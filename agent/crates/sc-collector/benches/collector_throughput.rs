// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Benchmark de throughput del camino parser + normalizador del colector.
//!
//! Mide datagramas completos contra un [`ProtocolSet`] con la cache de templates
//! ya caliente, que es el estado estacionario de un listener real. No incluye el
//! costo de UDP, tokio ni el canal del aggregator; para eso está el modo `udp`.
//!
//! Uso:
//!
//! ```text
//! cargo bench -p sc-collector --bench collector_throughput
//! cargo bench -p sc-collector --bench collector_throughput -- udp
//! ```
//!
//! Variables opcionales:
//! - `SC_BENCH_RECORDS`: registros por datagrama (default 30, máximo 1000).
//! - `SC_BENCH_ITERS`: datagramas por muestra (default 20 000 en parser, 5 000 en UDP).
//! - `SC_BENCH_SAMPLES`: muestras por protocolo (default 3).

use sc_capture::CaptureChannelPair;
use sc_collector::{Collector, CollectorConfig, CollectorMetrics, ListenerConfig, ProtocolSet};
use std::hint::black_box;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

// Reutiliza los constructores de los tests sin exponerlos en la API pública.
#[path = "../src/fixtures.rs"]
#[allow(dead_code)]
mod fixtures;

use fixtures::{
    ipfix_data_set, ipfix_ipv4_record, ipfix_packet, ipfix_template_set, nf5_packet, v9_data_set,
    v9_ipv4_record, v9_packet, v9_template_set, IpfixField, Nf5Record, Nf9Field,
    IPFIX_FLOW_TEMPLATE_ID, V9_FLOW_TEMPLATE_ID,
};

const NOW_NANOS: i64 = 1_700_000_000_000_000_000;

struct Case {
    name: &'static str,
    records: u64,
    template: Option<Vec<u8>>,
    datagram: Vec<u8>,
}

fn main() {
    let records = env_usize("SC_BENCH_RECORDS", 30).clamp(1, 1_000);
    let samples = env_usize("SC_BENCH_SAMPLES", 3).max(1);
    let mode = std::env::args()
        .skip(1)
        .find(|arg| arg == "parser" || arg == "udp")
        .unwrap_or_else(|| "parser".to_string());

    println!(
        "# Benchmark del colector — {} ({} {} / sc-collector {})",
        mode,
        std::env::consts::OS,
        std::env::consts::ARCH,
        env!("CARGO_PKG_VERSION")
    );
    println!(
        "Registros por datagrama: {records}; muestras: {samples}. \
         Fixtures sintéticos, template caliente, una sola fuente."
    );
    println!();

    match mode.as_str() {
        "parser" => {
            let iters = env_u64("SC_BENCH_ITERS", 20_000).max(1);
            println!("Datagramas por muestra: {iters}");
            println!();
            println!("| Protocolo | Registros/datagrama | Datagramas/s | Flows/s | ns/flow |");
            println!("|---|---:|---:|---:|---:|");
            for case in build_cases(records) {
                run_parser_case(&case, iters, samples);
            }
        }
        "udp" => {
            let iters = env_u64("SC_BENCH_ITERS", 5_000).max(1);
            println!("Datagramas por muestra: {iters}");
            println!();
            println!("| Protocolo | Registros/datagrama | Datagramas/s | Flows entregados/s | Drops | ns/flow |");
            println!("|---|---:|---:|---:|---:|---:|");
            for case in build_cases(records) {
                run_udp_case(&case, iters, samples);
            }
        }
        other => {
            eprintln!("modo desconocido: {other}; usar 'parser' o 'udp'");
            std::process::exit(2);
        }
    }
}

