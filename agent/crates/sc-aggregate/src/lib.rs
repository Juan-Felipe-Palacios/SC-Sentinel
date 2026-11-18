// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod accumulator;
pub mod host_mark;
pub mod snapshot;
pub mod window;

pub use host_mark::{host_key_hex, host_key_u128};
pub use snapshot::build_snapshot;
pub use window::{
    AggregatedWindow, AggregatorConfig, CaptureCounters, Clock, FixedClock, SystemClock,
    WindowAggregator,
};
