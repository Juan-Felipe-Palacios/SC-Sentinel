// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Emisor sintético para demos (`sc-collector-testsend`).
//!
//! Manda NetFlow v5, NetFlow v9 e IPFIX al mismo tiempo a los puertos de una
//! instancia de demo del agente, con tráfico que el dashboard puede mostrar tal
//! cual: hosts con IP pública (para que GeoLite2 resuelva país) y puertos
//! habituales 443/80/53/22.
//!
//! Reutiliza los constructores de `fixtures.rs` (los mismos de los tests) para
//! no duplicar el formato de los datagramas.
//!
//! Uso:
//! ```text
//! cargo run -p sc-collector --bin sc-collector-testsend -- \
//!   --duration-secs 150 --interval-ms 200
//! ```
//!
//! Destinos por defecto: `127.0.0.1:2066` (NetFlow) y `127.0.0.1:4740` (IPFIX).

#[path = "../fixtures.rs"]
#[allow(dead_code)]
mod fixtures;

use fixtures::{
    ipfix_data_set, ipfix_packet, ipfix_template_set, nf5_packet, v9_data_set, v9_packet,
    v9_template_set, IpfixField, Nf5Record, Nf9Field, IPFIX_FLOW_TEMPLATE_ID, V9_FLOW_TEMPLATE_ID,
};
use std::net::UdpSocket;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Hosts con IP pública: GeoLite2 les asigna país, así el panel muestra el mapa.
const CLIENTS: [[u8; 4]; 6] = [
    [8, 8, 8, 8],        // US
    [1, 1, 1, 1],        // AU
    [151, 101, 1, 69],   // US
    [185, 199, 108, 153], // US
    [31, 13, 71, 36],    // IE
    [91, 198, 174, 192], // NL
];

/// Destinos sintéticos por puerto: 443, 80, 53 y 22.
const SERVERS: [([u8; 4], u16, u8); 4] = [
    ([203, 0, 113, 20], 443, 6),
    ([203, 0, 113, 21], 80, 6),
    ([203, 0, 113, 53], 53, 17),
    ([203, 0, 113, 22], 22, 6),
];

/// Palabras clave del flujo `index` (rotación determinista).
struct Flow {
    src: [u8; 4],
    dst: [u8; 4],
    src_port: u16,
    dst_port: u16,
    protocol: u8,
    bytes: u64,
    packets: u64,
}

fn flow(index: usize) -> Flow {
    let src = CLIENTS[index % CLIENTS.len()];
    let (dst, dst_port, protocol) = SERVERS[index % SERVERS.len()];
    Flow {
        src,
        dst,
        src_port: 49_152 + ((index * 131) % 16_384) as u16,
        dst_port,
        protocol,
        // Tamaños plausibles: 1 KB–48 KB por flujo.
        bytes: 1_200 + (index as u64 % 7) * 6_700,
        packets: 8 + (index as u64 % 9) * 3,
    }
}

fn parse_flag(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    args.next()
        .ok_or_else(|| format!("falta el valor de {flag}"))
}

