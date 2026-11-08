// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Parser NetFlow v5 (Cisco legacy): header fijo de 24 bytes y registros de
//! 48 bytes, todo en big-endian y solo IPv4.
//!
//! Estructura de referencia: plan M4 §4.1. Se toleran bytes de relleno después
//! del último registro, pero nunca se lee más allá de lo declarado por `count`.

use super::{ProtocolKind, ProtocolParser, NETFLOW_V5_VERSION};
use crate::error::ParseError;
use crate::normalizer::NormalizedFlow;
use sc_capture::FlowUpdate;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

pub const HEADER_LEN: usize = 24;
pub const RECORD_LEN: usize = 48;

#[derive(Debug, Default)]
pub struct NetFlowV5Parser;

impl ProtocolParser for NetFlowV5Parser {
    fn protocol(&self) -> ProtocolKind {
        ProtocolKind::NetFlowV5
    }

    fn try_parse(
        &mut self,
        _source: SocketAddr,
        data: &[u8],
        _received_at_nanos: i64,
    ) -> Result<Vec<FlowUpdate>, ParseError> {
        parse(data).map(|flows| flows.iter().map(crate::to_flow_update).collect())
    }
}

/// Parsea un datagrama NetFlow v5 completo.
///
/// El timestamp de cada flujo es el `unix_secs`/`unix_nsecs` del header (hora
/// del export), no la hora de recepción: el exportador es la fuente de verdad.
pub fn parse(data: &[u8]) -> Result<Vec<NormalizedFlow>, ParseError> {
    if data.len() < HEADER_LEN {
        return Err(ParseError::TooShort {
            len: data.len(),
            min: HEADER_LEN,
        });
    }

    let version = read_u16(data, 0);
    if version != NETFLOW_V5_VERSION {
        return Err(ParseError::WrongVersion {
            expected: "NetFlow v5",
            got: version,
        });
    }

    let count = read_u16(data, 2) as usize;
    let unix_secs = read_u32(data, 8) as i64;
    let unix_nsecs = read_u32(data, 12) as i64;
    let ts_nanos = unix_secs
        .saturating_mul(1_000_000_000)
        .saturating_add(unix_nsecs);

    let required = HEADER_LEN + count * RECORD_LEN;
    if data.len() < required {
        return Err(ParseError::Truncated {
            expected: required,
            len: data.len(),
        });
    }

    let mut flows = Vec::with_capacity(count);
    for index in 0..count {
        let start = HEADER_LEN + index * RECORD_LEN;
        let record = &data[start..start + RECORD_LEN];
        flows.push(parse_record(record, ts_nanos));
    }
    Ok(flows)
}

fn parse_record(record: &[u8], ts_nanos: i64) -> NormalizedFlow {
    // `record` siempre mide RECORD_LEN bytes: los índices son fijos y seguros.
    NormalizedFlow {
        ts_nanos,
        src_ip: IpAddr::V4(Ipv4Addr::from(read_u32(record, 0))),
        dst_ip: IpAddr::V4(Ipv4Addr::from(read_u32(record, 4))),
        src_port: read_u16(record, 32),
        dst_port: read_u16(record, 34),
        protocol: record[38],
        bytes: read_u32(record, 20) as u64,
        packets: read_u32(record, 16) as u64,
    }
}

fn read_u16(data: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes([data[offset], data[offset + 1]])
}

