//! Parseo de paquetes → FlowUpdate (parseo manual para fixture sintético)
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//!
//! Derivado parcialmente de https://github.com/GyulyVGC/sniffnet (tag v1.5.1)
//! bajo licencia MIT OR Apache-2.0. Véase `docs/legal/THIRD_PARTY_NOTICES.md`.

#[allow(unused_imports)]
use crate::flow::{Direction, FlowUpdate, LocalIpSet};
use sc_core::{FlowKey, Protocol};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("link layer unsupported")]
    LinkUnsupported,
    #[error("ip malformed")]
    IpMalformed,
    #[error("transport malformed")]
    TransportMalformed,
}

fn ip_to_u128_v4(ip: [u8; 4]) -> u128 {
    u32::from_be_bytes(ip) as u128
}

pub fn parse_packet(
    local: &LocalIpSet,
    packet: &[u8],
    ts: i64,
) -> Result<Option<FlowUpdate>, ParseError> {
    if packet.len() < 14 {
        return Err(ParseError::LinkUnsupported);
    }

    // Ethernet header
    let ether_type = ((packet[12] as u16) << 8) | (packet[13] as u16);
    if ether_type != 0x0800 {
        // ARP (0x0806) u otros - retornar Ok(None)
        if ether_type == 0x0806 {
            return Ok(None);
        }
        return Ok(None);
    }

    // IPv4
    if packet.len() < 34 {
        return Err(ParseError::IpMalformed);
    }
    let ip_start = 14;
    let version_ihl = packet[ip_start];
    if (version_ihl >> 4) != 4 {
        return Err(ParseError::IpMalformed);
    }
    let ihl = ((version_ihl & 0x0f) as usize) * 4;
    if ihl < 20 || packet.len() < ip_start + ihl {
        return Err(ParseError::IpMalformed);
    }

    let protocol = packet[ip_start + 9];
    let src_ip = ip_to_u128_v4([
        packet[ip_start + 12],
        packet[ip_start + 13],
        packet[ip_start + 14],
        packet[ip_start + 15],
    ]);
    let dst_ip = ip_to_u128_v4([
        packet[ip_start + 16],
        packet[ip_start + 17],
        packet[ip_start + 18],
        packet[ip_start + 19],
    ]);

    // Fragmentos
    let flags_frag = ((packet[ip_start + 6] as u16) << 8) | (packet[ip_start + 7] as u16);
    let frag_offset = flags_frag & 0x1fff;
    let more_fragments = (flags_frag & 0x2000) != 0;
    if frag_offset != 0 || more_fragments {
        // Válido pero no reensamblable sin estado: se ignora, no es un parse error.
        return Ok(None);
    }

    let src_local = local.contains(src_ip);
    let dst_local = local.contains(dst_ip);
    // En modo promiscuo se ven flujos de otros hosts de la red: no son malformados.
    if !src_local && !dst_local {
        return Ok(None);
    }

    let transport_start = ip_start + ihl;
    match protocol {
        6 => {
            // TCP
            if packet.len() < transport_start + 20 {
                return Err(ParseError::TransportMalformed);
            }
            let data_offset = ((packet[transport_start + 12] >> 4) as usize) * 4;
            if data_offset < 20 {
                return Err(ParseError::TransportMalformed);
            }
            let src_port =
                ((packet[transport_start] as u16) << 8) | (packet[transport_start + 1] as u16);
            let dst_port =
                ((packet[transport_start + 2] as u16) << 8) | (packet[transport_start + 3] as u16);
            let payload_len = if packet.len() >= transport_start + data_offset {
                packet.len() - transport_start - data_offset
            } else {
                0
            };

            let (flow, direction) = if src_local && !dst_local {
                (
                    FlowKey {
                        src_ip,
                        dst_ip,
                        src_port,
                        dst_port,
                        protocol: Protocol::Tcp,
                    },
                    Direction::Out,
                )
            } else {
                (
                    FlowKey {
                        src_ip,
                        dst_ip,
                        src_port,
                        dst_port,
                        protocol: Protocol::Tcp,
                    },
                    Direction::In,
                )
            };

            Ok(Some(FlowUpdate {
                ts,
                flow,
                bytes: payload_len as u64,
                packets: 1,
                direction,
            }))
        }
        17 => {
            // UDP
            if packet.len() < transport_start + 8 {
                return Err(ParseError::TransportMalformed);
            }
            let src_port =
                ((packet[transport_start] as u16) << 8) | (packet[transport_start + 1] as u16);
            let dst_port =
                ((packet[transport_start + 2] as u16) << 8) | (packet[transport_start + 3] as u16);
            let udp_len =
                ((packet[transport_start + 4] as u16) << 8) | (packet[transport_start + 5] as u16);
            let payload_len = if udp_len >= 8 {
                (udp_len as usize) - 8
            } else {
                0
            };

            let (flow, direction) = if src_local && !dst_local {
                (
                    FlowKey {
                        src_ip,
                        dst_ip,
                        src_port,
                        dst_port,
                        protocol: Protocol::Udp,
                    },
                    Direction::Out,
                )
            } else {
                (
                    FlowKey {
                        src_ip,
                        dst_ip,
                        src_port,
                        dst_port,
                        protocol: Protocol::Udp,
                    },
                    Direction::In,
                )
            };

            Ok(Some(FlowUpdate {
                ts,
                flow,
                bytes: payload_len as u64,
                packets: 1,
                direction,
            }))
        }
        // ICMP, ESP, GRE…: válidos pero fuera del modelo de flujos, se ignoran.
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::net::Ipv4Addr;

    fn local(ip: [u8; 4]) -> LocalIpSet {
        let mut set = HashSet::new();
        set.insert(u32::from(Ipv4Addr::from(ip)) as u128);
        LocalIpSet(set)
    }

    /// Ethernet + IPv4 con el transporte indicado.
    fn ipv4(
        src: [u8; 4],
        dst: [u8; 4],
        protocol: u8,
        flags_frag: u16,
        transport: &[u8],
    ) -> Vec<u8> {
        let mut packet = vec![0u8; 14];
        packet[12] = 0x08;
        packet[13] = 0x00;
        let total = 20 + transport.len();
        packet.push(0x45);
        packet.push(0);
        packet.extend_from_slice(&(total as u16).to_be_bytes());
        packet.extend_from_slice(&[0, 1]);
        packet.extend_from_slice(&flags_frag.to_be_bytes());
        packet.push(64);
        packet.push(protocol);
        packet.extend_from_slice(&[0, 0]);
        packet.extend_from_slice(&src);
        packet.extend_from_slice(&dst);
        packet.extend_from_slice(transport);
        packet
    }

    fn udp(payload: &[u8]) -> Vec<u8> {
        let len = 8 + payload.len();
        let mut transport = Vec::new();
        transport.extend_from_slice(&12345u16.to_be_bytes());
        transport.extend_from_slice(&53u16.to_be_bytes());
        transport.extend_from_slice(&(len as u16).to_be_bytes());
        transport.extend_from_slice(&[0, 0]);
        transport.extend_from_slice(payload);
        transport
    }

    const LOCAL: [u8; 4] = [192, 168, 1, 41];
    const REMOTE: [u8; 4] = [8, 8, 8, 8];

    #[test]
    fn fragmento_valido_se_ignora_sin_contar_error() {
        let packet = ipv4(LOCAL, REMOTE, 17, 0x2000, &udp(b"frag"));
        assert!(matches!(parse_packet(&local(LOCAL), &packet, 0), Ok(None)));
    }

    #[test]
    fn icmp_valido_se_ignora_sin_contar_error() {
        let packet = ipv4(LOCAL, REMOTE, 1, 0x4000, &[]);
        assert!(matches!(parse_packet(&local(LOCAL), &packet, 0), Ok(None)));
    }

    #[test]
    fn trafico_de_otro_host_se_ignora_sin_contar_error() {
        let packet = ipv4([10, 0, 0, 1], REMOTE, 17, 0x4000, &udp(b"x"));
        assert!(matches!(parse_packet(&local(LOCAL), &packet, 0), Ok(None)));
    }

    #[test]
    fn udp_minimo_local_si_se_agrega() {
        let packet = ipv4(LOCAL, REMOTE, 17, 0x4000, &udp(b""));
        let update = parse_packet(&local(LOCAL), &packet, 0)
            .expect("sin error")
            .expect("flujo");
        assert_eq!(update.bytes, 0);
        assert_eq!(update.flow.protocol, Protocol::Udp);
        assert!(matches!(update.direction, Direction::Out));
    }

    #[test]
    fn udp_truncado_sigue_siendo_error() {
        let packet = ipv4(LOCAL, REMOTE, 17, 0x4000, &[0u8; 6]);
        assert!(matches!(
            parse_packet(&local(LOCAL), &packet, 0),
            Err(ParseError::TransportMalformed)
        ));
    }
}
