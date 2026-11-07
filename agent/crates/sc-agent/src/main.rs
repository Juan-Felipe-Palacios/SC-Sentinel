//! sc-agent — daemon headless SCNet.

use clap::Parser;
use sc_aggregate::{AggregatorConfig, CaptureCounters, WindowAggregator};
use sc_capture::{list_interfaces, local_ips_for_interface, run_live, run_offline, LocalIpSet};
use sc_config::AgentConfig;
use sc_geo::{GeoLite2Country, NoLookup};
use sc_sync::{
    build_envelope, Applied, DeviceInfo, IngestClient, Spool, SpoolConfig, SyncDecision, Syncer,
};
use sc_telemetry::{logging, HealthRegistry};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tokio::sync::{mpsc, watch, Mutex};

/// Tope para drenar ventana activa, cola de sync y spool antes de salir.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(5);
/// Vueltas máximas del drenaje final de sync (un batch de 10 por vuelta).
const DRAIN_ATTEMPTS: usize = 5;
const SYNC_INTERVAL: Duration = Duration::from_secs(1);
/// Reintento del enrolamiento: el device no puede hacer nada hasta que lo inscriban.
const ENROLLMENT_RETRY: Duration = Duration::from_secs(60);
/// Cada cuántos ticks de 1 s se aplica la retención del spool (cota §9.4).
const RETENTION_EVERY_TICKS: u64 = 60;