fn build_cases(records: usize) -> Vec<Case> {
    let mut cases = Vec::with_capacity(3);

    let nf5_records = vec![Nf5Record::default(); records];
    cases.push(Case {
        name: "NetFlow v5",
        records: records as u64,
        template: None,
        datagram: nf5_packet(&nf5_records, 1_700_000_000),
    });

    let v9_template = v9_template_set(&[(
        V9_FLOW_TEMPLATE_ID,
        vec![
            Nf9Field::new(8, 4),
            Nf9Field::new(12, 4),
            Nf9Field::new(7, 2),
            Nf9Field::new(11, 2),
            Nf9Field::new(4, 1),
            Nf9Field::new(1, 8),
            Nf9Field::new(2, 8),
            Nf9Field::new(22, 4),
        ],
    )]);
    let mut v9_body = Vec::with_capacity(records * 33);
    for _ in 0..records {
        v9_body.extend_from_slice(&v9_ipv4_record(9_500));
    }
    cases.push(Case {
        name: "NetFlow v9",
        records: records as u64,
        template: Some(v9_packet(&[v9_template], 1_700_000_000, 10_000)),
        datagram: v9_packet(
            &[v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_body)],
            1_700_000_000,
            10_000,
        ),
    });

    let ipfix_template = ipfix_template_set(&[(
        IPFIX_FLOW_TEMPLATE_ID,
        vec![
            IpfixField::standard(8, 4),
            IpfixField::standard(12, 4),
            IpfixField::standard(7, 2),
            IpfixField::standard(11, 2),
            IpfixField::standard(4, 1),
            IpfixField::standard(1, 8),
            IpfixField::standard(2, 8),
            IpfixField::standard(152, 8),
        ],
    )]);
    let mut ipfix_body = Vec::with_capacity(records * 37);
    for _ in 0..records {
        ipfix_body.extend_from_slice(&ipfix_ipv4_record(1_699_999_999_500));
    }
    cases.push(Case {
        name: "IPFIX",
        records: records as u64,
        template: Some(ipfix_packet(&[ipfix_template], 1_700_000_000)),
        datagram: ipfix_packet(
            &[ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &ipfix_body)],
            1_700_000_000,
        ),
    });

    cases
}

fn run_parser_case(case: &Case, iters: u64, samples: usize) {
    let source: SocketAddr = "192.168.1.1:2055".parse().expect("dirección válida");
    let mut protocols = ProtocolSet::new();
    prime_templates(&mut protocols, source, case);

    let warmup = (iters / 10).max(1);
    for _ in 0..warmup {
        parse_once(&mut protocols, source, case);
    }

    let mut flows_per_sec = Vec::with_capacity(samples);
    for _ in 0..samples {
        let started = Instant::now();
        for _ in 0..iters {
            parse_once(&mut protocols, source, case);
        }
        let elapsed = started.elapsed().as_secs_f64();
        flows_per_sec.push((iters as f64 * case.records as f64) / elapsed);
    }
    flows_per_sec.sort_by(f64::total_cmp);
    let median = flows_per_sec[flows_per_sec.len() / 2];
    let datagrams_per_sec = median / case.records as f64;
    let ns_per_flow = 1_000_000_000.0 / median;

    println!(
        "| {} | {} | {:.0} | {:.0} | {:.1} |",
        case.name, case.records, datagrams_per_sec, median, ns_per_flow
    );
}

fn prime_templates(protocols: &mut ProtocolSet, source: SocketAddr, case: &Case) {
    if let Some(template) = &case.template {
        let flows = protocols
            .parse(source, template, NOW_NANOS)
            .expect("template de benchmark válido");
        assert!(flows.is_empty(), "un template no debe producir flujos");
    }
    let flows = protocols
        .parse(source, &case.datagram, NOW_NANOS)
        .expect("datagrama de benchmark válido");
    assert_eq!(
        flows.len() as u64,
        case.records,
        "el datagrama debe producir todos los registros"
    );
    black_box(flows);
}

fn parse_once(protocols: &mut ProtocolSet, source: SocketAddr, case: &Case) {
    let flows = protocols
        .parse(source, &case.datagram, NOW_NANOS)
        .expect("datagrama de benchmark válido");
    black_box(flows);
}

