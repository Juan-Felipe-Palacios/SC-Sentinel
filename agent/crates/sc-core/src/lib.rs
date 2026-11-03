//! sc-core — Tipos de dominio compartidos de SC-Sentinel.
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod types;

pub use types::{
    AgentHealth, Alert, AlertSeverity, CaptureStatus, CountryStat, DeviceIdentity, FlowKey,
    HostStats, IngestEnvelope, PortStat, Protocol, Window, WindowSnapshot, SC_CORE_SCHEMA_VERSION,
};
