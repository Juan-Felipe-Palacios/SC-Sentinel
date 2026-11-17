// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod logging;
pub mod status;

use chrono::Utc;
use sc_core::{AgentHealth, CaptureStatus};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Debug)]
pub struct HealthRegistry {
    pub capture_status: AtomicU64,
    pub packets_seen: AtomicU64,
    pub packets_dropped: AtomicU64,
    pub parse_errors: AtomicU64,
    pub queue_depth: AtomicU64,
    pub spool_bytes: AtomicU64,
    pub data_loss_bytes: AtomicU64,
    pub data_loss_windows: AtomicU64,
    pub needs_enrollment: AtomicBool,
    /// true cuando el colector NetFlow/IPFIX corrió: gobierna si el snapshot
    /// publica las métricas `collector_*` (si no, quedan `None` y se omiten).
    pub collector_enabled: AtomicBool,
    pub collector_packets_received: AtomicU64,
    pub collector_packets_dropped: AtomicU64,
    pub collector_parse_errors: AtomicU64,
    pub collector_templates_cached: AtomicU64,
    pub collector_flows_normalized: AtomicU64,
    /// El agente ya publicó al menos una lectura del conjunto de IPs locales.
    pub local_ips_checked: AtomicBool,
    /// Hay al menos una IPv4 no APIPA que el parser puede usar.
    pub local_ips_usable: AtomicBool,
    pub local_ips_ipv4: AtomicU64,
    /// Segundos unix del último refresco exitoso; 0 = todavía ninguno.
    pub local_ips_last_refresh_unix: AtomicI64,
    pub last_error: Mutex<Option<String>>,
}

/// Foto del estado de IPs locales para `/status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalIpHealth {
    pub checked: bool,
    pub usable: bool,
    pub ipv4: u64,
    pub last_refresh_unix: Option<i64>,
}

impl Default for HealthRegistry {
    fn default() -> Self {
        HealthRegistry {
            capture_status: AtomicU64::new(0),
            packets_seen: AtomicU64::new(0),
            packets_dropped: AtomicU64::new(0),
            parse_errors: AtomicU64::new(0),
            queue_depth: AtomicU64::new(0),
            spool_bytes: AtomicU64::new(0),
            data_loss_bytes: AtomicU64::new(0),
            data_loss_windows: AtomicU64::new(0),
            needs_enrollment: AtomicBool::new(false),
            collector_enabled: AtomicBool::new(false),
            collector_packets_received: AtomicU64::new(0),
            collector_packets_dropped: AtomicU64::new(0),
            collector_parse_errors: AtomicU64::new(0),
            collector_templates_cached: AtomicU64::new(0),
            collector_flows_normalized: AtomicU64::new(0),
            local_ips_checked: AtomicBool::new(false),
            local_ips_usable: AtomicBool::new(false),
            local_ips_ipv4: AtomicU64::new(0),
            local_ips_last_refresh_unix: AtomicI64::new(0),
            last_error: Mutex::new(None),
        }
    }
}

