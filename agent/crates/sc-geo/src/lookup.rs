// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use sc_core::Alpha2;

pub trait CountryLookup: Send + Sync {
    fn country(&self, ip: u128) -> Option<Alpha2>;
}

/// Resultado de una consulta a la base GeoLite2-ASN.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AsnInfo {
    pub number: u32,
    pub organization: Option<String>,
}

pub trait AsnLookup: Send + Sync {
    fn asn(&self, ip: u128) -> Option<AsnInfo>;
}

#[derive(Debug, Clone)]
pub struct NoLookup;

impl CountryLookup for NoLookup {
    fn country(&self, _ip: u128) -> Option<Alpha2> {
        None
    }
}

impl AsnLookup for NoLookup {
    fn asn(&self, _ip: u128) -> Option<AsnInfo> {
        None
    }
}
