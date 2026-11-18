// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Benchmark del camino caliente de agregación (`Accumulator::add_flow`).
//!
//! Mide lo que el agente paga **por flujo** antes de que exista snapshot:
//! marcado del host (HMAC con caché), agregado del peer remoto, agregado del
//! extremo local, estadísticas de puerto y, opcionalmente, geolocalización. No
//! incluye captura, spool ni sync.
//!
//! Uso:
//!
//! ```text
//! cargo bench -p sc-aggregate --bench aggregate_throughput
//! SC_BENCH_GEOIP=1 cargo bench -p sc-aggregate --bench aggregate_throughput
//! ```
//!
//! Variables opcionales:
//! - `SC_BENCH_FLOWS`: flujos totales (default 100 000).
//! - `SC_BENCH_CHUNK`: flujos por tramo (default 20 000). Los tramos muestran si
//!   el costo crece a medida que la ventana se llena.
//! - `SC_BENCH_SNAPSHOT_HOSTS`: hosts remotos del cierre de ventana (default 2 000).
//! - `SC_BENCH_GEOIP=1`: usa GeoLite2 Country y ASN si están descubribles.
//!
//! Los valores absolutos dependen de la máquina; lo comparable entre equipos es
//! la forma: `add_flow` con caché de claves no debe rehacer el HMAC por flujo.

use sc_aggregate::accumulator::Accumulator;
use sc_aggregate::{build_snapshot, AggregatorConfig};
use sc_capture::{Direction, FlowUpdate};
use sc_core::{FlowKey, Protocol, Window};
use sc_geo::{AsnLookup, CountryLookup, GeoLite2Asn, GeoLite2Country, NoLookup};
use sc_telemetry::HealthRegistry;
use std::hint::black_box;
use std::sync::Arc;
use std::time::Instant;

const NOW_TS: i64 = 1_700_000_000_000_000_000;
/// Hosts remotos distintos que rota el generador de flujos (250 por octeto).
const REMOTE_HOSTS: u64 = 2_000;

/// Escenario del banco: nombre visible + los dos buscadores geográficos.
type Scenario = (&'static str, Arc<dyn CountryLookup>, Arc<dyn AsnLookup>);

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
        .unwrap_or(default)
}

fn ip(a: u8, b: u8, c: u8, d: u8) -> u128 {
    u32::from(std::net::Ipv4Addr::new(a, b, c, d)) as u128
}

/// Flujo determinista: `i` recorre hosts remotos y puertos de origen, con el
/// extremo local fijo. Repetible entre corridas y entre máquinas.
fn update(i: u64) -> FlowUpdate {
    let host = i % REMOTE_HOSTS;
    FlowUpdate {
        ts: NOW_TS,
        flow: FlowKey {
            src_ip: ip(192, 168, 1, 41),
            dst_ip: ip(93, 184, (host / 250) as u8, (host % 250) as u8 + 1),
            src_port: 51_234,
            dst_port: 443,
            protocol: Protocol::Tcp,
        },
        bytes: 1_400,
        packets: 1,
        direction: Direction::Out,
    }
}

fn accumulator(country: Arc<dyn CountryLookup>, asn: Arc<dyn AsnLookup>) -> Accumulator {
    Accumulator::new(b"bench-key".to_vec(), false, country, asn)
}

/// GeoLite2 solo si se pide y está descubrible; si falta, se avisa y se sigue.
fn geo_lookups() -> Option<(Arc<dyn CountryLookup>, Arc<dyn AsnLookup>)> {
    if std::env::var("SC_BENCH_GEOIP").is_err() {
        return None;
    }
    match (GeoLite2Country::discover(), GeoLite2Asn::discover()) {
        (Ok(country), Ok(asn)) => Some((Arc::new(country), Arc::new(asn))),
        _ => {
            println!("# SC_BENCH_GEOIP pedido pero faltan bases GeoLite2: se mide sin GeoIP");
            None
        }
    }
}

fn main() {
    let flows = env_usize("SC_BENCH_FLOWS", 100_000);
    let chunk = env_usize("SC_BENCH_CHUNK", 20_000).max(1_000);
    let snapshot_hosts = env_usize("SC_BENCH_SNAPSHOT_HOSTS", 2_000);

    println!(
        "# Benchmark del camino caliente de agregación — sc-aggregate {} ({} / {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    println!(
        "Flujos: {flows} en tramos de {chunk}; {} hosts remotos distintos; una sola fuente.",
        REMOTE_HOSTS
    );
    println!();

    let mut scenarios: Vec<Scenario> =
        vec![("add_flow sin GeoIP", Arc::new(NoLookup), Arc::new(NoLookup))];
    if let Some((country, asn)) = geo_lookups() {
        scenarios.push(("add_flow con GeoLite2 país+ASN", country, asn));
    }

    println!("| Escenario | tramo | flujos | ns/flujo | M flujos/s |");
    println!("|---|---:|---:|---:|---:|");
    for (name, country, asn) in scenarios {
        let mut accumulator = accumulator(country, asn);
        let mut tramo = 1;
        let mut done = 0usize;
        while done < flows {
            let n = chunk.min(flows - done);
            let started = Instant::now();
            for i in done..done + n {
                accumulator.add_flow(black_box(&update(i as u64)));
            }
            let elapsed = started.elapsed().as_secs_f64();
            println!(
                "| {name} | {tramo} | {n} | {:.0} | {:.2} |",
                elapsed * 1e9 / n as f64,
                n as f64 / elapsed / 1e6
            );
            done += n;
            tramo += 1;
        }
    }

    // Cierre de ventana: clonado de acumuladores, orden y GeoIP del top.
    let mut accumulator = accumulator(Arc::new(NoLookup), Arc::new(NoLookup));
    for host in 0..snapshot_hosts as u64 {
        for j in 0..20u64 {
            let mut flow = update(host * 20 + j);
            flow.flow.dst_ip = ip(93, 184, (host / 250) as u8, (host % 250) as u8 + 1);
            flow.flow.src_port = 1_000 + (j as u16 % 600);
            accumulator.add_flow(&flow);
        }
    }
    let cfg = AggregatorConfig::default();
    let health = HealthRegistry::new();
    let window = Window {
        id: "bench".to_string(),
        start: chrono::DateTime::from_timestamp(1_700_000_000, 0).expect("inicio válido"),
        end: chrono::DateTime::from_timestamp(1_700_000_030, 0).expect("fin válido"),
        duration_ms: 30_000,
        sequence: 0,
    };
    let started = Instant::now();
    let frame = build_snapshot(&accumulator, &cfg, &health, window, 0);
    println!(
        "build_snapshot con {snapshot_hosts} hosts ({} flujos): {:.1} ms (top={} señales={})",
        snapshot_hosts * 20,
        started.elapsed().as_secs_f64() * 1e3,
        frame.snapshot.top_hosts.len(),
        frame.signals.hosts.len()
    );
}
