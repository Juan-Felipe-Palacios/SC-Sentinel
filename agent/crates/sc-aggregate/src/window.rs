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

    /// Emite `(Window, WindowSnapshot)`: el spool necesita los extremos reales de
    /// la ventana, no un `now-30..now` aproximado al momento de persistirla.
    pub async fn run(
        self,
        mut rx: mpsc::Receiver<FlowUpdate>,
        snapshots: mpsc::Sender<(Window, WindowSnapshot)>,
    ) {
        let window_seconds = self.cfg.window_seconds as i64;
        let mut current_start = (self.clock.now_epoch_s() / window_seconds) * window_seconds;
        let mut accumulator = Accumulator::new(
            self.cfg.hmac_key.clone(),
            self.cfg.anonymize_hosts,
            self.country.clone(),
        );
        let mut window_id_counter: u64 = 0;
        // Último total de drops ya registrado, para loguear solo el delta de la ventana.
        let mut last_dropped: u64 = 0;

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
                        let dropped = self.health.packets_dropped.load(Ordering::Relaxed);
                        if dropped > last_dropped {
                            tracing::warn!(
                                event = "capture_drops",
                                dropped_window = dropped - last_dropped,
                                dropped_total = dropped,
                                "canal de captura lleno: paquetes descartados por backpressure"
                            );
                            last_dropped = dropped;
                        }
                        let window = Window {
                            id: format!("win_{}", window_id_counter),
                            start: chrono::DateTime::<chrono::Utc>::from_timestamp(current_start, 0).unwrap(),
                            end: chrono::DateTime::<chrono::Utc>::from_timestamp(window_end, 0).unwrap(),
                            duration_ms: (window_seconds * 1000) as u64,
                            sequence: window_id_counter,
                        };
                        let snapshot = build_snapshot(
                            &accumulator,
                            &self.cfg,
                            &self.health,
                            window.clone(),
                            window_id_counter,
                        );
                        window_id_counter += 1;
                        let _ = snapshots.send((window, snapshot)).await;
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
        let window = Window {
            id: format!("win_{}", window_id_counter),
            start: chrono::DateTime::<chrono::Utc>::from_timestamp(current_start, 0).unwrap(),
            end: chrono::DateTime::<chrono::Utc>::from_timestamp(end_time, 0).unwrap(),
            duration_ms: ((end_time - current_start).max(0)) as u64 * 1000,
            sequence: window_id_counter,
        };
        let snapshot = build_snapshot(
            &accumulator,
            &self.cfg,
            &self.health,
            window.clone(),
            window_id_counter,
        );
        let _ = snapshots.send((window, snapshot)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sc_capture::{Direction, FlowUpdate};
    use sc_core::{FlowKey, Protocol};

    /// Reloj mutable: permite avanzar el tiempo entre envíos sin dormir el test.
    struct StepClock(Arc<std::sync::atomic::AtomicI64>);

    impl Clock for StepClock {
        fn now_epoch_s(&self) -> i64 {
            self.0.load(Ordering::Relaxed)
        }
    }

    fn update(now: i64, bytes: u64) -> FlowUpdate {
        FlowUpdate {
            ts: now * 1_000_000_000,
            flow: FlowKey {
                src_ip: u32::from(std::net::Ipv4Addr::new(192, 168, 1, 41)) as u128,
                dst_ip: u32::from(std::net::Ipv4Addr::new(8, 8, 8, 8)) as u128,
                src_port: 51_234,
                dst_port: 443,
                protocol: Protocol::Tcp,
            },
            bytes,
            packets: 1,
            direction: Direction::Out,
        }
    }

    /// Golden de la ventana de 30 s: se cierra alineada al bloque de 30 s y el
    /// snapshot lleva solo los flujos de esa ventana (no los de la siguiente).
    #[tokio::test]
    async fn ventana_de_30_s_cierra_alineada_con_sus_flujos() {
        let clock = Arc::new(std::sync::atomic::AtomicI64::new(1_000));
        let (tx, rx) = mpsc::channel(16);
        let (snap_tx, mut snap_rx) = mpsc::channel(16);
        let aggregator = WindowAggregator::new(
            AggregatorConfig {
                window_seconds: 30,
                anonymize_hosts: false,
                ..AggregatorConfig::default()
            },
            Arc::new(sc_geo::NoLookup),
            HealthRegistry::new(),
        )
        .with_clock(Arc::new(StepClock(clock.clone())));
        let handle = tokio::spawn(aggregator.run(rx, snap_tx));
        // Deja que `run` fije la ventana inicial (990) antes de avanzar el reloj.
        tokio::task::yield_now().await;

        let t = std::time::Duration::from_secs(5);
        tokio::time::timeout(t, tx.send(update(1_000, 100)))
            .await
            .expect("timeout flujo 1")
            .expect("flujo 1");
        tokio::task::yield_now().await;
        tokio::time::timeout(t, tx.send(update(1_005, 100)))
            .await
            .expect("timeout flujo 2")
            .expect("flujo 2");
        tokio::task::yield_now().await;
        // El primer flujo que llega pasado el borde cierra 990..1020 y abre 1020..1050.
        clock.store(1_020, Ordering::Relaxed);
        tokio::time::timeout(t, tx.send(update(1_020, 999)))
            .await
            .expect("timeout flujo 3")
            .expect("flujo 3");
        tokio::task::yield_now().await;

        let (window, snapshot) = tokio::time::timeout(t, snap_rx.recv())
            .await
            .expect("timeout esperando la ventana")
            .expect("ventana cerrada");
        assert_eq!(window.start.timestamp(), 990);
        assert_eq!(window.end.timestamp(), 1_020);
        assert_eq!(window.duration_ms, 30_000);
        let host = snapshot.top_hosts.first().expect("host agregado");
        assert_eq!(host.packets, 2, "solo los flujos de 990..1020");
        assert_eq!(host.bytes_out, 200);

        drop(tx);
        tokio::time::timeout(t, handle)
            .await
            .expect("timeout cerrando el aggregator")
            .expect("aggregator sin panico");
    }
}
