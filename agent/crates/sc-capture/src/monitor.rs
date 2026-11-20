// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Refresco periódico del conjunto de IPs locales.
//!
//! El servicio puede arrancar antes de que DHCP asigne la IPv4 definitiva. Un
//! `LocalIpSet` congelado en ese momento descarta todo el tráfico IPv4 posterior
//! sin generar errores de parser. Este monitor vuelve a resolver la interfaz y
//! avisa al hilo de captura cuando el contenido cambia.
//!
//! Se usa un hilo del sistema, no `tokio::spawn`: `run_live` también se ejecuta
//! desde contextos síncronos y no debe exigir un reactor activo. La captura es
//! la única dueña de su copia del conjunto; no hay lock en la ruta caliente.

use crate::driver::CaptureError;
use crate::flow::LocalIpSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tracing::{info, warn};

/// Monitor cancelable de IPs locales.
///
/// Al dropearse detiene el hilo y espera a que termine. `stop()` es idempotente.
pub struct LocalIpMonitor {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl LocalIpMonitor {
    /// Ordena al monitor terminar y espera su finalización.
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            handle.thread().unpark();
            let _ = handle.join();
        }
    }
}

impl Drop for LocalIpMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Lanza un monitor que resuelve `iface` cada `interval` y avisa cuando el
/// **contenido** cambia.
///
/// `resolve` se inyecta para que los tests no dependan de Npcap. `on_refresh`
/// recibe el conjunto y si cambió; se invoca en cada resolución exitosa para
/// que la telemetría pueda publicar la hora del último refresco.
pub fn start_local_ip_monitor<F, G>(
    iface: String,
    initial: LocalIpSet,
    interval: Duration,
    resolve: F,
    on_refresh: G,
) -> std::io::Result<LocalIpMonitor>
where
    F: Fn(&str) -> Result<LocalIpSet, CaptureError> + Send + 'static,
    G: Fn(&LocalIpSet, bool) + Send + 'static,
{
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);

    let handle = thread::Builder::new()
        .name("local-ip-monitor".to_string())
        .spawn(move || {
            let mut last = initial;
            loop {
                if stop_thread.load(Ordering::Relaxed) {
                    break;
                }

                match resolve(&iface) {
                    Ok(new_ips) => {
                        let changed = new_ips != last;
                        if changed {
                            let usable = new_ips.has_usable_ipv4();
                            info!(
                                event = "local_ips_refreshed",
                                ipv4_count = new_ips.ipv4_count(),
                                ipv6_count = new_ips.ipv6_count(),
                                usable_ipv4 = usable,
                                "IPs locales actualizadas"
                            );
                            if last.has_usable_ipv4() && !usable {
                                warn!(
                                    event = "local_ips_degraded",
                                    ipv4_count = new_ips.ipv4_count(),
                                    "sin IPv4 local utilizable; el monitor seguirá reintentando"
                                );
                            }
                            last = new_ips.clone();
                        }

                        on_refresh(&new_ips, changed);
                    }
                    Err(error) => {
                        // Se conserva el conjunto anterior: un fallo transitorio
                        // de Npcap no debe vaciar la tabla y perder más tráfico.
                        warn!(
                            event = "local_ips_refresh_failed",
                            %error,
                            "no se pudieron refrescar las IPs locales"
                        );
                    }
                }

                if stop_thread.load(Ordering::Relaxed) {
                    break;
                }
                thread::park_timeout(interval);
            }
        })?;

    Ok(LocalIpMonitor {
        stop,
        handle: Some(handle),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::sync::atomic::AtomicUsize;
    use std::sync::mpsc;
    use std::sync::Mutex;

    fn ipv4(ip: [u8; 4]) -> LocalIpSet {
        let value = u32::from(std::net::Ipv4Addr::from(ip)) as u128;
        LocalIpSet(HashSet::from([value]))
    }

    fn queued_resolver(
        values: Vec<LocalIpSet>,
    ) -> impl Fn(&str) -> Result<LocalIpSet, CaptureError> + Send + 'static {
        let values = Arc::new(Mutex::new(values));
        let index = Arc::new(AtomicUsize::new(0));
        move |_| {
            let index = index.fetch_add(1, Ordering::Relaxed);
            let values = values
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let value = values
                .get(index)
                .or_else(|| values.last())
                .cloned()
                .unwrap_or_default();
            Ok(value)
        }
    }

    #[test]
    fn avisa_cuando_cambia_la_ip_aunque_el_conteo_no_cambie() {
        let initial = ipv4([192, 168, 1, 50]);
        let (tx, rx) = mpsc::channel();

        let mut monitor = start_local_ip_monitor(
            "test0".to_string(),
            initial,
            Duration::from_millis(10),
            queued_resolver(vec![ipv4([192, 168, 1, 50]), ipv4([192, 168, 1, 40])]),
            move |set, changed| {
                if changed {
                    let _ = tx.send(set.clone());
                }
            },
        )
        .expect("monitor de prueba");

        let updated = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("el monitor debe avisar la IP nueva");
        assert_eq!(updated, ipv4([192, 168, 1, 40]));
        monitor.stop();
    }

    #[test]
    fn un_fallo_del_resolver_no_emite_cambio() {
        let initial = ipv4([192, 168, 1, 40]);
        let (resolved_tx, resolved_rx) = mpsc::channel();
        let (refresh_tx, refresh_rx) = mpsc::channel();
        let resolver = move |_: &str| {
            let _ = resolved_tx.send(());
            Err(CaptureError::Runtime("fallo simulado".to_string()))
        };

        let mut monitor = start_local_ip_monitor(
            "test0".to_string(),
            initial,
            Duration::from_millis(10),
            resolver,
            move |set, changed| {
                let _ = refresh_tx.send((set.clone(), changed));
            },
        )
        .expect("monitor de prueba");

        resolved_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("el monitor debió intentar resolver");
        assert!(refresh_rx.try_recv().is_err());
        monitor.stop();
    }
}