#[derive(Parser, Debug)]
#[command(name = "sc-agent", version, about = "SCNet agent daemon")]
struct Args {
    /// Fuerza el modo offline (pcap de fixture en lugar de captura live).
    #[arg(long)]
    offline: bool,
    /// Interfaz de captura live (nombre o descripción; ver `--list-interfaces`).
    #[arg(long)]
    interface: Option<String>,
    /// Lista las interfaces capturables y sale.
    #[arg(long)]
    list_interfaces: bool,
    #[arg(long)]
    fixture: Option<PathBuf>,
    #[arg(long)]
    endpoint: Option<String>,
    #[arg(long)]
    api_key: Option<String>,
    /// Ruta del `config.toml` (sin esto se usan defaults + overrides SC_*).
    #[arg(long)]
    config: Option<PathBuf>,
    /// Device id inscrito en el tenant (`dev_<uuid>`), o SC_SENTINEL_DEVICE_ID.
    /// Sin default a propósito: un id inventado termina en 403 del backend.
    #[arg(long, env = "SC_SENTINEL_DEVICE_ID")]
    device_id: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    if std::env::args().any(|a| a == "--version") {
        println!("sc-sentinel-agent {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    if args.list_interfaces {
        match list_interfaces() {
            Ok(interfaces) => {
                for iface in interfaces {
                    println!("{iface}");
                }
                return Ok(());
            }
            Err(error) => {
                eprintln!("sc-agent: {error}");
                std::process::exit(2);
            }
        }
    }

    // Config: archivo explícito (--config) o defaults del agente + overrides SC_*.
    let config = match &args.config {
        Some(path) => AgentConfig::load(path),
        None => AgentConfig::from_env(),
    };
    let config = match config {
        Ok(config) => config,
        Err(error) => {
            eprintln!("sc-agent: configuración inválida: {error}");
            std::process::exit(2);
        }
    };
    logging::init_with_level(&config.log.level);

    let device_id = match args.device_id.as_deref().map(str::trim) {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => {
            eprintln!(
                "sc-agent: falta el device id. Pasá --device-id dev_<uuid> o definí SC_SENTINEL_DEVICE_ID (el id sale de la tabla devices del dashboard)."
            );
            std::process::exit(2);
        }
    };
    if !device_id.starts_with("dev_") {
        tracing::warn!(
            device_id = %device_id,
            "el device id no empieza por 'dev_'; el backend probablemente lo rechace"
        );
    }

    // Clave HMAC de host_mark: entorno → archivo persistido → nueva y persistida.
    let hmac_key = match config.resolve_hmac_key() {
        Ok(resolved) => {
            if resolved.generated {
                tracing::warn!(
                    event = "hmac_key_generated",
                    path = %resolved
                        .path
                        .as_deref()
                        .map(|path| path.display().to_string())
                        .unwrap_or_default(),
                    "clave HMAC de host_mark generada y persistida; conservá el archivo para no romper los host_key del dashboard"
                );
            }
            resolved.key
        }
        Err(error) => {
            eprintln!("sc-agent: {error}");
            std::process::exit(2);
        }
    };

    // El token nunca viaja por CLI ni por el archivo: se resuelve en memoria.
    let api_key = match args.api_key.clone() {
        Some(key) => Some(key),
        None => match config.resolve_token() {
            Ok(token) => Some(token),
            Err(error) => {
                eprintln!("sc-agent: {error}");
                std::process::exit(2);
            }
        },
    };

    let health = HealthRegistry::new();

    // Geo lookup
    let geo: Arc<dyn sc_geo::CountryLookup> = match GeoLite2Country::from_agent_resources() {
        Ok(g) => Arc::new(g),
        Err(error) => {
            tracing::warn!(
                %error,
                "GeoIP no disponible: se usa NoLookup (los países quedan vacíos)"
            );
            Arc::new(NoLookup)
        }
    };

    // Aggregator config
    let agg_cfg = AggregatorConfig {
        window_seconds: 30,
        // El dashboard muestra IP y nombre de host; se anonimiza solo si la config lo pide.
        anonymize_hosts: config.privacy.anonymize_hosts,
        hmac_key,
        top_hosts: 50,
        top_ports: 50,
        top_countries: 30,
        max_alerts: 50,
    };

    // Channels
    let (snap_tx, mut snap_rx) = mpsc::channel::<(sc_core::Window, sc_core::WindowSnapshot)>(1000);

    // Setup capture
    let use_offline = args.offline || args.fixture.is_some();
    // Ruta estable relativa al crate, no al cwd desde el que se lanza el agente.
    let fixture_path = args.fixture.clone().unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/loopback-trace.pcap")
    });

    let capture = if use_offline {
        run_offline(&fixture_path, LocalIpSet::default())?
    } else {
        match args.interface.as_deref() {
            Some(iface) => {
                tracing::info!(interface = iface, "captura live");
                // §5: sin las IPs locales el parser descarta todo el tráfico (IPs no locales).
                let local = local_ips_for_interface(iface)?;
                run_live(iface, local)?
            }
            None => {
                eprintln!(
                    "sc-agent: sin --offline/--fixture hay que indicar --interface (o correr --list-interfaces para ver las disponibles)"
                );
                std::process::exit(2);
            }
        }
    };

    // §9: el aggregator publica los contadores crudos de captura en cada snapshot
    // (sin esperar un tick periódico, que dejaba el primer health en 0).
    let capture_counters = CaptureCounters {
        packets_seen: Some(capture.packets_seen.clone()),
        packets_dropped: Some(capture.drops.clone()),
        parse_errors: Some(capture.parse_errors.clone()),
    };

    let aggregator = WindowAggregator::new(agg_cfg, geo.clone(), health.clone())
        .with_capture_counters(capture_counters);
    let mut aggregator_handle = tokio::spawn(async move {
        aggregator.run(capture.rx, snap_tx).await;
    });

    // Setup sync/spool
    let spool_config = SpoolConfig {
        path: config.spool.path.clone(),
        max_bytes: config.spool.max_bytes,
        max_age_days: config.spool.max_age_days,
    };
    let endpoint = args
        .endpoint
        .clone()
        .unwrap_or_else(|| config.ingest.url.clone());
    tracing::info!(
        endpoint = %endpoint,
        spool = %spool_config.path.display(),
        compression = %config.ingest.compression,
        "config cargada"
    );
    let spool = Arc::new(Mutex::new(Spool::open(spool_config)?));

    // §9: publica el tamaño real del spool (0 = vacío) en cada snapshot de health.
    let spool_health = health.clone();
    let spool_stats = spool.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(1));
        let mut ticks: u64 = 0;
        loop {
            ticker.tick().await;
            let mut spool = spool_stats.lock().await;
            let bytes = spool.len_bytes().unwrap_or(0);
            spool_health.spool_bytes.store(bytes, Ordering::Relaxed);
            // §9.4: la cota (edad y 500 MB) se aplica aunque el backend esté caído.
            ticks += 1;
            if ticks % RETENTION_EVERY_TICKS == 0 {
                let report = spool.enforce_retention(chrono::Utc::now().timestamp());
                if report.dropped_windows > 0 {
                    tracing::warn!(
                        event = "spool_retention",
                        dropped_windows = report.dropped_windows,
                        dropped_bytes = report.dropped_bytes,
                        "spool: ventanas descartadas por retención"
                    );
                }
            }
        }
    });
    let device = DeviceInfo {
        id: device_id,
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
        hostname: local_hostname(),
        boot_id: current_boot_id(),
    };
    let client = IngestClient::new(
        args.endpoint.unwrap_or_else(|| config.ingest.url.clone()),
        api_key,
    )?;

    // Process snapshots
    let spool_clone = spool.clone();
    let device_clone = device.clone();
    let spooler_handle = tokio::spawn(async move {
        let seq_base = sequence_base();
        while let Some((window, snap)) = snap_rx.recv().await {
            let now = chrono::Utc::now();
            let mut s = spool_clone.lock().await;
            // La secuencia vive en el spool: un contador en memoria reiniciaba en 1 en
            // cada arranque y el backend descartaba las ventanas como duplicadas (§9.2).
            // El base por época mantiene los ids crecientes aunque el spool sea nuevo.
            let seq = match s.next_sequence() {
                Ok(v) => seq_base + v,
                Err(_) => continue,
            };
            let window_id = format!("win_{:016x}", seq);
            // Los extremos son los de la ventana real agregada (alineada a 30 s),
            // no el instante en que el spool la persiste.
            let env = build_envelope(
                &device_clone,
                window_id.clone(),
                seq,
                window.start.timestamp(),
                window.end.timestamp(),
                &snap,
            );
            match serde_json::to_vec(&env) {
                Ok(json) => {
                    if let Err(error) = s.push_uncompressed(&window_id, &json, now.timestamp()) {
                        tracing::error!(
                            event = "spool_push_failed",
                            %window_id,
                            %error,
                            "no se pudo persistir la ventana en el spool"
                        );
                    }
                }
                Err(error) => tracing::error!(
                    event = "envelope_serialize_failed",
                    %window_id,
                    %error,
                    "no se pudo serializar la ventana"
                ),
            }
        }
    });

    // Sync loop: solo un 2xx borra del spool (spec §9.2).
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let spool_sync = spool.clone();
    let sync_handle = tokio::spawn(sync_loop(spool_sync, client, shutdown_rx));

    // Apagado ordenado: primera señal (o fin de la captura) drena y persiste;
    // una segunda señal fuerza la salida con código != 0 (plan M1 §6).
    spawn_forced_exit_watchdog();
    let mut aggregator_done = false;
    tokio::select! {
        _ = shutdown_signal() => {
            tracing::info!(event = "shutdown_signal", "señal de apagado: drenando pipeline");
        }
        _ = &mut aggregator_handle => {
            tracing::info!(event = "capture_finished", "captura finalizada: drenando pipeline");
            aggregator_done = true;
        }
    }

    // 1) Ventana activa: se emite cuando el aggregator cierra el canal de snapshots.
    if !aggregator_done
        && tokio::time::timeout(DRAIN_TIMEOUT, &mut aggregator_handle)
            .await
            .is_err()
    {
        tracing::warn!(
            event = "window_dropped",
            "drenaje agotado: se descarta la ventana en curso"
        );
        aggregator_handle.abort();
    }
    let _ = spooler_handle.await;

    // 2) Sync final: envía lo que quede y corta el loop.
    let _ = shutdown_tx.send(true);
    if tokio::time::timeout(DRAIN_TIMEOUT, sync_handle)
        .await
        .is_err()
    {
        tracing::warn!(
            event = "sync_drain_timeout",
            "el loop de sync no terminó dentro del tope"
        );
    }

    // 3) Flush: consolida el WAL y deja el spool listo para el próximo arranque.
    let pending = { spool.lock().await.flush()? };
    tracing::info!(
        event = "spool_flushed",
        pending,
        "spool persistido: salida limpia"
    );

    Ok(())
}

