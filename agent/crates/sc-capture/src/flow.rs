//! Tipos compartidos del canal de captura: `FlowUpdate`, `Direction` y
//! `LocalIpSet`.
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use sc_core::FlowKey;
use std::collections::HashSet;
use std::net::IpAddr;

/// Lado del flujo desde el punto de vista del nodo monitorizado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Hacia el nodo
    In,
    /// Desde el nodo
    Out,
}

/// Un cambio observable en un flujo: cada paquete interpretado produce un
/// `FlowUpdate` que el agregador acumula dentro de su ventana.
#[derive(Debug, Clone)]
pub struct FlowUpdate {
    pub ts: i64,
    pub flow: FlowKey,
    pub bytes: u64,
    pub packets: u64,
    pub direction: Direction,
}

/// Conjunto de IPs locales del nodo, codificadas como `u128`
/// (IPv4 ocupa los 32 bits bajos, IPv6 sus 16 octetos completos).
#[derive(Debug, Clone, Default)]
pub struct LocalIpSet(pub HashSet<u128>);

impl LocalIpSet {
    /// Construye el conjunto a partir de la lista de IPs de la configuración
    /// o de las interfaces detectadas.
    pub fn from_config(list: &[IpAddr]) -> Self {
        let mut set = HashSet::new();
        for ip in list {
            match ip {
                IpAddr::V4(v4) => {
                    set.insert(u32::from(*v4) as u128);
                }
                IpAddr::V6(v6) => {
                    set.insert(u128::from_be_bytes(v6.octets()));
                }
            }
        }
        Self(set)
    }

    pub fn contains(&self, ip: u128) -> bool {
        self.0.contains(&ip)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}
