// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//!
//! Captura de paquetes pasiva (M6 OT). Este crate solo observa: no responde,
//! no hace handshake y no escanea (AGENTS.md §10.1).
//!
//! Invariante pasivo: `#![forbid(unsafe_code)]` en toda la crate; clippy
//! `disallowed-types`/`disallowed-methods` bloquea `TcpStream::connect` y
//! similares para que un futuro cambio no introduzca tráfico activo.

#![forbid(unsafe_code)]

pub mod channel;
pub mod driver;
pub mod fixtures;
pub mod flow;
pub mod live;
pub mod monitor;
pub mod parser;

pub use channel::{CaptureChannel, CaptureChannelPair, FlowProducer, CHANNEL_CAPACITY};
pub use driver::{run_offline, CaptureError, CaptureStats};
pub use fixtures::generate_loopback_trace;
pub use flow::{Direction, FlowUpdate, LocalIpSet};
pub use live::{list_interfaces, local_ips_for_interface, run_live, run_live_with_updates};
pub use monitor::{start_local_ip_monitor, LocalIpMonitor};
pub use parser::{parse_packet, ParseError};
