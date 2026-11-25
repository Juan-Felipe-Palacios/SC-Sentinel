//! sc-core — Tipos de dominio compartidos de SC-Sentinel.
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod types;

pub use types::{
    AgentHealth, Alert, AlertSeverity, Alpha2, AsnStat, CaptureStatus, CountryStat, DetectionInput,
    DeviceIdentity, FlowKey, HostSignal, HostStats, IngestEnvelope, OtBlock, OtEndpoint, OtEvent,
    OtProtocol, OtRole, PortStat, Protocol, Window, WindowSnapshot, SC_CORE_SCHEMA_VERSION,
};
