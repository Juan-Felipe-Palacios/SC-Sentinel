// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Decodificación de registros descritos por un template.
//!
//! Compartido por NetFlow v9 e IPFIX: ambos usan los mismos Information
//! Elements de RFC 3954/IANA, difieren solo en el framing de sets y templates.
//! Los IEs que el agente no necesita se leen para avanzar el cursor y se
//! ignoran; los de empresa también se aceptan (se descarta su valor).

use super::template::{FieldSpec, Template, VARIABLE_LENGTH};
use crate::error::ParseError;
use crate::normalizer::NormalizedFlow;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Contexto temporal común a los registros de un datagrama.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RecordContext {
    /// Hora del export (header) en nanosegundos desde la época Unix.
    pub export_nanos: i64,
    /// `sys_uptime` del header de NetFlow v9, en milisegundos.
    pub sys_uptime_ms: Option<u32>,
}

/// Decodifica el cuerpo de un Data FlowSet/Set.
///
/// Los bytes finales que no alcanzan para otro registro se tratan como relleno
/// de alineación (el emisor los agrega para dejar el set en múltiplo de 4).
pub(crate) fn decode_records(
    template: &Template,
    body: &[u8],
    context: &RecordContext,
) -> Result<Vec<NormalizedFlow>, ParseError> {
    if template.is_options {
        // Los options templates describen metadatos (sampling, interfaces):
        // su data no representa flujos y se descarta completa.
        return Ok(Vec::new());
    }

    match template.fixed_record_len() {
        Some(record_len) if record_len > 0 => {
            let mut flows = Vec::with_capacity(body.len() / record_len);
            for record in body.chunks_exact(record_len) {
                if let Some(flow) = decode_record(template, record, context)?.0 {
                    flows.push(flow);
                }
            }
            Ok(flows)
        }
        Some(_) => Err(ParseError::InvalidTemplate(template.id)),
        None => decode_variable_records(template, body, context),
    }
}

fn decode_variable_records(
    template: &Template,
    body: &[u8],
    context: &RecordContext,
) -> Result<Vec<NormalizedFlow>, ParseError> {
    let mut flows = Vec::new();
    let mut cursor = 0usize;

    while body.len() - cursor >= template.min_record_len() {
        let remaining = &body[cursor..];
        let (flow, consumed) = decode_record(template, remaining, context)?;
        if let Some(flow) = flow {
            flows.push(flow);
        }
        if consumed == 0 {
            break;
        }
        cursor += consumed;
    }

    Ok(flows)
}

/// Decodifica un registro y devuelve el flujo (si tiene direcciones) y los
/// bytes consumidos.
fn decode_record(
    template: &Template,
    data: &[u8],
    context: &RecordContext,
) -> Result<(Option<NormalizedFlow>, usize), ParseError> {
    let mut fields = FlowFields::default();
    let mut offset = 0usize;

    for spec in &template.fields {
        let value = take_field(template.id, data, &mut offset, spec)?;
        fields.apply(spec, value);
    }

    Ok((fields.finish(context), offset))
}

/// Extrae el valor de un IE; en IPFIX, los IEs variables llevan su longitud
/// delante (1 byte, o `0xFF` + 2 bytes cuando supera 254).
fn take_field<'a>(
    template_id: u16,
    data: &'a [u8],
    offset: &mut usize,
    spec: &FieldSpec,
) -> Result<&'a [u8], ParseError> {
    let length = if spec.length == VARIABLE_LENGTH {
        let first = *data
            .get(*offset)
            .ok_or(ParseError::MalformedRecord(template_id))?;
        *offset += 1;
        if first < 0xFF {
            first as usize
        } else {
            let bytes = data
                .get(*offset..*offset + 2)
                .ok_or(ParseError::MalformedRecord(template_id))?;
            *offset += 2;
            u16::from_be_bytes([bytes[0], bytes[1]]) as usize
        }
    } else {
        spec.length as usize
    };

    let end = offset
        .checked_add(length)
        .ok_or(ParseError::MalformedRecord(template_id))?;
    let value = data
        .get(*offset..end)
        .ok_or(ParseError::MalformedRecord(template_id))?;
    *offset = end;
    Ok(value)
}

#[derive(Debug, Default)]
struct FlowFields {
    src_ip: Option<IpAddr>,
    dst_ip: Option<IpAddr>,
    src_port: Option<u16>,
    dst_port: Option<u16>,
    protocol: Option<u8>,
    bytes: Option<u64>,
    packets: Option<u64>,
    first_switched: Option<u32>,
    start_secs: Option<i64>,
    start_millis: Option<i64>,
    start_micros: Option<i64>,
    start_nanos: Option<i64>,
}

