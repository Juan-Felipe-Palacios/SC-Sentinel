// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Exportador sintético NetFlow v5/v9 + IPFIX para validar M4 sin hardware.
//!
//! Dos modos:
//!
//! - **envío**: construye datagramas con marcas de tiempo actuales y los manda
//!   por UDP al target, reenviando el template cada `--template-every`
//!   datagramas (equivale a `v9-template-refresh` de RouterOS). Los registros
//!   rotan entre hosts de documentación (TEST-NET) para que el dashboard
//!   muestre varios hosts.
//! - **`--dump <dir>`**: escribe los datagramas de muestra en
//!   `docs/testing/fixtures/` (IPs TEST-NET, timestamps fijos) y termina.
//!
//! Uso:
//!
//! ```text
//! # NetFlow v9 → 2055 durante 90 s, 5 flows cada 200 ms
//! cargo run -p sc-collector --example synthetic_exporter -- \
//!   --protocol v9 --records 5 --interval-ms 200 --duration-secs 90
//!
//! # IPFIX → 4739 (target por defecto de ipfix)
//! cargo run -p sc-collector --example synthetic_exporter -- \
//!   --protocol ipfix --records 5 --interval-ms 200 --duration-secs 90
//!
//! # Solo datos, sin template (para observar TemplateNotFound tras un reinicio)
//! cargo run -p sc-collector --example synthetic_exporter -- \
//!   --protocol v9 --skip-template --count 5
//!
//! # Regenerar los fixtures publicados
//! cargo run -p sc-collector --example synthetic_exporter -- \
//!   --dump ../docs/testing/fixtures
//! ```

// Reutiliza los constructores de los tests sin exponerlos en la API pública.
#[path = "../src/fixtures.rs"]
#[allow(dead_code)]
mod fixtures;

use fixtures::{
    ipfix_data_set, ipfix_packet, ipfix_template_set, nf5_packet, v9_data_set, v9_packet,
    v9_template_set, IpfixField, Nf5Record, Nf9Field, IPFIX_FLOW_TEMPLATE_ID, V9_FLOW_TEMPLATE_ID,
};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// sysUptime fijo de los fixtures (1 h en milisegundos).
const DUMP_UPTIME: u32 = 3_600_000;
/// unix_secs fijo de los fixtures (2023-11-14T22:13:20Z): determinismo (regla 3
/// de `docs/testing/fixtures.md`).
const DUMP_UNIX_SECS: u32 = 1_700_000_000;
/// flowStartMilliseconds fijo de los fixtures.
const DUMP_MILLIS: u64 = 1_700_000_000_500;
/// IP del "router" en el pcap de muestra (TEST-NET-1).
const ROUTER_IP: [u8; 4] = [192, 0, 2, 1];
/// IP del agente en el pcap de muestra (TEST-NET-1).
const AGENT_IP: [u8; 4] = [192, 0, 2, 10];
/// Puerto efímero de origen en el pcap de muestra.
const SAMPLE_SPORT: u16 = 49_152;

/// Clientes sintéticos (TEST-NET-2): son los hosts que verá el dashboard,
/// porque `Direction::In` atribuye el host a `src_ip` (ADR-0014 §5).
const CLIENTS: [[u8; 4]; 3] = [[198, 51, 100, 11], [198, 51, 100, 12], [198, 51, 100, 13]];
/// Servidores sintéticos (TEST-NET-3): destino de los flujos.
const SERVERS: [([u8; 4], u16, u8); 3] = [
    ([203, 0, 113, 20], 443, 6),
    ([203, 0, 113, 53], 53, 17),
    ([203, 0, 113, 80], 80, 6),
];

#[derive(Clone, Copy)]
struct Sample {
    src: [u8; 4],
    dst: [u8; 4],
    src_port: u16,
    dst_port: u16,
    protocol: u8,
    bytes: u64,
    packets: u64,
}

