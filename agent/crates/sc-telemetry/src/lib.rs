// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod logging;

use sc_core::{AgentHealth, CaptureStatus};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    pub last_error: Mutex<Option<String>>,
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
            last_error: Mutex::new(None),
        }
    }
}

impl HealthRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn snapshot(&self) -> AgentHealth {
        AgentHealth {
            capture_status: CaptureStatus::Ok,
            packets_seen: self.packets_seen.load(Ordering::Relaxed),
            packets_dropped: self.packets_dropped.load(Ordering::Relaxed),
            parse_errors: self.parse_errors.load(Ordering::Relaxed),
            queue_depth: Some(self.queue_depth.load(Ordering::Relaxed)),
            spool_bytes: None,
            cpu_percent: None,
            memory_bytes: None,
            last_error: self.last_error.lock().unwrap().clone(),
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
}
