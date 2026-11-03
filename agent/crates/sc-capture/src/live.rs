// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

#[cfg(feature = "live")]
use crate::channel::CaptureChannel;
#[cfg(feature = "live")]
use crate::flow::LocalIpSet;
#[cfg(feature = "live")]
use crate::CaptureError;
#[cfg(feature = "live")]
use std::path::Path;

#[cfg(feature = "live")]
pub fn run_live(iface: &str, local: LocalIpSet) -> Result<CaptureChannel, CaptureError> {
    // Implementación live con pcap - placeholder para M1
    let _ = (iface, local);
    Err(CaptureError::InterfaceNotFound)
}