/// Rotación determinista de flujos de muestra para el datagrama `index`.
fn sample(index: usize) -> Sample {
    let src = CLIENTS[index % CLIENTS.len()];
    let (dst, dst_port, protocol) = SERVERS[(index / CLIENTS.len()) % SERVERS.len()];
    Sample {
        src,
        dst,
        src_port: SAMPLE_SPORT + ((index * 7) % 16_384) as u16,
        dst_port,
        protocol,
        bytes: 900 + (index as u64 % 5) * 120,
        packets: 6 + (index as u64 % 4),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Protocol {
    V5,
    V9,
    Ipfix,
}

impl Protocol {
    fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "v5" | "netflow-v5" => Some(Self::V5),
            "v9" | "netflow-v9" => Some(Self::V9),
            "ipfix" => Some(Self::Ipfix),
            _ => None,
        }
    }

    fn default_target(self) -> &'static str {
        match self {
            Self::V5 | Self::V9 => "127.0.0.1:2055",
            Self::Ipfix => "127.0.0.1:4739",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::V5 => "NetFlow v5",
            Self::V9 => "NetFlow v9",
            Self::Ipfix => "IPFIX",
        }
    }
}

struct Args {
    target: String,
    protocol: Protocol,
    records: usize,
    count: u64,
    interval_ms: u64,
    template_every: u64,
    duration_secs: Option<u64>,
    skip_template: bool,
    dump: Option<PathBuf>,
}

fn print_usage() {
    println!(
        "Uso: synthetic_exporter [--protocol v5|v9|ipfix] [--target IP:PORT] \\
         [--records N] [--count N] [--interval-ms N] [--template-every N] \\
         [--duration-secs N] [--skip-template] [--dump DIR] [--help]"
    );
    println!();
    println!("  --protocol        v5 | v9 | ipfix (default v9)");
    println!("  --target          por defecto 127.0.0.1:2055 (v5/v9) o :4739 (ipfix)");
    println!("  --records         registros por datagrama (default 30, máx 1000)");
    println!("  --count           datagramas a enviar (default 120)");
    println!("  --interval-ms     pausa entre datagramas (default 250)");
    println!("  --template-every  reenviar template cada N datagramas (default 10)");
    println!("  --duration-secs   duración total; pisa --count");
    println!("  --skip-template   no enviar templates (observar TemplateNotFound)");
    println!("  --dump DIR        escribir fixtures de muestra y salir");
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        target: String::new(),
        protocol: Protocol::V9,
        records: 30,
        count: 120,
        interval_ms: 250,
        template_every: 10,
        duration_secs: None,
        skip_template: false,
        dump: None,
    };

    let mut iter = std::env::args().skip(1);
    while let Some(flag) = iter.next() {
        let mut value = || {
            iter.next()
                .ok_or_else(|| format!("falta el valor de {flag}"))
        };
        match flag.as_str() {
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            "--target" => args.target = value()?,
            "--protocol" => {
                let raw = value()?;
                args.protocol = Protocol::parse(&raw)
                    .ok_or_else(|| format!("protocolo desconocido: {raw} (usar v5, v9 o ipfix)"))?;
            }
            "--records" => {
                args.records = value()?
                    .parse::<usize>()
                    .map_err(|_| "--records debe ser un número".to_string())?
                    .clamp(1, 1_000);
            }
            "--count" => {
                args.count = value()?
                    .parse::<u64>()
                    .map_err(|_| "--count debe ser un número".to_string())?;
            }
            "--interval-ms" => {
                args.interval_ms = value()?
                    .parse::<u64>()
                    .map_err(|_| "--interval-ms debe ser un número".to_string())?;
            }
            "--template-every" => {
                args.template_every = value()?
                    .parse::<u64>()
                    .map_err(|_| "--template-every debe ser un número".to_string())?;
            }
            "--duration-secs" => {
                args.duration_secs = Some(
                    value()?
                        .parse::<u64>()
                        .map_err(|_| "--duration-secs debe ser un número".to_string())?,
                );
            }
            "--skip-template" => args.skip_template = true,
            "--dump" => args.dump = Some(PathBuf::from(value()?)),
            other => return Err(format!("flag desconocido: {other} (usar --help)")),
        }
    }

    if args.target.is_empty() {
        args.target = args.protocol.default_target().to_string();
    }
    Ok(args)
}

