//! Tipos de dominio — espejo exacto de `docs/contracts/*.schema.json` (v1).
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Versión del contrato soportada (campo `v` del envelope de ingest, no del snapshot:
/// ver `docs/contracts/ingest-api.v1.md` §1.1).
pub const SC_CORE_SCHEMA_VERSION: u8 = 1;

/// Código de país ISO 3166-1 alpha-2 (formato `^[A-Z]{2}$`, validado por los
/// generadores: sc-geo en el agente; zod en el servidor). Alias del contrato.
pub type Alpha2 = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
    Other,
}

/// Clave de flujo: identidad de una conexión agregada.
/// Los IPs se representan como `u128` (IPv4 mapeado a IPv6); este tipo es interno
/// del agente y nunca viaja en el snapshot (el contrato agregadores, no flujos).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FlowKey {
    pub src_ip: u128,
    pub dst_ip: u128,
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: Protocol,
}

/// Ventana de agregación del envelope de `/api/ingest` (ingest-api.v1.md §1.1):
/// `id` persistente, extremos RFC 3339, duración 30–60 s y `sequence` monotónica.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Window {
    pub id: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub duration_ms: u64,
    pub sequence: u64,
}

/// Un host agregado dentro de una ventana (top N, ≤ 50).
/// `ip_display` es `None` cuando `anonymize_hosts = true` (regla normativa de
/// `docs/contracts/ingest-api.v1.md` §1.2): la IP real nunca sale del nodo.
/// `risk_score` es opcional y determinista (blacklist/umbrales); no salida de IA.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HostStats {
    pub host_key: String,
    pub ip_display: Option<String>,
    pub country: Option<Alpha2>, // ISO 3166-1 alpha-2
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub packets: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_score: Option<f64>, // 0.0–1.0
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PortStat {
    pub port: u16,
    pub protocol: Protocol,
    pub bytes: u64,
    pub connections: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CountryStat {
    pub country: Alpha2, // ISO 3166-1 alpha-2
    pub bytes: u64,
    pub hosts: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

/// Alerta determinista generada por sc-detect (`docs/contracts/alert.v1.schema.json`).
/// La IA nunca produce alerts; solo `analysis`/`summary` del spec §5.4.
/// `evidence` es un objeto (no lista de pares): 1–32 entradas, valores string.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Alert {
    pub rule_id: String, // ^[a-z0-9_]+$ ≤ 64
    pub severity: AlertSeverity,
    pub title: String, // ≤ 200
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>, // ≤ 1000
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<BTreeMap<String, String>>, // 1–32 pares clave: valor
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureStatus {
    Ok,
    Degraded,
    Error,
}

/// Salud del agente (`docs/contracts/agent-health.v1.schema.json`).
/// Obligatorios: `capture_status`, `packets_seen`, `packets_dropped`, `parse_errors`;
/// el resto es opcional y se omite del JSON cuando es `None`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentHealth {
    pub capture_status: CaptureStatus,
    pub packets_seen: u64,
    pub packets_dropped: u64, // backpressure del canal mpsc (spec 8.2): descartes explícitos
    pub parse_errors: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_depth: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spool_bytes: Option<u64>, // cota 500 MB (spec 9.4)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_bytes: Option<u64>,
    pub last_error: Option<String>, // nullable en el contrato; sin datos sensibles (spec 9.3)
}

/// Snapshot agregado de una ventana (~2–10 KB JSON), espejo exacto de
/// `docs/contracts/window-snapshot.v1.schema.json`: solo señales agregadas,
/// jamás raw packets ni flujos individuales.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowSnapshot {
    pub top_hosts: Vec<HostStats>,
    pub top_ports: Vec<PortStat>,
    pub top_countries: Vec<CountryStat>,
    pub alerts: Vec<Alert>,
    pub health: AgentHealth,
}

/// Identidad del dispositivo en el envelope de ingest (`examples/ingest-request.valid.json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceIdentity {
    pub id: String,
    pub agent_version: String,
    pub hostname: String,
    pub boot_id: String,
}

