// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Parser NetFlow v9 (RFC 3954).
//!
//! Header de 20 bytes seguido de FlowSets. Los FlowSets de template (ID 0) y
//! de options template (ID 1) actualizan la cache por origen; los FlowSets de
//! datos (ID ≥ 256) se decodifican contra el template correspondiente. Un
//! template desconocido descarta el datagrama con error controlado, igual que
//! hace un colector de referencia: nunca se interpretan bytes sin esquema.

use super::record::{decode_records, RecordContext};
use super::template::{FieldSpec, Template, TemplateCache, TemplateKey, VARIABLE_LENGTH};
use super::{read_u16, read_u32, ProtocolKind, ProtocolParser, NETFLOW_V9_VERSION};
use crate::error::ParseError;
use crate::normalizer::NormalizedFlow;
use sc_capture::FlowUpdate;
use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

pub const HEADER_LEN: usize = 20;
const TEMPLATE_SET_ID: u16 = 0;
const OPTIONS_TEMPLATE_SET_ID: u16 = 1;

#[derive(Debug)]
pub struct NetFlowV9Parser {
    cache: TemplateCache,
}

impl NetFlowV9Parser {
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

impl Default for NetFlowV9Parser {
    fn default() -> Self {
        Self::new()
    }
}

impl ProtocolParser for NetFlowV9Parser {
    fn protocol(&self) -> ProtocolKind {
        ProtocolKind::NetFlowV9
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

/// Parsea un datagrama NetFlow v9 y actualiza la cache de templates.
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
    if version != NETFLOW_V9_VERSION {
        return Err(ParseError::WrongVersion {
            expected: "NetFlow v9",
            got: version,
        });
    }

    let sys_uptime = read_u32(data, 4);
    let unix_secs = read_u32(data, 8) as i64;
    let export_nanos = if unix_secs == 0 {
        received_at_nanos
    } else {
        unix_secs.saturating_mul(1_000_000_000)
    };
    let context = RecordContext {
        export_nanos,
        sys_uptime_ms: Some(sys_uptime),
    };
    let now = Instant::now();

    let mut flows = Vec::new();
    let mut offset = HEADER_LEN;
    while offset + 4 <= data.len() {
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
        if end > data.len() {
            return Err(ParseError::Truncated {
                expected: end,
                len: data.len(),
            });
        }

        let body = &data[offset + 4..end];
        match set_id {
            TEMPLATE_SET_ID => parse_template_set(body, cache, source, now)?,
            OPTIONS_TEMPLATE_SET_ID => parse_options_template_set(body, cache, source, now)?,
            // IDs 2..=255 están reservados por la RFC 3954.
            2..=255 => {}
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
            // Relleno de alineación a 4 bytes.
            break;
        }
        if template_id < 256 {
            return Err(ParseError::InvalidTemplate(template_id));
        }

        let fields_bytes = field_count
            .checked_mul(4)
            .ok_or(ParseError::InvalidTemplate(template_id))?;
        let record_len = 4usize
            .checked_add(fields_bytes)
            .ok_or(ParseError::InvalidTemplate(template_id))?;
        let end = cursor
            .checked_add(record_len)
            .ok_or(ParseError::InvalidTemplate(template_id))?;
        if end > body.len() {
            return Err(ParseError::Truncated {
                expected: end,
                len: body.len(),
            });
        }

        let fields = read_fixed_fields(body, cursor + 4, field_count, template_id)?;
        let template = Template::new(template_id, fields, 0, false)?;
        cache.insert(TemplateKey::new(source, template_id), template, now);
        cursor = end;
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
        let scope_bytes = read_u16(body, cursor + 2) as usize;
        let option_bytes = read_u16(body, cursor + 4) as usize;
        if template_id == 0 && scope_bytes == 0 && option_bytes == 0 {
            break;
        }
        if template_id < 256
            || scope_bytes % 4 != 0
            || option_bytes % 4 != 0
            || scope_bytes + option_bytes == 0
        {
            return Err(ParseError::InvalidTemplate(template_id));
        }

        let fields_bytes = scope_bytes + option_bytes;
        let end = cursor
            .checked_add(6 + fields_bytes)
            .ok_or(ParseError::InvalidTemplate(template_id))?;
        if end > body.len() {
            return Err(ParseError::Truncated {
                expected: end,
                len: body.len(),
            });
        }

        let scope_count = scope_bytes / 4;
        let field_count = fields_bytes / 4;
        let fields = read_fixed_fields(body, cursor + 6, field_count, template_id)?;
        let template = Template::new(template_id, fields, scope_count, true)?;
        cache.insert(TemplateKey::new(source, template_id), template, now);
        cursor = end;
    }
    Ok(())
}

/// Lee `count` pares (tipo, longitud) de un template NetFlow v9.
fn read_fixed_fields(
    body: &[u8],
    start: usize,
    count: usize,
    template_id: u16,
) -> Result<Vec<FieldSpec>, ParseError> {
    let mut fields = Vec::with_capacity(count);
    for index in 0..count {
        let position = start + index * 4;
        let id = read_u16(body, position);
        let length = read_u16(body, position + 2);
        if length == 0 || length == VARIABLE_LENGTH {
            return Err(ParseError::InvalidTemplate(template_id));
        }
        fields.push(FieldSpec::standard(id, length));
    }
    Ok(fields)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{
        v9_data_set, v9_ipv4_record, v9_options_template_set, v9_packet, v9_template_set, Nf9Field,
        V9_FLOW_TEMPLATE_ID,
    };
    use std::net::{Ipv4Addr, Ipv6Addr};

    fn template_set() -> Vec<u8> {
        v9_template_set(&[(
            V9_FLOW_TEMPLATE_ID,
            vec![
                Nf9Field::new(8, 4),
                Nf9Field::new(12, 4),
                Nf9Field::new(7, 2),
                Nf9Field::new(11, 2),
                Nf9Field::new(4, 1),
                Nf9Field::new(1, 8),
                Nf9Field::new(2, 8),
                Nf9Field::new(22, 4),
            ],
        )])
    }

    fn source() -> SocketAddr {
        "192.168.1.1:2055".parse().expect("socket addr")
    }

    #[test]
    fn parsea_template_y_data_en_el_mismo_datagrama() {
        let mut parser = NetFlowV9Parser::new();
        let packet = v9_packet(
            &[
                template_set(),
                v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_ipv4_record(9_500)),
            ],
            1_700_000_000,
            10_000,
        );

        let flows = parser
            .try_parse(source(), &packet, 0)
            .expect("template + data");
        assert_eq!(flows.len(), 1);
        assert_eq!(
            flows[0].flow.src_ip,
            u32::from(Ipv4Addr::new(192, 168, 1, 41)) as u128
        );
        assert_eq!(flows[0].flow.dst_port, 443);
        assert_eq!(flows[0].flow.protocol, sc_core::Protocol::Tcp);
        assert_eq!(flows[0].bytes, 1_500);
        assert_eq!(flows[0].packets, 10);
        assert_eq!(
            flows[0].ts,
            1_700_000_000_000_000_000 - 500_000_000,
            "FIRST_SWITCHED se descuenta del uptime del export"
        );
        assert_eq!(parser.cached_templates(), 1);
    }