fn now_unix() -> (u32, u64) {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("reloj anterior a la época Unix")
        .as_secs();
    (secs as u32, secs * 1_000)
}

/// Campos del template IPv4: mismos 8 campos que usan los tests del crate.
fn v9_fields() -> Vec<Nf9Field> {
    vec![
        Nf9Field::new(8, 4),  // IPV4_SRC_ADDR
        Nf9Field::new(12, 4), // IPV4_DST_ADDR
        Nf9Field::new(7, 2),  // SRC_PORT
        Nf9Field::new(11, 2), // DST_PORT
        Nf9Field::new(4, 1),  // PROTOCOL
        Nf9Field::new(1, 8),  // IN_BYTES
        Nf9Field::new(2, 8),  // IN_PKTS
        Nf9Field::new(22, 4), // FIRST_SWITCHED
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
        IpfixField::standard(152, 8), // flowStartMilliseconds
    ]
}

fn v9_record(sample: &Sample, first_switched: u32) -> Vec<u8> {
    let mut record = Vec::with_capacity(33);
    record.extend_from_slice(&sample.src);
    record.extend_from_slice(&sample.dst);
    record.extend_from_slice(&sample.src_port.to_be_bytes());
    record.extend_from_slice(&sample.dst_port.to_be_bytes());
    record.push(sample.protocol);
    record.extend_from_slice(&sample.bytes.to_be_bytes());
    record.extend_from_slice(&sample.packets.to_be_bytes());
    record.extend_from_slice(&first_switched.to_be_bytes());
    record
}

fn ipfix_record(sample: &Sample, start_millis: u64) -> Vec<u8> {
    let mut record = Vec::with_capacity(37);
    record.extend_from_slice(&sample.src);
    record.extend_from_slice(&sample.dst);
    record.extend_from_slice(&sample.src_port.to_be_bytes());
    record.extend_from_slice(&sample.dst_port.to_be_bytes());
    record.push(sample.protocol);
    record.extend_from_slice(&sample.bytes.to_be_bytes());
    record.extend_from_slice(&sample.packets.to_be_bytes());
    record.extend_from_slice(&start_millis.to_be_bytes());
    record
}

fn nf5_records(samples: &[Sample]) -> Vec<Nf5Record> {
    samples
        .iter()
        .map(|sample| Nf5Record {
            src: sample.src,
            dst: sample.dst,
            src_port: sample.src_port,
            dst_port: sample.dst_port,
            protocol: sample.protocol,
            bytes: sample.bytes as u32,
            packets: sample.packets as u32,
        })
        .collect()
}

/// Datagrama de datos para el protocolo elegido (`first` = índice del datagrama).
fn data_datagram(protocol: Protocol, samples: &[Sample], unix_secs: u32, millis: u64) -> Vec<u8> {
    match protocol {
        Protocol::V5 => nf5_packet(&nf5_records(samples), unix_secs),
        Protocol::V9 => {
            let mut body = Vec::with_capacity(samples.len() * 33);
            for sample in samples {
                // first_switched = sysUptime → la marca de tiempo del flujo es
                // la del export (cae en la ventana de agregación actual).
                body.extend_from_slice(&v9_record(sample, DUMP_UPTIME));
            }
            v9_packet(
                &[v9_data_set(V9_FLOW_TEMPLATE_ID, &body)],
                unix_secs,
                DUMP_UPTIME,
            )
        }
        Protocol::Ipfix => {
            let mut body = Vec::with_capacity(samples.len() * 37);
            for sample in samples {
                body.extend_from_slice(&ipfix_record(sample, millis));
            }
            ipfix_packet(&[ipfix_data_set(IPFIX_FLOW_TEMPLATE_ID, &body)], unix_secs)
        }
    }
}

