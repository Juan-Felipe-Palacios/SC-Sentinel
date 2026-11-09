// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Parser IPFIX (RFC 7011) con Information Model de RFC 7012.
//!
//! Comparte con NetFlow v9 la cache de templates y el decodificador de
//! registros; difiere el framing: header de 16 bytes con longitud total del
//! mensaje, set de templates ID 2, options templates ID 3 y el bit de empresa
//! (PEN) en cada Information Element.

use super::record::{decode_records, RecordContext};
use super::template::{FieldSpec, Template, TemplateCache, TemplateKey};
use super::{read_u16, read_u32, ProtocolKind, ProtocolParser, IPFIX_VERSION};
use crate::error::ParseError;
use crate::normalizer::NormalizedFlow;
use sc_capture::FlowUpdate;
use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

pub const HEADER_LEN: usize = 16;
const TEMPLATE_SET_ID: u16 = 2;
const OPTIONS_TEMPLATE_SET_ID: u16 = 3;
const ENTERPRISE_BIT: u16 = 0x8000;

#[derive(Debug)]
pub struct IpfixParser {
    cache: TemplateCache,
}

impl IpfixParser {
    pub fn new() -> Self {
        Self {
            cache: TemplateCache::new(),
        }
    }

    pub fn with_cache_limits(capacity: usize, ttl: std::time::Duration) -> Self {
        Self {
            cache: TemplateCache::with_limits(capacity, ttl),
        }
    }
}

impl Default for IpfixParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ProtocolParser for IpfixParser {
    fn protocol(&self) -> ProtocolKind {
        ProtocolKind::Ipfix
    }

    fn try_parse(
        &mut self,
        source: SocketAddr,
        data: &[u8],
        received_at_nanos: i64,
    ) -> Result<Vec<FlowUpdate>, ParseError> {
        let flows = parse(&mut self.cache, source.ip(), data, received_at_nanos)?;
        Ok(flows.iter().map(crate::to_flow_update).collect())
    }

    fn cached_templates(&self) -> u64 {
        self.cache.len() as u64
    }
}

/// Parsea un mensaje IPFIX y actualiza la cache de templates.
///
/// `length` del header es la verdad para delimitar el mensaje: un datagrama
/// puede traer bytes extra (relleno de enlace) y no deben interpretarse.
pub fn parse(
    cache: &mut TemplateCache,
    source: IpAddr,
    data: &[u8],
    received_at_nanos: i64,
) -> Result<Vec<NormalizedFlow>, ParseError> {
    if data.len() < HEADER_LEN {
        return Err(ParseError::TooShort {
            len: data.len(),
            min: HEADER_LEN,
        });
    }

    let version = read_u16(data, 0);
    if version != IPFIX_VERSION {
        return Err(ParseError::WrongVersion {
            expected: "IPFIX",
            got: version,
        });
    }

    let total_len = read_u16(data, 2) as usize;
    if total_len < HEADER_LEN {
        return Err(ParseError::MalformedSet {
            id: 0,
            length: total_len as u16,
        });
    }
    if data.len() < total_len {
        return Err(ParseError::Truncated {
            expected: total_len,
            len: data.len(),
        });
    }

    let export_secs = read_u32(data, 4) as i64;
    let export_nanos = if export_secs == 0 {
        received_at_nanos
    } else {
        export_secs.saturating_mul(1_000_000_000)
    };
    let context = RecordContext {
        export_nanos,
        sys_uptime_ms: None,
    };
    let now = Instant::now();

    let mut flows = Vec::new();
    let mut offset = HEADER_LEN;
    while offset + 4 <= total_len {
        let set_id = read_u16(data, offset);
        let set_len = read_u16(data, offset + 2) as usize;
        if set_len < 4 {
            return Err(ParseError::MalformedSet {
                id: set_id,
                length: set_len as u16,
            });
        }
        let end = offset
            .checked_add(set_len)
            .ok_or(ParseError::MalformedSet {
                id: set_id,
                length: set_len as u16,
            })?;
        if end > total_len {
            return Err(ParseError::Truncated {
                expected: end,
                len: total_len,
            });
        }

        let body = &data[offset + 4..end];
        match set_id {
            TEMPLATE_SET_ID => parse_template_set(body, cache, source, now)?,
            OPTIONS_TEMPLATE_SET_ID => parse_options_template_set(body, cache, source, now)?,
            // 0, 1 y 4..=255 están reservados por la RFC 7011.
            0 | 1 | 4..=255 => {}
            template_id => {
                let key = TemplateKey::new(source, template_id);
                match cache.get(key, now) {
                    Some(template) => flows.extend(decode_records(template, body, &context)?),
                    None => return Err(ParseError::TemplateNotFound(template_id)),
                }
            }
        }

        offset = end;
    }

    Ok(flows)
}

