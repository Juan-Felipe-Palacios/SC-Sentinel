//! CRC-16/DNP, validador fuerte de la capa de enlace DNP3.
//!
//! Parámetros (diseño, §«Firmas»): poly `0x3D65` reflejado (`0xA6BC`), init
//! `0x0000`, xorout `0xFFFF`, reflejado, almacenado little-endian.

/// Calcula el CRC-16/DNP de `data`.
///
/// `crc16_dnp(b"123456789")` devuelve `0xEA82` (check estándar incluido en los
/// tests de este módulo).
pub fn crc16_dnp(data: &[u8]) -> u16 {
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

#[cfg(test)]
mod tests {
    use super::crc16_dnp;

    #[test]
    fn check_estandar() {
        assert_eq!(crc16_dnp(b"123456789"), 0xEA82);
    }

    #[test]
    fn entrada_vacia() {
        assert_eq!(crc16_dnp(&[]), 0xFFFF);
    }
}
