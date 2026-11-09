// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Listener UDP del colector.
//!
//! Cada puerto configurado tiene su propio socket y su propio [`ProtocolSet`]
//! (estado aislado para templates futuros). Los flujos parseados se empujan al
//! canal acotado del pipeline; si está lleno, se descartan y se cuentan, igual
//! que la captura pcap ante backpressure.

use crate::error::CollectorError;
use crate::metrics::CollectorMetrics;
use crate::protocol::{
    ProtocolFilter, ProtocolSet, DEFAULT_TEMPLATE_CAPACITY, DEFAULT_TEMPLATE_TTL,
};
use sc_capture::FlowProducer;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;
use tokio::task::JoinHandle;

/// Tamaño máximo de un datagrama UDP.
pub const MAX_DATAGRAM: usize = 65_535;
/// Puertos de exportación habituales: Cisco legacy, IPFIX estándar y MikroTik.
pub const DEFAULT_PORTS: [u16; 4] = [2055, 4739, 9995, 9996];
/// Pausa tras un error de socket para no girar en vacío si el error es persistente.
const RECV_ERROR_BACKOFF: Duration = Duration::from_millis(10);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectorConfig {
    /// Interfaz de escucha; `0.0.0.0` acepta exportadores de toda la red.
    pub bind_addr: IpAddr,
    pub listeners: Vec<ListenerConfig>,
    /// Templates recordados por cada socket (cada listener tiene su cache).
    pub template_cache_capacity: usize,
    pub template_cache_ttl_secs: u64,
}

/// Un socket UDP con su protocolo permitido. `port = 0` pide uno efímero (tests).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListenerConfig {
    pub port: u16,
    pub protocol: ProtocolFilter,
}

impl ListenerConfig {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            protocol: ProtocolFilter::Auto,
        }
    }

    pub fn with_protocol(mut self, protocol: ProtocolFilter) -> Self {
        self.protocol = protocol;
        self
    }
}

impl CollectorConfig {
    pub fn new(ports: impl IntoIterator<Item = u16>) -> Self {
        Self {
            bind_addr: IpAddr::V4(Ipv4Addr::UNSPECIFIED),
            listeners: ports.into_iter().map(ListenerConfig::new).collect(),
            template_cache_capacity: DEFAULT_TEMPLATE_CAPACITY,
            template_cache_ttl_secs: DEFAULT_TEMPLATE_TTL.as_secs(),
        }
    }

    pub fn with_bind_addr(mut self, addr: IpAddr) -> Self {
        self.bind_addr = addr;
        self
    }

    /// Aplica el protocolo a todos los listeners (útil en tests y despliegues
    /// de un solo formato).
    pub fn with_protocol(mut self, protocol: ProtocolFilter) -> Self {
        for listener in &mut self.listeners {
            listener.protocol = protocol;
        }
        self
    }

    pub fn with_template_cache(mut self, capacity: usize, ttl_secs: u64) -> Self {
        self.template_cache_capacity = capacity;
        self.template_cache_ttl_secs = ttl_secs;
        self
    }
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self::new(DEFAULT_PORTS)
    }
}

/// Socket ya abierto; expone la dirección real (útil con puerto efímero).
#[derive(Debug)]
pub struct BoundListener {
    socket: UdpSocket,
    local_addr: SocketAddr,
    protocol: ProtocolFilter,
    template_cache_capacity: usize,
    template_cache_ttl_secs: u64,
}

impl BoundListener {
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }
}

/// Abre un socket por puerto. Si uno falla, no se devuelve ninguno.
pub async fn bind_all(cfg: &CollectorConfig) -> Result<Vec<BoundListener>, CollectorError> {
    let mut listeners = Vec::with_capacity(cfg.listeners.len());
    for listener in &cfg.listeners {
        let addr = SocketAddr::new(cfg.bind_addr, listener.port);
        let socket = UdpSocket::bind(addr)
            .await
            .map_err(|source| CollectorError::Bind { addr, source })?;
        let local_addr = socket
            .local_addr()
            .map_err(|source| CollectorError::LocalAddr { source })?;
        listeners.push(BoundListener {
            socket,
            local_addr,
            protocol: listener.protocol,
            template_cache_capacity: cfg.template_cache_capacity,
            template_cache_ttl_secs: cfg.template_cache_ttl_secs,
        });
    }
    Ok(listeners)
}

/// Lanza una tarea de recepción por listener.
pub fn spawn_listeners(
    listeners: Vec<BoundListener>,
    producer: FlowProducer,
    metrics: Arc<CollectorMetrics>,
) -> Vec<JoinHandle<()>> {
    listeners
        .into_iter()
        .map(|listener| {
            let producer = producer.clone();
            let metrics = metrics.clone();
            tokio::spawn(serve(listener, producer, metrics))
        })
        .collect()
}

