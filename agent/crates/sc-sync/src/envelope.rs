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
    hasher.update(window_start_s.to_be_bytes());
    let result = hasher.finalize();
    // Create deterministic ULID-like id
    format!(
        "win_{:x}",
        &result[0..16]
            .iter()
            .fold(0u64, |acc, &b| (acc << 8) | b as u64)
    )
}

/// Reasigna el `device.id` de un envelope ya persistido en el spool.
///
/// El envelope se construye al agregar la ventana, con el device id de ese
/// momento. Tras un re-enrolamiento el token pertenece a otro device y el
/// backend responde 403 cuando `device.id` no es el dueño del token; como la
/// cola es FIFO, ese batch retenido bloquearía el drenaje para siempre.
/// Devuelve `true` si cambió algo.
pub fn rebase_device_id(envelope: &mut IngestEnvelope, device_id: &str) -> bool {
    if envelope.device.id == device_id {
        return false;
    }
    envelope.device.id = device_id.to_string();
    true
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

#[cfg(test)]
mod tests {
    use super::*;
    use sc_core::{AgentHealth, CaptureStatus, WindowSnapshot};

    fn envelope_with_device(id: &str) -> IngestEnvelope {
        let snapshot = WindowSnapshot {
            top_hosts: vec![],
            top_ports: vec![],
            top_countries: vec![],
            alerts: vec![],
            health: AgentHealth {
                capture_status: CaptureStatus::Ok,
                packets_seen: 10,
                packets_dropped: 0,
                parse_errors: 0,
                queue_depth: None,
                spool_bytes: None,
                cpu_percent: None,
                memory_bytes: None,
                collector_packets_received: None,
                collector_packets_dropped: None,
                collector_parse_errors: None,
                collector_templates_cached: None,
                collector_flows_normalized: None,
                last_error: None,
            },
        };
        let device = DeviceInfo {
            id: id.to_string(),
            agent_version: "0.1.4".to_string(),
            hostname: "host".to_string(),
            boot_id: "boot".to_string(),
        };
        build_envelope(
            &device,
            "win_000000006af60b8b".to_string(),
            1,
            1_700_000_000,
            1_700_000_030,
            &snapshot,
        )
    }

    #[test]
    fn rebase_rewrites_owner_and_keeps_window() {
        let mut envelope = envelope_with_device("dev_m5svc");
        assert!(rebase_device_id(&mut envelope, "dev_fe4b1eb6"));
        assert_eq!(envelope.device.id, "dev_fe4b1eb6");
        // El resto del envelope no se toca: la ventana sigue siendo la medida.
        assert_eq!(envelope.window.id, "win_000000006af60b8b");
        assert_eq!(envelope.window.sequence, 1);
        assert_eq!(envelope.device.hostname, "host");
    }

    #[test]
    fn rebase_is_a_noop_for_the_same_device() {
        let mut envelope = envelope_with_device("dev_m5svc");
        assert!(!rebase_device_id(&mut envelope, "dev_m5svc"));
        assert_eq!(envelope.device.id, "dev_m5svc");
    }

    #[test]
    fn rebase_handles_empty_existing_id() {
        let mut envelope = envelope_with_device("");
        assert!(rebase_device_id(&mut envelope, "dev_fe4b1eb6"));
        assert_eq!(envelope.device.id, "dev_fe4b1eb6");
    }
}
