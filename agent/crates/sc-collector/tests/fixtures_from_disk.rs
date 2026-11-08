//! Regresión de los fixtures saneados del colector en `docs/testing/fixtures/`.
//!
//! Son datagramas NetFlow v5/v9 e IPFIX (y un pcap que los contiene) generados
//! por el ejemplo `synthetic_exporter --dump`. Validan el camino completo
//! detect → parse → normalizar sin hardware, con IPs de documentación
//! (TEST-NET) y timestamps fijos. Ver `docs/testing/fixtures/README.md`.

use sc_capture::{Direction, FlowUpdate};
use sc_collector::{detect_protocol, ProtocolKind, ProtocolSet};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

const DUMP_UNIX_SECS: i64 = 1_700_000_000;
const DUMP_MILLIS_NS: i64 = 1_700_000_000_500_000_000;

/// `agent/crates/sc-collector` → raíz del repo → `docs/testing/fixtures`.
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../docs/testing/fixtures")
}

fn fixture(name: &str) -> Vec<u8> {
    let path = fixtures_dir().join(name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("no se pudo leer {}: {e}", path.display()))
}

fn source(port: u16) -> SocketAddr {
    format!("192.0.2.1:{port}")
        .parse()
        .expect("socket addr de documentación")
}

/// IPv4 como u128 (mismo criterio que `ip_to_u128` del normalizador).
fn ip4(a: u8, b: u8, c: u8, d: u8) -> u128 {
    u32::from_be_bytes([a, b, c, d]) as u128
}

/// Los tres clientes TEST-NET-2 que rota el ejemplo (Direction::In → src_ip).
fn clients() -> [u128; 3] {
    [
        ip4(198, 51, 100, 11),
        ip4(198, 51, 100, 12),
        ip4(198, 51, 100, 13),
    ]
}

fn servers() -> [u128; 3] {
    [
        ip4(203, 0, 113, 20),
        ip4(203, 0, 113, 53),
        ip4(203, 0, 113, 80),
    ]
}

/// Asserts comunes a los tres protocolos: 3 flujos, hosts TEST-NET, sin PII.
fn assert_flujos_saneados(flows: &[FlowUpdate], protocolo: &str) {
    assert_eq!(
        flows.len(),
        3,
        "{protocolo}: se esperaban 3 flujos, llegaron {}",
        flows.len()
    );

    let mut srcs: Vec<u128> = flows.iter().map(|f| f.flow.src_ip).collect();
    srcs.sort_unstable();
    let mut expected = clients();
    expected.sort_unstable();
    assert_eq!(srcs, expected, "{protocolo}: clientes TEST-NET-2");

    for flow in flows {
        assert!(
            servers().contains(&flow.flow.dst_ip),
            "{protocolo}: dst_ip {} fuera de TEST-NET-3",
            flow.flow.dst_ip
        );
        // sample(i): src_port = 49152 + (i * 7) % 16384 → 49152, 49159, 49166.
        assert!(
            [49152u16, 49159, 49166].contains(&flow.flow.src_port),
            "{protocolo}: puerto origen inesperado {}",
            flow.flow.src_port
        );
        assert!(
            [443u16, 53, 80].contains(&flow.flow.dst_port),
            "{protocolo}: puerto destino inesperado {}",
            flow.flow.dst_port
        );
        assert!(
            flow.bytes > 0 && flow.packets > 0,
            "{protocolo}: bytes/packets deben ser > 0"
        );
        assert_eq!(
            flow.direction,
            Direction::In,
            "{protocolo}: Direction::In es la política actual (ADR-0014)"
        );
        use sc_core::Protocol;
        let esperado = match flow.flow.dst_port {
            443 | 80 => Protocol::Tcp,
            53 => Protocol::Udp,
            other => panic!("puerto inesperado {other}"),
        };
        assert_eq!(flow.flow.protocol, esperado, "{protocolo}: protocolo");
    }
}

#[test]
fn fixtures_libres_de_ips_internas_de_prueba() {
    // Regla de docs/testing/fixtures.md: ninguna IP real ni de pruebas
    // anteriores (192.168.1.41 / 8.8.8.8) puede colarse en los binarios.
    let internas: [&[u8]; 2] = [&[192, 168, 1, 41], &[8, 8, 8, 8]];
    for name in [
        "netflow-v5.bin",
        "netflow-v9-template.bin",
        "netflow-v9-data.bin",
        "ipfix-template.bin",
        "ipfix-data.bin",
        "exporter-sample.pcap",
    ] {
        let data = fixture(name);
        for patron in internas {
            assert!(
                !data.windows(patron.len()).any(|w| w == patron),
                "{name} contiene bytes de una IP interna/prohibida"
            );
        }
    }
}

#[test]
fn netflow_v5_en_disco_parsea_tres_flujos() {
    let data = fixture("netflow-v5.bin");
    assert_eq!(detect_protocol(&data), Some(ProtocolKind::NetFlowV5));

    let mut set = ProtocolSet::new();
    let flows = set
        .parse(source(2055), &data, 0)
        .expect("NetFlow v5 del fixture");
    assert_flujos_saneados(&flows, "v5");

    // v5 no usa templates: el tiempo sale de unix_secs del header.
    for flow in &flows {
        assert_eq!(
            flow.ts,
            DUMP_UNIX_SECS * 1_000_000_000,
            "v5: ts_nanos = unix_secs × 1e9"
        );
    }
}

