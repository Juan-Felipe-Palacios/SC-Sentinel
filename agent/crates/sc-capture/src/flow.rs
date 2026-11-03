//! Tipos FlowUpdate/Direction/LocalIpSet — derivados de Sniffnet v1.5.1
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//!
//! Derivado parcialmente de https://github.com/GyulyVGC/sniffnet (tag v1.5.1)
//! bajo licencia MIT OR Apache-2.0. Véase `docs/legal/THIRD_PARTY_NOTICES.md`.

use sc_core::FlowKey;
use std::collections::HashSet;
use std::net::IpAddr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Hacia el nodo
    In,
    /// Desde el nodo
    Out,
}

#[derive(Debug, Clone)]
pub struct FlowUpdate {
    pub ts: i64,
    pub flow: FlowKey,
    pub bytes: u64,
    pub packets: u64,
    pub direction: Direction,
}

#[derive(Debug, Clone, Default)]
pub struct LocalIpSet(pub HashSet<u128>);

impl LocalIpSet {
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