fn parse_template_set(
    body: &[u8],
    cache: &mut TemplateCache,
    source: IpAddr,
    now: Instant,
) -> Result<(), ParseError> {
    let mut cursor = 0usize;
    while body.len() - cursor >= 4 {
        let template_id = read_u16(body, cursor);
        let field_count = read_u16(body, cursor + 2) as usize;
        if template_id == 0 && field_count == 0 {
            break;
        }
        if template_id < 256 {
            return Err(ParseError::InvalidTemplate(template_id));
        }

        let (fields, next) = read_fields(body, cursor + 4, field_count, template_id)?;
        let template = Template::new(template_id, fields, 0, false)?;
        cache.insert(TemplateKey::new(source, template_id), template, now);
        cursor = next;
    }
    Ok(())
}

fn parse_options_template_set(
    body: &[u8],
    cache: &mut TemplateCache,
    source: IpAddr,
    now: Instant,
) -> Result<(), ParseError> {
    let mut cursor = 0usize;
    while body.len() - cursor >= 6 {
        let template_id = read_u16(body, cursor);
        let field_count = read_u16(body, cursor + 2) as usize;
        let scope_count = read_u16(body, cursor + 4) as usize;
        if template_id == 0 && field_count == 0 && scope_count == 0 {
            break;
        }
        if template_id < 256 || field_count == 0 || scope_count == 0 || scope_count > field_count {
            return Err(ParseError::InvalidTemplate(template_id));
        }

        let (fields, next) = read_fields(body, cursor + 6, field_count, template_id)?;
        let template = Template::new(template_id, fields, scope_count, true)?;
        cache.insert(TemplateKey::new(source, template_id), template, now);
        cursor = next;
    }
    Ok(())
}

