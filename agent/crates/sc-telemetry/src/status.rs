// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Endpoint de estado local para la GUI de administración (`sc-gui`).
//!
//! Escucha **solo** en loopback: no hay autenticación, así que la única
//! defensa es que el socket no salga del equipo. `StatusServer::bind` rechaza
//! cualquier dirección no loopback (incluida `0.0.0.0`) y el puerto se fija en
//! 8387 para que la GUI no tenga que descubrirlo.
//!
//! El JSON no incluye el token ni la URL de ingesta: `device_id` basta para
//! que la GUI muestre qué device está publicando. Los secretos viven solo en
//! el `Environment` del servicio.

use crate::HealthRegistry;
use chrono::{SecondsFormat, TimeZone, Utc};
use http_body_util::Full;
use hyper::body::{Bytes, Incoming};
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Serialize;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

/// Dirección fija del endpoint. Loopback por diseño (spec §19).
pub const STATUS_ADDR: &str = "127.0.0.1:8387";

const CONTENT_TYPE_JSON: &str = "application/json";

/// Fallos al publicar el endpoint.
#[derive(Debug)]
pub enum StatusError {
    /// La dirección pedida no es loopback: el endpoint no tiene autenticación.
    NotLoopback(SocketAddr),
    /// El socket no se pudo abrir (puerto ocupado, permisos).
    Bind {
        addr: SocketAddr,
        source: std::io::Error,
    },
}

impl std::fmt::Display for StatusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StatusError::NotLoopback(addr) => write!(
                f,
                "el endpoint de estado solo puede escuchar en loopback; se pidió {addr}"
            ),
            StatusError::Bind { addr, source } => {
                write!(
                    f,
                    "no se pudo abrir el endpoint de estado en {addr}: {source}"
                )
            }
        }
    }
}

impl std::error::Error for StatusError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            StatusError::Bind { source, .. } => Some(source),
            StatusError::NotLoopback(_) => None,
        }
    }
}

/// Cuerpo de `GET /status`. Contrato estable de `/status`; sc-gui lo consume
/// por polling (F3) y deserializa con valores por defecto, así que añadir
/// campos aquí no rompe a un cliente anterior.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AgentStatus {
    pub agent_version: String,
    pub device_id: String,
    /// `ok` (captura o colector activos) o `disabled` (modo collector-only).
    pub capture_status: String,
    pub packets_seen: u64,
    pub packets_dropped: u64,
    pub parse_errors: u64,
    pub queue_depth: u64,
    pub spool_bytes: u64,
    pub last_error: Option<String>,
    pub collector_ports: Vec<u16>,
    pub geo_loaded: bool,
    pub last_sync_at: Option<String>,
    /// `running` mientras el endpoint responda; el estado real del SCM lo
    /// consulta la GUI con `QueryServiceStatus` (F3), porque si el servicio
    /// está detenido no hay proceso que pueda contestar aquí.
    pub service_state: String,
    /// `service` (lanzado por el SCM) o `console` (CLI interactivo).
    pub mode: String,
    /// Segundos desde el arranque **del proceso** (se reinicia con el servicio).
    /// Opcional: un agente anterior no lo envía y la GUI muestra «—».
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_seconds: Option<u64>,
    /// Interfaz de captura que el agente tiene en memoria (`--interface`).
    /// `None` en modo colector puro o con `--offline`/`--fixture`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interface: Option<String>,
}

/// Datos que no cambian mientras el agente corre.
#[derive(Debug, Clone)]
pub struct StatusConfig {
    pub agent_version: String,
    pub device_id: String,
    pub mode: String,
    pub capture_enabled: bool,
    pub collector_ports: Vec<u16>,
    pub geo_loaded: bool,
    /// Interfaz pasada por `--interface`; `None` si no hay captura live.
    pub interface: Option<String>,
}

/// Estado compartido entre el agente y el endpoint.
#[derive(Debug)]
pub struct StatusShared {
    health: Arc<HealthRegistry>,
    config: StatusConfig,
    /// Segundos unix del último 2xx; 0 = nunca sincronizó.
    last_sync_unix: AtomicI64,
    last_sync_window: Mutex<Option<String>>,
    /// Segundos unix del arranque del proceso: base del uptime de `/status`.
    started_unix: i64,
}

impl StatusShared {
    pub fn new(health: Arc<HealthRegistry>, config: StatusConfig) -> Arc<Self> {
        Arc::new(Self {
            health,
            config,
            last_sync_unix: AtomicI64::new(0),
            last_sync_window: Mutex::new(None),
            started_unix: Utc::now().timestamp(),
        })
    }

    /// Registra una ventana confirmada por el backend (solo un 2xx llega acá).
    pub fn note_sync(&self, window_id: &str) {
        self.last_sync_unix
            .store(Utc::now().timestamp(), Ordering::Relaxed);
        if let Ok(mut slot) = self.last_sync_window.lock() {
            *slot = Some(window_id.to_string());
        }
    }

