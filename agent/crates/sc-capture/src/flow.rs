// Derived from Sniffnet v1.5.1 (src/networking/types/), Copyright (c) 2022
// Giuliano Bellini and contributors, dual-licensed MIT OR Apache-2.0.
// Modifications Copyright (c) 2026 Strategic Connex. All rights reserved.
// See THIRD_PARTY_NOTICES.md (Anexo A) for the full license texts.
//!
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
#[derive(Debug, Clone, Default, PartialEq, Eq)]
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

    /// IPv4 utilizable para el parser: al menos una dirección no APIPA.
    ///
    /// El parser solo modela IPv4/TCP/UDP, así que un conjunto con únicamente
    /// IPv6 (o solo 169.254.0.0/16) sigue siendo degradado aunque no esté vacío.
    pub fn has_usable_ipv4(&self) -> bool {
        self.0
            .iter()
            .any(|&ip| is_ipv4(ip) && ip > 0 && !is_apipa_v4(ip as u32))
    }

    pub fn ipv4_count(&self) -> usize {
        self.0.iter().filter(|ip| is_ipv4(**ip)).count()
    }

    pub fn ipv6_count(&self) -> usize {
        self.0.iter().filter(|ip| !is_ipv4(**ip)).count()
    }
}

/// Dirección IPv4 codificada en los 32 bits bajos del `u128`.
fn is_ipv4(ip: u128) -> bool {
    ip <= u32::MAX as u128
}

/// 169.254.0.0/16: dirección link-local de Windows cuando DHCP todavía no
/// asignó una IPv4. No sirve para decidir qué tráfico pertenece al nodo.
fn is_apipa_v4(ip: u32) -> bool {
    (ip & 0xFFFF_0000) == 0xA9FE_0000
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;

    fn v4(ip: [u8; 4]) -> u128 {
        u32::from(std::net::Ipv4Addr::from(ip)) as u128
    }

    #[test]
    fn un_conjunto_vacio_no_es_utilizable() {
        assert!(!LocalIpSet::default().has_usable_ipv4());
        assert_eq!(LocalIpSet::default().ipv4_count(), 0);
        assert_eq!(LocalIpSet::default().ipv6_count(), 0);
    }

    #[test]
    fn la_ip_no_especificada_no_es_utilizable() {
        let set = LocalIpSet(HashSet::from([0]));
        assert!(!set.has_usable_ipv4());
    }

    #[test]
    fn apipa_no_es_utilizable() {
        let set = LocalIpSet(HashSet::from([v4([169, 254, 10, 20])]));
        assert!(!set.has_usable_ipv4());
        assert_eq!(set.ipv4_count(), 1);
    }

    #[test]
    fn ipv4_privada_si_es_utilizable() {
        let set = LocalIpSet(HashSet::from([v4([192, 168, 1, 40])]));
        assert!(set.has_usable_ipv4());
        assert_eq!(set.ipv4_count(), 1);
        assert_eq!(set.ipv6_count(), 0);
    }

    #[test]
    fn solo_ipv6_no_es_utilizable_para_este_parser() {
        let v6 = u128::from_be_bytes(Ipv6Addr::new(0xfe80, 0, 0, 0, 1, 2, 3, 4).octets());
        let set = LocalIpSet(HashSet::from([v6]));
        assert!(!set.has_usable_ipv4());
        assert_eq!(set.ipv4_count(), 0);
        assert_eq!(set.ipv6_count(), 1);
    }

    #[test]
    fn igualdad_compara_el_contenido_no_el_orden() {
        let a = LocalIpSet(HashSet::from([v4([192, 168, 1, 40]), v4([10, 0, 0, 2])]));
        let b = LocalIpSet(HashSet::from([v4([10, 0, 0, 2]), v4([192, 168, 1, 40])]));
        assert_eq!(a, b);
    }
}
