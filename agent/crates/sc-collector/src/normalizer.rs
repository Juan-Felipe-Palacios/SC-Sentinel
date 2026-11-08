// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Normalización de flujos exportados a [`sc_capture::FlowUpdate`].
//!
//! Los parsers producen [`NormalizedFlow`] (campos con tipos de red) y este
//! módulo los convierte al tipo que consume `sc-aggregate`.

use sc_capture::{Direction, FlowUpdate};
use sc_core::{FlowKey, Protocol};
use std::net::IpAddr;

/// Campos de un flujo ya validado por un parser.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NormalizedFlow {
    /// Timestamp del export en nanosegundos desde la época Unix.
    pub ts_nanos: i64,
    pub src_ip: IpAddr,
    pub dst_ip: IpAddr,
    pub src_port: u16,
    pub dst_port: u16,
    /// Número de protocolo IP (6 TCP, 17 UDP, 1 ICMP…).
    pub protocol: u8,
    pub bytes: u64,
    pub packets: u64,
}

/// Representación interna de una IP: IPv4 como `u32` y IPv6 como 128 bits.
/// Es la misma convención que usa `sc-capture`/`LocalIpSet` (M1).
pub fn ip_to_u128(ip: IpAddr) -> u128 {
    match ip {
        IpAddr::V4(v4) => u32::from(v4) as u128,
        IpAddr::V6(v6) => u128::from_be_bytes(v6.octets()),
    }
}

pub fn protocol_from_number(number: u8) -> Protocol {
    match number {
        6 => Protocol::Tcp,
        17 => Protocol::Udp,
        _ => Protocol::Other,
    }
}

/// Convierte un flujo exportado al `FlowUpdate` del pipeline.
///
/// Orientación (ADR-0014 §5): un export de router no tiene un extremo local
/// conocido, así que se emite `Direction::In`, que el accumulator resuelve como
/// «el host es `src_ip`». Es determinista y atribuye el tráfico LAN → WAN al
/// cliente que lo origina.
pub fn to_flow_update(flow: &NormalizedFlow) -> FlowUpdate {
    FlowUpdate {
        ts: flow.ts_nanos,
        flow: FlowKey {
            src_ip: ip_to_u128(flow.src_ip),
            dst_ip: ip_to_u128(flow.dst_ip),
            src_port: flow.src_port,
            dst_port: flow.dst_port,
            protocol: protocol_from_number(flow.protocol),
        },
        bytes: flow.bytes,
        packets: flow.packets,
        direction: Direction::In,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    fn flow() -> NormalizedFlow {
        NormalizedFlow {
            ts_nanos: 1_700_000_000_500_000_000,
            src_ip: IpAddr::V4(Ipv4Addr::new(192, 168, 1, 41)),
            dst_ip: IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)),
            src_port: 51_234,
            dst_port: 443,
            protocol: 6,
            bytes: 1_500,
            packets: 10,
        }
    }

    #[test]
    fn ipv4_se_mapea_como_u32_en_u128() {
        assert_eq!(
            ip_to_u128(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 41))),
            0xC0A8_0129
        );
    }

    #[test]
    fn ipv6_se_mapea_a_sus_128_bits() {
        let ip = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
        assert_eq!(ip_to_u128(IpAddr::V6(ip)), u128::from_be_bytes(ip.octets()));
    }

    #[test]
    fn mapea_protocolos_conocidos_y_desconocidos() {
        assert_eq!(protocol_from_number(6), Protocol::Tcp);
        assert_eq!(protocol_from_number(17), Protocol::Udp);
        assert_eq!(protocol_from_number(1), Protocol::Other);
        assert_eq!(protocol_from_number(47), Protocol::Other);
    }

    #[test]
    fn flowupdate_conserva_campos_y_origen_como_host() {
        let normalized = to_flow_update(&flow());
        assert_eq!(normalized.ts, 1_700_000_000_500_000_000);
        assert_eq!(normalized.flow.src_ip, 0xC0A8_0129);
        assert_eq!(
            normalized.flow.dst_ip,
            u32::from(Ipv4Addr::new(8, 8, 8, 8)) as u128
        );
        assert_eq!(normalized.flow.src_port, 51_234);
        assert_eq!(normalized.flow.dst_port, 443);
        assert_eq!(normalized.flow.protocol, Protocol::Tcp);
        assert_eq!(normalized.bytes, 1_500);
        assert_eq!(normalized.packets, 10);
        assert_eq!(normalized.direction, Direction::In);
    }
}