/// Loop de sync: envía un batch por tick y respeta el backoff del `Syncer`.
/// Al recibir el apagado drena una última vez (acotado) y termina.
async fn sync_loop(
    spool: Arc<Mutex<Spool>>,
    client: IngestClient,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut syncer = Syncer::new();
    let mut interval = tokio::time::interval(SYNC_INTERVAL);

    loop {
        let delay = tokio::select! {
            _ = interval.tick() => {
                if syncer.enrollment_required() {
                    tracing::warn!("sync: el device necesita enrolarse; batches retenidos en el spool");
                    ENROLLMENT_RETRY
                } else if sync_pass(&spool, &client, &mut syncer).await {
                    syncer.delay()
                } else {
                    continue;
                }
            }
            _ = shutdown.changed() => break,
        };

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = shutdown.changed() => break,
        }
    }

    tracing::info!(
        event = "sync_final_drain",
        "drenaje final del spool antes de salir"
    );
    drain_spool(&spool, &client, &mut syncer).await;
}

/// Envía hasta 10 batches del spool. Devuelve `true` si hay que reintentar con backoff.
async fn sync_pass(spool: &Arc<Mutex<Spool>>, client: &IngestClient, syncer: &mut Syncer) -> bool {
    let batches = {
        let mut s = spool.lock().await;
        s.next_batch(10).unwrap_or_default()
    };

    for batch in batches {
        let decision = match serde_json::from_slice::<sc_core::IngestEnvelope>(&batch.payload) {
            Ok(env) => client.post_envelope(&env).await,
            // Un payload ilegible no se puede reintentar: va a dead-letter.
            Err(_) => SyncDecision::InvalidContract,
        };

        let applied = {
            let mut s = spool.lock().await;
            syncer.apply(&mut s, batch.row_id, &decision)
        };

        match applied {
            Ok(Applied::Confirmed) => {}
            Ok(Applied::DeadLettered) => {
                tracing::warn!(window_id = %batch.window_id, ?decision, "sync: batch a dead-letter");
            }
            Ok(Applied::EnrollmentRequired) => {
                tracing::error!(
                    window_id = %batch.window_id,
                    "sync: 401/403, re-enrolar el device"
                );
                return true;
            }
            Ok(Applied::Retained) => {
                tracing::warn!(
                    window_id = %batch.window_id,
                    ?decision,
                    "sync: batch retenido para reintento"
                );
                return true;
            }
            Err(error) => {
                tracing::error!(
                    window_id = %batch.window_id,
                    %error,
                    "sync: no se pudo aplicar la decisión al spool"
                );
                return true;
            }
        }
    }

    false
}