    #[test]
    fn data_sin_template_es_error_controlado() {
        let packet = v9_packet(
            &[v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_ipv4_record(9_500))],
            1_700_000_000,
            10_000,
        );
        let mut parser = NetFlowV9Parser::new();
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("sin template"),
            ParseError::TemplateNotFound(V9_FLOW_TEMPLATE_ID)
        );
        assert_eq!(parser.cached_templates(), 0);
    }

    #[test]
    fn template_en_un_datagrama_y_data_en_otro() {
        let mut parser = NetFlowV9Parser::new();
        let template_packet = v9_packet(&[template_set()], 1_700_000_000, 10_000);
        parser
            .try_parse(source(), &template_packet, 0)
            .expect("template");
        assert_eq!(parser.cached_templates(), 1);

        // El mismo parser conserva la cache entre datagramas.
        let data_packet = v9_packet(
            &[v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_ipv4_record(9_500))],
            1_700_000_001,
            10_000,
        );
        let flows = parser
            .try_parse(source(), &data_packet, 0)
            .expect("data con template cacheado");
        assert_eq!(flows.len(), 1);
    }

    #[test]
    fn template_ipv6_produce_direcciones_de_128_bits() {
        let template = v9_template_set(&[(
            V9_FLOW_TEMPLATE_ID,
            vec![
                Nf9Field::new(27, 16),
                Nf9Field::new(28, 16),
                Nf9Field::new(1, 4),
                Nf9Field::new(2, 4),
            ],
        )]);
        let src = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
        let dst = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2);
        let mut record = Vec::new();
        record.extend_from_slice(&src.octets());
        record.extend_from_slice(&dst.octets());
        record.extend_from_slice(&512u32.to_be_bytes());
        record.extend_from_slice(&4u32.to_be_bytes());

        let packet = v9_packet(
            &[template, v9_data_set(V9_FLOW_TEMPLATE_ID, &record)],
            1_700_000_000,
            10_000,
        );
        let mut parser = NetFlowV9Parser::new();
        let flows = parser.try_parse(source(), &packet, 0).expect("IPv6");

        assert_eq!(flows[0].flow.src_ip, u128::from_be_bytes(src.octets()));
        assert_eq!(flows[0].flow.dst_ip, u128::from_be_bytes(dst.octets()));
        assert_eq!(flows[0].bytes, 512);
    }

    #[test]
    fn options_template_y_su_data_se_ignoran_sin_error() {
        let options = v9_options_template_set(
            400,
            &[Nf9Field::new(1, 4)],
            &[Nf9Field::new(34, 4), Nf9Field::new(35, 1)],
        );
        let data = v9_data_set(400, &[0u8; 9]);
        let packet = v9_packet(&[options, data], 1_700_000_000, 10_000);

        let mut parser = NetFlowV9Parser::new();
        let flows = parser
            .try_parse(source(), &packet, 0)
            .expect("options no son flujos");
        assert!(flows.is_empty());
        assert_eq!(parser.cached_templates(), 1);
    }

    #[test]
    fn template_actualizado_reemplaza_los_campos() {
        let mut parser = NetFlowV9Parser::new();
        let packet = v9_packet(
            &[
                template_set(),
                v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_ipv4_record(9_500)),
            ],
            1_700_000_000,
            10_000,
        );
        parser
            .try_parse(source(), &packet, 0)
            .expect("primer parseo");

        // Nuevo template: bytes pasa a 4 bytes y desaparece FIRST_SWITCHED.
        let nuevo = v9_template_set(&[(
            V9_FLOW_TEMPLATE_ID,
            vec![
                Nf9Field::new(8, 4),
                Nf9Field::new(12, 4),
                Nf9Field::new(1, 4),
            ],
        )]);
        let mut record = Vec::new();
        record.extend_from_slice(&[10, 0, 0, 1, 10, 0, 0, 2]);
        record.extend_from_slice(&777u32.to_be_bytes());
        let packet = v9_packet(
            &[nuevo, v9_data_set(V9_FLOW_TEMPLATE_ID, &record)],
            1_700_000_000,
            10_000,
        );

        let flows = parser
            .try_parse(source(), &packet, 0)
            .expect("template nuevo");
        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].bytes, 777);
        assert_eq!(flows[0].ts, 1_700_000_000_000_000_000);
        assert_eq!(parser.cached_templates(), 1);
    }

    #[test]
    fn template_con_count_imposible_es_error_sin_panico() {
        // FlowSet 0 con count 100 y sin campos: solo template header + padding.
        let mut body = Vec::new();
        body.extend_from_slice(&V9_FLOW_TEMPLATE_ID.to_be_bytes());
        body.extend_from_slice(&100u16.to_be_bytes());
        let set = v9_data_set(0, &body);
        let packet = v9_packet(&[set], 1_700_000_000, 10_000);

        let mut parser = NetFlowV9Parser::new();
        assert!(matches!(
            parser.try_parse(source(), &packet, 0),
            Err(ParseError::Truncated { .. })
        ));
    }

    #[test]
    fn header_y_sets_invalidos_son_errores() {
        let mut parser = NetFlowV9Parser::new();
        assert_eq!(
            parser
                .try_parse(source(), &[0u8; 19], 0)
                .expect_err("header corto"),
            ParseError::TooShort { len: 19, min: 20 }
        );

        let mut packet = v9_packet(&[], 1_700_000_000, 0);
        packet[0..2].copy_from_slice(&5u16.to_be_bytes());
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("versión incorrecta"),
            ParseError::WrongVersion {
                expected: "NetFlow v9",
                got: 5
            }
        );

        // Set con longitud menor que su header.
        let mut packet = v9_packet(&[], 1_700_000_000, 0);
        packet.extend_from_slice(&[0x01, 0x00, 0x00, 0x02]);
        assert_eq!(
            parser
                .try_parse(source(), &packet, 0)
                .expect_err("set con longitud inválida"),
            ParseError::MalformedSet { id: 256, length: 2 }
        );
    }

    #[test]
    fn set_reservado_se_ignora() {
        let reserved = v9_data_set(200, &[1, 2, 3, 4]);
        let packet = v9_packet(&[reserved], 1_700_000_000, 0);
        let mut parser = NetFlowV9Parser::new();
        assert!(parser
            .try_parse(source(), &packet, 0)
            .expect("set reservado")
            .is_empty());
    }
}
