// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::channel::CaptureChannel;
#[cfg(feature = "live")]
use crate::channel::CaptureChannelPair;
use crate::flow::LocalIpSet;
use crate::CaptureError;

/// Captura en vivo sobre una interfaz (requiere compilar con `--features live`).
///
/// La interfaz se abre en el hilo llamante para poder devolver el error de
/// configuración (nombre inexistente, permisos, Npcap ausente) antes de arrancar
/// el hilo de lectura; el hilo solo bombea paquetes al canal y termina cuando el
/// consumidor cierra el canal.
#[cfg(feature = "live")]
pub fn run_live(iface: &str, local: LocalIpSet) -> Result<CaptureChannel, CaptureError> {
    use crate::parse_packet;
    use std::sync::Arc;
    use std::thread;
    use tokio::sync::mpsc::error::TrySendError;

    let pair = CaptureChannelPair::new();
    let rx = pair.channel.rx;
    let drops = pair.channel.drops.clone();
    let sent = pair.channel.sent.clone();
    let producer = pair.producer;

    // Acepta nombre de dispositivo o su descripción ("Ethernet", "Wi-Fi"…).
    let device = pcap::Device::list()
        .map_err(|e| CaptureError::OpenFailure(e.to_string()))?
        .into_iter()
        .find(|d| d.name == iface || d.desc.as_deref() == Some(iface))
        .ok_or(CaptureError::InterfaceNotFound)?;

    let mut capture = pcap::Capture::from_device(device)
        .map_err(|e| CaptureError::OpenFailure(e.to_string()))?
        .promisc(true)
        .snaplen(65_535)
        .buffer_size(64 * 1024 * 1024)
        .immediate_mode(true)
        // Timeout del read: es lo que permite reaccionar al cierre del canal.
        .timeout(1_000)
        .open()
        .map_err(|e| CaptureError::OpenFailure(e.to_string()))?;

    // El parser solo entiende IPv4/IPv6; filtrar en el kernel ahorra ring y CPU.
    capture
        .filter("ip or ip6", true)
        .map_err(|e| CaptureError::OpenFailure(e.to_string()))?;

    thread::spawn(move || {
        let local = Arc::new(local);
        loop {
            match capture.next_packet() {
                Ok(packet) => {
                    let ts = timestamp_ns(
                        packet.header.ts.tv_sec as i64,
                        packet.header.ts.tv_usec as i64,
                    );
                    match parse_packet(&local, packet.data, ts) {
                        Ok(Some(update)) => {
                            match producer.try_push(update) {
                                Ok(()) => {}
                                // Contados como drop dentro del canal.
                                Err(TrySendError::Full(_)) => {}
                                Err(TrySendError::Closed(_)) => break,
                            }
                        }
                        Ok(None) => {}
                        // El parse error lo cuenta el consumidor vía health.
                        Err(_) => {}
                    }
                }
                // Sin paquetes en la ventana del timeout: normal, seguimos.
                Err(pcap::Error::TimeoutExpired) => {}
                Err(error) => {
                    tracing::error!(%error, "captura live: error de lectura");
                    break;
                }
            }
        }
    });

    Ok(CaptureChannel { rx, drops, sent })
}

/// Sin la feature `live` el daemon sigue compilando, pero no captura.
#[cfg(not(feature = "live"))]
pub fn run_live(_iface: &str, _local: LocalIpSet) -> Result<CaptureChannel, CaptureError> {
    Err(CaptureError::Runtime(
        "captura live no compilada: recompilar con --features live".to_string(),
    ))
}

/// Interfaces disponibles para `--interface` (nombre y descripción).
#[cfg(feature = "live")]
pub fn list_interfaces() -> Result<Vec<String>, CaptureError> {
    let devices = pcap::Device::list().map_err(|e| CaptureError::OpenFailure(e.to_string()))?;
    Ok(devices
        .into_iter()
        .map(|d| match d.desc {
            Some(desc) => format!("{} ({})", d.name, desc),
            None => d.name,
        })
        .collect())
}

#[cfg(not(feature = "live"))]
pub fn list_interfaces() -> Result<Vec<String>, CaptureError> {
    Err(CaptureError::Runtime(
        "captura live no compilada: recompilar con --features live".to_string(),
    ))
}

#[cfg(feature = "live")]
fn timestamp_ns(secs: i64, micros: i64) -> i64 {
    secs * 1_000_000_000 + micros * 1_000
}

#[cfg(all(test, feature = "live"))]
mod tests {
    use super::*;

    #[test]
    fn interfaz_inexistente_es_error_de_interfaz() {
        // No toca hardware: la búsqueda falla antes de abrir la captura.
        match run_live("interfaz-que-no-existe-12345", LocalIpSet::default()) {
            Ok(_) => panic!("no debería abrir una interfaz inexistente"),
            Err(error) => assert!(matches!(
                error,
                CaptureError::InterfaceNotFound | CaptureError::OpenFailure(_)
            )),
        }
    }

    #[test]
    fn timestamp_usa_nanosegundos() {
        assert_eq!(timestamp_ns(2, 500_000), 2_500_000_000);
    }
}
