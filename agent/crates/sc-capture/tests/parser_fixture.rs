// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use sc_capture::{generate_loopback_trace, parse_packet, Direction, LocalIpSet};
use std::collections::HashSet;
use std::path::PathBuf;

#[test]
fn parse_loopback_fixture() {
    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("fixtures")
        .join("loopback-trace.pcap");

    // Generar fixture si no existe
    if !fixture_path.exists() {
        generate_loopback_trace(&fixture_path).expect("generar fixture");
    }

    let mut file = std::fs::File::open(&fixture_path).expect("abrir fixture");
    use pcap_file::pcap::PcapReader;
    let mut reader = PcapReader::new(&mut file).expect("leer pcap");

    // LocalIpSet con 10.0.0.2 local
    let mut local_set = HashSet::new();
    local_set.insert(u32::from(std::net::Ipv4Addr::new(10, 0, 0, 2)) as u128);
    let local = LocalIpSet(local_set);

    let mut updates = Vec::new();
    let mut arp_count = 0;
    while let Some(pkt) = reader.next_packet() {
        let packet = pkt.unwrap();
        match parse_packet(&local, &packet.data, packet.timestamp.as_secs() as i64) {
            Ok(Some(update)) => updates.push(update),
            Ok(None) => arp_count += 1, // ARP u otro no-IP
            Err(_) => {}                // contar como parse_error, no fallar el test
        }
    }

    assert_eq!(updates.len(), 6, "deben haber 6 FlowUpdates");
    assert!(
        arp_count >= 1,
        "debe haber al menos 1 frame ARP que resulte en Ok(None)"
    );

    // Contar por dirección
    let in_count = updates
        .iter()
        .filter(|u| matches!(u.direction, Direction::In))
        .count();
    let out_count = updates
        .iter()
        .filter(|u| matches!(u.direction, Direction::Out))
        .count();
    assert_eq!(in_count, 3);
    assert_eq!(out_count, 3);

    // Verificar que todos son TCP
    for update in &updates {
        assert_eq!(update.flow.protocol, sc_core::Protocol::Tcp);
        assert_eq!(update.packets, 1);
    }
}