/// Lee `count` IEs, incluyendo el PEN cuando el bit de empresa está activo.
/// Devuelve los campos y el cursor posterior al último.
fn read_fields(
    body: &[u8],
    start: usize,
    count: usize,
    template_id: u16,
) -> Result<(Vec<FieldSpec>, usize), ParseError> {
    // Cada IE ocupa al menos 4 bytes; validar antes de reservar memoria.
    let minimum = count
        .checked_mul(4)
        .ok_or(ParseError::InvalidTemplate(template_id))?;
    let minimum_end = match start.checked_add(minimum) {
        Some(end) if end <= body.len() => end,
        _ => {
            return Err(ParseError::Truncated {
                expected: start.saturating_add(minimum),
                len: body.len(),
            })
        }
    };
    debug_assert!(minimum_end <= body.len());

    let mut fields = Vec::with_capacity(count);
    let mut cursor = start;
    for _ in 0..count {
        // T4.2: los IEs de empresa ocupan 8 bytes (incluye PEN), así que el
        // mínimo de 4 bytes/IE no garantiza que quepa el siguiente IE.
        // Validar en cada iteración evita indexar fuera del cuerpo.
        if cursor.saturating_add(4) > body.len() {
            return Err(ParseError::Truncated {
                expected: cursor.saturating_add(4),
                len: body.len(),
            });
        }
        let raw_id = read_u16(body, cursor);
        let length = read_u16(body, cursor + 2);
        cursor += 4;

        let enterprise = if raw_id & ENTERPRISE_BIT != 0 {
            let end = cursor
                .checked_add(4)
                .ok_or(ParseError::InvalidTemplate(template_id))?;
            if end > body.len() {
                return Err(ParseError::Truncated {
                    expected: end,
                    len: body.len(),
                });
            }
            let pen = read_u32(body, cursor);
            cursor += 4;
            Some(pen)
        } else {
            None
        };

        if length == 0 {
            return Err(ParseError::InvalidTemplate(template_id));
        }
        fields.push(FieldSpec {
            id: raw_id & !ENTERPRISE_BIT,
            length,
            enterprise,
        });
    }

    Ok((fields, cursor))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{
        ipfix_data_set, ipfix_ipv4_record, ipfix_options_template_set, ipfix_packet,
        ipfix_template_set, IpfixField, IPFIX_FLOW_TEMPLATE_ID,
    };
    use crate::protocol::ProtocolSet;
    use std::net::Ipv6Addr;

    fn template_set() -> Vec<u8> {
        ipfix_template_set(&[(
            IPFIX_FLOW_TEMPLATE_ID,
            vec![
                IpfixField::standard(8, 4),
                IpfixField::standard(12, 4),
                IpfixField::standard(7, 2),
                IpfixField::standard(11, 2),
                IpfixField::standard(4, 1),
                IpfixField::standard(1, 8),
                IpfixField::standard(2, 8),
                IpfixField::standard(152, 8),
            ],
        )])
    }

    fn source() -> SocketAddr {
        "192.168.1.1:4739".parse().expect("socket addr")
    }

    #[test]
    fn parsea_template_y_data_con_flow_start_milliseconds() {
        let packet = ipfix_packet(
            &[
                template_set(),
                ipfix_data_set(
                    IPFIX_FLOW_TEMPLATE_ID,
                    &ipfix_ipv4_record(1_699_999_999_500),
                ),
            ],
            1_700_000_000,
        );
        let mut parser = IpfixParser::new();
        let flows = parser
            .try_parse(source(), &packet, 0)
            .expect("template + data");

        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].flow.dst_port, 443);
        assert_eq!(flows[0].bytes, 1_500);
        assert_eq!(flows[0].ts, 1_699_999_999_500 * 1_000_000);
        assert_eq!(parser.cached_templates(), 1);
    }

    #[test]
    fn data_sin_template_es_error_controlado() {
        let packet = ipfix_packet(
            &[ipfix_data_set(
                IPFIX_FLOW_TEMPLATE_ID,
                &ipfix_ipv4_record(1_700_000_000_000),
            )],
            1_700_000_000,
        );
        let mut parser = IpfixParser::new();
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("sin template"),
            ParseError::TemplateNotFound(IPFIX_FLOW_TEMPLATE_ID)
        );
    }

    #[test]
    fn template_sobrevive_entre_datagramas() {
        let mut parser = IpfixParser::new();
        let template = ipfix_packet(&[template_set()], 1_700_000_000);
        parser.try_parse(source(), &template, 0).expect("template");

        let data = ipfix_packet(
            &[ipfix_data_set(
                IPFIX_FLOW_TEMPLATE_ID,
                &ipfix_ipv4_record(1_700_000_000_000),
            )],
            1_700_000_001,
        );
        let flows = parser.try_parse(source(), &data, 0).expect("data cacheada");
        assert_eq!(flows.len(), 1);
    }

    #[test]
    fn ie_de_empresa_no_desalinea_los_campos_estandar() {
        let template = ipfix_template_set(&[(
            IPFIX_FLOW_TEMPLATE_ID,
            vec![
                IpfixField::standard(8, 4),
                IpfixField {
                    id: 1,
                    length: 4,
                    enterprise: Some(9),
                },
                IpfixField::standard(12, 4),
                IpfixField::standard(1, 4),
            ],
        )]);
        let mut record = Vec::new();
        record.extend_from_slice(&[10, 0, 0, 1]);
        record.extend_from_slice(&[0xCA, 0xFE, 0xBA, 0xBE]); // IE Cisco ignorado
        record.extend_from_slice(&[10, 0, 0, 2]);
        record.extend_from_slice(&2_048u32.to_be_bytes());

        let packet = ipfix_packet(
            &[template, ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &record)],
            1_700_000_000,
        );
        let flows = IpfixParser::new()
            .try_parse(source(), &packet, 0)
            .expect("empresa + estándar");
        assert_eq!(flows[0].flow.src_ip, 0x0A00_0001);
        assert_eq!(flows[0].flow.dst_ip, 0x0A00_0002);
        assert_eq!(flows[0].bytes, 2_048);
    }

    #[test]
    fn ie_de_longitud_variable_con_prefijo_de_uno_y_tres_bytes() {
        let template = ipfix_template_set(&[(
            IPFIX_FLOW_TEMPLATE_ID,
            vec![
                IpfixField::standard(8, 4),
                IpfixField::standard(12, 4),
                IpfixField::standard(82, crate::VARIABLE_LENGTH),
            ],
        )]);
        let mut record = Vec::new();
        record.extend_from_slice(&[10, 0, 0, 1, 10, 0, 0, 2]);
        record.push(3);
        record.extend_from_slice(b"wan");
        record.extend_from_slice(&[10, 0, 0, 3, 10, 0, 0, 4, 0xFF]);
        record.extend_from_slice(&300u16.to_be_bytes());
        record.extend_from_slice(&[0u8; 300]);

        let packet = ipfix_packet(
            &[template, ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &record)],
            1_700_000_000,
        );
        let flows = IpfixParser::new()
            .try_parse(source(), &packet, 0)
            .expect("longitud variable");
        assert_eq!(flows.len(), 2);
        assert_eq!(flows[1].flow.src_ip, 0x0A00_0003);
    }

    #[test]
    fn template_ipv6_mapea_128_bits() {
        let template = ipfix_template_set(&[(
            IPFIX_FLOW_TEMPLATE_ID,
            vec![
                IpfixField::standard(27, 16),
                IpfixField::standard(28, 16),
                IpfixField::standard(1, 4),
            ],
        )]);
        let src = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
        let dst = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2);
        let mut record = Vec::new();
        record.extend_from_slice(&src.octets());
        record.extend_from_slice(&dst.octets());
        record.extend_from_slice(&64u32.to_be_bytes());

        let packet = ipfix_packet(
            &[template, ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &record)],
            1_700_000_000,
        );
        let flows = IpfixParser::new()
            .try_parse(source(), &packet, 0)
            .expect("IPv6");
        assert_eq!(flows[0].flow.src_ip, u128::from_be_bytes(src.octets()));
    }

    #[test]
    fn options_template_y_su_data_no_producen_flujos() {
        let options = ipfix_options_template_set(
            500,
            &[IpfixField::standard(1, 4)],
            &[IpfixField::standard(34, 4)],
        );
        let data = ipfix_data_set(500, &[0u8; 8]);
        let packet = ipfix_packet(&[options, data], 1_700_000_000);

        let flows = IpfixParser::new()
            .try_parse(source(), &packet, 0)
            .expect("options ignoradas");
        assert!(flows.is_empty());
    }

    #[test]
    fn longitud_declarada_mayor_que_el_datagrama_es_error() {
        let mut packet = ipfix_packet(&[], 1_700_000_000);
        packet[2..4].copy_from_slice(&100u16.to_be_bytes());
        let mut parser = IpfixParser::new();
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("longitud declarada mayor"),
            ParseError::Truncated {
                expected: 100,
                len: HEADER_LEN
            }
        );
    }

    #[test]
    fn ignora_bytes_extra_despues_del_mensaje() {
        let mut packet = ipfix_packet(
            &[
                template_set(),
                ipfix_data_set(
                    IPFIX_FLOW_TEMPLATE_ID,
                    &ipfix_ipv4_record(1_700_000_000_000),
                ),
            ],
            1_700_000_000,
        );
        packet.extend_from_slice(&[0xEE; 16]);

        let flows = IpfixParser::new()
            .try_parse(source(), &packet, 0)
            .expect("el relleno no se interpreta");
        assert_eq!(flows.len(), 1);
    }

    #[test]
    fn version_y_header_cortos_son_errores() {
        let mut parser = IpfixParser::new();
        assert_eq!(
            parser
                .try_parse(source(), &[0u8; 15], 0)
                .expect_err("header corto"),
            ParseError::TooShort { len: 15, min: 16 }
        );

        let mut packet = ipfix_packet(&[], 1_700_000_000);
        packet[0..2].copy_from_slice(&9u16.to_be_bytes());
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("versión incorrecta"),
            ParseError::WrongVersion {
                expected: "IPFIX",
                got: 9
            }
        );
    }

    #[test]
    fn protocolset_despacha_ipfix_y_cuenta_templates() {
        let mut set = ProtocolSet::new();
        let packet = ipfix_packet(
            &[
                template_set(),
                ipfix_data_set(
                    IPFIX_FLOW_TEMPLATE_ID,
                    &ipfix_ipv4_record(1_700_000_000_000),
                ),
            ],
            1_700_000_000,
        );
        let flows = set
            .parse(source(), &packet, 0)
            .expect("IPFIX por ProtocolSet");
        assert_eq!(flows.len(), 1);
        assert_eq!(set.cached_templates(), 1);
    }

    /// T4.2: regresión del panic encontrado por proptest en `read_fields`.
    /// El mínimo de `count * 4` no cubre los IEs de empresa (8 bytes con PEN):
    /// activar el bit en todos los campos sobrepasaba el cuerpo y el parser
    /// indexaba fuera del buffer. Debe ser `Truncated`, nunca panic.
    #[test]
    fn ies_de_empresa_que_exceden_el_cuerpo_son_truncated() {
        let mut packet = ipfix_packet(&[template_set()], 1_700_000_000);
        // Activa el bit de empresa en cada IE del template (8 campos x 4 B a
        // partir de header(16) + set(4) + template_id(2) + field_count(2)).
        let campo_start = 16 + 4 + 4;
        for index in 0..8 {
            packet[campo_start + index * 4] |= 0x80;
        }
        let mut parser = IpfixParser::new();
        assert!(matches!(
            parser.try_parse(source(), &packet, 0),
            Err(ParseError::Truncated { .. })
        ));
    }
}
