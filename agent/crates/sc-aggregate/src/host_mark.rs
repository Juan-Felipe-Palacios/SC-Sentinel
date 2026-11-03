// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub fn host_key(hmac_key: &[u8], ip: u128) -> String {
    let mut mac = HmacSha256::new_from_slice(hmac_key).expect("HMAC can take key of any size");
    mac.update(&ip.to_be_bytes());
    let result = mac.finalize().into_bytes();
    let hex_str = hex::encode(&result);
    hex_str[0..32].to_string()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_key_stable() {
        let key = b"test_key";
        let ip = ((10u128) << 24) | 1u128;
        let k1 = host_key(key, ip);
        let k2 = host_key(key, ip);
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn test_different_key_different_result() {
        let ip = ((10u128) << 24) | 1u128;
        let k1 = host_key(b"key1", ip);
        let k2 = host_key(b"key2", ip);
        assert_ne!(k1, k2);
    }
}
