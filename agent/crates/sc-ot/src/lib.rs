//! Parsers pasivos de protocolos OT (M6 · etapa E4).
//!
//! Primer piso del pipeline de identificación pasiva: clasificar bytes ya
//! capturados, sin abrir sockets, sin responder y sin hacer handshake
//! (AGENTS.md §10.1). Cada parser es una función pura sobre `&[u8]` que
//! devuelve estructuras `Copy`: no hay asignaciones en la ruta caliente.
//!
//! Reglas tomadas de `docs/designs/m6-passive-ot-identification.md`:
//!
//! - Veredicto con confianza explícita: [`Verdict::Confirmed`],
//!   [`Verdict::Probable`] o [`Verdict::Reject`].
//! - DNP3: un CRC inválido es `Reject`, nunca `Probable`; el CRC es el
//!   validador fuerte.
//! - S7 se distingue de MMS por el magic del byte 7, nunca por el puerto.
//! - Alineación acotada 0–7 para flujos capturados a mitad de PDU.
//! - [`PeekCache`]: veredicto por 5-tupla y dirección, LRU de 4096 flujos, dos
//!   intentos por dirección y congelamiento tras `Confirmed`.
//!
//! Lo que este crate **no** hace, por diseño: no extrae valores ni direcciones
//! de registros, no camina bloques CRC de DNP3 (eso queda para F2) y no decide
//! el rol del endpoint (etapa E6).

#![forbid(unsafe_code)]

mod crc;
mod dnp3;
mod iec104;
mod modbus;
mod peek;
mod s7;

pub use crc::crc16_dnp;
pub use dnp3::classify as parse_dnp3;
pub use iec104::classify as parse_iec104;
pub use modbus::classify as parse_modbus;
pub use peek::{FlowKey, PeekCache, PeekDecision};
pub use s7::classify as parse_s7comm;

/// Mínimo de bytes que tiene sentido pedir en un *peek* (diseño, tabla de constantes).
pub const PEEK_MIN_BYTES: usize = 64;

/// Máximo de bytes de un *peek*: cubre MBAP (7) más una PDU de 254 bytes.
pub const PEEK_MAX_BYTES: usize = 256;

/// Intentos por flujo y dirección: tolera la segmentación TCP sin reassembly.
pub const PEEK_MAX_ATTEMPTS: u8 = 2;

/// Capacidad del LRU de flujos candidatos (diseño, tabla de constantes).
pub const FLOW_CACHE_CAPACITY: usize = 4096;

/// Máximo desplazamiento explorado para flujos capturados a mitad de PDU.
pub const MAX_ALIGNMENT: u8 = 7;

/// Protocolos que este crate identifica.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Protocol {
    /// Modbus/TCP.
    Modbus,
    /// S7comm clásico (magic `0x32`).
    S7Comm,
    /// S7comm Plus (magic `0x72`).
    S7CommPlus,
    /// DNP3 sobre TCP o UDP.
    Dnp3,
    /// IEC 60870-5-104.
    Iec104,
}

impl Protocol {
    /// Nombre canónico, igual al que viaja en el bloque `ot` del contrato.
    pub fn as_str(self) -> &'static str {
        match self {
            Protocol::Modbus => "modbus",
            Protocol::S7Comm => "s7comm",
            Protocol::S7CommPlus => "s7comm_plus",
            Protocol::Dnp3 => "dnp3",
            Protocol::Iec104 => "iec104",
        }
    }

    /// Puerto canónico del protocolo.
    ///
    /// Sólo informativo: la clasificación nunca depende del puerto, porque un
    /// servicio puede publicarse en otro y eso generaría falsos positivos.
    pub fn canonical_port(self) -> u16 {
        match self {
            Protocol::Modbus => 502,
            Protocol::S7Comm | Protocol::S7CommPlus => 102,
            Protocol::Dnp3 => 20000,
            Protocol::Iec104 => 2404,
        }
    }
}

/// Datos que un parser puede aportar sin recorrer la PDU completa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Parsed {
    /// Protocolo identificado.
    pub protocol: Protocol,
    /// Código de función, sólo cuando el frame lo expone en la cabecera ya
    /// validada (hoy: Modbus). DNP3 y S7 lo requieren en F2.
    pub fn_code: Option<u8>,
}

/// Resultado de clasificar un segmento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Estructura completa y coherente: la firma fuerte se cumplió.
    Confirmed(Parsed),
    /// Prefijo válido con payload incompleto o sin firma fuerte.
    Probable(Parsed),
    /// No es ninguno de los cuatro protocolos o la firma fuerte falló.
    Reject,
}

impl Verdict {
    /// Datos del parser, si el veredicto no es `Reject`.
    pub fn parsed(self) -> Option<Parsed> {
        match self {
            Verdict::Confirmed(parsed) | Verdict::Probable(parsed) => Some(parsed),
            Verdict::Reject => None,
        }
    }

