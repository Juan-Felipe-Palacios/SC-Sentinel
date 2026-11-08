// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Facade de arranque del colector para el agente.
//!
//! `Collector::start` abre todos los sockets antes de lanzar tareas: si un
//! puerto falla no queda un colector a medias. El [`CollectorHandle`] permite
//! cortar los listeners y esperar a que liberen sus sockets al apagar.

use crate::error::CollectorError;
use crate::listener::{bind_all, spawn_listeners, CollectorConfig};
use crate::metrics::CollectorMetrics;
use sc_capture::FlowProducer;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::task::JoinHandle;

pub struct Collector {
    config: CollectorConfig,
    producer: FlowProducer,
    metrics: Arc<CollectorMetrics>,
}

impl Collector {
    pub fn new(
        config: CollectorConfig,
        producer: FlowProducer,
        metrics: Arc<CollectorMetrics>,
    ) -> Self {
        Self {
            config,
            producer,
            metrics,
        }
    }

    pub fn config(&self) -> &CollectorConfig {
        &self.config
    }

    /// Abre los sockets y deja una tarea de recepción por listener.
    pub async fn start(self) -> Result<CollectorHandle, CollectorError> {
        let listeners = bind_all(&self.config).await?;
        let local_addrs = listeners
            .iter()
            .map(|listener| listener.local_addr())
            .collect();
        let tasks = spawn_listeners(listeners, self.producer, self.metrics);
        Ok(CollectorHandle { local_addrs, tasks })
    }
}

pub struct CollectorHandle {
    local_addrs: Vec<SocketAddr>,
    tasks: Vec<JoinHandle<()>>,
}

impl CollectorHandle {
    /// Direcciones reales ya abiertas (con puerto resuelto si se pidió 0).
    pub fn local_addrs(&self) -> &[SocketAddr] {
        &self.local_addrs
    }

    /// Aborta y espera cada listener: al terminar, los sockets y las caches de
    /// templates quedan liberados.
    pub async fn shutdown(self) {
        for task in self.tasks {
            task.abort();
            let _ = task.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sc_capture::CaptureChannelPair;
    use std::net::{IpAddr, Ipv4Addr};

    #[tokio::test]
    async fn arranca_un_listener_y_lo_cierra() {
        let pair = CaptureChannelPair::new();
        let config = CollectorConfig::new([0])
            .with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST))
            .with_template_cache(1_000, 60);
        let collector = Collector::new(config, pair.producer, CollectorMetrics::new());

        let handle = collector.start().await.expect("bind en loopback");
        assert_eq!(handle.local_addrs().len(), 1);
        assert_ne!(handle.local_addrs()[0].port(), 0);
        handle.shutdown().await;
    }

    #[tokio::test]
    async fn un_puerto_ocupado_falla_antes_de_lanzar_tareas() {
        let pair = CaptureChannelPair::new();
        let config = CollectorConfig::new([0]).with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST));
        let first = Collector::new(
            config.clone(),
            pair.producer.clone(),
            CollectorMetrics::new(),
        )
        .start()
        .await
        .expect("primer colector");
        let taken = first.local_addrs()[0].port();

        let second = Collector::new(
            CollectorConfig::new([taken]).with_bind_addr(IpAddr::V4(Ipv4Addr::LOCALHOST)),
            pair.producer,
            CollectorMetrics::new(),
        );
        assert!(second.start().await.is_err());

        first.shutdown().await;
    }
}