    pub fn report(&self) -> AgentStatus {
        let health = self.health.snapshot();
        AgentStatus {
            agent_version: self.config.agent_version.clone(),
            device_id: self.config.device_id.clone(),
            capture_status: if self.config.capture_enabled {
                "ok".to_string()
            } else {
                "disabled".to_string()
            },
            packets_seen: health.packets_seen,
            packets_dropped: health.packets_dropped,
            parse_errors: health.parse_errors,
            queue_depth: health.queue_depth.unwrap_or(0),
            spool_bytes: health.spool_bytes.unwrap_or(0),
            last_error: health.last_error,
            collector_ports: self.config.collector_ports.clone(),
            geo_loaded: self.config.geo_loaded,
            last_sync_at: self.last_sync_at(),
            service_state: "running".to_string(),
            mode: self.config.mode.clone(),
            uptime_seconds: Some(self.uptime_seconds()),
            interface: self.config.interface.clone(),
        }
    }

    /// Segundos desde el arranque del proceso (nunca negativo si el reloj salta).
    fn uptime_seconds(&self) -> u64 {
        Utc::now()
            .timestamp()
            .saturating_sub(self.started_unix)
            .max(0) as u64
    }

    fn last_sync_at(&self) -> Option<String> {
        let secs = self.last_sync_unix.load(Ordering::Relaxed);
        if secs <= 0 {
            return None;
        }
        Utc.timestamp_opt(secs, 0)
            .single()
            .map(|dt| dt.to_rfc3339_opts(SecondsFormat::Millis, true))
    }
}

/// Servidor HTTP mínimo de la GUI (un solo hilo de aceptación + una tarea por
/// conexión). Se apaga solo cuando cae el proceso del agente.
#[derive(Debug)]
pub struct StatusServer {
    addr: SocketAddr,
    handle: JoinHandle<()>,
}

impl StatusServer {
    /// Abre el socket. Rechaza cualquier dirección que no sea loopback: el
    /// endpoint no tiene autenticación y no debe ser alcanzable desde la red.
    pub async fn bind(addr: SocketAddr, shared: Arc<StatusShared>) -> Result<Self, StatusError> {
        if !addr.ip().is_loopback() {
            return Err(StatusError::NotLoopback(addr));
        }
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|source| StatusError::Bind { addr, source })?;
        let addr = listener
            .local_addr()
            .map_err(|source| StatusError::Bind { addr, source })?;
        let handle = tokio::spawn(accept_loop(listener, shared));
        Ok(Self { addr, handle })
    }

    /// Dirección real (útil cuando se pidió el puerto 0 en pruebas).
    pub fn local_addr(&self) -> SocketAddr {
        self.addr
    }

    /// Corta el endpoint (apagado ordenado del agente).
    pub fn stop(&self) {
        self.handle.abort();
    }
}

