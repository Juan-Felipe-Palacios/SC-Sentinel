//! DNP3 sobre TCP o UDP.
//!
//! Tabla M4 del diseño: start `05 64` con `L ∈ [5, 255]` y payload corto es
//! `Probable`; CRC-16/DNP válido sobre los bytes 0–7 es `Confirmed`. Un CRC
//! inválido es **`Reject`, nunca `Probable`**: el CRC es el validador fuerte.
//!
//! En F1 sólo se confirma la capa de enlace. Los códigos de función de
//! aplicación requieren caminar bloques CRC de 16 bytes y quedan para F2.

use crate::crc::crc16_dnp;
use crate::{Parsed, Protocol, Verdict};

/// Cabecera mínima de una trama de enlace DNP3.
const MIN_FRAME_LEN: usize = 10;

/// Longitud declarada mínima por el campo `L`.
const LEN_MIN: u8 = 5;

/// Bytes cubiertos por el primer CRC.
const CRC_COVERAGE: usize = 8;

/// Clasifica un segmento como DNP3.
pub fn classify(data: &[u8]) -> Verdict {
    if data.len() < MIN_FRAME_LEN {
        if data.len() >= 3 && data[0] == 0x05 && data[1] == 0x64 {
            let declared = data[2];
            if declared >= LEN_MIN {
                // Cabecera posible con CRC todavía no computable.
                return Verdict::Probable(Parsed {
                    protocol: Protocol::Dnp3,
                    fn_code: None,
                });
            }
        }
        return Verdict::Reject;
    }

    if data[0] != 0x05 || data[1] != 0x64 {
        return Verdict::Reject;
    }
    if data[2] < LEN_MIN {
        return Verdict::Reject;
    }

    let calculated = crc16_dnp(&data[..CRC_COVERAGE]);
    let stored = u16::from_le_bytes([data[8], data[9]]);
    if calculated != stored {
        return Verdict::Reject;
    }

    Verdict::Confirmed(Parsed {
        protocol: Protocol::Dnp3,
        fn_code: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame_with_crc(control: u8) -> Vec<u8> {
        let mut data = vec![0x05, 0x64, LEN_MIN, control, 0x01, 0x00, 0x02, 0x00];
        let crc = crc16_dnp(&data);
        data.extend_from_slice(&crc.to_le_bytes());
        data
    }

    #[test]
    fn confirma_crc_valido() {
        let data = frame_with_crc(0xC0);
        assert_eq!(
            classify(&data),
            Verdict::Confirmed(Parsed {
                protocol: Protocol::Dnp3,
                fn_code: None,
            })
        );
    }

    #[test]
    fn crc_invalido_es_reject() {
        let mut data = frame_with_crc(0xC0);
        data[9] ^= 0xFF;
        assert_eq!(classify(&data), Verdict::Reject);
    }

    #[test]
    fn probable_con_payload_corto() {
        assert_eq!(
            classify(&[0x05, 0x64, LEN_MIN]),
            Verdict::Probable(Parsed {
                protocol: Protocol::Dnp3,
                fn_code: None,
            })
        );
    }

    #[test]
    fn reject_l_fuera_de_rango() {
        assert_eq!(
            classify(&[0x05, 0x64, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
            Verdict::Reject
        );
    }

    #[test]
    fn probable_solo_con_start_valido() {
        assert_eq!(classify(&[0x05, 0x63, LEN_MIN]), Verdict::Reject);
    }
}
