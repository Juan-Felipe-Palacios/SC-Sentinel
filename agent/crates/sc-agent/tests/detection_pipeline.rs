// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Integración mínima aggregator -> sc-detect -> snapshot contractual.
//! Verifica que las señales locales del aggregator no se pierden y que el
//! agente puede enriquecer el snapshot antes de persistirlo en el spool.

use sc_aggregate::{AggregatedWindow, AggregatorConfig, Clock, WindowAggregator};
use sc_capture::{Direction, FlowUpdate};
use sc_core::{FlowKey, Protocol};
use sc_detect::{detect_and_apply, DetectorConfig};
use sc_geo::NoLookup;
use sc_telemetry::HealthRegistry;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

struct StepClock(Arc<AtomicI64>);

impl Clock for StepClock {
    fn now_epoch_s(&self) -> i64 {
        self.0.load(Ordering::Relaxed)
    }
}

fn outbound(port: u16) -> FlowUpdate {
    FlowUpdate {
        ts: 1,
        flow: FlowKey {
            src_ip: u32::from(std::net::Ipv4Addr::new(192, 168, 1, 41)) as u128,
            dst_ip: u32::from(std::net::Ipv4Addr::new(203, 0, 113, 9)) as u128,
            src_port: 51_234,
            dst_port: port,
            protocol: Protocol::Tcp,
        },
        bytes: 64,
        packets: 1,
        direction: Direction::Out,
    }
}

fn inbound(port: u16) -> FlowUpdate {
    FlowUpdate {
        ts: 1,
        flow: FlowKey {
            src_ip: u32::from(std::net::Ipv4Addr::new(203, 0, 113, 9)) as u128,
            dst_ip: u32::from(std::net::Ipv4Addr::new(192, 168, 1, 41)) as u128,
            src_port: 55_000,
            dst_port: port,
            protocol: Protocol::Tcp,
        },
        bytes: 64,
        packets: 1,
        direction: Direction::In,
    }
}

#[tokio::test]
async fn un_escaneo_saliente_llega_como_alerta_al_snapshot() {
    let clock = Arc::new(AtomicI64::new(1));
    let (tx, rx) = mpsc::channel(128);
    let (snap_tx, mut snap_rx) = mpsc::channel(16);

    let aggregator = WindowAggregator::new(
        AggregatorConfig {
            window_seconds: 1,
            anonymize_hosts: false,
            hmac_key: b"test-key".to_vec(),
            top_hosts: 50,
            top_ports: 50,
            top_countries: 30,
            max_alerts: 50,
        },
        Arc::new(NoLookup),
        HealthRegistry::new(),
    )
    .with_clock(Arc::new(StepClock(clock.clone())));

    let handle = tokio::spawn(aggregator.run(rx, snap_tx));
    tokio::task::yield_now().await;

    for port in 1_000..1_025 {
        tx.send(outbound(port)).await.expect("flujo de escaneo");
    }
    clock.store(2, Ordering::Relaxed);
    tx.send(outbound(9_999))
        .await
        .expect("flujo que cierra la ventana");
    drop(tx);

    // El aggregator puede emitir primero una ventana vacía si el reloj avanzó
    // antes de que procesara la cola; se descarta y se toma la primera con
    // señales. El test de `sc-aggregate` cubre el cierre temporal exacto.
    let mut frame: Option<AggregatedWindow> = None;
    for _ in 0..4 {
        let candidate = tokio::time::timeout(Duration::from_secs(2), snap_rx.recv())
            .await
            .expect("timeout esperando la ventana")
            .expect("ventana cerrada");
        if !candidate.signals.hosts.is_empty() {
            frame = Some(candidate);
            break;
        }
    }
    let mut frame = frame.expect("no se emitió una ventana con señales");

    assert!(
        frame
            .signals
            .hosts
            .iter()
            .any(|host| host.is_local && host.distinct_dst_ports >= 25),
        "el aggregator debe exponer las señales del extremo local: {:?}",
        frame.signals.hosts
    );

    let detected = detect_and_apply(
        &frame.window,
        &frame.signals,
        &DetectorConfig::default(),
        &mut frame.snapshot,
    );

    assert!(
        detected
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "port_scan"),
        "se esperaba port_scan, se obtuvo {:?}",
        detected.alerts
    );
    assert!(frame
        .snapshot
        .alerts
        .iter()
        .any(|alert| alert.rule_id == "port_scan"));

    let _ = tokio::time::timeout(Duration::from_secs(2), handle).await;
}

#[tokio::test]
async fn un_escaneo_entrante_llega_como_alerta_al_snapshot() {
    let clock = Arc::new(AtomicI64::new(1));
    let (tx, rx) = mpsc::channel(128);
    let (snap_tx, mut snap_rx) = mpsc::channel(16);

    let aggregator = WindowAggregator::new(
        AggregatorConfig {
            window_seconds: 1,
            anonymize_hosts: false,
            hmac_key: b"test-key".to_vec(),
            top_hosts: 50,
            top_ports: 50,
            top_countries: 30,
            max_alerts: 50,
        },
        Arc::new(NoLookup),
        HealthRegistry::new(),
    )
    .with_clock(Arc::new(StepClock(clock.clone())));

    let handle = tokio::spawn(aggregator.run(rx, snap_tx));
    tokio::task::yield_now().await;

    for port in 1_000..1_025 {
        tx.send(inbound(port)).await.expect("flujo entrante");
    }
    clock.store(2, Ordering::Relaxed);
    tx.send(inbound(9_999))
        .await
        .expect("flujo que cierra la ventana");
    drop(tx);

    let mut frame: Option<AggregatedWindow> = None;
    for _ in 0..4 {
        let candidate = tokio::time::timeout(Duration::from_secs(2), snap_rx.recv())
            .await
            .expect("timeout esperando la ventana")
            .expect("ventana cerrada");
        if candidate
            .signals
            .hosts
            .iter()
            .any(|host| !host.is_local && host.distinct_inbound_ports >= 25)
        {
            frame = Some(candidate);
            break;
        }
    }
    let mut frame = frame.expect("no se emitió una ventana con señales entrantes");

    let detected = detect_and_apply(
        &frame.window,
        &frame.signals,
        &DetectorConfig::default(),
        &mut frame.snapshot,
    );

    assert!(
        detected
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "inbound_port_scan"),
        "se esperaba inbound_port_scan, se obtuvo {:?}",
        detected.alerts
    );
    assert!(frame
        .snapshot
        .alerts
        .iter()
        .any(|alert| alert.rule_id == "inbound_port_scan"));

    let _ = tokio::time::timeout(Duration::from_secs(2), handle).await;
}
