//! S7comm sobre TPKT/COTP.
//!
//! Tabla M4 del diseño: TPKT válido más COTP CR/CC (`0xE0`/`0xD0`) sin PDU S7
//! es `Probable`; TPKT + COTP DT (`0xF0 0x80`) más magic `0x32`/`0x72` es
//! `Confirmed`; TPKT inválido es `Reject`. El protocolo nunca se decide por el
//! puerto.

use crate::{Parsed, Protocol, Verdict};

/// Frame mínimo: TPKT (4) + COTP DT (3) + magic (1).
const MIN_FRAME_LEN: usize = 8;

/// Magic de S7comm clásico (byte 7).
pub const MAGIC_S7COMM: u8 = 0x32;

/// Magic de S7comm Plus (byte 7).
pub const MAGIC_S7COMM_PLUS: u8 = 0x72;

/// Clasifica un segmento como S7comm o S7comm Plus.
pub fn classify(data: &[u8]) -> Verdict {
    if data.len() < MIN_FRAME_LEN {
        return Verdict::Reject;
    }
    // TPKT: versión 3 y reservado 0.
    if data[0] != 0x03 || data[1] != 0x00 {
        return Verdict::Reject;
    }
    let tpkt_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    if tpkt_len != data.len() {
        return Verdict::Reject;
    }

    // COTP DT: LI 2, PDU type 0xF0, EOT 0x80.
    if data[4] == 0x02 && data[5] == 0xF0 && data[6] == 0x80 {
        return match data[7] {
            MAGIC_S7COMM => Verdict::Confirmed(Parsed {
                protocol: Protocol::S7Comm,
                fn_code: None,
            }),
            MAGIC_S7COMM_PLUS => Verdict::Confirmed(Parsed {
                protocol: Protocol::S7CommPlus,
                fn_code: None,
            }),
            _ => Verdict::Reject,
        };
    }

    // COTP CR (0xE0) o CC (0xD0): conexión S7 sin PDU de aplicación todavía.
    if data[5] == 0xE0 || data[5] == 0xD0 {
        return Verdict::Probable(Parsed {
            protocol: Protocol::S7Comm,
            fn_code: None,
        });
    }

    Verdict::Reject
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dt_frame(magic: u8) -> Vec<u8> {
        let mut data = vec![0x03, 0x00, 0x00, 0x00, 0x02, 0xF0, 0x80, magic];
        data.extend_from_slice(&[0x00, 0x01]);
        let len = data.len() as u16;
        data[2..4].copy_from_slice(&len.to_be_bytes());
        data
    }

    #[test]
    fn confirma_s7comm_y_plus() {
        assert_eq!(
            classify(&dt_frame(MAGIC_S7COMM)),
            Verdict::Confirmed(Parsed {
                protocol: Protocol::S7Comm,
                fn_code: None,
            })
        );
        assert_eq!(
            classify(&dt_frame(MAGIC_S7COMM_PLUS)),
            Verdict::Confirmed(Parsed {
                protocol: Protocol::S7CommPlus,
                fn_code: None,
            })
        );
    }

    #[test]
    fn reject_magic_desconocido() {
        assert_eq!(classify(&dt_frame(0x00)), Verdict::Reject);
    }

    #[test]
    fn reject_tpkt_invalido() {
        let mut data = dt_frame(MAGIC_S7COMM);
        data[0] = 0x02;
        assert_eq!(classify(&data), Verdict::Reject);
    }

    #[test]
    fn reject_longitud_tpkt_incoherente() {
        let mut data = dt_frame(MAGIC_S7COMM);
        let len = (data.len() as u16) + 1;
        data[2..4].copy_from_slice(&len.to_be_bytes());
        assert_eq!(classify(&data), Verdict::Reject);
    }

    #[test]
    fn probable_conexion_cotp_sin_magic() {
        // COTP CR: LI 0x11, tipo 0xE0.
        let mut data = vec![0x03, 0x00, 0x00, 0x00, 0x11, 0xE0, 0x00, 0x00];
        data.extend_from_slice(&[0x00, 0x01, 0x00]);
        let len = data.len() as u16;
        data[2..4].copy_from_slice(&len.to_be_bytes());
        assert_eq!(
            classify(&data),
            Verdict::Probable(Parsed {
                protocol: Protocol::S7Comm,
                fn_code: None,
            })
        );
    }
}