/// Bucle de recepción de un socket. Nunca termina por un datagrama inválido.
pub async fn serve(
    listener: BoundListener,
    producer: FlowProducer,
    metrics: Arc<CollectorMetrics>,
) {
    let BoundListener {
        socket,
        local_addr,
        protocol,
        template_cache_capacity,
        template_cache_ttl_secs,
    } = listener;
    let ttl = Duration::from_secs(template_cache_ttl_secs);
    let mut protocols = match protocol.kind() {
        Some(kind) => ProtocolSet::only(kind, template_cache_capacity, ttl),
        None => ProtocolSet::with_template_cache_limits(template_cache_capacity, ttl),
    };
    let mut buffer = vec![0u8; MAX_DATAGRAM];
    // Cada listener tiene su propia cache; se publica el delta acumulado para
    // que el contador global sume los templates de todos los puertos.
    let mut reported_templates = 0u64;

    tracing::info!(
        event = "collector_listening",
        %local_addr,
        protocol = %protocol,
        "colector UDP escuchando exportaciones de flujos"
    );

    loop {
        match socket.recv_from(&mut buffer).await {
            Ok((len, source)) => {
                metrics.packets_received.fetch_add(1, Ordering::Relaxed);
                metrics
                    .bytes_received
                    .fetch_add(len as u64, Ordering::Relaxed);

                match protocols.parse(source, &buffer[..len], now_nanos()) {
                    Ok(flows) => {
                        metrics
                            .flows_normalized
                            .fetch_add(flows.len() as u64, Ordering::Relaxed);
                        for flow in flows {
                            if producer.try_push(flow).is_err() {
                                metrics.packets_dropped.fetch_add(1, Ordering::Relaxed);
                            }
                        }
                    }
                    Err(error) => {
                        metrics.parse_errors.fetch_add(1, Ordering::Relaxed);
                        // debug, no warn: un exportador defectuoso no debe inundar logs.
                        tracing::debug!(
                            event = "collector_parse_error",
                            %source,
                            %local_addr,
                            %error,
                            len,
                            "datagrama de flujos descartado"
                        );
                    }
                }
            }
            Err(error) => {
                metrics.socket_errors.fetch_add(1, Ordering::Relaxed);
                tracing::warn!(
                    event = "collector_recv_error",
                    %local_addr,
                    %error,
                    "error recibiendo datagramas; el listener continúa"
                );
                tokio::time::sleep(RECV_ERROR_BACKOFF).await;
            }
        }

        let current_templates = protocols.cached_templates();
        if current_templates > reported_templates {
            metrics
                .templates_cached
                .fetch_add(current_templates - reported_templates, Ordering::Relaxed);
        } else if current_templates < reported_templates {
            metrics
                .templates_cached
                .fetch_sub(reported_templates - current_templates, Ordering::Relaxed);
        }
        reported_templates = current_templates;
    }
}

