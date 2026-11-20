//! Mide el costo por paquete de `run_live_with_updates()`.
//!
//! Ejecutar desde `agent/`:
//! `cargo run --release -p sc-capture --example lock_bench`
//!
//! El escritor simula el monitor de IPs cada 5 ms (1000× más frecuente que el
//! tick real de 5 s) para medir el peor caso del `RwLock` histórico. La ruta
//! final no usa lock: el hilo de captura solo consulta una bandera atómica y
//! drena el canal cuando el monitor avisa un cambio.
//!
//! Correr 3–5 veces y usar la mediana: el ratio depende de la frecuencia de CPU.

use sc_capture::{parse_packet, LocalIpSet};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

const OPS: usize = 10_000_000;
const WRITER_TICK: Duration = Duration::from_millis(5);

fn ns_per_op(elapsed: Duration) -> f64 {
    elapsed.as_nanos() as f64 / OPS as f64
}

fn v4(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(a, b, c, d))
}

/// Ethernet + IPv4 + TCP mínimo y válido para medir el parseo real.
fn tcp_packet() -> Vec<u8> {
    let mut packet = vec![0u8; 14];
    packet[12] = 0x08;
    packet[13] = 0x00;

    let total = 20 + 20;
    packet.extend_from_slice(&[0x45, 0]);
    packet.extend_from_slice(&(total as u16).to_be_bytes());
    packet.extend_from_slice(&[0, 1]);
    packet.extend_from_slice(&0x4000u16.to_be_bytes());
    packet.extend_from_slice(&[64, 6, 0, 0]);
    packet.extend_from_slice(&[192, 168, 1, 40]);
    packet.extend_from_slice(&[8, 8, 8, 8]);

    packet.extend_from_slice(&12345u16.to_be_bytes());
    packet.extend_from_slice(&443u16.to_be_bytes());
    packet.extend_from_slice(&[0; 8]);
    packet.extend_from_slice(&[0x50, 0x10]);
    packet.extend_from_slice(&[0; 6]);
    packet
}

fn main() {
    let ips = LocalIpSet::from_config(&[
        v4(192, 168, 1, 40),
        v4(192, 168, 1, 1),
        v4(10, 0, 0, 5),
        IpAddr::V6(Ipv6Addr::new(0xfe80, 0, 0, 0, 1, 2, 3, 4)),
    ]);
    let target = u32::from(Ipv4Addr::new(192, 168, 1, 40)) as u128;
    let shared = Arc::new(RwLock::new(ips));

    // Baseline: HashSet local, sin lock.
    let local = shared.read().unwrap().clone();
    let started = Instant::now();
    let mut hits = 0usize;
    for _ in 0..OPS {
        if local.contains(target) {
            hits += 1;
        }
    }
    let baseline = ns_per_op(started.elapsed());

    // Costo real de Eth+IPv4+TCP con el parser, sin lock. Es la referencia
    // para el criterio "< 10 % del parseo".
    let packet = tcp_packet();
    let started = Instant::now();
    for _ in 0..OPS {
        if let Ok(Some(_)) = parse_packet(&local, &packet, 0) {
            hits += 1;
        }
    }
    let parse = ns_per_op(started.elapsed());

    // RwLock read sin escritor (diseño anterior).
    let started = Instant::now();
    for _ in 0..OPS {
        let guard = shared.read().unwrap();
        if guard.contains(target) {
            hits += 1;
        }
    }
    let uncontended = ns_per_op(started.elapsed());

    // RwLock read con un escritor cada 5 ms. `stop` evita esperar al terminar.
    let stop = Arc::new(AtomicBool::new(false));
    let writer_shared = Arc::clone(&shared);
    let writer_stop = Arc::clone(&stop);
    let writer = thread::spawn(move || {
        while !writer_stop.load(Ordering::Relaxed) {
            thread::sleep(WRITER_TICK);
            let mut guard = writer_shared.write().unwrap();
            *guard = guard.clone();
        }
    });

    thread::sleep(WRITER_TICK + Duration::from_millis(1));
    let started = Instant::now();
    for _ in 0..OPS {
        let guard = shared.read().unwrap();
        if guard.contains(target) {
            hits += 1;
        }
    }
    let contended = ns_per_op(started.elapsed());

    stop.store(true, Ordering::Relaxed);
    writer.join().expect("escritor del benchmark");

    // Ruta final: el hilo de captura es dueño del conjunto y solo toca el
    // canal cuando el monitor activa la bandera. El caso normal es un swap.
    let (ip_tx, updates) = mpsc::channel::<LocalIpSet>();
    let dirty = Arc::new(AtomicBool::new(false));
    let mut channel_local = local.clone();
    let started = Instant::now();
    for _ in 0..OPS {
        if dirty.swap(false, Ordering::Acquire) {
            while let Ok(updated) = updates.try_recv() {
                channel_local = updated;
            }
        }
        if channel_local.contains(target) {
            hits += 1;
        }
    }
    let channel = ns_per_op(started.elapsed());
    drop(ip_tx);

    println!("baseline sin lock:     {baseline:>7.2} ns/op");
    println!("RwLock uncontended:    {uncontended:>7.2} ns/op");
    println!("RwLock contended(5ms): {contended:>7.2} ns/op");
    println!("canal try_recv:        {channel:>7.2} ns/op");
    println!(
        "overhead RwLock:       {:>7.2} ns/op",
        uncontended - baseline
    );
    println!("overhead contended:    {:>7.2} ns/op", contended - baseline);
    println!("overhead canal:        {:>7.2} ns/op", channel - baseline);
    println!("parse Eth+IPv4+TCP:    {parse:>7.2} ns/op");
    println!(
        "overhead/parse RwLock: {:>7.2} %",
        (uncontended - baseline) / parse * 100.0
    );
    println!(
        "overhead/parse canal:  {:>7.2} %",
        (channel - baseline) / parse * 100.0
    );
    println!("hits={hits} (evita optimización)");
}
