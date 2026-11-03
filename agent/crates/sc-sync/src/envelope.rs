// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use chrono::Utc;
use sc_core::{DeviceIdentity, IngestEnvelope, Window, WindowSnapshot};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug)]
pub struct DeviceInfo {
    pub id: String,
    pub agent_version: String,
    pub hostname: String,
    pub boot_id: String,
}

pub fn window_id_for(boot_id: &str, window_start_s: i64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(boot_id.as_bytes());
    hasher.update(&window_start_s.to_be_bytes());
    let result = hasher.finalize();
    // Create deterministic ULID-like id
    format!(
        "win_{:x}",
        &result[0..16]
            .iter()
            .fold(0u64, |acc, &b| (acc << 8) | b as u64)
    )
}

pub struct IngestWindow {
    pub id: String,
    pub start: String,
    pub end: String,
    pub duration_ms: u64,
    pub sequence: u64,
}

pub fn build_envelope(
    device: &DeviceInfo,
    window_id: String,
    sequence: u64,
    start_s: i64,
    end_s: i64,
    snap: &WindowSnapshot,
) -> IngestEnvelope {
    use chrono::{Duration, TimeZone};
    let epoch = Utc.with_ymd_and_hms(1970, 1, 1, 0, 0, 0).unwrap();
    let start = epoch + Duration::seconds(start_s);
    let end = epoch + Duration::seconds(end_s);
    IngestEnvelope {
        v: 1,
        device: DeviceIdentity {
            id: device.id.clone(),
            agent_version: device.agent_version.clone(),
            hostname: device.hostname.clone(),
            boot_id: device.boot_id.clone(),
        },
        window: Window {
            id: window_id,
            start,
            end,
            duration_ms: ((end_s - start_s) as u64) * 1000,
            sequence,
        },
        snapshot: snap.clone(),
    }
}
