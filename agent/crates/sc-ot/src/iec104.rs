//! IEC 60870-5-104: start `0x68`, longitud y APCI.
//!
//! Tabla M4 del diseño: `0x68` con `L ∈ [4, 253]` y payload corto es
//! `Probable`; APCI completo con formato U, S o I válido es `Confirmed`;
//! start distinto o `L` fuera de rango es `Reject`.

use crate::{Parsed, Protocol, Verdict};

/// Frame mínimo: start + longitud + 4 bytes de control.
const MIN_FRAME_LEN: usize = 6;

/// Longitud declarada mínima por el campo `L`.
const LEN_MIN: usize = 4;

/// Longitud declarada máxima por el campo `L`.
const LEN_MAX: usize = 253;

/// Valores de control de las tramas U admitidas (STARTDT, STOPDT, TESTFR).
const U_FRAMES: [u8; 6] = [0x07, 0x0B, 0x13, 0x23, 0x43, 0x83];

/// Control de una trama S.
const S_FRAME: u8 = 0x01;

/// Clasifica un segmento como IEC 60870-5-104.
pub fn classify(data: &[u8]) -> Verdict {
    if data.len() < MIN_FRAME_LEN {
        if data.len() >= 2 && data[0] == 0x68 {
            let declared = data[1] as usize;
            if (LEN_MIN..=LEN_MAX).contains(&declared) {
                return Verdict::Probable(Parsed {
                    protocol: Protocol::Iec104,
                    fn_code: None,
                });
            }
        }
        return Verdict::Reject;
    }

    if data[0] != 0x68 {
        return Verdict::Reject;
    }
    let declared = data[1] as usize;
    if !(LEN_MIN..=LEN_MAX).contains(&declared) {
        return Verdict::Reject;
    }

    let total = declared + 2;
    if data.len() < total {
        return Verdict::Probable(Parsed {
            protocol: Protocol::Iec104,
            fn_code: None,
        });
    }
    if data.len() > total {
        return Verdict::Reject;
    }

    // Formato del APCI por el primer byte de control: U, S o I. Un byte de
    // control impar que no sea S ni una U conocida no es un APCI válido.
    let control = data[2];
    let valid_u = U_FRAMES.contains(&control);
    let valid_s = control == S_FRAME;
    let valid_i = control & 0x01 == 0;
    if valid_u || valid_s || valid_i {
        return Verdict::Confirmed(Parsed {
            protocol: Protocol::Iec104,
            fn_code: None,
        });
    }

    Verdict::Reject
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(control: u8) -> Vec<u8> {
        vec![0x68, 0x04, control, 0x00, 0x00, 0x00]
    }

    #[test]
    fn confirma_trama_u() {
        assert_eq!(
            classify(&frame(0x07)),
            Verdict::Confirmed(Parsed {
                protocol: Protocol::Iec104,
                fn_code: None,
            })
        );
    }

    #[test]
    fn confirma_trama_s_e_i() {
        assert!(classify(&frame(S_FRAME)).is_confirmed());
        assert!(classify(&frame(0x00)).is_confirmed());
        assert!(classify(&frame(0x02)).is_confirmed());
    }

    #[test]
    fn reject_control_impar_desconocido() {
        assert_eq!(classify(&frame(0x05)), Verdict::Reject);
    }

    #[test]
    fn probable_con_payload_corto() {
        assert_eq!(
            classify(&[0x68, 0x04, 0x07]),
            Verdict::Probable(Parsed {
                protocol: Protocol::Iec104,
                fn_code: None,
            })
        );
    }

    #[test]
    fn reject_start_y_longitud_invalidos() {
        assert_eq!(
            classify(&[0x67, 0x04, 0x07, 0x00, 0x00, 0x00]),
            Verdict::Reject
        );
        assert_eq!(classify(&[0x68, 0x03, 0x07, 0x00, 0x00]), Verdict::Reject);
        assert_eq!(
            classify(&[0x68, 0xFE, 0x07, 0x00, 0x00, 0x00]),
            Verdict::Reject
        );
    }

    #[test]
    fn reject_bytes_de_mas() {
        let mut data = frame(0x07);
        data.push(0x00);
        assert_eq!(classify(&data), Verdict::Reject);
    }
}
