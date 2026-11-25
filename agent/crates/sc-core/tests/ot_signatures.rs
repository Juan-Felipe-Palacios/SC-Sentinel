//! E2.0 — Spike de firmas: clasificación byte-level de protocolos OT.
//!
//! Lee fixtures binarios de `agent/fixtures/ot/` y verifica que cada uno
//! se clasifica según la tabla normativa M4 (confirmado / probable / reject).
//!
//! CRC-16/DNP: poly 0x3D65 (reflected 0xA6BC), init 0x0000, xorout 0xFFFF,
//! reflected, almacenado little-endian. Validado con check("123456789") = 0xEA82.

use std::fs;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
enum OtClass {
    Confirmed(&'static str),
    Probable(&'static str),
    Reject,
}

// Allowlist de function codes Modbus (M4, tabla de firmas)
fn modbus_fc_allowed(fc: u8) -> bool {
    matches!(
        fc,
        1..=8 | 11 | 12 | 15..=17 | 20..=24 | 43
    )
}

// CRC-16/DNP
fn crc16_dnp(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        crc ^= byte as u16;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xA6BC;
            } else {
                crc >>= 1;
            }
        }
    }
    crc ^ 0xFFFF
}

fn classify_modbus(data: &[u8]) -> OtClass {
    if data.len() < 8 {
        return OtClass::Reject;
    }
    // pid (bytes 2-3) == 0x0000
    if data[2] != 0x00 || data[3] != 0x00 {
        return OtClass::Reject;
    }
    // L (bytes 4-5) en [2, 254], big-endian
    let l = u16::from_be_bytes([data[4], data[5]]) as usize;
    if !(2..=254).contains(&l) {
        return OtClass::Reject;
    }
    // Coherencia de length: total == 6 + L
    if data.len() != 6 + l {
        if data.len() < 6 + l {
            return OtClass::Probable("modbus");
        }
        return OtClass::Reject;
    }
    // fc en offset 7
    let fc = data[7];
    if !modbus_fc_allowed(fc) {
        return OtClass::Reject;
    }
    OtClass::Confirmed("modbus")
}

fn classify_s7comm(data: &[u8]) -> OtClass {
    if data.len() < 8 {
        return OtClass::Reject;
    }
    // TPKT: bytes 0-1 == 03 00
    if data[0] != 0x03 || data[1] != 0x00 {
        return OtClass::Reject;
    }
    // TPKT len (bytes 2-3) == largo real
    let tpkt_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    if tpkt_len != data.len() {
        return OtClass::Reject;
    }
    // COTP: byte 4 = 0x02 (LI), byte 5 = 0xF0 (DT), byte 6 = 0x80
    if data[4] != 0x02 || data[5] != 0xF0 || data[6] != 0x80 {
        return OtClass::Reject;
    }
    // Magic: byte 7 ∈ {0x32, 0x72}
    match data[7] {
        0x32 => OtClass::Confirmed("s7comm"),
        0x72 => OtClass::Confirmed("s7comm_plus"),
        _ => OtClass::Reject,
    }
}

fn classify_dnp3(data: &[u8]) -> OtClass {
    if data.len() < 10 {
        if data.len() >= 3 && data[0] == 0x05 && data[1] == 0x64 {
            let l = data[2] as usize;
            if (5..=255).contains(&l) {
                return OtClass::Probable("dnp3");
            }
        }
        return OtClass::Reject;
    }
    // Start: bytes 0-1 == 05 64
    if data[0] != 0x05 || data[1] != 0x64 {
        return OtClass::Reject;
    }
    // L (byte 2) ∈ [5, 255]
    let l = data[2] as usize;
    if !(5..=255).contains(&l) {
        return OtClass::Reject;
    }
    // CRC sobre bytes 0-7, little-endian en bytes 8-9
    let crc_calc = crc16_dnp(&data[0..8]);
    let crc_stored = u16::from_le_bytes([data[8], data[9]]);
    if crc_calc != crc_stored {
        // CRC roto → reject, nunca probable
        return OtClass::Reject;
    }
    OtClass::Confirmed("dnp3")
}