#[test]
fn netflow_v9_template_luego_data_parsea() {
    let template = fixture("netflow-v9-template.bin");
    assert_eq!(detect_protocol(&template), Some(ProtocolKind::NetFlowV9));

    let mut set = ProtocolSet::new();
    let primeros = set
        .parse(source(2055), &template, 0)
        .expect("template v9 válido");
    assert!(primeros.is_empty(), "un template no produce flujos");
    assert_eq!(set.cached_templates(), 1, "template cacheado por origen");

    let data = fixture("netflow-v9-data.bin");
    let flows = set
        .parse(source(2055), &data, 0)
        .expect("data v9 con template cacheado");
    assert_flujos_saneados(&flows, "v9");
}

#[test]
fn ipfix_template_luego_data_parsea() {
    let template = fixture("ipfix-template.bin");
    assert_eq!(detect_protocol(&template), Some(ProtocolKind::Ipfix));

    let mut set = ProtocolSet::new();
    let primeros = set
        .parse(source(4739), &template, 0)
        .expect("template IPFIX válido");
    assert!(primeros.is_empty(), "un template no produce flujos");
    assert_eq!(set.cached_templates(), 1, "template cacheado por origen");

    let data = fixture("ipfix-data.bin");
    let flows = set
        .parse(source(4739), &data, 0)
        .expect("data IPFIX con template cacheado");
    assert_flujos_saneados(&flows, "ipfix");

    // IE152 (start en millis) fija el timestamp absoluto del dump.
    for flow in &flows {
        assert_eq!(
            flow.ts, DUMP_MILLIS_NS,
            "ipfix: ts_nanos desde IE152 en millis"
        );
    }
}

/// El pcap es la misma evidencia que adjuntaría un operador con Wireshark:
/// 5 tramas Ethernet/IPv4/UDP con los datagramas de arriba.
#[test]
fn pcap_del_exportador_contiene_los_cinco_datagramas() {
    let pcap = fixture("exporter-sample.pcap");
    assert_eq!(
        &pcap[0..4],
        &[0xA1, 0xB2, 0xC3, 0xD4],
        "magic pcap big-endian"
    );

    let mut offset = 24; // cabecera global
    let mut vistos = Vec::new();
    while offset + 16 <= pcap.len() {
        let incl_len =
            u32::from_be_bytes(pcap[offset + 8..offset + 12].try_into().unwrap()) as usize;
        let trama = &pcap[offset + 16..offset + 16 + incl_len];
        offset += 16 + incl_len;

        // Ethernet (14) + IPv4 (20) + UDP (8)
        assert_eq!(trama[12..14], [0x08, 0x00], "EtherType IPv4");
        assert_eq!(trama[14] >> 4, 4, "versión IPv4");
        assert_eq!(trama[23], 17, "protocolo UDP");
        let udp_len = u16::from_be_bytes([trama[38], trama[39]]) as usize - 8; // cabecera UDP incluida
        let payload = &trama[42..42 + udp_len];
        let puerto = u16::from_be_bytes([trama[36], trama[37]]);
        vistos.push((detect_protocol(payload), puerto, payload.to_vec()));
    }

    assert_eq!(
        vistos.len(),
        5,
        "v5, template v9, data v9, template IPFIX, data IPFIX"
    );

    let esperado = [
        (Some(ProtocolKind::NetFlowV5), 2055),
        (Some(ProtocolKind::NetFlowV9), 2055),
        (Some(ProtocolKind::NetFlowV9), 2055),
        (Some(ProtocolKind::Ipfix), 4739),
        (Some(ProtocolKind::Ipfix), 4739),
    ];
    for (i, (kind, puerto)) in esperado.iter().enumerate() {
        assert_eq!(vistos[i].0, *kind, "trama {i}: protocolo");
        assert_eq!(vistos[i].1, *puerto, "trama {i}: puerto");
    }

    // Mismo ciclo que un listener real: un solo ProtocolSet, templates
    // cacheados del datagrama anterior resuelven el de datos.
    let mut set = ProtocolSet::new();
    let totales: Vec<usize> = vistos
        .iter()
        .map(|(_, puerto, payload)| {
            set.parse(source(*puerto), payload, 0)
                .expect("datagrama del pcap")
                .len()
        })
        .collect();
    assert_eq!(
        totales,
        vec![3, 0, 3, 0, 3],
        "flujos por trama (templates no producen flujos)"
    );
}

#[test]
fn el_directorio_de_fixtures_existe_y_esta_completo() {
    let dir = fixtures_dir();
    for name in [
        "netflow-v5.bin",
        "netflow-v9-template.bin",
        "netflow-v9-data.bin",
        "ipfix-template.bin",
        "ipfix-data.bin",
        "exporter-sample.pcap",
    ] {
        let path: &Path = &dir.join(name);
        assert!(path.is_file(), "falta {}", path.display());
    }
}
