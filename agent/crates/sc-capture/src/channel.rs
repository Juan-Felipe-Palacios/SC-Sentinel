// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::flow::FlowUpdate;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

pub const CHANNEL_CAPACITY: usize = 10_000;

#[derive(Clone)]
pub struct FlowProducer {
    tx: mpsc::Sender<FlowUpdate>,
    drops: Arc<AtomicU64>,
    sent: Arc<AtomicU64>,
}

impl FlowProducer {
    pub fn try_push(&self, u: FlowUpdate) -> Result<(), mpsc::error::TrySendError<FlowUpdate>> {
        match self.tx.try_send(u) {
            Ok(()) => {
                self.sent.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }
            Err(mpsc::error::TrySendError::Full(v)) => {
                self.drops.fetch_add(1, Ordering::Relaxed);
                Err(mpsc::error::TrySendError::Full(v))
            }
            Err(e) => Err(e),
        }
    }
}

pub struct CaptureChannel {
    pub rx: mpsc::Receiver<FlowUpdate>,
    pub drops: Arc<AtomicU64>,
    pub sent: Arc<AtomicU64>,
    /// Paquetes crudos leídos de la interfaz (incluye los que no generan flow).
    pub packets_seen: Arc<AtomicU64>,
    /// Paquetes que el parser rechazó.
    pub parse_errors: Arc<AtomicU64>,
}

impl Default for CaptureChannel {
    fn default() -> Self {
        let (tx, rx) = mpsc::channel::<FlowUpdate>(CHANNEL_CAPACITY);
        let drops = Arc::new(AtomicU64::new(0));
        let sent = Arc::new(AtomicU64::new(0));
        let packets_seen = Arc::new(AtomicU64::new(0));
        let parse_errors = Arc::new(AtomicU64::new(0));
        let _tx = tx;
        CaptureChannel {
            rx,
            drops,
            sent,
            packets_seen,
            parse_errors,
        }
    }
}

impl CaptureChannel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn producer(&self) -> FlowProducer {
        unimplemented!("use new_pair instead")
    }
}

pub struct CaptureChannelPair {
    pub channel: CaptureChannel,
    pub producer: FlowProducer,
}

impl CaptureChannelPair {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<FlowUpdate>(CHANNEL_CAPACITY);
        let drops = Arc::new(AtomicU64::new(0));
        let sent = Arc::new(AtomicU64::new(0));
        let packets_seen = Arc::new(AtomicU64::new(0));
        let parse_errors = Arc::new(AtomicU64::new(0));
        CaptureChannelPair {
            channel: CaptureChannel {
                rx,
                drops: drops.clone(),
                sent: sent.clone(),
                packets_seen,
                parse_errors,
            },
            producer: FlowProducer { tx, drops, sent },
        }
    }
}

impl Default for CaptureChannelPair {
    fn default() -> Self {
        Self::new()
    }
}

// For backward compatibility with the API shape in plan
impl CaptureChannel {
    pub fn new_with_pair() -> CaptureChannelPair {
        CaptureChannelPair::new()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::flow::{Direction, FlowUpdate};
    use sc_core::{FlowKey, Protocol};

    #[tokio::test]
    async fn test_backpressure_full_channel() {
        let pair = CaptureChannelPair::new();
        // Fill the channel
        for i in 0..CHANNEL_CAPACITY {
            let flow = FlowKey {
                src_ip: i as u128,
                dst_ip: 1,
                src_port: 80,
                dst_port: 443,
                protocol: Protocol::Tcp,
            };
            let update = FlowUpdate {
                ts: 0,
                flow,
                bytes: 100,
                packets: 1,
                direction: Direction::Out,
            };
            assert!(pair.producer.try_push(update).is_ok());
        }
        // Next push should fail with Full and increment drops
        let flow = FlowKey {
            src_ip: 9999,
            dst_ip: 1,
            src_port: 80,
            dst_port: 443,
            protocol: Protocol::Tcp,
        };
        let update = FlowUpdate {
            ts: 0,
            flow,
            bytes: 100,
            packets: 1,
            direction: Direction::Out,
        };
        assert!(pair.producer.try_push(update).is_err());
        assert_eq!(pair.channel.drops.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn test_drain_frees_space() {
        let mut pair = CaptureChannelPair::new();
        // Fill channel
        for i in 0..CHANNEL_CAPACITY {
            let flow = FlowKey {
                src_ip: i as u128,
                dst_ip: 1,
                src_port: 80,
                dst_port: 443,
                protocol: Protocol::Tcp,
            };
            let update = FlowUpdate {
                ts: 0,
                flow,
                bytes: 100,
                packets: 1,
                direction: Direction::Out,
            };
            let _ = pair.producer.try_push(update);
        }
        // Drain one
        let _ = pair.channel.rx.try_recv();
        // Should be able to push again
        let flow = FlowKey {
            src_ip: 9999,
            dst_ip: 1,
            src_port: 80,
            dst_port: 443,
            protocol: Protocol::Tcp,
        };
        let update = FlowUpdate {
            ts: 0,
            flow,
            bytes: 100,
            packets: 1,
            direction: Direction::Out,
        };
        assert!(pair.producer.try_push(update).is_ok());
    }

    #[tokio::test]
    async fn test_sent_counter() {
        let mut pair = CaptureChannelPair::new();
        let count = 100;
        for i in 0..count {
            let flow = FlowKey {
                src_ip: i as u128,
                dst_ip: 1,
                src_port: 80,
                dst_port: 443,
                protocol: Protocol::Tcp,
            };
            let update = FlowUpdate {
                ts: 0,
                flow,
                bytes: 100,
                packets: 1,
                direction: Direction::Out,
            };
            let _ = pair.producer.try_push(update);
        }
        // Drain them
        for _ in 0..count {
            let _ = pair.channel.rx.try_recv();
        }
        assert_eq!(pair.channel.sent.load(Ordering::Relaxed), count as u64);
    }
}