impl HealthRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn snapshot(&self) -> AgentHealth {
        // `spool_bytes` siempre se publica (0 = spool vacío): un null hacía que el
        // dashboard mostrara "—" y pareciera que el agente no reporta nada.
        let spool_bytes = self.spool_bytes.load(Ordering::Relaxed);
        // Las métricas del colector solo se publican si el colector está activo:
        // sin eso, un agente sin NetFlow/IPFIX reportaría contadores en cero
        // que parecerían "colector corriendo sin flujos".
        let collector = if self.collector_enabled.load(Ordering::Relaxed) {
            Some((
                self.collector_packets_received.load(Ordering::Relaxed),
                self.collector_packets_dropped.load(Ordering::Relaxed),
                self.collector_parse_errors.load(Ordering::Relaxed),
                self.collector_templates_cached.load(Ordering::Relaxed),
                self.collector_flows_normalized.load(Ordering::Relaxed),
            ))
        } else {
            None
        };
        AgentHealth {
            capture_status: CaptureStatus::Ok,
            packets_seen: self.packets_seen.load(Ordering::Relaxed),
            packets_dropped: self.packets_dropped.load(Ordering::Relaxed),
            parse_errors: self.parse_errors.load(Ordering::Relaxed),
            queue_depth: Some(self.queue_depth.load(Ordering::Relaxed)),
            spool_bytes: Some(spool_bytes),
            cpu_percent: None,
            memory_bytes: None,
            collector_packets_received: collector.map(|c| c.0),
            collector_packets_dropped: collector.map(|c| c.1),
            collector_parse_errors: collector.map(|c| c.2),
            collector_templates_cached: collector.map(|c| c.3),
            collector_flows_normalized: collector.map(|c| c.4),
            last_error: self.last_error.lock().unwrap().clone(),
        }
    }

    /// Copia las métricas del colector (T4.1) hacia los contadores de salud.
    /// Llamar periódicamente desde el agente; marca `collector_enabled` para
    /// que el snapshot publique los campos `collector_*`.
    pub fn set_collector_stats(
        &self,
        packets_received: u64,
        packets_dropped: u64,
        parse_errors: u64,
        templates_cached: u64,
        flows_normalized: u64,
    ) {
        self.collector_enabled.store(true, Ordering::Relaxed);
        self.collector_packets_received
            .store(packets_received, Ordering::Relaxed);
        self.collector_packets_dropped
            .store(packets_dropped, Ordering::Relaxed);
        self.collector_parse_errors
            .store(parse_errors, Ordering::Relaxed);
        self.collector_templates_cached
            .store(templates_cached, Ordering::Relaxed);
        self.collector_flows_normalized
            .store(flows_normalized, Ordering::Relaxed);
    }

    /// Publica el conjunto de IPs locales resuelto por el monitor.
    ///
    /// Se llama al arrancar y en cada refresco exitoso, aunque el contenido no
    /// haya cambiado, para que `local_ips_last_refresh` refleje el latido del
    /// monitor y no la hora del request a `/status`.
    pub fn note_local_ips(&self, usable: bool, ipv4: u64) {
        self.local_ips_checked.store(true, Ordering::Relaxed);
        self.local_ips_usable.store(usable, Ordering::Relaxed);
        self.local_ips_ipv4.store(ipv4, Ordering::Relaxed);
        self.local_ips_last_refresh_unix
            .store(Utc::now().timestamp(), Ordering::Relaxed);
    }

    pub fn local_ip_health(&self) -> LocalIpHealth {
        let last_refresh_unix = match self.local_ips_last_refresh_unix.load(Ordering::Relaxed) {
            0 => None,
            value => Some(value),
        };
        LocalIpHealth {
            checked: self.local_ips_checked.load(Ordering::Relaxed),
            usable: self.local_ips_usable.load(Ordering::Relaxed),
            ipv4: self.local_ips_ipv4.load(Ordering::Relaxed),
            last_refresh_unix,
        }
    }

    /// Guarda el último error truncado a 500 caracteres.
    /// Truncar por caracteres (no por bytes) evita paniquear al cortar una
    /// secuencia UTF-8 (mensajes de error con acentos en español).
    pub fn note_error(&self, msg: impl Into<String>) {
        let mut err = self.last_error.lock().unwrap();
        let msg = msg.into();
        *err = Some(if msg.chars().count() > 500 {
            msg.chars().take(500).collect()
        } else {
            msg
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn snapshot_refleja_los_contadores() {
        let health = HealthRegistry::new();
        health.packets_seen.store(7, Ordering::Relaxed);
        health.packets_dropped.store(2, Ordering::Relaxed);
        health.parse_errors.store(1, Ordering::Relaxed);
        health.queue_depth.store(3, Ordering::Relaxed);

        let snapshot = health.snapshot();
        assert_eq!(snapshot.packets_seen, 7);
        assert_eq!(snapshot.packets_dropped, 2);
        assert_eq!(snapshot.parse_errors, 1);
        assert_eq!(snapshot.queue_depth, Some(3));
        assert!(snapshot.last_error.is_none());
    }

    #[test]
    fn note_error_trunca_a_500_caracteres_sin_panico_utf8() {
        let health = HealthRegistry::new();
        health.note_error("ñ".repeat(700));

        let last = health.snapshot().last_error.expect("debe guardar el error");
        assert_eq!(last.chars().count(), 500);
    }

    #[test]
    fn local_ip_health_refleja_la_ultima_publicacion() {
        let health = HealthRegistry::new();
        assert!(!health.local_ip_health().checked);

        health.note_local_ips(false, 0);
        let degraded = health.local_ip_health();
        assert!(degraded.checked);
        assert!(!degraded.usable);
        assert_eq!(degraded.ipv4, 0);
        assert!(degraded.last_refresh_unix.is_some());

        health.note_local_ips(true, 1);
        let ok = health.local_ip_health();
        assert!(ok.usable);
        assert_eq!(ok.ipv4, 1);
    }

    #[test]
    fn sin_colector_las_metricas_collector_son_none() {
        let health = HealthRegistry::new();
        let snap = health.snapshot();
        assert!(snap.collector_packets_received.is_none());
        assert!(snap.collector_packets_dropped.is_none());
        assert!(snap.collector_parse_errors.is_none());
        assert!(snap.collector_templates_cached.is_none());
        assert!(snap.collector_flows_normalized.is_none());
    }

    #[test]
    fn con_colector_publica_las_metricas_collector() {
        let health = HealthRegistry::new();
        health.set_collector_stats(100, 2, 1, 5, 97);
        let snap = health.snapshot();
        assert_eq!(snap.collector_packets_received, Some(100));
        assert_eq!(snap.collector_packets_dropped, Some(2));
        assert_eq!(snap.collector_parse_errors, Some(1));
        assert_eq!(snap.collector_templates_cached, Some(5));
        assert_eq!(snap.collector_flows_normalized, Some(97));
    }
}
