// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod geolite2;
pub mod lookup;

pub use geolite2::{GeoError, GeoLite2Country, GEOIP_DB_ENV};
pub use lookup::{CountryLookup, NoLookup};

use std::net::{Ipv4Addr, Ipv6Addr};

/// Representación textual de una IP almacenada como `u128` (IPv4 = u32 en los 32 bits
/// bajos, tal como la codifica el parser; el resto se interpreta como IPv6).
pub fn format_ip(ip: u128) -> String {
    if ip <= u32::MAX as u128 {
        Ipv4Addr::from(ip as u32).to_string()
    } else {
        Ipv6Addr::from(ip.to_be_bytes()).to_string()
    }
}

/// `true` cuando la IP no es un destino público de Internet: rangos privados
/// (RFC1918), loopback, link-local, CGNAT (100.64/10), ULA IPv6, unspecified,
/// multicast y broadcast. Estas direcciones no están en GeoLite2 y se etiquetan
/// como "LAN" en las estadísticas en lugar de quedar como país desconocido.
pub fn is_non_public_ip(ip: u128) -> bool {
    if ip <= u32::MAX as u128 {
        let v4 = Ipv4Addr::from(ip as u32);
        v4.is_private()
            || v4.is_loopback()
            || v4.is_link_local()
            || v4.is_broadcast()
            || v4.is_unspecified()
            || v4.octets()[0] == 0 // 0.0.0.0/8 ("this network")
            || v4.is_multicast()
            || (v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1])) // 100.64.0.0/10
    } else {
        let bytes = ip.to_be_bytes();
        let v6 = Ipv6Addr::from(bytes);
        v6.is_loopback()
            || v6.is_unspecified()
            || v6.is_multicast()
            || (bytes[0] & 0xfe) == 0xfc // fc00::/7 (ULA)
            || (bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80) // fe80::/10 (link-local)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v4(a: u8, b: u8, c: u8, d: u8) -> u128 {
        u32::from(Ipv4Addr::new(a, b, c, d)) as u128
    }

    fn v6(addr: Ipv6Addr) -> u128 {
        u128::from(addr)
    }

    #[test]
    fn privadas_y_especiales_son_no_publicas() {
        assert!(is_non_public_ip(v4(10, 0, 0, 1)));
        assert!(is_non_public_ip(v4(172, 16, 5, 4)));
        assert!(is_non_public_ip(v4(192, 168, 1, 10)));
        assert!(is_non_public_ip(v4(127, 0, 0, 1)));
        assert!(is_non_public_ip(v4(169, 254, 1, 1)));
        assert!(is_non_public_ip(v4(100, 64, 0, 1)));
        assert!(is_non_public_ip(v4(100, 127, 255, 254)));
        assert!(is_non_public_ip(v4(0, 0, 0, 0)));
        assert!(is_non_public_ip(v4(0, 0, 0, 1)));
        assert!(is_non_public_ip(v4(224, 0, 0, 1)));
        assert!(is_non_public_ip(v4(255, 255, 255, 255)));
        assert!(is_non_public_ip(v6(Ipv6Addr::new(
            0xfe80, 0, 0, 0, 0, 0, 0, 1
        ))));
        assert!(is_non_public_ip(v6(Ipv6Addr::new(
            0xfc00, 0, 0, 0, 0, 0, 0, 1
        ))));
        assert!(is_non_public_ip(v6(Ipv6Addr::new(
            0xfd12, 0, 0, 0, 0, 0, 0, 1
        ))));
        assert!(is_non_public_ip(v6(Ipv6Addr::new(
            0xff02, 0, 0, 0, 0, 0, 0, 1
        ))));
    }

    #[test]
    fn publicas_no_se_marcan_como_lan() {
        assert!(!is_non_public_ip(v4(8, 8, 8, 8)));
        assert!(!is_non_public_ip(v4(1, 1, 1, 1)));
        assert!(!is_non_public_ip(v4(100, 128, 0, 1)));
        assert!(!is_non_public_ip(v6(Ipv6Addr::new(
            0x2606, 0x4700, 0x4700, 0, 0, 0, 0, 0x1111
        ))));
    }
}
