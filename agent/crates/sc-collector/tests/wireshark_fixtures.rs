//! Tests de regresión con capturas reales Wireshark (T4.3).
//!
//! Lee los payloads extraídos de los pcaps jobaid (ver
//! fixtures/wireshark/README.md). Los `.bin` viven en
//! `fixtures/wireshark-extracted/` (gitignored) por la licencia de la fuente:
//! se regeneran con `scripts/extract-udp-payloads.py`.
//!
//! Son `#[ignore]`: no corren por defecto porque en un clon limpio del repo
//! todavía no existen los payloads. Se ejecutan con:
//! `cargo test -p sc-collector --test wireshark_fixtures -- --ignored`

use sc_collector::{detect_protocol, ProtocolSet};
use std::net::SocketAddr;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join("wireshark-extracted")
}

/// Lee manifest.tsv (fixture, src_ip, src_port, ...) generado por el
/// extractor, para parsear cada payload con el source real del pcap.
fn load_manifest(dir: &std::path::Path) -> Vec<(String, SocketAddr)> {
    let text = std::fs::read_to_string(dir.join("manifest.tsv"))
        .unwrap_or_else(|_| panic!("extrae primero los fixtures: scripts/extract-udp-payloads.py"));
    text.lines()
        .skip(1)
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let mut cols = line.split('\t');
            let name = cols.next().unwrap_or_default().to_owned();
            let ip: std::net::IpAddr = cols
                .next()
                .unwrap_or_default()
                .trim()
                .parse()
                .unwrap_or_else(|_| panic!("IP inválida en manifest.tsv: {line}"));
            let port: u16 = cols
                .next()
                .unwrap_or_default()
                .trim()
                .parse()
                .unwrap_or_else(|_| panic!("puerto inválido en manifest.tsv: {line}"));
            (name, SocketAddr::new(ip, port))
        })
        .collect()
}

/// Cada payload extraído parsea con un único parser por exportador
/// (sin empezar, porque v9/IPFIX con template y data en datagramas
/// distintos requieren la cache persistente del parser).
#[test]
#[ignore]
fn payloads_wireshark_parsean_sin_panic() {
    let dir = fixtures_dir();
    let manifest = load_manifest(&dir);
    assert!(
        manifest.len() >= 20,
        "se esperaban ≥20 payloads, hay {}",
        manifest.len()
    );

    let mut parsers: std::collections::HashMap<SocketAddr, ProtocolSet> =
        std::collections::HashMap::new();
    let mut ok_count = 0usize;
    let mut flows_total = 0usize;
    let mut version_counts = [0usize; 3]; // v5, v9, v10/ipfix
    for (name, source) in &manifest {
        let data = std::fs::read(dir.join(name))
            .unwrap_or_else(|_| panic!("payload ausente en el manifiesto: {name}"));
        let version = match detect_protocol(&data) {
            Some(sc_collector::ProtocolKind::NetFlowV5) => 0,
            Some(sc_collector::ProtocolKind::NetFlowV9) => 1,
            Some(sc_collector::ProtocolKind::Ipfix) => 2,
            None => panic!("payload sin versión detectada: {name}"),
        };
        version_counts[version] += 1;
        let parser = parsers.entry(*source).or_default();
        // Una captura real puede arrancar mid-stream: el primer datagrama de
        // v9_mpls trae data sin que el template se haya visto aún. Eso es un
        // error controlado (TemplateNotFound), no un panic.
        match parser.parse(*source, &data, 0) {
            Ok(flows) => {
                ok_count += 1;
                flows_total += flows.len();
                eprintln!("  {name} ({source}) -> {} flujos", flows.len());
            }
            Err(e) => {
                eprintln!(
                    "  {name} ({source}) -> {e:?} (controlado; la captura arranca mid-stream)"
                );
                // El único error aceptable de una captura real aislada es la
                // falta de template (no hay panics ni otros ParseError).
                assert!(
                    matches!(e, sc_collector::ParseError::TemplateNotFound(_)),
                    "error inesperado en payload real {name}: {e:?}"
                );
            }
        }
    }
    assert!(
        version_counts[0] >= 2,
        "al menos 2 payloads v5, hay {}",
        version_counts[0]
    );
    assert!(
        version_counts[1] >= 6,
        "al menos 6 payloads v9, hay {}",
        version_counts[1]
    );
    assert!(
        version_counts[2] >= 6,
        "al menos 6 payloads v10/IPFIX, hay {}",
        version_counts[2]
    );
    assert!(
        flows_total >= 8,
        "las capturas reales deben producir flujos normalizados (total {flows_total})"
    );
    eprintln!(
        "wireshark fixtures: {ok_count} payloads OK (v5={}, v9={}, v10={}), {flows_total} flujos",
        version_counts[0], version_counts[1], version_counts[2]
    );
}
