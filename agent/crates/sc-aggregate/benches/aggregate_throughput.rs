// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Benchmark del camino caliente de agregación (`Accumulator::add_flow`).
//!
//! Mide lo que el agente paga **por flujo** antes de que exista snapshot:
//! marcado del host (HMAC con caché), agregado del peer remoto, agregado del
//! extremo local y estadísticas de puerto. No incluye captura, spool ni sync.
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
//! - `SC_BENCH_GEOIP=1`: usa GeoLite2 Country y ASN si están descubribles.
//!
//! Los valores absolutos dependen de la máquina; lo comparable entre equipos es
//! la forma: `add_flow` con caché de claves no debe rehacer el HMAC por flujo.

use sc_aggregate::accumulator::Accumulator;
use sc_capture::{Direction, FlowUpdate};
use sc_core::{FlowKey, Protocol};
use sc_geo::{AsnLookup, CountryLookup, GeoLite2Asn, GeoLite2Country, NoLookup};
use std::hint::black_box;
use std::sync::Arc;
use std::time::Instant;

const NOW_TS: i64 = 1_700_000_000_000_000_000;
/// Hosts remotos distintos que rota el generador de flujos (250 por octeto).
const REMOTE_HOSTS: u64 = 2_000;

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
        .unwrap_or(default)
}

fn ip(a: u8, b: u8, c: u8, d: u8) -> u128 {
    u32::from(std::net::Ipv4Addr::new(a, b, c, d)) as u128
}

/// Flujo determinista: `i` recorre hosts remotos, con el extremo local fijo.
/// Repetible entre corridas y entre máquinas.
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

/// Corre `flows` flujos en tramos de `chunk` sobre un acumulador nuevo.
fn measure(
    name: &str,
    country: Arc<dyn CountryLookup>,
    asn: Arc<dyn AsnLookup>,
    flows: usize,
    chunk: usize,
) {
    let mut accumulator = Accumulator::new(b"bench-key".to_vec(), false, country, asn);
    let mut tramo = 1;
    let mut done = 0;
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

fn main() {
    let flows = env_usize("SC_BENCH_FLOWS", 100_000);
    let chunk = env_usize("SC_BENCH_CHUNK", 20_000).max(1);

    println!(
        "# Benchmark del camino caliente de agregación — sc-aggregate {} ({} / {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    println!(
        "Flujos: {flows} en tramos de {chunk}; {REMOTE_HOSTS} hosts remotos distintos; una sola fuente."
    );
    println!();
    println!("| Escenario | tramo | flujos | ns/flujo | M flujos/s |");
    println!("|---|---:|---:|---:|---:|");

    measure(
        "sin GeoIP",
        Arc::new(NoLookup),
        Arc::new(NoLookup),
        flows,
        chunk,
    );
    if let Some((country, asn)) = geo_lookups() {
        measure("con GeoLite2 país+ASN", country, asn, flows, chunk);
    }
}
