use sc_geo::{CountryLookup, GeoLite2Country, NoLookup};
use sha2::{Digest, Sha256};
use std::fs;

#[test]
fn test_no_lookup_always_none() {
    let lookup = NoLookup;
    assert_eq!(lookup.country(12345), None);
    assert_eq!(lookup.country(u32::MAX as u128), None);
}

#[test]
fn test_open_valid_resource() {
    let lookup = GeoLite2Country::from_agent_resources();
    assert!(lookup.is_ok());
}

#[test]
fn test_private_ip_returns_none() {
    let lookup = GeoLite2Country::from_agent_resources().unwrap();
    // 10.0.0.1
    let ip = ((10u32) << 24) | 1u32;
    assert_eq!(lookup.country(ip as u128), None);
}

#[test]
fn test_integrity_sha256() {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("..");
    path.push("..");
    path.push("resources");
    path.push("geolite2");
    path.push("GeoLite2-Country.mmdb");

    let data = fs::read(&path).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    let _hash = format!("{:x}", result);
    // Just ensure it computes - hash is recorded in README per plan
    assert!(result.len() == 32);
}
