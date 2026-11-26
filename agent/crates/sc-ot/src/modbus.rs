//! Modbus/TCP: cabecera MBAP más código de función.
//!
//! Tabla M4 del diseño: `pid == 0` y `L ∈ [2, 254]` con payload incompleto es
//! `Probable`; MBAP completo con coherencia de longitud y función de la
//! allowlist es `Confirmed`; `pid ≠ 0` o función fuera de la lista es `Reject`.

use crate::{Parsed, Protocol, Verdict};

/// Longitud de la cabecera MBAP: transaction id (2), protocol id (2), length (2).
pub const MBAP_LEN: usize = 6;

/// Longitud mínima declarada por MBAP: unit id + código de función.
pub const LEN_MIN: usize = 2;

/// Longitud máxima declarada por MBAP.
pub const LEN_MAX: usize = 254;

/// Frame mínimo: MBAP completo más unit id y código de función.
const MIN_FRAME_LEN: usize = 8;

/// Códigos de función Modbus admitidos (tabla de firmas de M4).
///
/// Son los que un maestro real usa de forma habitual; el resto se considera
/// firma inválida para no confirmar tráfico ajeno en el puerto 502.
pub fn allowed_fn_code(fn_code: u8) -> bool {
    matches!(fn_code, 1..=8 | 11 | 12 | 15..=17 | 20..=24 | 43)
}

/// Clasifica un segmento como Modbus/TCP.
pub fn classify(data: &[u8]) -> Verdict {
    if data.len() < MIN_FRAME_LEN {
        return Verdict::Reject;
    }
    // Protocol id 0x0000 identifica Modbus dentro de MBAP.
    if data[2] != 0x00 || data[3] != 0x00 {
        return Verdict::Reject;
    }
    let declared = u16::from_be_bytes([data[4], data[5]]) as usize;
    if !(LEN_MIN..=LEN_MAX).contains(&declared) {
        return Verdict::Reject;
    }

    let total = MBAP_LEN + declared;
    if data.len() < total {
        // Payload segmentado: se tolera como probable y se reintenta el peek.
        return Verdict::Probable(Parsed {
            protocol: Protocol::Modbus,
            fn_code: None,
        });
    }
    if data.len() > total {
        return Verdict::Reject;
    }

    // Offset 7: primer byte de la PDU después de unit id.
    let fn_code = data[7];
    if !allowed_fn_code(fn_code) {
        return Verdict::Reject;
    }

    Verdict::Confirmed(Parsed {
        protocol: Protocol::Modbus,
        fn_code: Some(fn_code),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(fn_code: u8, declared: u8, payload: &[u8]) -> Vec<u8> {
        let mut data = vec![0x00, 0x01, 0x00, 0x00, 0x00, declared, 0x01, fn_code];
        data.extend_from_slice(payload);
        data
    }

    #[test]
    fn confirmado_con_funcion_permitida() {
        let data = frame(0x03, 2, &[]);
        assert_eq!(
            classify(&data),
            Verdict::Confirmed(Parsed {
                protocol: Protocol::Modbus,
                fn_code: Some(0x03),
            })
        );
    }

    #[test]
    fn probable_si_falta_payload() {
        let data = frame(0x03, 6, &[]);
        assert_eq!(
            classify(&data),
            Verdict::Probable(Parsed {
                protocol: Protocol::Modbus,
                fn_code: None,
            })
        );
    }

    #[test]
    fn reject_con_pid_distinto() {
        let mut data = frame(0x03, 2, &[]);
        data[3] = 0x01;
        assert_eq!(classify(&data), Verdict::Reject);
    }

    #[test]
    fn reject_con_longitud_fuera_de_rango() {
        assert_eq!(classify(&frame(0x03, 1, &[])), Verdict::Reject);
        assert_eq!(classify(&frame(0x03, 255, &[])), Verdict::Reject);
    }

    #[test]
    fn reject_con_funcion_fuera_de_allowlist() {
        assert_eq!(classify(&frame(0x09, 2, &[])), Verdict::Reject);
        assert_eq!(classify(&frame(0x00, 2, &[])), Verdict::Reject);
    }

    #[test]
    fn reject_con_bytes_de_mas() {
        let mut data = frame(0x03, 2, &[]);
        data.push(0x00);
        assert_eq!(classify(&data), Verdict::Reject);
    }

    #[test]
    fn allowlist_cubre_lecturas_escrituras_y_diagnostico() {
        for fn_code in [1u8, 3, 4, 6, 8, 16, 23, 43] {
            assert!(
                allowed_fn_code(fn_code),
                "fc {fn_code} debería estar permitida"
            );
        }
        for fn_code in [0u8, 9, 10, 13, 14, 18, 19, 25, 44, 255] {
            assert!(
                !allowed_fn_code(fn_code),
                "fc {fn_code} no debería estar permitida"
            );
        }
    }
}
