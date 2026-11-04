//! sc-agent — daemon headless SCNet.

use clap::Parser;
use sc_aggregate::{AggregatorConfig, WindowAggregator};
use sc_capture::{run_offline, LocalIpSet};
use sc_geo::{GeoLite2Country, NoLookup};
use sc_sync::{
    build_envelope, Applied, DeviceInfo, IngestClient, Spool, SpoolConfig, SyncDecision, Syncer,
};
use sc_telemetry::{logging, HealthRegistry};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::signal;
use tokio::sync::{mpsc, Mutex};

#[derive(Parser, Debug)]
#[command(name = "sc-agent", version, about = "SCNet agent daemon")]
struct Args {
    #[arg(long)]
    offline: bool,
    #[arg(long)]
    fixture: Option<PathBuf>,
    #[arg(long)]
    endpoint: Option<String>,
    #[arg(long)]
    api_key: Option<String>,
    /// Device id inscrito en el tenant (por defecto dev-001, override con SC_SENTINEL_DEVICE_ID).
    #[arg(long, env = "SC_SENTINEL_DEVICE_ID", default_value = "dev-001")]
    device_id: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    logging::init();
    let args = Args::parse();

    if std::env::args().any(|a| a == "--version") {
        println!("sc-sentinel-agent {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

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
    let local = LocalIpSet::default();
    let fixture_path = args.fixture.unwrap_or_else(|| {
        // Try from cwd/agent context
        if PathBuf::from("fixtures/loopback-trace.pcap").exists() {
            PathBuf::from("fixtures/loopback-trace.pcap")
        } else {
            PathBuf::from("../fixtures/loopback-trace.pcap")
        }
    });

    let capture = run_offline(&fixture_path, local.clone())?;

    // Start aggregator with capture rx
    let aggregator = WindowAggregator::new(agg_cfg, geo.clone(), health.clone());
    tokio::spawn(async move {
        aggregator.run(capture.rx, snap_tx).await;
    });

    // Setup sync/spool
    let spool = Arc::new(Mutex::new(Spool::open(SpoolConfig::default())?));
    let device = DeviceInfo {
        id: args.device_id,
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
        hostname: "localhost".to_string(),
        boot_id: "boot-001".to_string(),
    };
    let client = IngestClient::new(
        args.endpoint
            .unwrap_or_else(|| "http://localhost:8080/api/ingest".to_string()),
        args.api_key,
    )?;

    // Process snapshots
    let spool_clone = spool.clone();
    let device_clone = device.clone();
    tokio::spawn(async move {
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
    let spool_sync = spool.clone();
    let sync_handle = tokio::spawn(async move {
        let mut syncer = Syncer::new();
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;

            if syncer.enrollment_required() {
                tracing::warn!("sync: el device necesita enrolarse; batches retenidos en el spool");
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                continue;
            }

            let batches = {
                let mut s = spool_sync.lock().await;
                s.next_batch(10).unwrap_or_default()
            };

            let mut retained = false;
            for batch in batches {
                let decision =
                    match serde_json::from_slice::<sc_core::IngestEnvelope>(&batch.payload) {
                        Ok(env) => client.post_envelope(&env).await,
                        // Un payload ilegible no se puede reintentar: va a dead-letter.
                        Err(_) => SyncDecision::InvalidContract,
                    };

                let applied = {
                    let mut s = spool_sync.lock().await;
                    syncer.apply(&mut s, batch.row_id, &decision)
                };

                match applied {
                    Ok(Applied::Confirmed) => {}
                    Ok(Applied::DeadLettered) => {
                        tracing::warn!(window_id = %batch.window_id, ?decision, "sync: batch a dead-letter");
                    }
                    Ok(Applied::EnrollmentRequired) => {
                        tracing::error!(window_id = %batch.window_id, "sync: 401/403, re-enrolar el device");
                        retained = true;
                        break;
                    }
                    Ok(Applied::Retained) => {
                        tracing::warn!(window_id = %batch.window_id, ?decision, "sync: batch retenido para reintento");
                        retained = true;
                        break;
                    }
                    Err(error) => {
                        tracing::error!(window_id = %batch.window_id, %error, "sync: no se pudo aplicar la decisión al spool");
                        retained = true;
                        break;
                    }
                }
            }

            if retained {
                tokio::time::sleep(syncer.delay()).await;
            }
        }
    });

    // Handle Ctrl+C for graceful shutdown
    tokio::select! {
        _ = signal::ctrl_c() => {
            tracing::info!("shutting down gracefully");
        }
        _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
            tracing::info!("timeout shutdown");
        }
    }
    sync_handle.abort();

    Ok(())
}
