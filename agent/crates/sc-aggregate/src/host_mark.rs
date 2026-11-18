// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Bytes del tag HMAC que forman la identidad del host.
///
/// 16 bytes = 128 bits, exactamente lo que exponía la versión en `String`
/// (`hex::encode(tag)[0..32]`). No se recorta más: esa clave es la identidad
/// del host en todas las ventanas, y bajarla a 64 bits multiplicaría el riesgo
/// de colisión sin ganancia de velocidad apreciable (hashear 8 o 16 bytes
/// cuesta lo mismo).
const KEY_BYTES: usize = 16;

/// Clave del host como entero de 128 bits, sin asignaciones.
///
/// Es el camino caliente: el acumulador la memoiza por IP, así que se paga una
/// vez por IP distinta y ventana en lugar de una vez por flujo.
pub fn host_key_u128(hmac_key: &[u8], ip: u128) -> u128 {
    let mut mac = HmacSha256::new_from_slice(hmac_key).expect("HMAC can take key of any size");
    mac.update(&ip.to_be_bytes());
    let tag = mac.finalize().into_bytes();
    let bytes: [u8; KEY_BYTES] = tag[..KEY_BYTES].try_into().expect("tag de 32 bytes");
    u128::from_be_bytes(bytes)
}

/// Representación canónica de una clave de host: 32 hex en minúsculas.
///
/// Coincide byte a byte con `hex::encode(tag)[0..32]`, así que el contrato del
/// snapshot (`HostStats.host_key`, `HostSignal.host_key`) no cambia.
pub fn host_key_hex(key: u128) -> String {
    format!("{key:032x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Contrato: la clave de 128 bits y su hex reproducen exactamente la
    /// representación histórica (`hex::encode(tag)[..32]`). Si esto cambia,
    /// cambian los `host_key` de todos los snapshots y de la web.
    #[test]
    fn host_key_conserva_el_hex_historico() {
        let key = b"test_key";
        let ip = ((10u128) << 24) | 1u128;
        let mut mac = HmacSha256::new_from_slice(key).expect("clave válida");
        mac.update(&ip.to_be_bytes());
        let tag = mac.finalize().into_bytes();
        let historico = hex::encode(tag)[..32].to_string();

        assert_eq!(host_key_hex(host_key_u128(key, ip)), historico);
        assert_eq!(host_key_hex(host_key_u128(key, 1)).len(), 32);
        assert_ne!(host_key_u128(key, 1), host_key_u128(key, 2));
        assert_ne!(host_key_u128(b"key1", ip), host_key_u128(b"key2", ip));
    }
}
