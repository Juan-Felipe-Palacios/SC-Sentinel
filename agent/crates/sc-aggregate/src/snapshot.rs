// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::accumulator::Accumulator;
use crate::window::{AggregatedWindow, AggregatorConfig};
use sc_core::{DetectionInput, Window, WindowSnapshot};
use sc_telemetry::HealthRegistry;
use std::sync::Arc;

/// Las reglas necesitan ver más hosts que el top visual de 50: un escaneo de
/// puertos puede tener poco volumen y quedar fuera del top por bytes.
const DETECTION_REMOTE_HOSTS: usize = 500;

pub fn build_snapshot(
    accumulator: &Accumulator,
    cfg: &AggregatorConfig,
    health: &Arc<HealthRegistry>,
    window: Window,
    _window_id_counter: u64,
) -> AggregatedWindow {
    let health_snap = health.snapshot();
    let top_hosts = accumulator.build_hosts(cfg.top_hosts);
    let top_ports = accumulator.build_ports(cfg.top_ports);
    let signals = DetectionInput {
        hosts: accumulator.build_signals(cfg.top_hosts.max(DETECTION_REMOTE_HOSTS)),
        ports: top_ports.clone(),
        health: health_snap.clone(),
    };
    let snapshot = WindowSnapshot {
        top_hosts,
        top_ports,
        top_countries: accumulator.build_countries(cfg.top_countries),
        alerts: Vec::new(),
        health: health_snap,
    };
    AggregatedWindow {
        window,
        snapshot,
        signals,
    }
}
