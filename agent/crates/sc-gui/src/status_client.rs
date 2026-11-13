// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Cliente del endpoint loopback `/status` del agente (F3).
//!
//! El contrato lo define `sc-telemetry::status::AgentStatus`. Aquí se
//! deserializa con `#[serde(default)]` en todos los campos para que un agente
//! más nuevo (o más viejo) no rompa la GUI: lo que falte queda en su valor por
//! defecto y se muestra como ausente.
//!
//! La URL se puede redirigir con `SC_GUI_STATUS_URL`, pensado para comprobar la
//! degradación (por ejemplo `http://127.0.0.1:9/status`) sin tocar el servicio.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::sync::mpsc::{channel, Receiver};
use std::thread;
use std::time::Duration;

/// Endpoint local que publica el agente cuando corre como servicio o consola.
pub const DEFAULT_STATUS_URL: &str = "http://127.0.0.1:8387/status";

/// Cadencia del poller: el mismo segundo que el refresco de la ventana.
pub const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Timeout del GET: loopback, así que 2 s ya distingue "colgado" de "lento".
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);

/// Cuerpo de `GET /status` tal como lo publica el agente.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct StatusSnapshot {
    #[serde(default)]
    pub agent_version: String,
    #[serde(default)]
    pub device_id: String,
    /// `ok` o `disabled` (modo collector-only con `--no-capture`).
    #[serde(default)]
    pub capture_status: String,
    #[serde(default)]
    pub packets_seen: u64,
    #[serde(default)]
    pub packets_dropped: u64,
    #[serde(default)]
    pub parse_errors: u64,
    #[serde(default)]
    pub queue_depth: u64,
    #[serde(default)]
    pub spool_bytes: u64,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub collector_ports: Vec<u16>,
    #[serde(default)]
    pub geo_loaded: bool,
    #[serde(default)]
    pub last_sync_at: Option<String>,
    /// Siempre `running` mientras haya proceso que responda: el estado real del
    /// servicio lo da el SCM (`crate::scm`).
    #[serde(default)]
    pub service_state: String,
    /// `service` (SCM) o `console` (CLI interactivo).
    #[serde(default)]
    pub mode: String,
}

impl StatusSnapshot {
    /// Segundos desde el último sync confirmado; `None` si nunca sincronizó o
    /// si el timestamp no es RFC 3339.
    pub fn sync_age_secs(&self, now: DateTime<Utc>) -> Option<i64> {
        Some((now - self.sync_instant()?).num_seconds().max(0))
    }

    /// Instante del último sync confirmado, `None` si nunca sincronizó o el
    /// timestamp no es RFC 3339.
    pub fn sync_instant(&self) -> Option<DateTime<Utc>> {
        let raw = self.last_sync_at.as_deref()?;
        DateTime::parse_from_rfc3339(raw)
            .ok()
            .map(|when| when.with_timezone(&Utc))
    }
}

/// URL efectiva del endpoint, con override por entorno para pruebas.
pub fn status_url() -> String {
    std::env::var("SC_GUI_STATUS_URL").unwrap_or_else(|_| DEFAULT_STATUS_URL.to_string())
}

/// Un `GET` con timeout corto. `None` = agente ausente, colgado o answer rara.
pub fn fetch(url: &str) -> Option<StatusSnapshot> {
    let client = reqwest::blocking::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .ok()?;
    client
        .get(url)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .ok()
}

/// Hilo de sondeo: envía el resultado de cada intento (éxito o `None`).
pub struct Poller {
    rx: Receiver<Option<StatusSnapshot>>,
}

impl Poller {
    pub fn spawn(url: String) -> Self {
        let (tx, rx) = channel();
        thread::spawn(move || loop {
            if tx.send(fetch(&url)).is_err() {
                break; // la ventana se cerró
            }
            thread::sleep(POLL_INTERVAL);
        });
        Self { rx }
    }

    /// Último resultado recibido desde el frame anterior. `None` = sin novedades.
    pub fn try_latest(&mut self) -> Option<Option<StatusSnapshot>> {
        let mut latest = None;
        while let Ok(item) = self.rx.try_recv() {
            latest = Some(item);
        }
        latest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Respuesta real de `curl http://127.0.0.1:8387/status` (2026-11-12).
    const FIXTURE: &str = r#"{"agent_version":"0.1.4","device_id":"dev_fe4b1eb6-da3c-4d58-8e17-b09ed2798a71","capture_status":"disabled","packets_seen":0,"packets_dropped":0,"parse_errors":0,"queue_depth":0,"spool_bytes":0,"last_error":null,"collector_ports":[2056,4739],"geo_loaded":true,"last_sync_at":"2026-11-12T21:36:02.000Z","service_state":"running","mode":"service"}"#;

    #[test]
    fn deserializa_el_json_real_del_agente() {
        let snapshot: StatusSnapshot = serde_json::from_str(FIXTURE).expect("fixture válido");
        assert_eq!(snapshot.agent_version, "0.1.4");
        assert_eq!(
            snapshot.device_id,
            "dev_fe4b1eb6-da3c-4d58-8e17-b09ed2798a71"
        );
        assert_eq!(snapshot.capture_status, "disabled");
        assert_eq!(snapshot.collector_ports, vec![2056, 4739]);
        assert!(snapshot.geo_loaded);
        assert_eq!(snapshot.mode, "service");
        assert_eq!(snapshot.last_error, None);
    }

    #[test]
    fn un_json_parcial_no_rompe_la_gui() {
        let snapshot: StatusSnapshot =
            serde_json::from_str(r#"{"agent_version":"9.9.9"}"#).expect("defaults");
        assert_eq!(snapshot.agent_version, "9.9.9");
        assert_eq!(snapshot.spool_bytes, 0);
        assert!(snapshot.last_sync_at.is_none());
        assert!(snapshot.collector_ports.is_empty());
    }

    #[test]
    fn calcula_la_antiguedad_del_ultimo_sync() {
        let snapshot: StatusSnapshot = serde_json::from_str(FIXTURE).unwrap();
        let now = DateTime::parse_from_rfc3339("2026-11-12T21:41:02.000Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(snapshot.sync_age_secs(now), Some(300));
    }

    #[test]
    fn sin_sync_no_hay_antiguedad() {
        let now = Utc::now();
        assert_eq!(StatusSnapshot::default().sync_age_secs(now), None);
    }
}