fn run_udp_case(case: &Case, iters: u64, samples: usize) {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime de tokio");

    let mut delivered_rates = Vec::with_capacity(samples);
    let mut drop_counts = Vec::with_capacity(samples);

    for run in 0..=samples {
        let (pair, addr, metrics, handle) = runtime.block_on(start_collector());
        let sender = runtime
            .block_on(tokio::net::UdpSocket::bind("127.0.0.1:0"))
            .expect("socket emisor");

        if let Some(template) = &case.template {
            runtime.block_on(async {
                sender
                    .send_to(template, addr)
                    .await
                    .expect("enviar template");
                tokio::time::sleep(Duration::from_millis(20)).await;
            });
        }

        let expected = iters * case.records;
        let received = Arc::new(AtomicU64::new(0));
        let receiver = received.clone();
        let mut rx = pair.channel.rx;
        let drain = runtime.spawn(async move {
            while let Some(_flow) = rx.recv().await {
                let total = receiver.fetch_add(1, Ordering::Relaxed) + 1;
                if total >= expected {
                    return total;
                }
            }
            receiver.load(Ordering::Relaxed)
        });

        if run == 0 {
            eprintln!(
                "  # {}: calentando {} datagramas antes de medir",
                case.name,
                (iters / 10).max(1)
            );
            runtime.block_on(async {
                for _ in 0..(iters / 10).max(1) {
                    sender
                        .send_to(&case.datagram, addr)
                        .await
                        .expect("enviar warmup");
                }
            });
            // El warmup no forma parte de la muestra; se descarta el receptor y
            // se arranca un colector nuevo para no mezclar contadores.
            drain.abort();
            runtime.block_on(handle.shutdown());
            continue;
        }

        let started = Instant::now();
        runtime.block_on(async {
            for _ in 0..iters {
                sender
                    .send_to(&case.datagram, addr)
                    .await
                    .expect("enviar datagrama");
            }
            let _ = tokio::time::timeout(Duration::from_secs(30), drain).await;
        });
        let elapsed = started.elapsed().as_secs_f64();

        let delivered = received.load(Ordering::Relaxed);
        if delivered != expected {
            eprintln!(
                "  # {}: entregados {delivered} de {expected}; la tasa es una cota inferior",
                case.name
            );
        }
        let drops = metrics.snapshot().packets_dropped;
        delivered_rates.push(delivered as f64 / elapsed);
        drop_counts.push(drops);
        runtime.block_on(handle.shutdown());
    }

    delivered_rates.sort_by(f64::total_cmp);
    let median = delivered_rates[delivered_rates.len() / 2];
    let drops = drop_counts.iter().copied().max().unwrap_or(0);
    let ns_per_flow = if median > 0.0 {
        1_000_000_000.0 / median
    } else {
        f64::INFINITY
    };
    let datagrams_per_sec = if case.records > 0 {
        median / case.records as f64
    } else {
        0.0
    };

    println!(
        "| {} | {} | {:.0} | {:.0} | {} | {:.1} |",
        case.name, case.records, datagrams_per_sec, median, drops, ns_per_flow
    );
}

async fn start_collector() -> (
    CaptureChannelPair,
    SocketAddr,
    Arc<CollectorMetrics>,
    sc_collector::CollectorHandle,
) {
    let config = CollectorConfig {
        bind_addr: "127.0.0.1".parse().expect("bind loopback"),
        listeners: vec![ListenerConfig::new(0)],
        template_cache_capacity: 10_000,
        template_cache_ttl_secs: 3_600,
    };
    let pair = CaptureChannelPair::new();
    let metrics = CollectorMetrics::new();
    let collector = Collector::new(config, pair.producer.clone(), metrics.clone());
    let handle = collector.start().await.expect("colector en loopback");
    let addr = handle.local_addrs()[0];
    (pair, addr, metrics, handle)
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}