fn now_nanos() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{nf5_packet, Nf5Record};
    use sc_capture::CaptureChannelPair;
    use std::net::Ipv4Addr;

    async fn start_collector() -> (
        SocketAddr,
        tokio::sync::mpsc::Receiver<sc_capture::FlowUpdate>,
        Arc<CollectorMetrics>,
        Vec<JoinHandle<()>>,
    ) {
        let pair = CaptureChannelPair::new();
        let config = CollectorConfig::new([0]).with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST));
        let listeners = bind_all(&config).await.expect("bind en loopback");
        let addr = listeners[0].local_addr();
        let metrics = CollectorMetrics::new();
        let handles = spawn_listeners(listeners, pair.producer, metrics.clone());
        (addr, pair.channel.rx, metrics, handles)
    }

    fn nf5_datagram() -> Vec<u8> {
        nf5_packet(&[Nf5Record::default()], 1_700_000_000)
    }

    #[tokio::test]
    async fn recibe_udp_y_publica_flowupdate() {
        let (addr, mut rx, metrics, handles) = start_collector().await;
        let sender = UdpSocket::bind("127.0.0.1:0").await.expect("socket emisor");

        sender
            .send_to(&nf5_datagram(), addr)
            .await
            .expect("envío UDP");

        let update = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout esperando el flujo")
            .expect("canal abierto");

        assert_eq!(update.flow.dst_port, 443);
        assert_eq!(update.bytes, 1_500);

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.packets_received, 1);
        assert_eq!(snapshot.flows_normalized, 1);
        assert_eq!(snapshot.parse_errors, 0);

        for handle in handles {
            handle.abort();
        }
    }

    /// T4.1 (M4): enviar 1000 flows por UDP → los contadores del colector
    /// reflejan exactamente 1000 paquetes/flows recibidos y 0 errores.
    #[tokio::test]
    async fn mil_flows_incrementan_los_contadores_del_colector() {
        let (addr, mut rx, metrics, handles) = start_collector().await;
        let sender = UdpSocket::bind("127.0.0.1:0").await.expect("socket emisor");
        let datagram = nf5_datagram();

        for i in 0..1_000u32 {
            sender
                .send_to(&datagram, addr)
                .await
                .unwrap_or_else(|e| panic!("envío UDP #{i}: {e}"));
            // Drena en tandas para no llenar el buffer del socket UDP.
            if i % 50 == 49 {
                for _ in 0..50 {
                    tokio::time::timeout(Duration::from_secs(5), rx.recv())
                        .await
                        .expect("timeout esperando flujo")
                        .expect("canal abierto");
                }
            }
        }

        let snapshot = metrics.snapshot();
        assert_eq!(snapshot.packets_received, 1_000);
        assert_eq!(snapshot.flows_normalized, 1_000);
        assert_eq!(snapshot.parse_errors, 0);
        assert_eq!(snapshot.packets_dropped, 0);

        for handle in handles {
            handle.abort();
        }
    }

    #[tokio::test]
    async fn un_datagrama_malformado_no_tumba_el_listener() {
        let (addr, mut rx, metrics, handles) = start_collector().await;
        let sender = UdpSocket::bind("127.0.0.1:0").await.expect("socket emisor");

        sender.send_to(&[0x00, 0x05], addr).await.expect("basura");
        tokio::time::sleep(Duration::from_millis(50)).await;

        sender
            .send_to(&nf5_datagram(), addr)
            .await
            .expect("envío válido");
        let update = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout esperando el flujo tras la basura")
            .expect("canal abierto");

        assert_eq!(update.flow.protocol, sc_core::Protocol::Tcp);
        assert_eq!(metrics.snapshot().parse_errors, 1);

        for handle in handles {
            handle.abort();
        }
    }

    #[tokio::test]
    async fn puerto_ocupado_devuelve_error_de_bind() {
        let first =
            bind_all(&CollectorConfig::new([0]).with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST)))
                .await
                .expect("primer bind");
        let taken = first[0].local_addr();

        let second = CollectorConfig::new([taken.port()]).with_bind_addr(taken.ip());
        let error = bind_all(&second).await.expect_err("puerto ya ocupado");
        assert!(matches!(error, CollectorError::Bind { .. }));
        drop(first);
    }

    #[tokio::test]
    async fn config_por_defecto_escucha_los_puertos_habituales() {
        let config = CollectorConfig::default();
        let ports: Vec<u16> = config
            .listeners
            .iter()
            .map(|listener| listener.port)
            .collect();
        assert_eq!(ports, DEFAULT_PORTS.to_vec());
        assert_eq!(config.bind_addr, IpAddr::V4(Ipv4Addr::UNSPECIFIED));
        assert_eq!(config.template_cache_capacity, DEFAULT_TEMPLATE_CAPACITY);
        assert!(config
            .listeners
            .iter()
            .all(|l| l.protocol == ProtocolFilter::Auto));
    }

    #[tokio::test]
    async fn listener_con_filtro_v5_descarta_ipfix_sin_caer() {
        let pair = CaptureChannelPair::new();
        let config = CollectorConfig::new([0])
            .with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST))
            .with_protocol(ProtocolFilter::NetFlowV5);
        let listeners = bind_all(&config).await.expect("bind en loopback");
        let addr = listeners[0].local_addr();
        let metrics = CollectorMetrics::new();
        let handles = spawn_listeners(listeners, pair.producer, metrics.clone());
        let mut rx = pair.channel.rx;
        let sender = UdpSocket::bind("127.0.0.1:0").await.expect("socket emisor");

        let ipfix = crate::fixtures::ipfix_packet(&[], 1_700_000_000);
        sender.send_to(&ipfix, addr).await.expect("envío IPFIX");
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(metrics.snapshot().parse_errors, 1);

        sender
            .send_to(&nf5_datagram(), addr)
            .await
            .expect("envío v5");
        let update = tokio::time::timeout(Duration::from_secs(2), rx.recv())
            .await
            .expect("timeout esperando el flujo v5")
            .expect("canal abierto");
        assert_eq!(update.flow.dst_port, 443);

        for handle in handles {
            handle.abort();
        }
    }
}