async fn accept_loop(listener: TcpListener, shared: Arc<StatusShared>) {
    loop {
        match listener.accept().await {
            Ok((stream, _peer)) => {
                let shared = shared.clone();
                tokio::spawn(async move {
                    let io = TokioIo::new(stream);
                    let service = service_fn(move |request| {
                        let shared = shared.clone();
                        async move { respond(request, shared).await }
                    });
                    // Un cliente que corta la conexión no debe dejar ruido en el log.
                    let _ = hyper::server::conn::http1::Builder::new()
                        .serve_connection(io, service)
                        .await;
                });
            }
            Err(_) => {
                // Sin este respiro, un error persistente de `accept` giraría en
                // vacío gastando CPU.
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

async fn respond(
    request: Request<Incoming>,
    shared: Arc<StatusShared>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let is_status = request.uri().path() == "/status";
    let is_get = request.method() == Method::GET;

    let response = match (is_status, is_get) {
        (true, true) => {
            let body = serde_json::to_vec(&shared.report())
                .unwrap_or_else(|_| br#"{"error":"serialization_failed"}"#.to_vec());
            json(StatusCode::OK, body)
        }
        (true, false) => json(
            StatusCode::METHOD_NOT_ALLOWED,
            br#"{"error":"method_not_allowed"}"#.to_vec(),
        ),
        // Cualquier otra ruta es 404, incluso con el método correcto.
        (false, _) => json(StatusCode::NOT_FOUND, br#"{"error":"not_found"}"#.to_vec()),
    };

    Ok(response)
}

fn json(status: StatusCode, body: Vec<u8>) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", CONTENT_TYPE_JSON)
        .header("cache-control", "no-store")
        .header("connection", "close")
        .body(Full::new(Bytes::from(body)))
        .expect("respuesta JSON bien formada")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::HealthRegistry;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn shared() -> Arc<StatusShared> {
        let health = HealthRegistry::new();
        health.packets_seen.store(1_682_219, Ordering::Relaxed);
        health.packets_dropped.store(0, Ordering::Relaxed);
        health.parse_errors.store(3, Ordering::Relaxed);
        health.queue_depth.store(3, Ordering::Relaxed);
        health.spool_bytes.store(0, Ordering::Relaxed);
        StatusShared::new(
            health,
            StatusConfig {
                agent_version: "0.1.5".to_string(),
                device_id: "dev_fe4b1eb6".to_string(),
                mode: "service".to_string(),
                capture_enabled: false,
                collector_ports: vec![2056, 4739],
                geo_loaded: true,
                interface: None,
            },
        )
    }

    fn config_for(addr: &str) -> SocketAddr {
        addr.parse().expect("dirección de prueba")
    }

    #[test]
    fn report_serializa_los_campos_del_contrato_y_ningun_secreto() {
        let status = shared();
        status.note_sync("win_000000006af60b99");
        let json = serde_json::to_string(&status.report()).unwrap();

        for field in [
            "agent_version",
            "device_id",
            "capture_status",
            "packets_seen",
            "packets_dropped",
            "parse_errors",
            "queue_depth",
            "spool_bytes",
            "last_error",
            "collector_ports",
            "geo_loaded",
            "last_sync_at",
            "service_state",
            "uptime_seconds",
        ] {
            assert!(json.contains(field), "falta {field} en {json}");
        }
        assert!(!json.to_lowercase().contains("token"));
        assert!(!json.contains("sc_dev_"));
        assert!(json.contains("\"packets_seen\":1682219"));
        assert!(json.contains("\"collector_ports\":[2056,4739]"));
        assert!(json.contains("\"capture_status\":\"disabled\""));
        assert!(json.contains("\"last_sync_at\":\""));
    }

    #[test]
    fn la_interfaz_se_omite_cuando_no_hay_captura_live() {
        let json = serde_json::to_string(&shared().report()).unwrap();
        assert!(
            !json.contains("\"interface\""),
            "sin interfaz no debe aparecer: {json}"
        );
    }

    #[test]
    fn la_interfaz_se_publica_si_el_agente_la_tiene_en_memoria() {
        let config = StatusConfig {
            agent_version: "0.1.5".to_string(),
            device_id: "dev_x".to_string(),
            mode: "service".to_string(),
            capture_enabled: true,
            collector_ports: Vec::new(),
            geo_loaded: false,
            interface: Some("\\\\Device\\\\NPF_{GUID}".to_string()),
        };
        let status = StatusShared::new(Arc::new(HealthRegistry::default()), config);
        let json = serde_json::to_string(&status.report()).unwrap();
        assert!(json.contains("NPF_{GUID}"), "{json}");

        // Y con uptime: es un número, no un nulo.
        let uptime = status.report().uptime_seconds.unwrap();
        assert!(
            uptime < 5,
            "un agente recién arrancado no puede llevar {uptime} s"
        );
    }

    #[test]
    fn sin_sync_reporta_last_sync_at_nulo() {
        let status = shared();
        assert!(status.report().last_sync_at.is_none());
        assert!(serde_json::to_string(&status.report())
            .unwrap()
            .contains("\"last_sync_at\":null"));
    }

    #[tokio::test]
    async fn bind_rechaza_0_0_0_0() {
        let error = StatusServer::bind(config_for("0.0.0.0:8387"), shared())
            .await
            .expect_err("0.0.0.0 no debe aceptarse");
        assert!(matches!(error, StatusError::NotLoopback(_)));
        assert!(error.to_string().contains("loopback"));
    }

    #[tokio::test]
    async fn bind_rechaza_una_ip_de_la_red_local() {
        let error = StatusServer::bind(config_for("192.168.1.10:8387"), shared())
            .await
            .expect_err("una IP de LAN no debe aceptarse");
        assert!(matches!(error, StatusError::NotLoopback(_)));
    }

    #[tokio::test]
    async fn sirve_status_y_404_en_el_resto() {
        let server = StatusServer::bind(config_for("127.0.0.1:0"), shared())
            .await
            .expect("loopback debe abrir");
        let addr = server.local_addr();

        let (status, body) = request(addr, "GET /status HTTP/1.1").await;
        assert_eq!(status, 200);
        assert!(body.contains("\"device_id\":\"dev_fe4b1eb6\""));
        assert!(body.contains("\"service_state\":\"running\""));

        let (status, body) = request(addr, "GET /otra HTTP/1.1").await;
        assert_eq!(status, 404);
        assert!(body.contains("not_found"));

        let (status, _) = request(addr, "POST /status HTTP/1.1").await;
        assert_eq!(status, 405);

        server.stop();
    }

    async fn request(addr: SocketAddr, request_line: &str) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(addr)
            .await
            .expect("conexión");
        let raw = format!("{request_line}\r\nhost: {addr}\r\nconnection: close\r\n\r\n");
        stream.write_all(raw.as_bytes()).await.expect("escritura");
        let mut response = String::new();
        stream.read_to_string(&mut response).await.expect("lectura");
        let status = response
            .split_whitespace()
            .nth(1)
            .and_then(|code| code.parse().ok())
            .expect("código de estado");
        (status, response)
    }
}
