//! Paridad con los fixtures binarios de E2.0 (`agent/fixtures/ot/`).
//!
//! Los mismos 12 archivos que clasifica el spike de firmas deben dar el mismo
//! veredicto con los parsers del crate: 4 positivos confirmados con su
//! protocolo y 8 negativos en `Reject`.

use std::fs;
use std::path::PathBuf;

use sc_ot::{classify, classify_aligned, Protocol, Verdict};

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("fixtures")
        .join("ot")
}

fn read_fixture(name: &str) -> Vec<u8> {
    let path = fixture_dir().join(name);
    fs::read(&path).unwrap_or_else(|e| panic!("no se pudo leer {}: {}", path.display(), e))
}

fn assert_confirmed(name: &str, expected: Protocol) {
    let data = read_fixture(name);
    let verdict = classify(&data);
    assert_eq!(
        verdict.protocol(),
        Some(expected),
        "{name} debería confirmar {expected:?}, dio {verdict:?}"
    );
    assert!(verdict.is_confirmed(), "{name} debería ser Confirmed");
    let (offset, aligned) = classify_aligned(&data);
    assert_eq!(
        (offset, aligned),
        (0, verdict),
        "{name} no debería desplazarse"
    );
}

fn assert_rejected(name: &str) {
    let data = read_fixture(name);
    assert_eq!(
        classify(&data),
        Verdict::Reject,
        "{name} debería ser Reject"
    );
}

#[test]
fn positivos_confirman_su_protocolo() {
    assert_confirmed("modbus_tcp_read_holding.bin", Protocol::Modbus);
    assert_confirmed("s7comm_read_var.bin", Protocol::S7Comm);
    assert_confirmed("dnp3_link_status_crc_ok.bin", Protocol::Dnp3);
    assert_confirmed("iec104_startdt_act.bin", Protocol::Iec104);
}

#[test]
fn modbus_expone_codigo_de_funcion() {
    let data = read_fixture("modbus_tcp_read_holding.bin");
    let verdict = classify(&data);
    assert_eq!(verdict.parsed().and_then(|p| p.fn_code), Some(0x03));
}

#[test]
fn negativos_estructurales_rechazan() {
    assert_rejected("modbus_tcp_bad_pid.bin");
    assert_rejected("s7comm_bad_tpkt.bin");
    assert_rejected("dnp3_link_status_crc_bad.bin");
    assert_rejected("neg_tcp_fragmented.bin");
    assert_rejected("neg_vlan.bin");
    assert_rejected("neg_gre.bin");
    assert_rejected("neg_tcp_retransmission.bin");
    assert_rejected("neg_http_on_ot_port.bin");
}

#[test]
fn crc_roto_no_degrada_a_probable() {
    let data = read_fixture("dnp3_link_status_crc_bad.bin");
    assert_eq!(classify(&data), Verdict::Reject);
    assert!(!matches!(classify(&data), Verdict::Probable(_)));
}

#[test]
fn los_doce_fixtures_existen() {
    let names = [
        "modbus_tcp_read_holding.bin",
        "modbus_tcp_bad_pid.bin",
        "s7comm_read_var.bin",
        "s7comm_bad_tpkt.bin",
        "dnp3_link_status_crc_ok.bin",
        "dnp3_link_status_crc_bad.bin",
        "iec104_startdt_act.bin",
        "neg_tcp_fragmented.bin",
        "neg_vlan.bin",
        "neg_gre.bin",
        "neg_tcp_retransmission.bin",
        "neg_http_on_ot_port.bin",
    ];
    for name in names {
        assert!(fixture_dir().join(name).is_file(), "falta {name}");
    }
}