/// Best-effort al apagar: vacía el spool sin esperar backoff ni enrolamiento.
async fn drain_spool(spool: &Arc<Mutex<Spool>>, client: &IngestClient, syncer: &mut Syncer) {
    for _ in 0..DRAIN_ATTEMPTS {
        if syncer.enrollment_required() {
            break;
        }
        let pending = { spool.lock().await.pending_count().unwrap_or(0) };
        if pending == 0 {
            break;
        }
        if sync_pass(spool, client, syncer).await {
            // El backend pidió backoff: no tiene sentido bloquear el apagado.
            break;
        }
    }

    let pending = { spool.lock().await.pending_count().unwrap_or(0) };
    if pending == 0 {
        tracing::info!(
            event = "spool_drained",
            "sin batches pendientes tras el drenaje"
        );
    } else {
        tracing::warn!(
            event = "spool_pending",
            pending,
            "quedan batches en el spool para el próximo arranque"
        );
    }
}

/// Primera señal de apagado: SIGINT (Ctrl+C) o SIGTERM en Unix.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate = match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(handler) => handler,
            Err(error) => {
                tracing::error!(%error, "no se pudo registrar SIGTERM; solo Ctrl+C");
                let _ = signal::ctrl_c().await;
                return;
            }
        };
        tokio::select! {
            _ = signal::ctrl_c() => {}
            _ = terminate.recv() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = signal::ctrl_c().await;
    }
}

/// Segunda señal: salida inmediata con código != 0, nunca silenciosa.
/// Nombre del equipo para el contrato de ingest (1..255 caracteres).
fn local_hostname() -> String {
    let candidate = {
        #[cfg(windows)]
        {
            std::env::var("COMPUTERNAME").ok()
        }
        #[cfg(unix)]
        {
            unix_hostname()
        }
        #[cfg(not(any(windows, unix)))]
        {
            None
        }
    };
    candidate
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

#[cfg(unix)]
fn unix_hostname() -> Option<String> {
    std::fs::read_to_string("/etc/hostname")
        .ok()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .or_else(|| std::env::var("HOSTNAME").ok())
}

/// Identificador de arranque (1..64 caracteres en el contrato).
/// Linux lo lee del kernel; el resto usa un UUID por proceso, que es estable
/// durante toda la vida del agente aunque no identifique al SO.
fn current_boot_id() -> String {
    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/proc/sys/kernel/random/boot_id") {
            let id = id.trim();
            if !id.is_empty() {
                return id.to_string();
            }
        }
    }
    uuid::Uuid::new_v4().to_string()
}

/// Base de la secuencia de ventanas: segundos desde la época. Mantiene los ids
/// crecientes aunque el spool se recree y evita colisiones de idempotencia.
fn sequence_base() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn spawn_forced_exit_watchdog() {
    tokio::spawn(async {
        shutdown_signal().await;
        tracing::error!(
            event = "shutdown_forced",
            "segunda señal: salida inmediata sin drenar"
        );
        std::process::exit(130);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hostname_resuelto_cabe_en_el_contrato() {
        let hostname = local_hostname();
        assert!(!hostname.is_empty());
        assert!(hostname.chars().count() <= 255);
    }

    #[test]
    fn boot_id_resuelto_cabe_en_el_contrato() {
        let boot_id = current_boot_id();
        assert!(!boot_id.is_empty());
        assert!(boot_id.chars().count() <= 64);
    }
}