fn main() {
    let mut netflow_target = String::from("127.0.0.1:2066");
    let mut ipfix_target = String::from("127.0.0.1:4740");
    let mut interval_ms = 200u64;
    let mut duration_secs = 150u64;
    let mut records = 12usize;

    let mut args = std::env::args().skip(1);
    while let Some(flag) = args.next() {
        let result = match flag.as_str() {
            "--netflow-target" => parse_flag(&mut args, "--netflow-target")
                .map(|value| netflow_target = value),
            "--ipfix-target" => {
                parse_flag(&mut args, "--ipfix-target").map(|value| ipfix_target = value)
            }
            "--interval-ms" => parse_flag(&mut args, "--interval-ms")
                .and_then(|value| value.parse().map_err(|_| "--interval-ms inválido".to_string()))
                .map(|value: u64| interval_ms = value),
            "--duration-secs" => parse_flag(&mut args, "--duration-secs")
                .and_then(|value| {
                    value
                        .parse()
                        .map_err(|_| "--duration-secs inválido".to_string())
                })
                .map(|value: u64| duration_secs = value),
            "--records" => parse_flag(&mut args, "--records")
                .and_then(|value| value.parse().map_err(|_| "--records inválido".to_string()))
                .map(|value: usize| records = value.clamp(1, 100)),
            "--help" | "-h" => {
                println!(
                    "Uso: sc-collector-testsend [--netflow-target IP:PORT] [--ipfix-target IP:PORT] \
                     [--interval-ms N] [--duration-secs N] [--records N]"
                );
                return;
            }
            other => Err(format!("flag desconocido: {other}")),
        };
        if let Err(error) = result {
            eprintln!("sc-collector-testsend: {error}");
            std::process::exit(2);
        }
    }

    let netflow = UdpSocket::bind("0.0.0.0:0").expect("socket NetFlow");
    let ipfix = UdpSocket::bind("0.0.0.0:0").expect("socket IPFIX");
    println!(
        "enviando v5+v9 → {netflow_target}, IPFIX → {ipfix_target} · {records} flujos cada {interval_ms} ms durante {duration_secs} s"
    );

    let started = Instant::now();
    let mut tick = 0u64;
    let mut sent = 0u64;
    while started.elapsed() < Duration::from_secs(duration_secs) {
        let unix_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as u32;
        let now_millis = i64::from(unix_secs) * 1_000;

        // NetFlow v5: registros de 48 bytes, sin templates.
        let v5_records: Vec<Nf5Record> = (0..records)
            .map(|index| {
                let flow = flow(tick as usize * records + index);
                Nf5Record {
                    src: flow.src,
                    dst: flow.dst,
                    src_port: flow.src_port,
                    dst_port: flow.dst_port,
                    protocol: flow.protocol,
                    bytes: flow.bytes as u32,
                    packets: flow.packets as u32,
                }
            })
            .collect();
        let v5 = nf5_packet(&v5_records, unix_secs);

        // NetFlow v9: template cada 10 datagramas + un set de datos por tick.
        let mut v9_sets = Vec::new();
        if tick % 10 == 0 {
            v9_sets.push(v9_template_set(&[(V9_FLOW_TEMPLATE_ID, v9_fields())]));
        }
        let mut v9_body = Vec::new();
        for index in 0..records {
            write_v9_record(&mut v9_body, &flow(tick as usize * records + index));
        }
        v9_sets.push(v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_body));
        let v9 = v9_packet(&v9_sets, unix_secs, 1_000 + tick as u32 * 200);

        // IPFIX: mismo patrón de template + datos.
        let mut ipfix_sets = Vec::new();
        if tick % 10 == 0 {
            ipfix_sets.push(ipfix_template_set(&[(IPFIX_FLOW_TEMPLATE_ID, ipfix_fields())]));
        }
        let mut ipfix_body = Vec::new();
        for index in 0..records {
            write_ipfix_record(
                &mut ipfix_body,
                &flow(tick as usize * records + index),
                now_millis,
            );
        }
        ipfix_sets.push(ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &ipfix_body));
        let ipfix_packet = ipfix_packet(&ipfix_sets, unix_secs);

        for payload in [v5, v9] {
            if let Err(error) = netflow.send_to(&payload, &netflow_target) {
                eprintln!("sc-collector-testsend: fallo NetFlow: {error}");
            } else {
                sent += 1;
            }
        }
        if let Err(error) = ipfix.send_to(&ipfix_packet, &ipfix_target) {
            eprintln!("sc-collector-testsend: fallo IPFIX: {error}");
        } else {
            sent += 1;
        }

        tick += 1;
        std::thread::sleep(Duration::from_millis(interval_ms));
    }

    println!(
        "terminado: {sent} datagramas en {:.0} s",
        started.elapsed().as_secs_f64()
    );
}

/// Campos del template v9: los mismos 8 que usa el colector en los tests.
fn v9_fields() -> Vec<Nf9Field> {
    vec![
        Nf9Field::new(8, 4),
        Nf9Field::new(12, 4),
        Nf9Field::new(7, 2),
        Nf9Field::new(11, 2),
        Nf9Field::new(4, 1),
        Nf9Field::new(1, 8),
        Nf9Field::new(2, 8),
        Nf9Field::new(22, 4),
    ]
}

fn ipfix_fields() -> Vec<IpfixField> {
    vec![
        IpfixField::standard(8, 4),
        IpfixField::standard(12, 4),
        IpfixField::standard(7, 2),
        IpfixField::standard(11, 2),
        IpfixField::standard(4, 1),
        IpfixField::standard(1, 8),
        IpfixField::standard(2, 8),
        IpfixField::standard(22, 4),
    ]
}

fn write_v9_record(buffer: &mut Vec<u8>, flow: &Flow) {
    buffer.extend_from_slice(&flow.src);
    buffer.extend_from_slice(&flow.dst);
    buffer.extend_from_slice(&flow.src_port.to_be_bytes());
    buffer.extend_from_slice(&flow.dst_port.to_be_bytes());
    buffer.push(flow.protocol);
    buffer.extend_from_slice(&flow.bytes.to_be_bytes());
    buffer.extend_from_slice(&flow.packets.to_be_bytes());
    buffer.extend_from_slice(&0u32.to_be_bytes());
}

fn write_ipfix_record(buffer: &mut Vec<u8>, flow: &Flow, start_millis: i64) {
    buffer.extend_from_slice(&flow.src);
    buffer.extend_from_slice(&flow.dst);
    buffer.extend_from_slice(&flow.src_port.to_be_bytes());
    buffer.extend_from_slice(&flow.dst_port.to_be_bytes());
    buffer.push(flow.protocol);
    buffer.extend_from_slice(&flow.bytes.to_be_bytes());
    buffer.extend_from_slice(&flow.packets.to_be_bytes());
    // El campo 22 está declarado con 4 bytes en el template: escribir 8
    // desalinea todos los registros siguientes (el colector lee basura).
    buffer.extend_from_slice(&(start_millis as u64 as u32).to_be_bytes());
}