fn read_u32(data: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{nf5_packet, Nf5Record};
    use sc_capture::Direction;
    use sc_core::Protocol;
    use std::net::Ipv4Addr;

    const EXPORT_SECS: u32 = 1_700_000_000;

    fn sample_packet() -> Vec<u8> {
        nf5_packet(&[Nf5Record::default()], EXPORT_SECS)
    }

    #[test]
    fn parsea_un_registro_valido() {
        let flows = parse(&sample_packet()).expect("paquete válido");
        assert_eq!(flows.len(), 1);
        let flow = flows[0];
        assert_eq!(flow.src_ip, IpAddr::V4(Ipv4Addr::new(192, 168, 1, 41)));
        assert_eq!(flow.dst_ip, IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)));
        assert_eq!(flow.src_port, 51_234);
        assert_eq!(flow.dst_port, 443);
        assert_eq!(flow.protocol, 6);
        assert_eq!(flow.bytes, 1_500);
        assert_eq!(flow.packets, 10);
        assert_eq!(flow.ts_nanos, EXPORT_SECS as i64 * 1_000_000_000);
    }

    #[test]
    fn parsea_varios_registros_en_orden() {
        let records = [
            Nf5Record::default(),
            Nf5Record {
                src_port: 53,
                dst_port: 53,
                protocol: 17,
                bytes: 512,
                packets: 2,
                ..Nf5Record::default()
            },
        ];
        let flows = parse(&nf5_packet(&records, EXPORT_SECS)).expect("dos registros");
        assert_eq!(flows.len(), 2);
        assert_eq!(flows[0].src_port, 51_234);
        assert_eq!(flows[1].protocol, 17);
        assert_eq!(flows[1].bytes, 512);
    }

    #[test]
    fn cero_registros_devuelve_vec_vacio() {
        let flows = parse(&nf5_packet(&[], EXPORT_SECS)).expect("header sin registros");
        assert!(flows.is_empty());
    }

    #[test]
    fn header_truncado_es_error_sin_panico() {
        let packet = sample_packet();
        assert_eq!(
            parse(&packet[..HEADER_LEN - 1]),
            Err(ParseError::TooShort {
                len: HEADER_LEN - 1,
                min: HEADER_LEN,
            })
        );
    }

    #[test]
    fn count_que_excede_el_datagrama_es_error() {
        let packet = sample_packet();
        let mut liar = packet[..HEADER_LEN].to_vec();
        liar[2..4].copy_from_slice(&5u16.to_be_bytes());

        assert_eq!(
            parse(&liar),
            Err(ParseError::Truncated {
                expected: HEADER_LEN + 5 * RECORD_LEN,
                len: HEADER_LEN,
            })
        );
    }

    #[test]
    fn version_incorrecta_es_error() {
        let mut packet = sample_packet();
        packet[0..2].copy_from_slice(&9u16.to_be_bytes());

        assert_eq!(
            parse(&packet),
            Err(ParseError::WrongVersion {
                expected: "NetFlow v5",
                got: 9,
            })
        );
    }

    #[test]
    fn tolera_relleno_despues_del_ultimo_registro() {
        let mut packet = sample_packet();
        packet.extend_from_slice(&[0u8; RECORD_LEN]);
        let flows = parse(&packet).expect("el relleno no invalida el paquete");
        assert_eq!(flows.len(), 1, "count manda, no el tamaño del datagrama");
    }

    #[test]
    fn nanosegundos_del_export_se_suman_al_timestamp() {
        let mut packet = sample_packet();
        packet[12..16].copy_from_slice(&500_000_000u32.to_be_bytes());
        let flows = parse(&packet).expect("paquete válido");
        assert_eq!(
            flows[0].ts_nanos,
            EXPORT_SECS as i64 * 1_000_000_000 + 500_000_000
        );
    }

    #[test]
    fn parser_produce_flowupdate_con_direccion_al_origen() {
        let mut parser = NetFlowV5Parser;
        let source: SocketAddr = "192.168.1.1:2055".parse().expect("socket addr");
        let updates = parser
            .try_parse(source, &sample_packet(), 0)
            .expect("NetFlow v5 válido");

        assert_eq!(updates.len(), 1);
        let update = &updates[0];
        assert_eq!(
            update.flow.src_ip,
            u32::from(Ipv4Addr::new(192, 168, 1, 41)) as u128
        );
        assert_eq!(update.flow.protocol, Protocol::Tcp);
        assert_eq!(update.direction, Direction::In);
        assert_eq!(update.bytes, 1_500);
    }
}