    /// `true` si la firma fuerte se cumplió.
    pub fn is_confirmed(self) -> bool {
        matches!(self, Verdict::Confirmed(_))
    }

    /// Protocolo identificado, si lo hay.
    pub fn protocol(self) -> Option<Protocol> {
        self.parsed().map(|parsed| parsed.protocol)
    }
}

/// Clasifica un segmento que empieza exactamente en la cabecera del protocolo.
///
/// Se prueban los cuatro protocolos en orden. DNP3 es el único que corta la
/// cadena: si empieza con `05 64` y el CRC no valida, el veredicto es `Reject`
/// y no se reintenta como otro protocolo.
pub fn classify(segment: &[u8]) -> Verdict {
    // Modbus/TCP: MBAP con protocol id 0.
    if segment.len() >= 8 && segment[2] == 0x00 && segment[3] == 0x00 {
        let len = u16::from_be_bytes([segment[4], segment[5]]) as usize;
        if (modbus::LEN_MIN..=modbus::LEN_MAX).contains(&len) {
            let verdict = parse_modbus(segment);
            if verdict != Verdict::Reject {
                return verdict;
            }
        }
    }

    // S7comm: TPKT 03 00.
    if segment.len() >= 2 && segment[0] == 0x03 && segment[1] == 0x00 {
        let verdict = parse_s7comm(segment);
        if verdict != Verdict::Reject {
            return verdict;
        }
    }

    // DNP3: start 05 64. CRC roto descarta, no degrada.
    if segment.len() >= 2 && segment[0] == 0x05 && segment[1] == 0x64 {
        return parse_dnp3(segment);
    }

    // IEC 60870-5-104: start 0x68.
    if segment.first() == Some(&0x68) {
        let verdict = parse_iec104(segment);
        if verdict != Verdict::Reject {
            return verdict;
        }
    }

    Verdict::Reject
}

/// Clasifica probando desplazamientos 0–7 y devuelve el offset usado.
///
/// Sirve para flujos capturados a mitad de PDU: si el segmento empieza en el
/// medio de una trama, la cabecera puede aparecer hasta 7 bytes más adelante.
/// Prioriza `Confirmed` sobre `Probable` y, dentro de cada nivel, el offset más
/// bajo. Si nada clasifica devuelve `(0, Verdict::Reject)`.
pub fn classify_aligned(segment: &[u8]) -> (u8, Verdict) {
    let mut first_probable: Option<(u8, Verdict)> = None;

    for offset in 0..=MAX_ALIGNMENT as usize {
        if segment.len() <= offset {
            break;
        }
        match classify(&segment[offset..]) {
            Verdict::Confirmed(parsed) => {
                return (offset as u8, Verdict::Confirmed(parsed));
            }
            Verdict::Probable(parsed) if first_probable.is_none() => {
                first_probable = Some((offset as u8, Verdict::Probable(parsed)));
            }
            _ => {}
        }
    }

    first_probable.unwrap_or((0, Verdict::Reject))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reject_vacio_o_corto() {
        assert_eq!(classify(&[]), Verdict::Reject);
        assert_eq!(classify(&[0x68]), Verdict::Reject);
        assert_eq!(classify(&[0x05, 0x64]), Verdict::Reject);
    }

    #[test]
    fn clasificar_confirmado_no_desplaza() {
        // Trama Modbus mínima: MBAP (6) + L=2 → uid + fc.
        let frame = [0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x01, 0x03];
        let (offset, verdict) = classify_aligned(&frame);
        assert_eq!(offset, 0);
        assert_eq!(
            verdict,
            Verdict::Confirmed(Parsed {
                protocol: Protocol::Modbus,
                fn_code: Some(0x03)
            })
        );
    }

    #[test]
    fn alineacion_encuentra_cabecera_desplazada() {
        let mut frame = vec![0xAA, 0xBB, 0xCC];
        frame.extend_from_slice(&[0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x01, 0x16]);
        let (offset, verdict) = classify_aligned(&frame);
        assert_eq!(offset, 3);
        assert_eq!(verdict.protocol(), Some(Protocol::Modbus));
    }

    #[test]
    fn alignment_acotado_a_siete() {
        // Cabecera válida en el offset 8: fuera del alcance explorado.
        let mut frame = vec![0xAA; 8];
        frame.extend_from_slice(&[0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x01, 0x03]);
        let verdict = classify_aligned(&frame).1;
        assert!(!verdict.is_confirmed());
    }

    #[test]
    fn nombres_canonicos() {
        assert_eq!(Protocol::Modbus.as_str(), "modbus");
        assert_eq!(Protocol::S7CommPlus.as_str(), "s7comm_plus");
        assert_eq!(Protocol::Iec104.canonical_port(), 2404);
    }
}
