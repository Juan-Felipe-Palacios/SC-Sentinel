// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Derived from Sniffnet v1.5.1 (src/mmdb/country.rs), Copyright (c) Guilherme ("Guly") Vardanyan and Sniffnet contributors, dual-licensed MIT OR Apache-2.0.
// Adaptations and modifications for SC-Sentinel are proprietary:
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::lookup::CountryLookup;
use maxminddb::Reader;
use sc_core::Alpha2;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeoError {
    #[error("open error: {0}")]
    Open(String),
    #[error("format error: {0}")]
    Format(String),
}

pub struct GeoLite2Country {
    reader: Reader<Vec<u8>>,
}

impl GeoLite2Country {
    pub fn from_path(path: &Path) -> Result<Self, GeoError> {
        let reader = Reader::open_readfile(path).map_err(|e| GeoError::Open(e.to_string()))?;
        Ok(Self { reader })
    }

    pub fn from_agent_resources() -> Result<Self, GeoError> {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("..");
        path.push("..");
        path.push("resources");
        path.push("geolite2");
        path.push("GeoLite2-Country.mmdb");
        Self::from_path(&path)
    }
}

#[derive(serde::Deserialize)]
struct CountryResp {
    country: Option<CountryCode>,
}

#[derive(serde::Deserialize)]
struct CountryCode {
    iso_code: Option<String>,
}

impl CountryLookup for GeoLite2Country {
    fn country(&self, ip: u128) -> Option<Alpha2> {
        // Try to construct IpAddr
        let ip_addr: IpAddr = if ip <= u32::MAX as u128 {
            let v4 = (ip as u32).to_be_bytes();
            std::net::IpAddr::V4(std::net::Ipv4Addr::new(v4[0], v4[1], v4[2], v4[3]))
        } else {
            let bytes = ip.to_be_bytes();
            std::net::IpAddr::V6(std::net::Ipv6Addr::from(bytes))
        };

        match self.reader.lookup(ip_addr) {
            Ok(result) => {
                if let Ok(Some(resp)) = result.decode::<CountryResp>() {
                    if let Some(country) = resp.country {
                        if let Some(code) = country.iso_code {
                            if code.len() == 2 && code.chars().all(|c| c.is_ascii_uppercase()) {
                                return Some(code);
                            }
                        }
                    }
                }
                None
            }
            Err(_) => None,
        }
    }
}
