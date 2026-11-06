// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::accumulator::Accumulator;
use crate::snapshot::build_snapshot;
use sc_capture::FlowUpdate;
use sc_core::{Window, WindowSnapshot};
use sc_geo::CountryLookup;
use sc_telemetry::HealthRegistry;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

pub trait Clock: Send + Sync {
    fn now_epoch_s(&self) -> i64;
}

#[derive(Clone)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_epoch_s(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }
}

#[derive(Clone)]
pub struct FixedClock {
    now: i64,
}

impl FixedClock {
    pub fn new(now: i64) -> Self {
        Self { now }
    }
}

impl Clock for FixedClock {
    fn now_epoch_s(&self) -> i64 {
        self.now
    }
}

#[derive(Clone)]
pub struct AggregatorConfig {
    pub window_seconds: u32,
    pub anonymize_hosts: bool,
    pub hmac_key: Vec<u8>,
    pub top_hosts: usize,
    pub top_ports: usize,
    pub top_countries: usize,
    pub max_alerts: usize,
}

/// Contadores crudos del canal de captura, compartidos con el aggregator para
/// que cada snapshot lleve el health del instante (no el del último tick).
#[derive(Clone, Default)]
pub struct CaptureCounters {
    pub packets_seen: Option<Arc<std::sync::atomic::AtomicU64>>,
    pub packets_dropped: Option<Arc<std::sync::atomic::AtomicU64>>,
    pub parse_errors: Option<Arc<std::sync::atomic::AtomicU64>>,
}

impl Default for AggregatorConfig {
    fn default() -> Self {
        Self {
            window_seconds: 30,
            anonymize_hosts: true,
            hmac_key: b"default".to_vec(),
            top_hosts: 50,
            top_ports: 50,
            top_countries: 30,
            max_alerts: 50,
        }
    }
}

pub struct WindowAggregator {
    cfg: AggregatorConfig,
    country: Arc<dyn CountryLookup>,
    health: Arc<HealthRegistry>,
    clock: Arc<dyn Clock>,
    counters: CaptureCounters,
}

impl WindowAggregator {
    pub fn new(
        cfg: AggregatorConfig,
        country: Arc<dyn CountryLookup>,
        health: Arc<HealthRegistry>,
    ) -> Self {
        Self {
            cfg,
            country,
            health,
            clock: Arc::new(SystemClock),
            counters: CaptureCounters::default(),
        }
    }

    /// Inyecta los contadores de captura para publicarlos en cada snapshot (§9).
    pub fn with_capture_counters(mut self, counters: CaptureCounters) -> Self {
        self.counters = counters;
        self
    }

    /// Copia `packets_seen`/`drops`/`parse_errors` al health antes de snapshotear.
    fn sync_capture_counters(&self) {
        if let Some(seen) = &self.counters.packets_seen {
            self.health
                .packets_seen
                .store(seen.load(Ordering::Relaxed), Ordering::Relaxed);
        }
        if let Some(dropped) = &self.counters.packets_dropped {
            self.health
                .packets_dropped
                .store(dropped.load(Ordering::Relaxed), Ordering::Relaxed);
        }
        if let Some(errors) = &self.counters.parse_errors {
            self.health
                .parse_errors
                .store(errors.load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }

    pub fn with_clock(mut self, clock: Arc<dyn Clock>) -> Self {
        self.clock = clock;
        self
    }

    pub async fn run(
        self,
        mut rx: mpsc::Receiver<FlowUpdate>,
        snapshots: mpsc::Sender<WindowSnapshot>,
    ) {
        let window_seconds = self.cfg.window_seconds as i64;
        let mut current_start = (self.clock.now_epoch_s() / window_seconds) * window_seconds;
        let mut accumulator = Accumulator::new(
            self.cfg.hmac_key.clone(),
            self.cfg.anonymize_hosts,
            self.country.clone(),
        );
        let mut window_id_counter: u64 = 0;

        loop {
            tokio::select! {
                Some(update) = rx.recv() => {
                    let now = self.clock.now_epoch_s();
                    let window_end = current_start + window_seconds;
                    if now >= window_end {
                        // Flush current window
                        let _ = chrono::Utc;
                        // Backlog real del canal de captura en este instante (§9).
                        self.health
                            .queue_depth
                            .store(rx.len() as u64, Ordering::Relaxed);
                        self.sync_capture_counters();
                        let snapshot = build_snapshot(
                            &accumulator,
                            &self.cfg,
                            &self.health,
                            Window {
                                id: format!("win_{}", window_id_counter),
                                start: chrono::DateTime::<chrono::Utc>::from_timestamp(current_start, 0).unwrap(),
                                end: chrono::DateTime::<chrono::Utc>::from_timestamp(window_end, 0).unwrap(),
                                duration_ms: (window_seconds * 1000) as u64,
                                sequence: window_id_counter,
                            },
                            window_id_counter,
                        );
                        window_id_counter += 1;
                        let _ = snapshots.send(snapshot).await;
                        // Start new window
                        current_start = (now / window_seconds) * window_seconds;
                        accumulator = Accumulator::new(self.cfg.hmac_key.clone(), self.cfg.anonymize_hosts, self.country.clone());
                    }
                    accumulator.add_flow(&update);
                }
                else => break,
            }
        }
        // Flush remaining
        let now = self.clock.now_epoch_s();
        let window_end = current_start + window_seconds;
        let end_time = if now > window_end { window_end } else { now };
        self.health
            .queue_depth
            .store(rx.len() as u64, Ordering::Relaxed);
        self.sync_capture_counters();
        let snapshot = build_snapshot(
            &accumulator,
            &self.cfg,
            &self.health,
            Window {
                id: format!("win_{}", window_id_counter),
                start: chrono::DateTime::<chrono::Utc>::from_timestamp(current_start, 0).unwrap(),
                end: chrono::DateTime::<chrono::Utc>::from_timestamp(end_time, 0).unwrap(),
                duration_ms: ((end_time - current_start).max(0)) as u64 * 1000,
                sequence: window_id_counter,
            },
            window_id_counter,
        );
        let _ = snapshots.send(snapshot).await;
    }
}