fn template_datagram(protocol: Protocol, unix_secs: u32) -> Option<Vec<u8>> {
    match protocol {
        Protocol::V5 => None,
        Protocol::V9 => Some(v9_packet(
            &[v9_template_set(&[(V9_FLOW_TEMPLATE_ID, v9_fields())])],
            unix_secs,
            DUMP_UPTIME,
        )),
        Protocol::Ipfix => Some(ipfix_packet(
            &[ipfix_template_set(&[(
                IPFIX_FLOW_TEMPLATE_ID,
                ipfix_fields(),
            )])],
            unix_secs,
        )),
    }
}

// ---------------------------------------------------------------------------
// Modo --dump
// ---------------------------------------------------------------------------

fn write_file(dir: &std::path::Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    let path = dir.join(name);
    std::fs::write(&path, bytes).map_err(|error| format!("no pude escribir {path:?}: {error}"))?;
    println!("  {} ({} bytes)", path.display(), bytes.len());
    Ok(())
}

fn run_dump(dir: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("no pude crear {dir:?}: {error}"))?;

    let samples: Vec<Sample> = (0..3).map(sample).collect();
    let v5 = data_datagram(Protocol::V5, &samples, DUMP_UNIX_SECS, DUMP_MILLIS);
    let v9_template = template_datagram(Protocol::V9, DUMP_UNIX_SECS).expect("template v9");
    let v9_data = data_datagram(Protocol::V9, &samples, DUMP_UNIX_SECS, DUMP_MILLIS);
    let ipfix_template =
        template_datagram(Protocol::Ipfix, DUMP_UNIX_SECS).expect("template ipfix");
    let ipfix_data = data_datagram(Protocol::Ipfix, &samples, DUMP_UNIX_SECS, DUMP_MILLIS);

    println!("Escribiendo fixtures en {}:", dir.display());
    write_file(dir, "netflow-v5.bin", &v5)?;
    write_file(dir, "netflow-v9-template.bin", &v9_template)?;
    write_file(dir, "netflow-v9-data.bin", &v9_data)?;
    write_file(dir, "ipfix-template.bin", &ipfix_template)?;
    write_file(dir, "ipfix-data.bin", &ipfix_data)?;

    // El pcap envuelve los mismos datagramas en tramas Ethernet/IPv4/UDP:
    // router 192.0.2.1 → agente 192.0.2.10 (puertos 2055 y 4739).
    let frames: Vec<(u16, &Vec<u8>)> = vec![
        (2055, &v5),
        (2055, &v9_template),
        (2055, &v9_data),
        (4739, &ipfix_template),
        (4739, &ipfix_data),
    ];
    let pcap = build_pcap(&frames);
    write_file(dir, "exporter-sample.pcap", &pcap)?;
    Ok(())
}

fn ipv4_checksum(header: &[u8]) -> u16 {
    let mut sum = 0u32;
    for chunk in header.chunks(2) {
        let word = u16::from_be_bytes([chunk[0], *chunk.get(1).unwrap_or(&0)]);
        sum += u32::from(word);
    }
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    !sum as u16
}

fn ethernet_frame(dport: u16, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(14 + 20 + 8 + payload.len());

    // Ethernet: MACs locales administradas (02:00:00:…), IPv4.
    frame.extend_from_slice(&[0x02, 0, 0, 0, 0, 1]); // dst = agente
    frame.extend_from_slice(&[0x02, 0, 0, 0, 0, 2]); // src = router
    frame.extend_from_slice(&[0x08, 0x00]);

    let ip_len = (20 + 8 + payload.len()) as u16;
    let mut ip = Vec::with_capacity(20);
    ip.extend_from_slice(&[0x45, 0x00]); // v4, IHL 5, DSCP 0
    ip.extend_from_slice(&ip_len.to_be_bytes());
    ip.extend_from_slice(&[0x00, 0x00]); // id
    ip.extend_from_slice(&[0x00, 0x00]); // flags/fragmentación
    ip.extend_from_slice(&[64, 17]); // TTL, UDP
    ip.extend_from_slice(&[0x00, 0x00]); // checksum (se calcula abajo)
    ip.extend_from_slice(&ROUTER_IP);
    ip.extend_from_slice(&AGENT_IP);
    let checksum = ipv4_checksum(&ip);
    ip[10..12].copy_from_slice(&checksum.to_be_bytes());

    frame.extend_from_slice(&ip);
    frame.extend_from_slice(&SAMPLE_SPORT.to_be_bytes());
    frame.extend_from_slice(&dport.to_be_bytes());
    frame.extend_from_slice(&((8 + payload.len()) as u16).to_be_bytes());
    frame.extend_from_slice(&[0x00, 0x00]); // checksum UDP (opcional en IPv4)
    frame.extend_from_slice(payload);
    frame
}

