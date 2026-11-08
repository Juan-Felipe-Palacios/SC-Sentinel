// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Contadores atómicos de salud del colector (T4.1 los publicará en el dashboard).
//!
//! Se actualizan con `Ordering::Relaxed`: son métricas de salud, no
//! sincronización; el snapshot puede ver un valor ligeramente desfasado.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Default)]
pub struct CollectorMetrics {
    /// Datagramas UDP recibidos (incluye los que luego fallan al parsear).
    pub packets_received: AtomicU64,
    /// Bytes UDP recibidos.
    pub bytes_received: AtomicU64,
    /// Flujos descartados porque el canal del pipeline estaba lleno.
    pub packets_dropped: AtomicU64,
    /// Datagramas rechazados por un parser (versión, longitud, formato).
    pub parse_errors: AtomicU64,
    /// Errores de `recv_from` (socket cerrado, ICMP, etc.).
    pub socket_errors: AtomicU64,
    /// Flujos entregados al canal del aggregator.
    pub flows_normalized: AtomicU64,
    /// Templates cacheados (NetFlow v9/IPFIX; 0 con solo NetFlow v5).
    pub templates_cached: AtomicU64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CollectorMetricsSnapshot {
    pub packets_received: u64,
    pub bytes_received: u64,
    pub packets_dropped: u64,
    pub parse_errors: u64,
    pub socket_errors: u64,
    pub flows_normalized: u64,
    pub templates_cached: u64,
}

impl CollectorMetrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn snapshot(&self) -> CollectorMetricsSnapshot {
        CollectorMetricsSnapshot {
            packets_received: self.packets_received.load(Ordering::Relaxed),
            bytes_received: self.bytes_received.load(Ordering::Relaxed),
            packets_dropped: self.packets_dropped.load(Ordering::Relaxed),
            parse_errors: self.parse_errors.load(Ordering::Relaxed),
            socket_errors: self.socket_errors.load(Ordering::Relaxed),
            flows_normalized: self.flows_normalized.load(Ordering::Relaxed),
            templates_cached: self.templates_cached.load(Ordering::Relaxed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_refleja_los_contadores() {
        let metrics = CollectorMetrics::new();
        metrics.packets_received.store(10, Ordering::Relaxed);
        metrics.flows_normalized.store(9, Ordering::Relaxed);
        metrics.parse_errors.store(1, Ordering::Relaxed);

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.packets_received, 10);
        assert_eq!(snapshot.flows_normalized, 9);
        assert_eq!(snapshot.parse_errors, 1);
        assert_eq!(snapshot.templates_cached, 0);
    }
}