impl FlowFields {
    fn apply(&mut self, spec: &FieldSpec, value: &[u8]) {
        if spec.enterprise.is_some() {
            // IEs de empresa (Cisco PEN 9, MikroTik PEN 14988, …): no aportan
            // direcciones ni contadores estándar; se ignoran tras consumirlos.
            return;
        }

        match spec.id {
            // octetDeltaCount, octetTotalCount y OUT_BYTES (v9).
            1 | 23 | 85 => self.bytes = read_uint(value),
            // packetDeltaCount, packetTotalCount y OUT_PKTS (v9).
            2 | 24 | 86 => self.packets = read_uint(value),
            4 => self.protocol = read_uint(value).map(|number| number as u8),
            7 => self.src_port = read_uint(value).map(|number| number as u16),
            11 => self.dst_port = read_uint(value).map(|number| number as u16),
            // sourceIPv4Address/sourceIPv6Address y sus pares de destino.
            8 | 27 => {
                if let Some(ip) = read_ip(value) {
                    self.src_ip = Some(ip);
                }
            }
            12 | 28 => {
                if let Some(ip) = read_ip(value) {
                    self.dst_ip = Some(ip);
                }
            }
            22 => self.first_switched = read_uint(value).map(|number| number as u32),
            // dateTimeSeconds/Milliseconds/Microseconds/Nanoseconds de IPFIX.
            150 => self.start_secs = read_uint(value).map(|number| number as i64),
            152 => self.start_millis = read_uint(value).map(|number| number as i64),
            154 => self.start_micros = read_uint(value).map(|number| number as i64),
            156 => self.start_nanos = read_uint(value).map(|number| number as i64),
            _ => {}
        }
    }

    fn finish(self, context: &RecordContext) -> Option<NormalizedFlow> {
        let src_ip = self.src_ip?;
        let dst_ip = self.dst_ip?;

        let ts_nanos = self
            .start_nanos
            .or_else(|| self.start_micros.map(|v| v.saturating_mul(1_000)))
            .or_else(|| self.start_millis.map(|v| v.saturating_mul(1_000_000)))
            .or_else(|| self.start_secs.map(|v| v.saturating_mul(1_000_000_000)))
            .or_else(|| self.relative_start(context))
            .unwrap_or(context.export_nanos);

        Some(NormalizedFlow {
            ts_nanos,
            src_ip,
            dst_ip,
            src_port: self.src_port.unwrap_or(0),
            dst_port: self.dst_port.unwrap_or(0),
            protocol: self.protocol.unwrap_or(0),
            bytes: self.bytes.unwrap_or(0),
            packets: self.packets.unwrap_or(0),
        })
    }

    /// `FIRST_SWITCHED` es uptime en ms: el inicio del flujo es el instante del
    /// export menos la diferencia con el uptime del header (con wrap de 32 bits).
    fn relative_start(&self, context: &RecordContext) -> Option<i64> {
        let first = self.first_switched?;
        let uptime = context.sys_uptime_ms?;
        let elapsed_ms = uptime.wrapping_sub(first) as i64;
        Some(
            context
                .export_nanos
                .saturating_sub(elapsed_ms.saturating_mul(1_000_000))
                .max(0),
        )
    }
}

fn read_uint(value: &[u8]) -> Option<u64> {
    if value.is_empty() || value.len() > 8 {
        return None;
    }
    Some(
        value
            .iter()
            .fold(0u64, |accumulated, byte| (accumulated << 8) | *byte as u64),
    )
}