fn build_pcap(frames: &[(u16, &Vec<u8>)]) -> Vec<u8> {
    let mut pcap = Vec::new();
    // Global header (big-endian, magic a1b2c3d4): v2.4, snaplen 65535, Ethernet.
    pcap.extend_from_slice(&0xa1b2c3d4u32.to_be_bytes());
    pcap.extend_from_slice(&2u16.to_be_bytes());
    pcap.extend_from_slice(&4u16.to_be_bytes());
    pcap.extend_from_slice(&0i32.to_be_bytes()); // thiszone
    pcap.extend_from_slice(&0u32.to_be_bytes()); // sigfigs
    pcap.extend_from_slice(&65_535u32.to_be_bytes());
    pcap.extend_from_slice(&1u32.to_be_bytes()); // linktype Ethernet

    for (index, (dport, payload)) in frames.iter().enumerate() {
        let frame = ethernet_frame(*dport, payload);
        pcap.extend_from_slice(&(DUMP_UNIX_SECS + index as u32).to_be_bytes());
        pcap.extend_from_slice(&0u32.to_be_bytes()); // microsegundos
        pcap.extend_from_slice(&(frame.len() as u32).to_be_bytes());
        pcap.extend_from_slice(&(frame.len() as u32).to_be_bytes());
        pcap.extend_from_slice(&frame);
    }
    pcap
}

// ---------------------------------------------------------------------------
// Modo envío
// ---------------------------------------------------------------------------

fn run_send(args: &Args) -> Result<(), String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| format!("bind UDP: {error}"))?;
    let started = Instant::now();
    let deadline = args
        .duration_secs
        .map(|secs| started + Duration::from_secs(secs));

    println!(
        "Exportador sintético {} → {} ({} registros/datagrama, template cada {}, {})",
        args.protocol.label(),
        args.target,
        args.records,
        args.template_every,
        match deadline {
            Some(_) => format!("hasta {:.0}s", args.duration_secs.unwrap_or_default()),
            None => format!("{} datagramas", args.count),
        }
    );

    let mut sent: u64 = 0;
    let mut flows: u64 = 0;
    loop {
        if let Some(deadline) = deadline {
            if Instant::now() >= deadline {
                break;
            }
        } else if sent >= args.count {
            break;
        }

        let (unix_secs, millis) = now_unix();

        // Template antes del primer datagrama y luego cada template_every.
        if !args.skip_template && sent % args.template_every.max(1) == 0 {
            if let Some(template) = template_datagram(args.protocol, unix_secs) {
                socket
                    .send_to(&template, &args.target)
                    .map_err(|error| format!("enviar template: {error}"))?;
            }
        }

        let samples: Vec<Sample> = (0..args.records)
            .map(|offset| sample((sent as usize) * args.records + offset))
            .collect();
        let datagram = data_datagram(args.protocol, &samples, unix_secs, millis);
        socket
            .send_to(&datagram, &args.target)
            .map_err(|error| format!("enviar datagrama: {error}"))?;

        sent += 1;
        flows += args.records as u64;
        if sent % 50 == 0 {
            println!("  enviados={sent} datagramas (~{flows} flows)");
        }

        std::thread::sleep(Duration::from_millis(args.interval_ms));
    }

    println!(
        "Listo: {sent} datagramas (~{flows} flows) en {:.1}s → {}",
        started.elapsed().as_secs_f64(),
        args.target
    );
    Ok(())
}

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(error) => {
            eprintln!("error: {error}");
            print_usage();
            std::process::exit(2);
        }
    };

    let result = match &args.dump {
        Some(dir) => run_dump(dir),
        None => run_send(&args),
    };
    if let Err(error) = result {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