fn classify_iec104(data: &[u8]) -> OtClass {
    if data.len() < 6 {
        if data.len() >= 2 && data[0] == 0x68 {
            let l = data[1] as usize;
            if (4..=253).contains(&l) {
                return OtClass::Probable("iec104");
            }
        }
        return OtClass::Reject;
    }
    // Start: byte 0 == 0x68
    if data[0] != 0x68 {
        return OtClass::Reject;
    }
    // L (byte 1) ∈ [4, 253]
    let l = data[1] as usize;
    if !(4..=253).contains(&l) {
        return OtClass::Reject;
    }
    // Coherencia de length: total == L + 2
    if data.len() != l + 2 {
        if data.len() < l + 2 {
            return OtClass::Probable("iec104");
        }
        return OtClass::Reject;
    }
    // U-frame values: {0x07, 0x0B, 0x13, 0x23, 0x43, 0x83}
    let u_frames: [u8; 6] = [0x07, 0x0B, 0x13, 0x23, 0x43, 0x83];
    if u_frames.contains(&data[2]) {
        return OtClass::Confirmed("iec104");
    }
    // S-frame: (byte2 & 0x01) == 0x01
    if data[2] & 0x01 == 0x01 {
        return OtClass::Confirmed("iec104");
    }
    // I-frame: otherwise
    OtClass::Confirmed("iec104")
}

fn classify(data: &[u8]) -> OtClass {
    // Modbus: MBAP header (pid == 0)
    if data.len() >= 8 && data[2] == 0x00 && data[3] == 0x00 {
        let l = u16::from_be_bytes([data[4], data[5]]) as usize;
        if (2..=254).contains(&l) {
            let r = classify_modbus(data);
            if !matches!(r, OtClass::Reject) {
                return r;
            }
        }
    }
    // S7comm: TPKT 03 00
    if data.len() >= 2 && data[0] == 0x03 && data[1] == 0x00 {
        let r = classify_s7comm(data);
        if !matches!(r, OtClass::Reject) {
            return r;
        }
    }
    // DNP3: start 05 64
    if data.len() >= 2 && data[0] == 0x05 && data[1] == 0x64 {
        let r = classify_dnp3(data);
        // CRC roto → reject (ya devuelto por classify_dnp3)
        return r;
    }
    // IEC-104: start 0x68
    if !data.is_empty() && data[0] == 0x68 {
        let r = classify_iec104(data);
        if !matches!(r, OtClass::Reject) {
            return r;
        }
    }
    // Negativos estructurales → reject
    OtClass::Reject
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn fixture_path(name: &str) -> PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(manifest)
        .join("..")
        .join("..")
        .join("fixtures")
        .join("ot")
        .join(name)
}

