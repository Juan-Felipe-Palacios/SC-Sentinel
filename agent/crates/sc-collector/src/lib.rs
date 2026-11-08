//! sc-collector — colector pasivo de flujos NetFlow v5/v9 e IPFIX.
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//!
//! Recibe exportaciones UDP de routers y switches, las normaliza a
//! [`sc_capture::FlowUpdate`] y las entrega al mismo canal acotado que usa la
//! captura pcap, de modo que `sc-aggregate` no distingue el origen.
//!
//! Alcance actual (M4, fase 2): listener UDP multipuerto, detección por campo
//! de versión, parser NetFlow v5 y parsers NetFlow v9/IPFIX con cache de
//! templates por origen. Configuración, integración con `sc-agent` y métricas
//! en el dashboard quedan para las fases 3 y 4.

pub mod collector;
pub mod error;
pub mod listener;
pub mod metrics;
pub mod normalizer;
pub mod protocol;

#[cfg(test)]
mod fixtures;

pub use collector::{Collector, CollectorHandle};
pub use error::{CollectorError, ParseError};
pub use listener::{
    bind_all, serve, spawn_listeners, BoundListener, CollectorConfig, ListenerConfig, DEFAULT_PORTS,
};
pub use metrics::{CollectorMetrics, CollectorMetricsSnapshot};
pub use normalizer::{ip_to_u128, protocol_from_number, to_flow_update, NormalizedFlow};
pub use protocol::{
    detect_protocol, FieldSpec, IpfixParser, NetFlowV5Parser, NetFlowV9Parser, ProtocolFilter,
    ProtocolKind, ProtocolParser, ProtocolSet, Template, TemplateCache, TemplateKey,
    DEFAULT_TEMPLATE_CAPACITY, DEFAULT_TEMPLATE_TTL, IPFIX_VERSION, NETFLOW_V5_VERSION,
    NETFLOW_V9_VERSION, VARIABLE_LENGTH,
};
