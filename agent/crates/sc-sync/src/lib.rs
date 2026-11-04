// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod client;
pub mod envelope;
pub mod spool;
pub mod syncer;

pub use client::{IngestClient, IngestError, SyncDecision};
pub use envelope::{build_envelope, window_id_for, DeviceInfo};
pub use spool::{BatchRow, RetentionReport, Spool, SpoolConfig, SpoolError};
pub use syncer::{Applied, Backoff, Syncer, BASE_BACKOFF, MAX_BACKOFF};