/// Envelope del body de `POST /api/ingest` (ingest-api.v1.md §1.1):
/// `{ v, device, window, snapshot }`. La versión del contrato viaja acá.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IngestEnvelope {
    pub v: u8,
    pub device: DeviceIdentity,
    pub window: Window,
    pub snapshot: WindowSnapshot,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_window() -> Window {
        let start = Utc.with_ymd_and_hms(2026, 11, 3, 12, 0, 0).unwrap();
        Window {
            id: "win_01HXYZ0001".into(),
            start,
            end: start + chrono::Duration::seconds(30),
            duration_ms: 30_000,
            sequence: 1234,
        }
    }

    fn sample_device() -> DeviceIdentity {
        DeviceIdentity {
            id: "dev_01HXYZ0001".into(),
            agent_version: "0.1.0".into(),
            hostname: "pc-office".into(),
            boot_id: "uuid-boot-123".into(),
        }
    }

    fn sample_health() -> AgentHealth {
        AgentHealth {
            capture_status: CaptureStatus::Ok,
            packets_seen: 50_000,
            packets_dropped: 0,
            parse_errors: 0,
            queue_depth: Some(5),
            spool_bytes: Some(102_400),
            cpu_percent: Some(2.5),
            memory_bytes: Some(52_428_800),
            last_error: None,
        }
    }

    fn sample_snapshot() -> WindowSnapshot {
        WindowSnapshot {
            top_hosts: vec![HostStats {
                host_key: "hmac-truncated-01".into(),
                ip_display: None, // anonymize_hosts = true (regla §1.2 del contrato ingest)
                country: Some("AR".into()),
                bytes_in: 1_048_576,
                bytes_out: 524_288,
                packets: 1_500,
                risk_score: Some(0.2),
            }],
            top_ports: vec![PortStat {
                port: 443,
                protocol: Protocol::Tcp,
                bytes: 2_097_152,
                connections: 50,
            }],
            top_countries: vec![CountryStat {
                country: "AR".into(),
                bytes: 5_242_880,
                hosts: 15,
            }],
            alerts: vec![],
            health: sample_health(),
        }
    }

    fn sample_envelope() -> IngestEnvelope {
        IngestEnvelope {
            v: SC_CORE_SCHEMA_VERSION,
            device: sample_device(),
            window: sample_window(),
            snapshot: sample_snapshot(),
        }
    }

    #[test]
    fn snapshot_serializa_json_roundtrip() {
        let snapshot = sample_snapshot();
        let json = serde_json::to_string(&snapshot).unwrap();
        let back: WindowSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back, snapshot);

        let envelope = sample_envelope();
        let json = serde_json::to_string(&envelope).unwrap();
        let back: IngestEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(back, envelope);
    }

    #[test]
    fn campo_v_es_la_version_del_contrato() {
        let json = serde_json::to_value(sample_envelope()).unwrap();
        assert_eq!(json["v"], SC_CORE_SCHEMA_VERSION);
        // El snapshot en sí no lleva `v`: la versión viaja en el envelope
        // (ingest-api.v1.md §1.1; snapshot.schema tiene additionalProperties: false).
        assert!(json["snapshot"].get("v").is_none());
    }

    /// El ejemplo normativo del contrato (`examples/ingest-request.valid.json`)
    /// debe deserializar con los tipos tal como quedan: si se agrega un campo o
    /// cambia un tipo, este test falla antes de Publicar nada a la CI.
    #[test]
    fn ejemplo_del_contrato_deserializa() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../docs/contracts/examples/ingest-request.valid.json"
        );
        let raw =
            std::fs::read_to_string(path).expect("ejemplo del contrato presente en docs/contracts");
        let envelope: IngestEnvelope =
            serde_json::from_str(&raw).expect("ejemplo válido para los tipos v1");
        assert_eq!(envelope.v, 1);
        assert_eq!(envelope.snapshot.top_hosts[0].packets, 1_500);
        assert_eq!(envelope.snapshot.top_hosts[0].ip_display, None); // anonymize=true en el ejemplo
        assert_eq!(envelope.snapshot.top_ports[0].port, 443);
        assert_eq!(envelope.snapshot.top_countries[0].country, "AR");
        assert!(envelope.snapshot.alerts.is_empty());
        assert_eq!(envelope.snapshot.health.packets_dropped, 0);
    }

    /// El fixture normativo también debe serializar **idéntico**: si Rust agrega
    /// un campo obligatorio y no se actualiza `docs/contracts`, este test falla.
    /// Así el fixture queda pineado en ambos sentidos (Rust ↔ Zod) y no solo en
    /// la deserialización.
    #[test]
    fn ejemplo_del_contrato_serializa_identico() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../docs/contracts/examples/ingest-request.valid.json"
        );
        let raw =
            std::fs::read_to_string(path).expect("ejemplo del contrato presente en docs/contracts");
        let fixture: serde_json::Value = serde_json::from_str(&raw).expect("JSON válido");
        let envelope: IngestEnvelope =
            serde_json::from_str(&raw).expect("ejemplo válido para los tipos v1");
        let serializado = serde_json::to_value(&envelope).expect("el envelope serializa");

        // Comparación de `Value`: el orden de claves es irrelevante, pero cualquier
        // campo agregado, eliminado o con otro tipo rompe el gate.
        assert_eq!(
            serializado, fixture,
            "el JSON de Rust difiere del fixture normativo: actualizá el contrato o el tipo"
        );
    }
}
