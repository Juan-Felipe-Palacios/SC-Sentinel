//! Política de *peek* acotado (M6 · E4).
//!
//! Reglas del diseño (`m6-passive-ot-identification.md`, «Peek policy»): primer
//! paquete con payload por flujo y dirección, máximo 256 B, máximo dos intentos
//! por dirección para tolerar segmentación TCP, sin reassembly y sin volver a
//! parsear un flujo ya confirmado.
//!
//! La caché sigue el patrón de `sc-collector` (`TemplateCache`): `HashMap` por
//! clave más `BTreeMap` por tick para desalojar el menos usado en `O(log n)`,
//! reloj inyectable a través del `Instant` que recibe cada método.

use std::collections::{BTreeMap, HashMap};
use std::net::IpAddr;
use std::time::{Duration, Instant};

use crate::{Verdict, FLOW_CACHE_CAPACITY, PEEK_MAX_ATTEMPTS};

/// TTL por defecto del veredicto cacheado.
///
/// Supuesto, no medido: 5 minutos, alineado con la frescura de inventario que
/// fija el diseño. Sólo evita que un flujo muerto ocupe una entrada del LRU.
pub const DEFAULT_FLOW_TTL: Duration = Duration::from_secs(300);

/// Clave de flujo: 5-tupla con dirección.
///
/// El llamador usa `src`/`dst` tal como vienen del paquete, de modo que cada
/// dirección de la conversación tenga sus propios dos intentos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FlowKey {
    /// IP de origen.
    pub src: IpAddr,
    /// IP de destino.
    pub dst: IpAddr,
    /// Puerto de origen.
    pub src_port: u16,
    /// Puerto de destino.
    pub dst_port: u16,
    /// Transporte: 6 = TCP, 17 = UDP.
    pub transport: u8,
}

impl FlowKey {
    /// Valor de `transport` para TCP.
    pub const TCP: u8 = 6;
    /// Valor de `transport` para UDP.
    pub const UDP: u8 = 17;

    /// Construye una clave de flujo.
    pub fn new(src: IpAddr, dst: IpAddr, src_port: u16, dst_port: u16, transport: u8) -> Self {
        Self {
            src,
            dst,
            src_port,
            dst_port,
            transport,
        }
    }
}

/// Qué hacer cuando llega un paquete con payload de un flujo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeekDecision {
    /// Tomar hasta [`crate::PEEK_MAX_BYTES`] bytes y clasificarlos.
    Peek,
    /// Ya hay veredicto firme o se agotaron los intentos.
    Cached(Verdict),
}

#[derive(Debug, Clone, Copy)]
struct PeekEntry {
    verdict: Verdict,
    attempts: u8,
    inserted_at: Instant,
    tick: u64,
}

/// LRU acotado de veredictos por flujo, con intentos y TTL.
#[derive(Debug)]
pub struct PeekCache {
    capacity: usize,
    ttl: Duration,
    entries: HashMap<FlowKey, PeekEntry>,
    /// tick → clave, para encontrar el menos usado recientemente en `O(log n)`.
    order: BTreeMap<u64, FlowKey>,
    clock: u64,
}

impl PeekCache {
    /// Caché con la capacidad del diseño (4096 flujos) y el TTL por defecto.
    pub fn new() -> Self {
        Self::with_limits(FLOW_CACHE_CAPACITY, DEFAULT_FLOW_TTL)
    }

    /// Caché con capacidad y TTL explícitos (para pruebas y configuración).
    pub fn with_limits(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl,
            entries: HashMap::new(),
            order: BTreeMap::new(),
            clock: 0,
        }
    }

    /// Decide si hay que hacer *peek* o alcanza con el veredicto cacheado.
    ///
    /// Devuelve [`PeekDecision::Peek`] mientras no haya veredicto, el veredicto
    /// no sea `Confirmed` y queden intentos; en cualquier otro caso devuelve el
    /// veredicto cacheado.
    pub fn decide(&mut self, key: FlowKey, now: Instant) -> PeekDecision {
        let expired = match self.entries.get(&key) {
            None => return PeekDecision::Peek,
            Some(entry) => now.saturating_duration_since(entry.inserted_at) >= self.ttl,
        };
        if expired {
            self.remove(&key);
            return PeekDecision::Peek;
        }

        let (verdict, attempts) = match self.entries.get(&key) {
            Some(entry) => (entry.verdict, entry.attempts),
            None => return PeekDecision::Peek,
        };
        self.touch(key);

        if attempts >= PEEK_MAX_ATTEMPTS || verdict.is_confirmed() {
            PeekDecision::Cached(verdict)
        } else {
            PeekDecision::Peek
        }
    }

    /// Registra el resultado de un intento de *peek*.
    ///
    /// Suma un intento y conserva el mejor veredicto visto (`Confirmed` >
    /// `Probable` > `Reject`): un primer intento segmentado no borra lo que ya
    /// se sabía del flujo.
    pub fn record(&mut self, key: FlowKey, verdict: Verdict, now: Instant) {
        let known = self
            .entries
            .get_mut(&key)
            .map(|entry| {
                entry.attempts = entry.attempts.saturating_add(1).min(PEEK_MAX_ATTEMPTS);
                entry.verdict = prefer(entry.verdict, verdict);
            })
            .is_some();
        if known {
            self.touch(key);
            return;
        }

        while self.entries.len() >= self.capacity {
            if !self.evict_least_recently_used() {
                break;
            }
        }

        self.clock += 1;
        let tick = self.clock;
        self.entries.insert(
            key,
            PeekEntry {
                verdict,
                attempts: 1,
                inserted_at: now,
                tick,
            },
        );
        self.order.insert(tick, key);
    }

    /// Cantidad de flujos cacheados.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// `true` si la caché está vacía.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Capacidad máxima configurada.
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    fn touch(&mut self, key: FlowKey) {
        self.clock += 1;
        let tick = self.clock;
        if let Some(entry) = self.entries.get_mut(&key) {
            let previous = entry.tick;
            entry.tick = tick;
            self.order.remove(&previous);
            self.order.insert(tick, key);
        }
    }

    fn remove(&mut self, key: &FlowKey) {
        if let Some(entry) = self.entries.remove(key) {
            self.order.remove(&entry.tick);
        }
    }

    /// Descarta el flujo con el tick de uso más antiguo.
    fn evict_least_recently_used(&mut self) -> bool {
        while let Some((tick, key)) = self.order.pop_first() {
            let is_current = self
                .entries
                .get(&key)
                .is_some_and(|entry| entry.tick == tick);
            if is_current {
                self.entries.remove(&key);
                return true;
            }
        }
        false
    }
}

