//! sc-agent — daemon headless SCNet.

use clap::Parser;
use sc_aggregate::{AggregatorConfig, WindowAggregator};
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
    /// Device id inscrito en el tenant (por defecto dev-001, override con SC_SENTINEL_DEVICE_ID).
    #[arg(long, env = "SC_SENTINEL_DEVICE_ID", default_value = "dev-001")]
    device_id: String,
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
        Err(_) => Arc::new(NoLookup),
    };

    // Aggregator config
    let agg_cfg = AggregatorConfig {
        window_seconds: 30,
        anonymize_hosts: true,
        hmac_key: b"sc-sentinel-dev-key".to_vec(),
        top_hosts: 50,
        top_ports: 50,
        top_countries: 30,
        max_alerts: 50,
    };

    // Channels
    let (snap_tx, mut snap_rx) = mpsc::channel(1000);

    // Setup capture
    let use_offline = args.offline || args.fixture.is_some();
    let fixture_path = args.fixture.clone().unwrap_or_else(|| {
        // Try from cwd/agent context
        if PathBuf::from("fixtures/loopback-trace.pcap").exists() {
            PathBuf::from("fixtures/loopback-trace.pcap")
        } else {
            PathBuf::from("../fixtures/loopback-trace.pcap")
        }
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

    // Start aggregator with capture rx
    // §9: publica los contadores de captura en health para que packets_seen no quede en 0.
    let stats_health = health.clone();
    let stats_packets_seen = capture.packets_seen.clone();
    let stats_drops = capture.drops.clone();
    let stats_parse_errors = capture.parse_errors.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(1));
        loop {
            ticker.tick().await;
            stats_health.packets_seen.store(
                stats_packets_seen.load(Ordering::Relaxed),
                Ordering::Relaxed,
            );
            stats_health
                .packets_dropped
                .store(stats_drops.load(Ordering::Relaxed), Ordering::Relaxed);
            stats_health.parse_errors.store(
                stats_parse_errors.load(Ordering::Relaxed),
                Ordering::Relaxed,
            );
        }
    });

    let aggregator = WindowAggregator::new(agg_cfg, geo.clone(), health.clone());
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
    let device = DeviceInfo {
        id: args.device_id,
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
        hostname: "localhost".to_string(),
        boot_id: "boot-001".to_string(),
    };
    let client = IngestClient::new(
        args.endpoint.unwrap_or_else(|| config.ingest.url.clone()),
        api_key,
    )?;

    // Process snapshots
    let spool_clone = spool.clone();
    let device_clone = device.clone();
    let spooler_handle = tokio::spawn(async move {
        let mut seq: u64 = 0;
        while let Some(snap) = snap_rx.recv().await {
            seq += 1;
            let now = chrono::Utc::now();
            let env = build_envelope(
                &device_clone,
                format!("win_{:016x}", seq),
                seq,
                now.timestamp() - 30,
                now.timestamp(),
                &snap,
            );
            if let Ok(json) = serde_json::to_vec(&env) {
                let mut s = spool_clone.lock().await;
                let _ = s.push_uncompressed(&format!("win_{:016x}", seq), &json, now.timestamp());
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
