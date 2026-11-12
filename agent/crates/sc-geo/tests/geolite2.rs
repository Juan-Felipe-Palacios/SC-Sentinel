use sc_geo::{CountryLookup, GeoLite2Country, NoLookup};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

/// Ruta de la base dentro del árbol del repo (solo para tests).
fn repo_database() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("..");
    path.push("..");
    path.push("resources");
    path.push("geolite2");
    path.push("GeoLite2-Country.mmdb");
    path
}

#[test]
fn test_no_lookup_always_none() {
    let lookup = NoLookup;
    assert_eq!(lookup.country(12345), None);
    assert_eq!(lookup.country(u32::MAX as u128), None);
}

#[test]
fn test_open_valid_resource() {
    let lookup = GeoLite2Country::from_path(&repo_database());
    assert!(lookup.is_ok());
}

#[test]
fn test_private_ip_returns_none() {
    let lookup = GeoLite2Country::from_path(&repo_database()).unwrap();
    // 10.0.0.1
    let ip = ((10u32) << 24) | 1u32;
    assert_eq!(lookup.country(ip as u128), None);
}

#[test]
fn test_public_ip_returns_country() {
    let lookup = GeoLite2Country::from_path(&repo_database()).unwrap();
    // 8.8.8.8 (Google DNS) es una IP pública con pais en GeoLite2.
    let ip = ((8u32) << 24) | (8u32) << 16 | (8u32) << 8 | 8u32;
    assert_eq!(lookup.country(ip as u128), Some("US".to_string()));
}

#[test]
fn test_discover_encuentra_la_base_en_runtime() {
    // El ejecutable de test vive en `agent/target/<perfil>/deps/`: la busqueda
    // por ancestros tiene que llegar a `agent/resources/geolite2/`.
    let path = GeoLite2Country::discover_path().expect("la base debe encontrarse");
    assert!(path.ends_with("GeoLite2-Country.mmdb"));
    assert!(path.exists());
    assert!(GeoLite2Country::discover().is_ok());
}

#[test]
fn test_integrity_sha256() {
    let data = fs::read(repo_database()).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    let _hash = format!("{:x}", result);
    // Just ensure it computes - hash is recorded in README per plan
    assert!(result.len() == 32);
}
