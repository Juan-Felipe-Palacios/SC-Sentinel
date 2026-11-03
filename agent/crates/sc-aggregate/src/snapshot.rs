// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::accumulator::Accumulator;
use crate::window::AggregatorConfig;
use sc_core::{Alert, WindowSnapshot};
use sc_telemetry::HealthRegistry;
use std::sync::Arc;

pub fn build_snapshot(
    accumulator: &Accumulator,
    cfg: &AggregatorConfig,
    health: &Arc<HealthRegistry>,
    _window: sc_core::Window,
    _window_id_counter: u64,
) -> WindowSnapshot {
    let health_snap = health.snapshot();
    WindowSnapshot {
        top_hosts: accumulator.build_hosts(cfg.top_hosts),
        top_ports: accumulator.build_ports(cfg.top_ports),
        top_countries: accumulator.build_countries(cfg.top_countries),
        alerts: Vec::<Alert>::new(),
        health: health_snap,
    }
}
