// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use sc_core::Alpha2;

pub trait CountryLookup: Send + Sync {
    fn country(&self, ip: u128) -> Option<Alpha2>;
}

#[derive(Debug, Clone)]
pub struct NoLookup;

impl CountryLookup for NoLookup {
    fn country(&self, _ip: u128) -> Option<Alpha2> {
        None
    }
}