impl Default for PeekCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Jerarquía de veredictos: `Confirmed` > `Probable` > `Reject`.
fn prefer(current: Verdict, candidate: Verdict) -> Verdict {
    if rank(candidate) > rank(current) {
        candidate
    } else {
        current
    }
}

fn rank(verdict: Verdict) -> u8 {
    match verdict {
        Verdict::Confirmed(_) => 2,
        Verdict::Probable(_) => 1,
        Verdict::Reject => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Parsed, Protocol};

    fn key(port: u16) -> FlowKey {
        FlowKey::new(
            "10.0.0.1".parse().unwrap(),
            "10.0.0.2".parse().unwrap(),
            50000,
            port,
            FlowKey::TCP,
        )
    }

    fn confirmed() -> Verdict {
        Verdict::Confirmed(Parsed {
            protocol: Protocol::Modbus,
            fn_code: Some(3),
        })
    }

    fn probable() -> Verdict {
        Verdict::Probable(Parsed {
            protocol: Protocol::Modbus,
            fn_code: None,
        })
    }

    #[test]
    fn dos_intentos_y_luego_cacheado() {
        let now = Instant::now();
        let mut cache = PeekCache::new();
        let k = key(502);

        assert_eq!(cache.decide(k, now), PeekDecision::Peek);
        cache.record(k, probable(), now);
        assert_eq!(cache.decide(k, now), PeekDecision::Peek);
        cache.record(k, probable(), now);
        assert_eq!(cache.decide(k, now), PeekDecision::Cached(probable()));
    }

    #[test]
    fn confirmado_congela_el_flujo() {
        let now = Instant::now();
        let mut cache = PeekCache::new();
        let k = key(502);

        assert_eq!(cache.decide(k, now), PeekDecision::Peek);
        cache.record(k, confirmed(), now);
        assert_eq!(cache.decide(k, now), PeekDecision::Cached(confirmed()));
    }

    #[test]
    fn un_reject_no_borra_un_probable_anterior() {
        let now = Instant::now();
        let mut cache = PeekCache::new();
        let k = key(502);

        cache.record(k, probable(), now);
        cache.record(k, Verdict::Reject, now);
        assert_eq!(cache.decide(k, now), PeekDecision::Cached(probable()));
    }

    #[test]
    fn ttl_expira_el_veredicto() {
        let now = Instant::now();
        let mut cache = PeekCache::with_limits(8, Duration::from_secs(5));
        let k = key(502);

        cache.record(k, confirmed(), now);
        assert_eq!(cache.decide(k, now), PeekDecision::Cached(confirmed()));
        let later = now + Duration::from_secs(6);
        assert_eq!(cache.decide(k, later), PeekDecision::Peek);
        assert!(cache.is_empty());
    }

    #[test]
    fn capacidad_acotada_y_desaloja_el_mas_viejo() {
        let now = Instant::now();
        let mut cache = PeekCache::with_limits(2, DEFAULT_FLOW_TTL);

        cache.record(key(502), confirmed(), now);
        cache.record(key(102), confirmed(), now);
        cache.record(key(2404), confirmed(), now);

        assert_eq!(cache.len(), 2);
        assert_eq!(cache.capacity(), 2);
        assert_eq!(cache.decide(key(502), now), PeekDecision::Peek);
    }

    #[test]
    fn usa_marca_reciente_al_desenpalmar() {
        let now = Instant::now();
        let mut cache = PeekCache::with_limits(2, DEFAULT_FLOW_TTL);

        cache.record(key(502), confirmed(), now);
        cache.record(key(102), confirmed(), now);
        // key(502) pasa a ser el más reciente por el `decide`.
        assert_eq!(
            cache.decide(key(502), now),
            PeekDecision::Cached(confirmed())
        );
        cache.record(key(2404), confirmed(), now);

        assert_eq!(cache.len(), 2);
        assert_eq!(cache.decide(key(102), now), PeekDecision::Peek);
        assert_eq!(
            cache.decide(key(502), now),
            PeekDecision::Cached(confirmed())
        );
    }

    #[test]
    fn capacidad_por_defecto_es_la_del_diseno() {
        assert_eq!(PeekCache::new().capacity(), FLOW_CACHE_CAPACITY);
        assert_eq!(FLOW_CACHE_CAPACITY, 4096);
    }
}
