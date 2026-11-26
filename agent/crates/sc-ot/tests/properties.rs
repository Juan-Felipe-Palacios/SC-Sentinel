//! Property tests de la etapa E4 (`proptest`).
//!
//! Cubren los dos criterios del plan: ningún parser paniquea con bytes
//! arbitrarios y DNP3 sólo confirma con CRC válido. El `cargo fuzz` real queda
//! como deuda medida: la toolchain de la máquina y del CI es `stable`.

use proptest::prelude::*;
use sc_ot::{
    classify, classify_aligned, crc16_dnp, parse_dnp3, parse_iec104, parse_modbus, parse_s7comm,
    Protocol, Verdict, MAX_ALIGNMENT,
};

fn config() -> ProptestConfig {
    ProptestConfig {
        cases: 256,
        ..ProptestConfig::default()
    }
}

proptest! {
    #![proptest_config(config())]

    /// Cualquier byte string, de 0 a 2048 bytes, se clasifica sin panic.
    #[test]
    fn bytes_arbitrarios_nunca_paniquean(
        data in proptest::collection::vec(any::<u8>(), 0..=2048usize),
    ) {
        let verdict = classify(&data);
        let (offset, aligned) = classify_aligned(&data);
        prop_assert!(offset <= MAX_ALIGNMENT);
        prop_assert_eq!(aligned.parsed().map(|p| p.protocol), aligned.protocol());
        prop_assert_eq!(verdict.parsed().map(|p| p.protocol), verdict.protocol());
        let _ = parse_modbus(&data);
        let _ = parse_s7comm(&data);
        let _ = parse_dnp3(&data);
        let _ = parse_iec104(&data);
    }

    /// DNP3 confirmado exige que el CRC almacenado coincida con el calculado.
    #[test]
    fn dnp3_confirmed_exige_crc_valido(
        body in proptest::collection::vec(any::<u8>(), 8..=8usize),
        stored in any::<u16>(),
    ) {
        let mut data = body;
        data[0] = 0x05;
        data[1] = 0x64;
        data[2] = data[2].max(5);
        data.extend_from_slice(&stored.to_le_bytes());

        if let Verdict::Confirmed(parsed) = parse_dnp3(&data) {
            prop_assert_eq!(parsed.protocol, Protocol::Dnp3);
            let calculated = crc16_dnp(&data[..8]);
            let stored_le = u16::from_le_bytes([data[8], data[9]]);
            prop_assert_eq!(calculated, stored_le);
            prop_assert_eq!(stored, calculated);
        }
    }

    /// Modbus sólo confirma con MBAP completo y código de función de la allowlist.
    #[test]
    fn modbus_confirmed_exige_longitud_coherente(
        declared in 2u8..=254u8,
        fn_code in any::<u8>(),
    ) {
        let data = vec![0x00, 0x01, 0x00, 0x00, 0x00, declared, 0x01, fn_code];
        if let Verdict::Confirmed(parsed) = parse_modbus(&data) {
            prop_assert_eq!(parsed.protocol, Protocol::Modbus);
            prop_assert_eq!(parsed.fn_code, Some(fn_code));
            prop_assert_eq!(data.len(), 6 + declared as usize);
        }
    }

    /// IEC-104 sólo confirma con longitud declarada coherente y APCI U/S/I.
    #[test]
    fn iec104_confirmed_exige_longitud_coherente(
        declared in any::<u8>(),
        payload in proptest::collection::vec(any::<u8>(), 0..=8usize),
    ) {
        let mut data = vec![0x68, declared];
        data.extend_from_slice(&payload);
        if let Verdict::Confirmed(parsed) = parse_iec104(&data) {
            prop_assert_eq!(parsed.protocol, Protocol::Iec104);
            prop_assert_eq!(data.len(), declared as usize + 2);
        }
    }

    /// El offset reportado por `classify_aligned` reproduce el veredicto.
    #[test]
    fn alineacion_reportada_es_coherente(
        data in proptest::collection::vec(any::<u8>(), 0..=512usize),
    ) {
        let (offset, verdict) = classify_aligned(&data);
        prop_assert!(offset <= MAX_ALIGNMENT);
        if !matches!(verdict, Verdict::Reject) {
            prop_assert_eq!(classify(&data[offset as usize..]), verdict);
        }
    }

    /// S7 sólo confirma con TPKT coherente y magic conocida.
    #[test]
    fn s7_confirmed_exige_tpkt_coherente(
        magic in any::<u8>(),
        body in proptest::collection::vec(any::<u8>(), 0..=24usize),
    ) {
        let mut data = vec![0x03, 0x00, 0x00, 0x00, 0x02, 0xF0, 0x80, magic];
        data.extend_from_slice(&body);
        let tpkt_len = data.len() as u16;
        data[2..4].copy_from_slice(&tpkt_len.to_be_bytes());
        if let Verdict::Confirmed(parsed) = parse_s7comm(&data) {
            prop_assert!(matches!(parsed.protocol, Protocol::S7Comm | Protocol::S7CommPlus));
            prop_assert_eq!(parsed.protocol, if magic == 0x32 { Protocol::S7Comm } else { Protocol::S7CommPlus });
            let tpkt_len = u16::from_be_bytes([data[2], data[3]]) as usize;
            prop_assert_eq!(tpkt_len, data.len());
        }
    }
}
