// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::channel::{CaptureChannel, CaptureChannelPair};
use crate::flow::LocalIpSet;
use crate::parse_packet;
use pcap_file::pcap::PcapReader;
use std::fs::File;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("open failure: {0}")]
    OpenFailure(String),
    #[error("interface not found")]
    InterfaceNotFound,
    #[error("runtime: {0}")]
    Runtime(String),
}

#[derive(Debug, Clone)]
pub struct CaptureStats {
    pub seen: u64,
    pub parsed: u64,
    pub parse_errors: u64,
    pub dropped: u64,
}

pub fn run_offline(path: &Path, local: LocalIpSet) -> Result<CaptureChannel, CaptureError> {
    let pair = CaptureChannelPair::new();
    let rx = pair.channel.rx;
    let drops = pair.channel.drops.clone();
    let sent = pair.channel.sent.clone();
    let packets_seen = pair.channel.packets_seen.clone();
    let parse_errors = pair.channel.parse_errors.clone();
    let producer = pair.producer;

    // Copias para el hilo lector: el canal devuelto conserva las originales.
    let thread_packets_seen = packets_seen.clone();
    let thread_parse_errors = parse_errors.clone();

    let path = path.to_path_buf();
    thread::spawn(move || {
        let file = match File::open(&path) {
            Ok(f) => f,
            Err(e) => {
                tracing::error!("failed to open pcap: {}", e);
                return;
            }
        };
        let mut reader = match PcapReader::new(file) {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("failed to read pcap: {}", e);
                return;
            }
        };
        let local = Arc::new(local);
        loop {
            match reader.next_packet() {
                Some(Ok(pkt)) => {
                    thread_packets_seen.fetch_add(1, Ordering::Relaxed);
                    let ts = pkt.timestamp.as_secs() as i64 * 1_000_000_000
                        + pkt.timestamp.as_nanos() as i64;
                    let data = &pkt.data;
                    match parse_packet(&local, data, ts) {
                        Ok(Some(update)) => {
                            let _ = producer.try_push(update);
                        }
                        Ok(None) => {
                            // ARP u otros - ok
                        }
                        Err(_) => {
                            thread_parse_errors.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
                Some(Err(e)) => {
                    tracing::error!("pcap read error: {}", e);
                    break;
                }
                None => break,
            }
        }
        // channel closes when producer drops
    });

    Ok(CaptureChannel {
        rx,
        drops,
        sent,
        packets_seen,
        parse_errors,
    })
}
#[cfg(test)]
mod tests {
    use super::*;

    /// Sin fichero legible el canal debe cerrarse sin emitir actualizaciones
    /// (el error se registra en el hilo lector, no se propaga al consumidor).
    #[test]
    fn offline_missing_pcap_cierra_el_canal_sin_actualizaciones() {
        let channel = run_offline(
            Path::new("no-existe-esta-captura.pcap"),
            LocalIpSet::default(),
        )
        .expect("run_offline siempre debe crear el canal");

        let mut rx = channel.rx;
        assert!(
            rx.try_recv().is_err(),
            "no debe haber paquetes de un pcap inexistente"
        );
    }
}
