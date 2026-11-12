// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Blacklist local de IPs para la regla `blacklist_hit`.
//!
//! Formato: una IP exacta (IPv4 o IPv6) por línea. Se permiten comentarios con
//! `#` y líneas vacías. No se resuelven dominios: el agente no debe hacer
//! consultas de red para evaluar una ventana.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BlacklistError {
    #[error("no se pudo leer la blacklist {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("IP inválida en la blacklist, línea {line}: {value:?}")]
    InvalidIp { line: usize, value: String },
}

/// Conjunto inmutable de IPs maliciosas conocidas.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Blacklist {
    entries: BTreeMap<u128, String>,
}

impl Blacklist {
    /// Carga la blacklist desde disco. Un archivo inexistente es un error de
    /// configuración: el agente no debe arrancar silenciosamente sin la lista
    /// que el operador pidió aplicar.
    pub fn from_path(path: &Path) -> Result<Self, BlacklistError> {
        let raw = std::fs::read_to_string(path).map_err(|source| BlacklistError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        Self::from_lines(&raw)
    }

    /// Parsea una lista en memoria. Cada entrada conserva su texto original
    /// para incluirlo como evidencia de la alerta.
    pub fn from_lines(raw: &str) -> Result<Self, BlacklistError> {
        let mut entries = BTreeMap::new();
        for (index, line) in raw.lines().enumerate() {
            let value = line.split('#').next().unwrap_or("").trim();
            if value.is_empty() {
                continue;
            }
            let ip = value
                .parse::<IpAddr>()
                .map_err(|_| BlacklistError::InvalidIp {
                    line: index + 1,
                    value: value.to_string(),
                })?;
            entries.insert(ip_to_u128(ip), value.to_string());
        }
        Ok(Self { entries })
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn lookup(&self, ip: u128) -> Option<&str> {
        self.entries.get(&ip).map(String::as_str)
    }
}

fn ip_to_u128(ip: IpAddr) -> u128 {
    match ip {
        IpAddr::V4(v4) => u32::from(v4) as u128,
        IpAddr::V6(v6) => u128::from_be_bytes(v6.octets()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    #[test]
    fn parsea_comentarios_lineas_vacias_y_ambas_familias() {
        let list = Blacklist::from_lines("# feed\n\n203.0.113.5 # bad\n2001:db8::1\n")
            .expect("lista válida");
        assert_eq!(list.len(), 2);
        assert_eq!(
            list.lookup(u32::from(Ipv4Addr::new(203, 0, 113, 5)) as u128),
            Some("203.0.113.5")
        );
        assert_eq!(
            list.lookup(u128::from(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1))),
            Some("2001:db8::1")
        );
    }

    #[test]
    fn rechaza_una_entrada_invalida_con_su_linea() {
        let error = Blacklist::from_lines("203.0.113.5\nno-es-una-ip\n").expect_err("debe fallar");
        assert!(matches!(error, BlacklistError::InvalidIp { line: 2, .. }));
    }

    #[test]
    fn un_archivo_inexistente_es_error_de_configuracion() {
        let error =
            Blacklist::from_path(Path::new("no-existe-blacklist.txt")).expect_err("debe fallar");
        assert!(matches!(error, BlacklistError::Io { .. }));
    }
}
