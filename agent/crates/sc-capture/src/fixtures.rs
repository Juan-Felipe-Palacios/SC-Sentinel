//! Generador de fixture pcap sintético (formato pcap raw)
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use std::fs::File;
use std::io::Write;
use std::path::Path;

pub fn generate_loopback_trace(path: &Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut file = File::create(path)?;

    // Pcap global header (big endian)
    file.write_all(&0xa1b2c3d4u32.to_be_bytes())?;
    file.write_all(&2u16.to_be_bytes())?; // major
    file.write_all(&4u16.to_be_bytes())?; // minor
    file.write_all(&0i32.to_be_bytes())?; // tz
    file.write_all(&0u32.to_be_bytes())?; // sigfigs
    file.write_all(&65535u32.to_be_bytes())?; // snaplen
    file.write_all(&1u32.to_be_bytes())?; // ethernet

    let mut ts_sec: u32 = 1700000000;
    let mut ts_usec: u32 = 0;

    let src_ip = [10, 0, 0, 1];
    let dst_ip = [10, 0, 0, 2];
    let src_mac = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55];
    let dst_mac = [0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb];

    // 3 frames src -> dst
    for i in 0..3 {
        let payload = format!("HELLO{}", i).into_bytes();
        let packet = build_tcp_packet(
            &src_mac, &dst_mac, &src_ip, &dst_ip, 50000, 443, &payload, i as u32,
        );
        write_packet(&mut file, ts_sec, ts_usec, &packet)?;
        ts_usec += 10000;
        if ts_usec >= 1_000_000 {
            ts_sec += 1;
            ts_usec -= 1_000_000;
        }
    }

    // 3 frames dst -> src
    for i in 0..3 {
        let payload = format!("WORLD{}", i).into_bytes();
        let packet = build_tcp_packet(
            &dst_mac,
            &src_mac,
            &dst_ip,
            &src_ip,
            443,
            50000,
            &payload,
            (100 + i) as u32,
        );
        write_packet(&mut file, ts_sec, ts_usec, &packet)?;
        ts_usec += 10000;
        if ts_usec >= 1_000_000 {
            ts_sec += 1;
            ts_usec -= 1_000_000;
        }
    }

    // ARP
    let arp_packet = build_arp_packet(&src_mac, &src_ip);
    write_packet(&mut file, ts_sec, ts_usec, &arp_packet)?;

    Ok(())
}

fn write_packet<W: Write>(
    file: &mut W,
    ts_sec: u32,
    ts_usec: u32,
    packet: &[u8],
) -> std::io::Result<()> {
    file.write_all(&ts_sec.to_be_bytes())?;
    file.write_all(&ts_usec.to_be_bytes())?;
    file.write_all(&(packet.len() as u32).to_be_bytes())?;
    file.write_all(&(packet.len() as u32).to_be_bytes())?;
    file.write_all(packet)?;
    Ok(())
}

fn build_tcp_packet(
    src_mac: &[u8; 6],
    dst_mac: &[u8; 6],
    src_ip: &[u8; 4],
    dst_ip: &[u8; 4],
    src_port: u16,
    dst_port: u16,
    payload: &[u8],
    seq: u32,
) -> Vec<u8> {
    let mut packet = Vec::new();

    // Ethernet header
    packet.extend_from_slice(dst_mac);
    packet.extend_from_slice(src_mac);
    packet.extend_from_slice(&[0x08, 0x00]); // EtherType IPv4

    // IP header
    packet.push(0x45);
    packet.push(0x00);
    let total_len = 20 + 20 + payload.len();
    packet.extend_from_slice(&(total_len as u16).to_be_bytes());
    packet.extend_from_slice(&[0x00, 0x01]);
    packet.extend_from_slice(&[0x40, 0x00]);
    packet.push(64);
    packet.push(6);
    packet.extend_from_slice(&[0x00, 0x00]);
    packet.extend_from_slice(src_ip);
    packet.extend_from_slice(dst_ip);
    let ip_checksum = checksum(&packet[14..34]);
    packet[24..26].copy_from_slice(&ip_checksum);

    // TCP header
    let tcp_start = packet.len();
    packet.extend_from_slice(&src_port.to_be_bytes());
    packet.extend_from_slice(&dst_port.to_be_bytes());
    packet.extend_from_slice(&seq.to_be_bytes());
    packet.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
    packet.push(0x50);
    packet.push(0x18);
    packet.extend_from_slice(&[0x05, 0xb4]);
    packet.extend_from_slice(&[0x00, 0x00]);
    packet.extend_from_slice(&[0x00, 0x00]);

    let mut tcp_pseudo = Vec::new();
    tcp_pseudo.extend_from_slice(src_ip);
    tcp_pseudo.extend_from_slice(dst_ip);
    tcp_pseudo.push(0x00);
    tcp_pseudo.push(6);
    let tcp_len = 20 + payload.len();
    tcp_pseudo.extend_from_slice(&(tcp_len as u16).to_be_bytes());
    tcp_pseudo.extend_from_slice(&packet[tcp_start..tcp_start + 20]);
    tcp_pseudo.extend_from_slice(payload);
    let tcp_checksum = checksum(&tcp_pseudo);
    packet[tcp_start + 16..tcp_start + 18].copy_from_slice(&tcp_checksum);

    packet.extend_from_slice(payload);
    packet
}

fn build_arp_packet(src_mac: &[u8; 6], src_ip: &[u8; 4]) -> Vec<u8> {
    let mut packet = Vec::new();
    packet.extend_from_slice(&[0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    packet.extend_from_slice(src_mac);
    packet.extend_from_slice(&[0x08, 0x06]);
    packet.extend_from_slice(&[0x00, 0x01]);
    packet.extend_from_slice(&[0x08, 0x00]);
    packet.push(6);
    packet.push(4);
    packet.extend_from_slice(&[0x00, 0x01]);
    packet.extend_from_slice(src_mac);
    packet.extend_from_slice(src_ip);
    packet.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    packet.extend_from_slice(&[0x0a, 0x00, 0x00, 0x02]);
    packet
}

fn checksum(data: &[u8]) -> [u8; 2] {
    let mut sum: u32 = 0;
    let mut i = 0;
    while i < data.len() {
        if i + 1 < data.len() {
            sum += ((data[i] as u32) << 8) | (data[i + 1] as u32);
        } else {
            sum += (data[i] as u32) << 8;
        }
        i += 2;
    }
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    let result = !(sum as u16);
    result.to_be_bytes()
}