fn read_ip(value: &[u8]) -> Option<IpAddr> {
    match value.len() {
        4 => Some(IpAddr::V4(Ipv4Addr::new(
            value[0], value[1], value[2], value[3],
        ))),
        16 => {
            let mut octets = [0u8; 16];
            octets.copy_from_slice(value);
            Some(IpAddr::V6(Ipv6Addr::from(octets)))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::template::FieldSpec;

    const EXPORT_NANOS: i64 = 1_700_000_000_000_000_000;

    fn context(uptime: Option<u32>) -> RecordContext {
        RecordContext {
            export_nanos: EXPORT_NANOS,
            sys_uptime_ms: uptime,
        }
    }

    #[test]
    fn flujo_completo_con_direcciones_y_contadores() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(12, 4),
                FieldSpec::standard(7, 2),
                FieldSpec::standard(11, 2),
                FieldSpec::standard(4, 1),
                FieldSpec::standard(1, 8),
                FieldSpec::standard(2, 8),
            ],
            0,
            false,
        )
        .expect("template válido");

        let mut record = Vec::new();
        record.extend_from_slice(&[192, 168, 1, 41, 8, 8, 8, 8]);
        record.extend_from_slice(&51_234u16.to_be_bytes());
        record.extend_from_slice(&443u16.to_be_bytes());
        record.push(6);
        record.extend_from_slice(&1_500u64.to_be_bytes());
        record.extend_from_slice(&10u64.to_be_bytes());

        let flows = decode_records(&template, &record, &context(None)).expect("registro válido");
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].src_ip, IpAddr::V4(Ipv4Addr::new(192, 168, 1, 41)));
        assert_eq!(flows[0].dst_port, 443);
        assert_eq!(flows[0].bytes, 1_500);
        assert_eq!(flows[0].packets, 10);
        assert_eq!(flows[0].ts_nanos, EXPORT_NANOS);
    }

    #[test]
    fn registro_sin_direcciones_no_genera_flujo() {
        let template = Template::new(
            256,
            vec![FieldSpec::standard(1, 8), FieldSpec::standard(2, 8)],
            0,
            false,
        )
        .expect("template válido");
        let record = [0u8; 16];

        let flows = decode_records(&template, &record, &context(None)).expect("registro válido");
        assert!(flows.is_empty());
    }

    #[test]
    fn ies_de_empresa_avanzan_el_cursor_sin_romper_los_estandares() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec {
                    id: 1,
                    length: 4,
                    enterprise: Some(9),
                },
                FieldSpec::standard(12, 4),
            ],
            0,
            false,
        )
        .expect("template válido");

        let mut record = Vec::new();
        record.extend_from_slice(&[10, 0, 0, 1]);
        record.extend_from_slice(&[0xDE, 0xAD, 0xBE, 0xEF]);
        record.extend_from_slice(&[10, 0, 0, 2]);

        let flows = decode_records(&template, &record, &context(None)).expect("registro válido");
        assert_eq!(flows[0].src_ip, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)));
        assert_eq!(flows[0].dst_ip, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2)));
    }

    #[test]
    fn longitud_variable_en_un_byte_y_en_tres_bytes() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(12, 4),
                FieldSpec {
                    id: 82,
                    length: VARIABLE_LENGTH,
                    enterprise: None,
                },
            ],
            0,
            false,
        )
        .expect("template válido");

        let mut record = Vec::new();
        record.extend_from_slice(&[10, 0, 0, 1, 10, 0, 0, 2]);
        record.push(3);
        record.extend_from_slice(b"wan");

        // 300 bytes: prefijo 0xFF + longitud de 16 bits.
        record.extend_from_slice(&[10, 0, 0, 3, 10, 0, 0, 4, 0xFF]);
        record.extend_from_slice(&300u16.to_be_bytes());
        record.extend_from_slice(&[0u8; 300]);

        let flows =
            decode_records(&template, &record, &context(None)).expect("registros variables");
        assert_eq!(flows.len(), 2);
        assert_eq!(flows[1].src_ip, IpAddr::V4(Ipv4Addr::new(10, 0, 0, 3)));
    }

    #[test]
    fn prefijo_variable_truncado_es_error_controlado() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(12, 4),
                FieldSpec::standard(82, VARIABLE_LENGTH),
            ],
            0,
            false,
        )
        .expect("template válido");

        let record = [10, 0, 0, 1, 10, 0, 0, 2, 9, 1];
        assert_eq!(
            decode_records(&template, &record, &context(None)),
            Err(ParseError::MalformedRecord(256))
        );
    }

    #[test]
    fn primer_switched_calcula_el_inicio_del_flujo() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(12, 4),
                FieldSpec::standard(22, 4),
            ],
            0,
            false,
        )
        .expect("template válido");

        let mut record = vec![10, 0, 0, 1, 10, 0, 0, 2];
        // Uptime 10_000 ms, flujo empezó en 9_500 ms → 500 ms antes del export.
        record.extend_from_slice(&9_500u32.to_be_bytes());

        let flows = decode_records(&template, &record, &context(Some(10_000))).expect("registro");
        assert_eq!(flows[0].ts_nanos, EXPORT_NANOS - 500_000_000);
    }

    #[test]
    fn timestamp_absoluto_tiene_prioridad_sobre_el_uptime() {
        let template = Template::new(
            256,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(12, 4),
                FieldSpec::standard(22, 4),
                FieldSpec::standard(152, 8),
            ],
            0,
            false,
        )
        .expect("template válido");

        let start_ms = 1_699_999_000_123i64;
        let mut record = vec![10, 0, 0, 1, 10, 0, 0, 2];
        record.extend_from_slice(&1u32.to_be_bytes());
        record.extend_from_slice(&(start_ms as u64).to_be_bytes());

        let flows = decode_records(&template, &record, &context(Some(10_000))).expect("registro");
        assert_eq!(flows[0].ts_nanos, start_ms * 1_000_000);
    }
}
