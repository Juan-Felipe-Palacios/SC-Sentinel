//! sc-sentinel-agent — daemon headless SCNet.

use clap::Parser;
use sc_aggregate::{AggregatedWindow, AggregatorConfig, CaptureCounters, WindowAggregator};
use sc_capture::{
    list_interfaces, local_ips_for_interface, run_live, run_offline, CaptureChannel,
    CaptureChannelPair, FlowProducer, LocalIpSet,
};
use sc_collector::{
    Collector, CollectorConfig, CollectorHandle, CollectorMetrics, ListenerConfig, ProtocolFilter,
};
use sc_config::{AgentConfig, CollectorSection};
use sc_detect::{Blacklist, DetectorConfig};
use sc_geo::{GeoLite2Country, NoLookup};
use sc_sync::{
    build_envelope, rebase_device_id, Applied, DeviceInfo, IngestClient, Spool, SpoolConfig,
    SyncDecision, Syncer,
};
use sc_telemetry::status::{StatusConfig, StatusServer, StatusShared, STATUS_ADDR};
use sc_telemetry::{logging, HealthRegistry};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::signal;
use tokio::sync::{mpsc, watch, Mutex};

#[cfg(windows)]
mod service;

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
#[command(name = "sc-sentinel-agent", version, about = "SCNet agent daemon")]
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
    /// Habilita el colector UDP aunque el config lo desactive.
    #[arg(long, conflicts_with = "no_collector")]
    collector: bool,
    /// Sin captura: solo colector UDP (fuente exclusiva, pcap-vs-flow §7).
    #[arg(long, conflicts_with_all = ["offline", "fixture", "interface"])]
    no_capture: bool,
    /// Deshabilita el colector aunque el config lo habilite.
    #[arg(long)]
    no_collector: bool,
    /// Puertos UDP del colector separados por coma; elegirlos lo habilita.
    #[arg(long = "collector-port", value_delimiter = ',', value_name = "PORT")]
    collector_ports: Vec<u16>,
}

/// Punto de entrada sync: en Windows decide primero si lo lanzó el SCM
/// (run as service) o si es una corrida CLI interactiva. Sin `#[tokio::main]`
/// porque `service_main` necesita un runtime construido ad-hoc por hilo.
fn main() {
    #[cfg(windows)]
    if service::enter() == service::RunMode::Service {
        return;
    }

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("sc-sentinel-agent: runtime de tokio: {error}");
            std::process::exit(1);
        }
    };
    let code = runtime.block_on(run_cli());
    if code != 0 {
        std::process::exit(code);
    }
}

/// Camino CLI interactivo (clap sale solo con `--version` y ante errores de
/// parseo; `run_agent` devuelve el código de salida real del daemon).
async fn run_cli() -> i32 {
    let args = Args::parse();

    // En modo CLI las señales vienen de la consola (Ctrl+C / SIGTERM). Como
    // servicio las aporta el SCM, que llama a `notify_shutdown_signal`.
    spawn_console_shutdown_listener();

    if args.list_interfaces {
        match list_interfaces() {
            Ok(interfaces) => {
                for iface in interfaces {
                    println!("{iface}");
                }
                return 0;
            }
            Err(error) => {
                eprintln!("sc-sentinel-agent: {error}");
                return 2;
            }
        }
    }

    run_agent(args).await
}

/// Ruta del fixture pcap de la demo offline.
///
/// Se busca en runtime (junto al binario, en sus ancestros y en los ancestros
/// del directorio de trabajo) para que el ejecutable no arrastre la ruta de
/// compilación embebida y siga siendo portable.
fn default_fixture_path() -> Option<PathBuf> {
    const FIXTURE: &str = "loopback-trace.pcap";
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for level in 0..=6 {
                let Some(ancestor) = dir.ancestors().nth(level) else {
                    break;
                };
                candidates.push(ancestor.join("fixtures").join(FIXTURE));
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for level in 0..=3 {
            let Some(ancestor) = cwd.ancestors().nth(level) else {
                break;
            };
            candidates.push(ancestor.join("fixtures").join(FIXTURE));
        }
    }

    candidates.into_iter().find(|path| path.is_file())
}