fn read_fixture(name: &str) -> Vec<u8> {
    let path = fixture_path(name);
    fs::read(&path).unwrap_or_else(|e| panic!("no se pudo leer {}: {}", path.display(), e))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn ot_signatures_crc_standard() {
    assert_eq!(crc16_dnp(b"123456789"), 0xEA82);
}

#[test]
fn ot_signatures_modbus_confirmed() {
    let data = read_fixture("modbus_tcp_read_holding.bin");
    assert_eq!(data.len(), 12);
    assert_eq!(&data[2..4], &[0x00, 0x00], "pid debe ser 0x0000");
    let l = u16::from_be_bytes([data[4], data[5]]);
    assert_eq!(l, 6, "L debe ser 6");
    assert_eq!(data[7], 0x03, "fc debe ser 3");
    assert_eq!(classify(&data), OtClass::Confirmed("modbus"));
}

#[test]
fn ot_signatures_modbus_bad_pid_reject() {
    let data = read_fixture("modbus_tcp_bad_pid.bin");
    assert_eq!(data.len(), 12);
    assert_eq!(&data[2..4], &[0x00, 0x01], "pid debe ser 0x0001");
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_s7comm_confirmed() {
    let data = read_fixture("s7comm_read_var.bin");
    assert_eq!(data.len(), 31);
    assert_eq!(&data[0..2], &[0x03, 0x00]);
    let tpkt_len = u16::from_be_bytes([data[2], data[3]]);
    assert_eq!(tpkt_len as usize, data.len());
    assert_eq!(data[4], 0x02);
    assert_eq!(data[5], 0xF0);
    assert_eq!(data[6], 0x80);
    assert!(data[7] == 0x32 || data[7] == 0x72);
    assert_eq!(classify(&data), OtClass::Confirmed("s7comm"));
}

#[test]
fn ot_signatures_s7comm_bad_tpkt_reject() {
    let data = read_fixture("s7comm_bad_tpkt.bin");
    assert_eq!(data.len(), 31);
    assert_eq!(data[0], 0x02, "TPKT debe empezar con 0x02");
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_dnp3_crc_ok_confirmed() {
    let data = read_fixture("dnp3_link_status_crc_ok.bin");
    assert_eq!(data.len(), 10);
    assert_eq!(&data[0..2], &[0x05, 0x64]);
    assert_eq!(data[2], 0x05, "L debe ser 5");
    assert!(data[3] & 0x40 != 0, "bit PRM debe estar activo");
    let crc_calc = crc16_dnp(&data[0..8]);
    let crc_stored = u16::from_le_bytes([data[8], data[9]]);
    assert_eq!(crc_calc, crc_stored, "CRC debe coincidir");
    assert_eq!(crc_calc, 0x953B, "CRC debe ser 0x953B");
    assert_eq!(classify(&data), OtClass::Confirmed("dnp3"));
}

#[test]
fn ot_signatures_dnp3_crc_bad_reject() {
    let data = read_fixture("dnp3_link_status_crc_bad.bin");
    assert_eq!(data.len(), 10);
    assert_eq!(&data[0..2], &[0x05, 0x64]);
    let crc_calc = crc16_dnp(&data[0..8]);
    let crc_stored = u16::from_le_bytes([data[8], data[9]]);
    assert_ne!(crc_calc, crc_stored, "CRC debe ser inválido");
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_iec104_confirmed() {
    let data = read_fixture("iec104_startdt_act.bin");
    assert_eq!(data.len(), 6);
    assert_eq!(data[0], 0x68, "start debe ser 0x68");
    assert_eq!(data[1], 0x04, "L debe ser 4");
    assert_eq!(data[2], 0x07);
    assert_eq!(classify(&data), OtClass::Confirmed("iec104"));
}

#[test]
fn ot_signatures_neg_tcp_fragmented_reject() {
    let data = read_fixture("neg_tcp_fragmented.bin");
    assert_eq!(data.len(), 6);
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_neg_vlan_reject() {
    let data = read_fixture("neg_vlan.bin");
    assert_eq!(data.len(), 16);
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_neg_gre_reject() {
    let data = read_fixture("neg_gre.bin");
    assert_eq!(data.len(), 16);
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_neg_tcp_retransmission_reject() {
    let data = read_fixture("neg_tcp_retransmission.bin");
    assert_eq!(data.len(), 24);
    assert_eq!(classify(&data), OtClass::Reject);
}

#[test]
fn ot_signatures_neg_http_reject() {
    let data = read_fixture("neg_http_on_ot_port.bin");
    assert_eq!(data.len(), 16);
    assert_eq!(data[0], 0x47, "debe empezar con 'G'");
    assert_eq!(classify(&data), OtClass::Reject);
}

// ---------------------------------------------------------------------------
// OtBlock emission (Opción C: spike emite via json! sin tipado)
// ---------------------------------------------------------------------------

#[test]
fn ot_signatures_otblock_shape() {
    use serde_json::json;

    let ot_block = json!({
        "engine": "passive-v1",
        "capture_mode": "live",
        "truncated": false,
        "events": [
            {
                "rule": "ot_new_master",
                "host_key": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
                "protocol": "modbus",
                "confidence": 0.95,
                "evidence": {
                    "fn_codes": "3",
                    "allowlist_version": "1"
                },
                "client": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
                "server": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5"
            }
        ],
        "protocols": [
            {
                "name": "modbus",
                "role": "server",
                "first_seen": "2026-01-01T00:00:00Z",
                "last_seen": "2026-01-01T00:05:00Z"
            }
        ],
        "endpoints": [
            {
                "host_key": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
                "protocol": "modbus",
                "role": "server",
                "port": 502
            }
        ]
    });

    let serialized = serde_json::to_string(&ot_block).expect("OtBlock debe serializar");
    assert!(!serialized.is_empty());
    assert!(serialized.contains("\"engine\""));
    assert!(serialized.contains("\"events\""));
    assert!(serialized.contains("\"protocols\""));
    assert!(serialized.contains("\"endpoints\""));
    assert!(!serialized.contains("baseline_instance"));
    assert!(!serialized.contains("baseline_state"));
    assert!(!serialized.contains("baseline_epoch"));

    let parsed: serde_json::Value = serde_json::from_str(&serialized).unwrap();
    assert_eq!(parsed["events"].as_array().unwrap().len(), 1);
    assert_eq!(parsed["protocols"].as_array().unwrap().len(), 1);
    assert_eq!(parsed["endpoints"].as_array().unwrap().len(), 1);
}
