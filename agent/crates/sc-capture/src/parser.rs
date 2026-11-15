// Derived from Sniffnet v1.5.1 (src/networking/parse_packets.rs),
// Copyright (c) 2022 Giuliano Bellini and contributors, dual-licensed MIT OR Apache-2.0.
// Modifications Copyright (c) 2026 Strategic Connex. All rights reserved.
// See THIRD_PARTY_NOTICES.md (Anexo A) for the full license texts.
//!
//! Parser de tramas Ethernet → IPv4 → TCP/UDP hacia `FlowUpdate`.
//!
//! Implementación propia y minimalista: solo interpreta lo que el modelo de
//! flujos de SC-Sentinel necesita (IPv4, TCP y UDP no fragmentados con al
//! menos un extremo local). Todo lo demás (ARP, ICMP, ESP, GRE, IPv6,
//! fragmentos) se descarta en silencio como `Ok(None)`, sin contar error.
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

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

/// Encabezado IPv4 ya validado.
struct Ipv4Header {
    src: u128,
    dst: u128,
    /// Código de protocolo IP (6 = TCP, 17 = UDP).
    protocol: u8,
    /// Desplazamiento del transporte desde el inicio de la trama.
    transport_start: usize,
    /// `true` para datagramas fragmentados: sin estado no se pueden
    /// reensamblar, así que se ignoran.
    fragment: bool,
}

/// Convierte una dirección IPv4 codificada como `u128` (32 bits bajos).
fn ip_to_u128_v4(ip: [u8; 4]) -> u128 {
    u32::from_be_bytes(ip) as u128
}

/// Punto de entrada: interpreta una trama Ethernet y devuelve el flujo que
/// representa, `None` si el paquete es válido pero no modelable, o un error
/// si está malformado.
pub fn parse_packet(
    local: &LocalIpSet,
    packet: &[u8],
    ts: i64,
) -> Result<Option<FlowUpdate>, ParseError> {
    let header = match read_ipv4(packet)? {
        Some(header) => header,
        None => return Ok(None),
    };

    if header.fragment {
        return Ok(None);
    }

    // En modo promiscuo se ven flujos de otros hosts de la red: no son
    // malformados, simplemente no pertenecen a este nodo.
    if !local.contains(header.src) && !local.contains(header.dst) {
        return Ok(None);
    }

    match header.protocol {
        6 => flow_tcp(local, header, packet, ts),
        17 => flow_udp(local, header, packet, ts),
        // ICMP, ESP, GRE…: válidos pero fuera del modelo de flujos.
        _ => Ok(None),
    }
}

/// Lee y valida el encabezado Ethernet + IPv4. Devuelve `None` para tramas
/// válidas que no son IPv4 (ARP, IPv6, …).
fn read_ipv4(packet: &[u8]) -> Result<Option<Ipv4Header>, ParseError> {
    const ETHERTYPE_IPV4: u16 = 0x0800;

    if packet.len() < 14 {
        return Err(ParseError::LinkUnsupported);
    }
    if u16::from_be_bytes([packet[12], packet[13]]) != ETHERTYPE_IPV4 {
        return Ok(None);
    }
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

    let flags_frag = u16::from_be_bytes([packet[ip_start + 6], packet[ip_start + 7]]);
    let fragment = (flags_frag & 0x2000) != 0 || (flags_frag & 0x1fff) != 0;

    Ok(Some(Ipv4Header {
        src: ip_to_u128_v4([
            packet[ip_start + 12],
            packet[ip_start + 13],
            packet[ip_start + 14],
            packet[ip_start + 15],
        ]),
        dst: ip_to_u128_v4([
            packet[ip_start + 16],
            packet[ip_start + 17],
            packet[ip_start + 18],
            packet[ip_start + 19],
        ]),
        protocol: packet[ip_start + 9],
        transport_start: ip_start + ihl,
        fragment,
    }))
}

/// Dirección del flujo: hacia fuera solo cuando el emisor es local y el
/// receptor no lo es; el resto se contabiliza como entrada.
fn direction_of(local: &LocalIpSet, header: &Ipv4Header) -> Direction {
    if local.contains(header.src) && !local.contains(header.dst) {
        Direction::Out
    } else {
        Direction::In
    }
}

fn flow_tcp(
    local: &LocalIpSet,
    header: Ipv4Header,
    packet: &[u8],
    ts: i64,
) -> Result<Option<FlowUpdate>, ParseError> {
    const TCP_HEADER_MIN: usize = 20;

    let start = header.transport_start;
    if packet.len() < start + TCP_HEADER_MIN {
        return Err(ParseError::TransportMalformed);
    }

    let data_offset = ((packet[start + 12] >> 4) as usize) * 4;
    if data_offset < TCP_HEADER_MIN {
        return Err(ParseError::TransportMalformed);
    }

    // Si la captura trunca el paquete tras el encabezado, el payload visible
    // es 0 (pasa igual con capturas cortas); no es un error.
    let payload_len = if packet.len() >= start + data_offset {
        packet.len() - start - data_offset
    } else {
        0
    };

    Ok(Some(FlowUpdate {
        ts,
        flow: FlowKey {
            src_ip: header.src,
            dst_ip: header.dst,
            src_port: u16::from_be_bytes([packet[start], packet[start + 1]]),
            dst_port: u16::from_be_bytes([packet[start + 2], packet[start + 3]]),
            protocol: Protocol::Tcp,
        },
        bytes: payload_len as u64,
        packets: 1,
        direction: direction_of(local, &header),
    }))
}

fn flow_udp(
    local: &LocalIpSet,
    header: Ipv4Header,
    packet: &[u8],
    ts: i64,
) -> Result<Option<FlowUpdate>, ParseError> {
    const UDP_HEADER_LEN: usize = 8;

    let start = header.transport_start;
    if packet.len() < start + UDP_HEADER_LEN {
        return Err(ParseError::TransportMalformed);
    }

    let datagram_len = u16::from_be_bytes([packet[start + 4], packet[start + 5]]);
    // La longitud del datagrama incluye los 8 bytes del encabezado UDP.
    let payload_len = (datagram_len as usize).saturating_sub(UDP_HEADER_LEN);

    Ok(Some(FlowUpdate {
        ts,
        flow: FlowKey {
            src_ip: header.src,
            dst_ip: header.dst,
            src_port: u16::from_be_bytes([packet[start], packet[start + 1]]),
            dst_port: u16::from_be_bytes([packet[start + 2], packet[start + 3]]),
            protocol: Protocol::Udp,
        },
        bytes: payload_len as u64,
        packets: 1,
        direction: direction_of(local, &header),
    }))
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