/// Ciclo completo del agente con los datos ya parseados. Devuelve el código
/// de salida: 0 = apagado limpio (también el Stop del SCM), 2 = error de
/// configuración/argumentos, 1 = fallo de ejecución.
pub(crate) async fn run_agent(args: Args) -> i32 {
    // Config: archivo explícito (--config) o defaults del agente + overrides SC_*.
    let config = match &args.config {
        Some(path) => AgentConfig::load(path),
        None => AgentConfig::from_env(),
    };
    let mut config = match config {
        Ok(config) => config,
        Err(error) => {
            eprintln!("sc-sentinel-agent: configuración inválida: {error}");
            return 2;
        }
    };

    // Precedencia: archivo < SC_* < flags de CLI.
    let collector_enabled = if args.no_collector {
        Some(false)
    } else if args.collector {
        Some(true)
    } else {
        None
    };
    if let Err(error) = config.with_collector_cli(collector_enabled, &args.collector_ports) {
        eprintln!("sc-sentinel-agent: configuración del colector inválida: {error}");
        return 2;
    }

    // M5: en modo servicio todo el log va a archivo (no hay stdout visible).
    // La config puede elegir `log.file`; si no, default de ProgramData.
    #[cfg(windows)]
    let log_file = config
        .log
        .file
        .clone()
        .or_else(|| service::is_service().then(service::default_log_file));
    #[cfg(not(windows))]
    let log_file = config.log.file.clone();

    // El guard del writer no bloqueante DEBE sobrevivir hasta el final: si se
    // dropeara aquí, los últimos logs se perderían durante el drenaje.
    let _log_guard = match &log_file {
        Some(file) => match logging::init_file_level(&config.log.level, file) {
            Ok(guard) => Some(guard),
            Err(error) => {
                eprintln!(
                    "sc-sentinel-agent: no se pudo abrir el log {} : {error}",
                    file.display()
                );
                return 2;
            }
        },
        None => {
            logging::init_with_level(&config.log.level);
            None
        }
    };

    let device_id = match args.device_id.as_deref().map(str::trim) {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => {
            eprintln!(
                "sc-sentinel-agent: falta el device id. Pasá --device-id dev_<uuid> o definí SC_SENTINEL_DEVICE_ID (el id sale de la tabla devices del dashboard)."
            );
            return 2;
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
            eprintln!("sc-sentinel-agent: {error}");
            return 2;
        }
    };

    // El token nunca viaja por CLI ni por el archivo: se resuelve en memoria.
    let api_key = match args.api_key.clone() {
        Some(key) => Some(key),
        None => match config.resolve_token() {
            Ok(token) => Some(token),
            Err(error) => {
                eprintln!("sc-sentinel-agent: {error}");
                return 2;
            }
        },
    };

    let health = HealthRegistry::new();

    // Geo lookup: la base GeoLite2 se resuelve en runtime (SC_GEOIP_DB o
    // <dir del binario>/geolite2/), nunca con una ruta compilada.
    // `geo_loaded` se publica en /status para que la GUI pueda mostrar si la
    // base GeoLite2 se cargó (sin ella los países salen vacíos).
    let (geo, geo_loaded): (Arc<dyn sc_geo::CountryLookup>, bool) =
        match GeoLite2Country::discover() {
            Ok(g) => {
                tracing::info!(
                    path = %g.path().display(),
                    "GeoIP: base GeoLite2 cargada"
                );
                (Arc::new(g), true)
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    "GeoIP no disponible: se usa NoLookup (los países quedan vacíos)"
                );
                (Arc::new(NoLookup), false)
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

    // Motor determinista: evalúa cada ventana cerrada antes de persistirla en
    // el spool. La blacklist es opcional; si está configurada y no se puede
    // leer, el agente no arranca (mejor fallar que detectar a ciegas).
    let blacklist = match &config.detection.blacklist_file {
        Some(path) => match Blacklist::from_path(path) {
            Ok(list) => list,
            Err(error) => {
                eprintln!("sc-sentinel-agent: blacklist inválida: {error}");
                return 2;
            }
        },
        None => Blacklist::default(),
    };
    let detection = &config.detection;
    let detector_config = DetectorConfig {
        enabled: detection.enabled,
        max_alerts: agg_cfg.max_alerts,
        blacklist,
        port_scan_min_ports: detection.port_scan_min_ports,
        port_scan_min_connections: detection.port_scan_min_connections,
        port_scan_max_connections_per_port: detection.port_scan_max_connections_per_port,
        inbound_scan_enabled: detection.inbound_scan_enabled,
        inbound_scan_min_ports: detection.inbound_scan_min_ports,
        inbound_scan_min_connections: detection.inbound_scan_min_connections,
        inbound_scan_max_connections_per_port: detection.inbound_scan_max_connections_per_port,
        dns_min_queries: detection.dns_min_queries,
        dns_min_bytes: detection.dns_min_bytes,
        dns_min_avg_bytes: detection.dns_min_avg_bytes,
        volume_min_bytes: detection.volume_min_bytes,
        drop_ratio_percent: detection.drop_ratio_percent,
        min_drops: detection.min_drops,
        min_parse_errors: detection.min_parse_errors,
    };
    if !detector_config.enabled {
        tracing::warn!(
            event = "detection_disabled",
            "motor determinista deshabilitado por configuración"
        );
    }

    // Channels
    let (snap_tx, mut snap_rx) = mpsc::channel::<AggregatedWindow>(1000);

    // Setup capture
    let use_offline = args.offline || args.fixture.is_some();
    // La ruta del fixture se resuelve en runtime: el binario no lleva la ruta
    // de compilación embebida. Prioridad: --fixture, luego el árbol de
    // desarrollo (junto al binario o en sus ancestros).
    let fixture_path = args.fixture.clone().or_else(default_fixture_path);

    let capture = if args.no_capture {
        // Solo colector (M4): sin captura live ni offline; el pipeline sigue
        // idéntico pero el canal de captura no recibe nada. Así el colector
        // UDP es la única fuente (política de fuente exclusiva).
        tracing::info!(
            event = "no_capture",
            "collector-only: captura deshabilitada"
        );
        // Canal de captura vacío: su Tx se descarta, así que el rx cierra al
        // instante y el reenvío termina (el brazo del select queda desactivado).
        CaptureChannel::new()
    } else if use_offline {
        let Some(fixture) = fixture_path.as_ref() else {
            eprintln!(
                "sc-sentinel-agent: no se encontró el fixture pcap; indica la ruta con --fixture <ruta>"
            );
            return 2;
        };
        match run_offline(fixture, LocalIpSet::default()) {
            Ok(capture) => capture,
            Err(error) => {
                tracing::error!(event = "offline_load_failed", %error, "no se pudo abrir el fixture pcap");
                return 1;
            }
        }
    } else {
        match args.interface.as_deref() {
            Some(iface) => {
                tracing::info!(interface = iface, "captura live");
                // §5: sin las IPs locales el parser descarta todo el tráfico (IPs no locales).
                let local = match local_ips_for_interface(iface) {
                    Ok(local) => local,
                    Err(error) => {
                        tracing::error!(event = "interface_lookup_failed", %error, interface = iface, "no se pudo resolver la interfaz");
                        return 1;
                    }
                };
                match run_live(iface, local) {
                    Ok(capture) => capture,
                    Err(error) => {
                        tracing::error!(event = "capture_start_failed", %error, interface = iface, "no se pudo abrir la captura");
                        return 1;
                    }
                }
            }
            None => {
                eprintln!(
                    "sc-sentinel-agent: sin --offline/--fixture hay que indicar --interface (o correr --list-interfaces para ver las disponibles)"
                );
                return 2;
            }
        }
    };

    // §9: el aggregator publica los contadores crudos de captura en cada snapshot
    // (sin esperar un tick periódico, que dejaba el primer health en 0).
    let capture_counters = if args.no_capture {
        CaptureCounters {
            packets_seen: None,
            packets_dropped: None,
            parse_errors: None,
        }
    } else {
        CaptureCounters {
            packets_seen: Some(capture.packets_seen.clone()),
            packets_dropped: Some(capture.drops.clone()),
            parse_errors: Some(capture.parse_errors.clone()),
        }
    };

    // Merge de fuentes: captura y colector escriben al mismo canal y el
    // aggregator sigue consumiendo un único Receiver (no se modifica).
    let CaptureChannelPair {
        channel: merged_channel,
        producer: merged_producer,
    } = CaptureChannelPair::new();

    let mut collector_handle =
        start_collector(&config.collector, merged_producer.clone(), health.clone()).await;

    // Dedup pcap+flow (pcap-vs-flow §7): la decisión de diseño es "fuente
    // exclusiva por segmento" — si la captura live y el colector atienden el
    // mismo segmento, el mismo tráfico entra dos veces al aggregator. El agente
    // no puede saber si hay solape real, así que advierte una sola vez al
    // arranque para que el operador revise la topología.
    if source_overlap(!use_offline && !args.no_capture, config.collector.enabled) {
        tracing::warn!(
            event = "source_overlap",
            "captura live y colector activos a la vez: si ambos ven el mismo segmento, el tráfico se contaría doble; usar una sola fuente por segmento (docs/testing/pcap-vs-flow.md §7)"
        );
    }

    let mut capture_rx = capture.rx;
    let forward_producer = merged_producer.clone();
    let mut capture_forward = tokio::spawn(async move {
        while let Some(update) = capture_rx.recv().await {
            // `send` aplica backpressure: si el aggregator se atrasa, el
            // descarte ocurre en el canal de captura, donde ya se cuenta.
            if forward_producer.send(update).await.is_err() {
                break;
            }
        }
    });
    // Sin este drop el canal quedaría abierto y el aggregator nunca drenaría.
    drop(merged_producer);

    let aggregator = WindowAggregator::new(agg_cfg, geo.clone(), health.clone())
        .with_capture_counters(capture_counters);
    let mut aggregator_handle = tokio::spawn(async move {
        aggregator.run(merged_channel.rx, snap_tx).await;
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
    let spool = match Spool::open(spool_config) {
        Ok(spool) => Arc::new(Mutex::new(spool)),
        Err(error) => {
            tracing::error!(event = "spool_open_failed", %error, "no se pudo abrir el spool local");
            return 1;
        }
    };

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
    let client = match IngestClient::new(endpoint, api_key) {
        Ok(client) => client,
        Err(error) => {
            tracing::error!(event = "ingest_client_failed", %error, "no se pudo crear el cliente de ingest");
            return 1;
        }
    };

    // Process snapshots
    let spool_clone = spool.clone();
    let device_clone = device.clone();
    let spooler_handle = tokio::spawn(async move {
        let seq_base = sequence_base();
        while let Some(frame) = snap_rx.recv().await {
            let AggregatedWindow {
                window,
                mut snapshot,
                signals,
            } = frame;
            let detected =
                sc_detect::detect_and_apply(&window, &signals, &detector_config, &mut snapshot);
            if !detected.alerts.is_empty() {
                tracing::debug!(
                    event = "alerts_detected",
                    count = detected.alerts.len(),
                    window = %window.id,
                    "alertas deterministas generadas"
                );
            }
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
                &snapshot,
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
    // F1: endpoint local para la GUI (127.0.0.1:8387). No lleva autenticación,
    // así que solo se abre en loopback. Si el puerto está ocupado, el agente
    // sigue funcionando y la GUI mostrará "Desconectado".
    let status_shared = StatusShared::new(
        health.clone(),
        StatusConfig {
            agent_version: env!("CARGO_PKG_VERSION").to_string(),
            device_id: device.id.clone(),
            mode: if service::is_service() {
                "service".to_string()
            } else {
                "console".to_string()
            },
            capture_enabled: !args.no_capture,
            collector_ports: if config.collector.enabled {
                config
                    .collector
                    .listeners
                    .iter()
                    .map(|listener| listener.port)
                    .collect()
            } else {
                Vec::new()
            },
            geo_loaded,
            // La interfaz que el agente ya usa para capturar: no se relee del
            // binPath del SCM, que puede estar editado a mano.
            interface: args.interface.clone(),
        },
    );
    // Permite una segunda instancia (demo/temporal) sin chocar con el servicio,
    // que ya ocupa el puerto por defecto. Solo loopback: no es configurable la
    // interfaz, únicamente el puerto.
    let status_addr = std::env::var("SC_STATUS_ADDR").unwrap_or_else(|_| STATUS_ADDR.to_string());
    match status_addr.parse::<std::net::SocketAddr>() {
        Ok(addr) => match StatusServer::bind(addr, status_shared.clone()).await {
            Ok(server) => tracing::info!(
                event = "status_server_started",
                addr = %server.local_addr(),
                "endpoint de estado local activo"
            ),
            Err(error) => tracing::warn!(
                event = "status_server_failed",
                %error,
                "el endpoint de estado local no se pudo abrir; la GUI quedará en Desconectado"
            ),
        },
        Err(error) => tracing::warn!(
            event = "status_addr_invalid",
            %error,
            "dirección del endpoint de estado inválida"
        ),
    }

    let sync_handle = tokio::spawn(sync_loop(
        spool_sync,
        client,
        device.id.clone(),
        status_shared,
        shutdown_rx,
    ));

    // Apagado ordenado: primera señal (o fin de la captura) drena y persiste;
    // una segunda señal fuerza la salida con código != 0 (plan M1 §6).
    spawn_forced_exit_watchdog();
    let mut aggregator_done = false;
    tokio::select! {
        _ = wait_shutdown_signal(1) => {
            tracing::info!(event = "shutdown_signal", "señal de apagado: drenando pipeline");
        }
        // En modo solo colector la tarea de reenvío termina al instante (el
        // canal de captura está vacío): con `if` desactivo ese brazo para que
        // no apague el agente (la vida útil la dan colector + sync).
        _ = &mut capture_forward, if !args.no_capture => {
            tracing::info!(
                event = "capture_finished",
                "captura finalizada (offline): drenando pipeline"
            );
        }
        _ = &mut aggregator_handle => {
            tracing::info!(event = "capture_finished", "captura finalizada: drenando pipeline");
            aggregator_done = true;
        }
    }

    #[cfg(windows)]
    {
        // SCM Stop: informa StopPending antes del drenaje (puede tardar hasta
        // DRAIN_TIMEOUT + sync) para que el SCM no declare timeout.
        crate::service::report_stop_pending();
    }

    // El colector mantiene abierto el canal de merge: se corta y espera a que
    // libere sus sockets antes de drenar la ventana activa.
    if let Some(handle) = collector_handle.take() {
        let addrs = handle.local_addrs().to_vec();
        handle.shutdown().await;
        tracing::info!(
            event = "collector_stopped",
            listeners = ?addrs,
            "colector UDP detenido"
        );
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
    let pending = match spool.lock().await.flush() {
        Ok(pending) => pending,
        Err(error) => {
            tracing::error!(event = "spool_flush_failed", %error, "no se pudo persistir el spool");
            return 1;
        }
    };
    tracing::info!(
        event = "spool_flushed",
        pending,
        "spool persistido: salida limpia"
    );

    0
}

/// ¿Hay solape potencial de fuentes? Captura pcap live y colector activos a la
/// vez (docs/testing/pcap-vs-flow.md §7: fuente exclusiva por segmento).
fn source_overlap(live_capture: bool, collector_enabled: bool) -> bool {
    live_capture && collector_enabled
}

/// Abre los listeners configurados y devuelve el handle para cortarlos al
/// apagar. Un fallo de bind no es fatal: la captura local sigue funcionando y
/// el error se publica en el health del agente.
async fn start_collector(
    section: &CollectorSection,
    producer: FlowProducer,
    health: Arc<HealthRegistry>,
) -> Option<CollectorHandle> {
    if !section.enabled {
        tracing::info!(event = "collector_disabled", "colector UDP deshabilitado");
        return None;
    }

    let listeners: Vec<ListenerConfig> = section
        .listeners
        .iter()
        .map(|listener| {
            let protocol = ProtocolFilter::parse(&listener.protocol).unwrap_or_else(|| {
                tracing::warn!(
                    protocol = %listener.protocol,
                    "protocolo de colector desconocido; se usa auto"
                );
                ProtocolFilter::Auto
            });
            ListenerConfig::new(listener.port).with_protocol(protocol)
        })
        .collect();
    if listeners.is_empty() {
        tracing::warn!(
            event = "collector_without_listeners",
            "el colector está habilitado sin listeners; no se abre ningún socket"
        );
        return None;
    }

    let config = CollectorConfig {
        bind_addr: section.bind_addr,
        listeners,
        template_cache_capacity: section.template_cache_capacity,
        template_cache_ttl_secs: section.template_cache_ttl_secs,
    };
    tracing::info!(
        event = "collector_starting",
        bind_addr = %section.bind_addr,
        listeners = ?section
            .listeners
            .iter()
            .map(|listener| (listener.port, listener.protocol.as_str()))
            .collect::<Vec<_>>(),
        cache_capacity = section.template_cache_capacity,
        cache_ttl_secs = section.template_cache_ttl_secs,
        "abriendo colector UDP"
    );

    // T4.1: se conserva una copia del Arc para espejar las métricas del
    // colector hacia HealthRegistry (el handle no las expone).
    let metrics = CollectorMetrics::new();
    match Collector::new(config, producer, metrics.clone())
        .start()
        .await
    {
        Ok(handle) => {
            tracing::info!(
                event = "collector_started",
                listeners = ?handle.local_addrs(),
                "colector UDP activo"
            );
            // Espejo 1 s: mismo patrón que spool_bytes. publica collector_* en
            // cada snapshot de health (T4.1).
            let mirror_health = health.clone();
            tokio::spawn(async move {
                let mut ticker = tokio::time::interval(Duration::from_secs(1));
                loop {
                    ticker.tick().await;
                    let snap = metrics.snapshot();
                    mirror_health.set_collector_stats(
                        snap.packets_received,
                        snap.packets_dropped,
                        snap.parse_errors,
                        snap.templates_cached,
                        snap.flows_normalized,
                    );
                }
            });
            Some(handle)
        }
        Err(error) => {
            tracing::error!(
                event = "collector_start_failed",
                %error,
                "no se pudo abrir el colector; el agente sigue solo con la captura pcap"
            );
            health.note_error(format!("collector: {error}"));
            None
        }
    }
}

/// Loop de sync: envía un batch por tick y respeta el backoff del `Syncer`.
/// Al recibir el apagado drena una última vez (acotado) y termina.
async fn sync_loop(
    spool: Arc<Mutex<Spool>>,
    client: IngestClient,
    device_id: String,
    status: Arc<StatusShared>,
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
                } else if sync_pass(&spool, &client, &mut syncer, &device_id, &status).await {
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
    drain_spool(&spool, &client, &mut syncer, &device_id, &status).await;
}

/// Envía hasta 10 batches del spool. Devuelve `true` si hay que reintentar con backoff.
async fn sync_pass(
    spool: &Arc<Mutex<Spool>>,
    client: &IngestClient,
    syncer: &mut Syncer,
    device_id: &str,
    status: &StatusShared,
) -> bool {
    let batches = {
        let mut s = spool.lock().await;
        s.next_batch(10).unwrap_or_default()
    };

    for batch in batches {
        let decision = match serde_json::from_slice::<sc_core::IngestEnvelope>(&batch.payload) {
            Ok(mut env) => {
                // Un batch agregado antes de un re-enrolamiento lleva el device
                // id de aquel momento. El backend responde 403 si no coincide
                // con el dueño del token, y como la cola es FIFO ese batch
                // bloqueaba el drenaje completo. Se reasigna al device actual.
                if rebase_device_id(&mut env, device_id) {
                    tracing::info!(
                        event = "sync_rebased_device",
                        window_id = %batch.window_id,
                        device_id = %device_id,
                        "sync: ventana reasignada al device enrolado"
                    );
                }
                client.post_envelope(&env).await
            }
            // Un payload ilegible no se puede reintentar: va a dead-letter.
            Err(_) => SyncDecision::InvalidContract,
        };

        let applied = {
            let mut s = spool.lock().await;
            syncer.apply(&mut s, batch.row_id, &decision)
        };

        match applied {
            // Prueba directa de publicación: solo un 2xx borra la fila del
            // spool, así que esta línea es la evidencia de que el device está
            // autenticado y el batch entró en el backend. La usa
            // `scripts/re-enroll-device.ps1` para devolver exit 0.
            Ok(Applied::Confirmed) => {
                tracing::info!(
                    event = "sync_confirmed",
                    window_id = %batch.window_id,
                    "sync: ventana aceptada por el backend"
                );
                // Alimenta `last_sync_at` de /status (lo muestra la GUI).
                status.note_sync(&batch.window_id);
            }
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
async fn drain_spool(
    spool: &Arc<Mutex<Spool>>,
    client: &IngestClient,
    syncer: &mut Syncer,
    device_id: &str,
    status: &StatusShared,
) {
    for _ in 0..DRAIN_ATTEMPTS {
        if syncer.enrollment_required() {
            break;
        }
        let pending = { spool.lock().await.pending_count().unwrap_or(0) };
        if pending == 0 {
            break;
        }
        if sync_pass(spool, client, syncer, device_id, status).await {
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

/// Emisor de las señales de apagado.
///
/// Cada señal (Ctrl+C, SIGTERM o el Stop del SCM) incrementa el contador. La
/// primera ordena el drenaje del pipeline; la segunda fuerza la salida
/// inmediata con código != 0 (plan M1 §6).
///
/// El CONTEO es lo que hace posible distinguir "primera" de "segunda": el
/// watchdog y el drenaje esperan a la misma fuente, así que con un simple
/// booleano una sola señal del SCM despertaba a los dos y el watchdog
/// abortaba el drenaje (el servicio moría con 130 y el SCM reportaba 1067
/// en lugar del código de salida real).
static SHUTDOWN: OnceLock<watch::Sender<u32>> = OnceLock::new();

/// Canal de señales de apagado (el emisor vive en un static).
fn shutdown_sender() -> &'static watch::Sender<u32> {
    SHUTDOWN.get_or_init(|| watch::channel(0).0)
}

/// Registra una señal de apagado.
pub(crate) fn notify_shutdown_signal() {
    shutdown_sender().send_modify(|count| *count += 1);
}

/// Espera a que se acumulen `objetivo` señales de apagado.
async fn wait_shutdown_signal(objetivo: u32) {
    let mut senales = shutdown_sender().subscribe();
    loop {
        if *senales.borrow_and_update() >= objetivo {
            return;
        }
        if senales.changed().await.is_err() {
            return;
        }
    }
}

/// Escucha las señales de la consola (Ctrl+C y SIGTERM) y las cuenta.
///
/// Se registra UNA sola vez y se cuenta cada pulsación: si el drenaje y el
/// watchdog tuvieran cada uno su propio listener, una sola señal los
/// despertaría a los dos y el watchdog abortaría el drenaje.
fn spawn_console_shutdown_listener() {
    tokio::spawn(async {
        #[cfg(unix)]
        {
            let mut terminate = match signal::unix::signal(signal::unix::SignalKind::terminate()) {
                Ok(handler) => handler,
                Err(error) => {
                    tracing::error!(%error, "no se pudo registrar SIGTERM; solo Ctrl+C");
                    loop {
                        if signal::ctrl_c().await.is_err() {
                            return;
                        }
                        notify_shutdown_signal();
                    }
                }
            };
            loop {
                tokio::select! {
                    _ = signal::ctrl_c() => {}
                    _ = terminate.recv() => {}
                }
                notify_shutdown_signal();
            }
        }
        #[cfg(not(unix))]
        {
            loop {
                if signal::ctrl_c().await.is_err() {
                    return;
                }
                notify_shutdown_signal();
            }
        }
    });
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
        // Segunda señal: en modo servicio el SCM solo envía una, así que el
        // watchdog espera a la segunda para forzar la salida sin drenar.
        wait_shutdown_signal(2).await;
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
    use sc_capture::Direction;
    use sc_core::{FlowKey, Protocol};
    use tokio::net::UdpSocket;

    #[test]
    fn hostname_resuelto_cabe_en_el_contrato() {
        let hostname = local_hostname();
        assert!(!hostname.is_empty());
        assert!(hostname.chars().count() <= 255);
    }

    /// La 1ª señal de apagado ordena el drenaje; la 2ª fuerza la salida.
    ///
    /// El SCM solo envía UN Stop: con un contador el watchdog espera a la
    /// segunda señal y el drainage puede completarse (antes el watchdog
    /// abortaba el drenaje y el servicio moría con exit 130 → 1067).
    #[tokio::test]
    async fn la_primera_senal_drena_y_la_segunda_forza_la_salida() {
        let mut senales = shutdown_sender().subscribe();
        let base = *senales.borrow_and_update();

        // Nadie ha señalado todavía: el watchdog sigue esperando.
        let antes = tokio::time::timeout(
            std::time::Duration::from_millis(50),
            wait_shutdown_signal(base + 2),
        )
        .await;
        assert!(antes.is_err(), "no debe resolverse sin señales");

        // Primera señal: suficiente para drenar, insuficiente para forzar.
        notify_shutdown_signal();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            wait_shutdown_signal(base + 1),
        )
        .await
        .expect("la primera señal debe habilitar el drenaje");
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(50),
                wait_shutdown_signal(base + 2),
            )
            .await
            .is_err(),
            "la primera señal no debe forzar la salida"
        );

        // Segunda señal: ahora sí, salida forzada.
        notify_shutdown_signal();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            wait_shutdown_signal(base + 2),
        )
        .await
        .expect("la segunda señal debe forzar la salida");
    }

    #[test]
    fn boot_id_resuelto_cabe_en_el_contrato() {
        let boot_id = current_boot_id();
        assert!(!boot_id.is_empty());
        assert!(boot_id.chars().count() <= 64);
    }

    #[test]
    fn cli_parsea_puertos_del_colector_separados_por_coma() {
        let args = Args::try_parse_from(["sc-sentinel-agent", "--collector-port", "2055,4739"])
            .expect("puertos válidos");
        assert_eq!(args.collector_ports, vec![2055, 4739]);
        assert!(!args.collector);
        assert!(!args.no_collector);
    }

    #[test]
    fn cli_rechaza_habilitar_y_deshabilitar_a_la_vez() {
        let error = Args::try_parse_from(["sc-sentinel-agent", "--collector", "--no-collector"])
            .expect_err("flags contradictorios");
        assert_eq!(error.kind(), clap::error::ErrorKind::ArgumentConflict);
    }

    #[test]
    fn solape_de_fuentes_solo_con_captura_live_y_colector() {
        assert!(source_overlap(true, true));
        assert!(
            !source_overlap(false, true),
            "offline/fixture no captura la red"
        );
        assert!(!source_overlap(true, false));
        assert!(!source_overlap(false, false));
    }

    fn nf5_datagram() -> Vec<u8> {
        let mut packet = Vec::with_capacity(72);
        packet.extend_from_slice(&5u16.to_be_bytes());
        packet.extend_from_slice(&1u16.to_be_bytes());
        packet.extend_from_slice(&[0u8; 16]); // uptime, secs, nsecs, secuencia
        packet.extend_from_slice(&[0u8; 4]); // engine + sampling
        packet.extend_from_slice(&[192, 168, 1, 41, 8, 8, 8, 8]);
        packet.extend_from_slice(&[0u8; 4]); // next hop
        packet.extend_from_slice(&[0u8; 4]); // input + output
        packet.extend_from_slice(&10u32.to_be_bytes());
        packet.extend_from_slice(&1_500u32.to_be_bytes());
        packet.extend_from_slice(&[0u8; 8]); // first + last
        packet.extend_from_slice(&51_234u16.to_be_bytes());
        packet.extend_from_slice(&443u16.to_be_bytes());
        packet.extend_from_slice(&[0, 0x10, 6, 0]);
        packet.extend_from_slice(&[0u8; 4]); // src_as + dst_as
        packet.extend_from_slice(&[0u8; 4]); // masks + pad
        packet
    }

    #[tokio::test]
    async fn merge_de_captura_y_colector_entrega_ambos_flujos() {
        let capture = CaptureChannelPair::new();
        let CaptureChannelPair {
            channel: mut merged_channel,
            producer: merged_producer,
        } = CaptureChannelPair::new();

        // Mismo puente que usa main para volcar la captura al canal de merge.
        let mut capture_rx = capture.channel.rx;
        let forward_tx = merged_producer.clone();
        let forward = tokio::spawn(async move {
            while let Some(update) = capture_rx.recv().await {
                if forward_tx.send(update).await.is_err() {
                    break;
                }
            }
        });

        let collector_config =
            CollectorConfig::new([0]).with_bind_addr("127.0.0.1".parse().expect("loopback"));
        let collector = Collector::new(
            collector_config,
            merged_producer.clone(),
            CollectorMetrics::new(),
        )
        .start()
        .await
        .expect("colector en loopback");
        drop(merged_producer);

        capture
            .producer
            .try_push(sc_capture::FlowUpdate {
                ts: 0,
                flow: FlowKey {
                    src_ip: 1,
                    dst_ip: 2,
                    src_port: 1000,
                    dst_port: 80,
                    protocol: Protocol::Tcp,
                },
                bytes: 100,
                packets: 1,
                direction: Direction::Out,
            })
            .expect("push de captura");

        let sender = UdpSocket::bind("127.0.0.1:0").await.expect("socket UDP");
        sender
            .send_to(&nf5_datagram(), collector.local_addrs()[0])
            .await
            .expect("envío de flujo UDP");

        let mut ports = Vec::new();
        for _ in 0..2 {
            let update = tokio::time::timeout(Duration::from_secs(2), merged_channel.rx.recv())
                .await
                .expect("timeout esperando los dos flujos")
                .expect("canal abierto");
            ports.push(update.flow.dst_port);
        }
        ports.sort_unstable();
        assert_eq!(ports, vec![80, 443]);

        collector.shutdown().await;
        forward.abort();
    }
}
