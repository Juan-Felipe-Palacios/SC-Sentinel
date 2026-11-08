// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Errores del colector: apertura de sockets y parseo de datagramas.

use crate::protocol::ProtocolKind;
use std::io;
use std::net::SocketAddr;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CollectorError {
    #[error("no se pudo abrir el socket UDP en {addr}: {source}")]
    Bind {
        addr: SocketAddr,
        #[source]
        source: io::Error,
    },
    #[error("el socket UDP no expone su dirección local: {source}")]
    LocalAddr {
        #[source]
        source: io::Error,
    },
}

/// Un datagrama inválido nunca es fatal: el listener lo descarta y sigue.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ParseError {
    #[error("datagrama demasiado corto: {len} bytes (mínimo {min})")]
    TooShort { len: usize, min: usize },
    #[error("versión de exportación desconocida: {0}")]
    UnknownVersion(u16),
    #[error("se esperaba {expected} y llegó la versión {got}")]
    WrongVersion { expected: &'static str, got: u16 },
    #[error("datagrama truncado: se necesitan {expected} bytes y llegaron {len}")]
    Truncated { expected: usize, len: usize },
    #[error("set {id} inválido: longitud {length}")]
    MalformedSet { id: u16, length: u16 },
    #[error("definición de template {0} inválida")]
    InvalidTemplate(u16),
    #[error("template {0} desconocido para este exportador")]
    TemplateNotFound(u16),
    #[error("registro malformado para el template {0}")]
    MalformedRecord(u16),
    #[error("protocolo {0} detectado pero aún no implementado")]
    UnsupportedProtocol(ProtocolKind),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_errores_de_parseo_son_comparables_y_legibles() {
        assert_eq!(
            ParseError::TooShort { len: 3, min: 24 },
            ParseError::TooShort { len: 3, min: 24 }
        );
        assert!(ParseError::UnknownVersion(7)
            .to_string()
            .contains("desconocida"));
        assert!(ParseError::UnsupportedProtocol(ProtocolKind::Ipfix)
            .to_string()
            .contains("IPFIX"));
        assert!(ParseError::TemplateNotFound(300)
            .to_string()
            .contains("300"));
    }
}
