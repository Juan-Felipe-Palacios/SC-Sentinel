// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Templates dinámicos de NetFlow v9 e IPFIX.
//!
//! Un template describe qué Information Elements (IEs) trae cada registro y
//! con qué longitud. La cache se indexa por `(IP del exportador, template ID)`
//! y está acotada en entradas (LRU) y en tiempo (TTL), para que un exportador
//! defectuoso o comprometido no pueda crecer la memoria del agente.
//!
//! No se usa el crate `lru`: la implementación interna (HashMap + BTreeMap por
//! tick de acceso) evita una dependencia en el camino crítico y permite
//! inyectar el reloj en los tests para verificar la expiración sin dormir.

use crate::error::ParseError;
use std::collections::{BTreeMap, HashMap};
use std::net::IpAddr;
use std::time::{Duration, Instant};

/// Capacidad por defecto por listener (ADR-0014 §6).
pub const DEFAULT_TEMPLATE_CAPACITY: usize = 10_000;
/// Vida por defecto de un template: los exportadores lo refrescan mucho antes.
pub const DEFAULT_TEMPLATE_TTL: Duration = Duration::from_secs(3_600);
/// Longitud de campo que marca un IE de longitud variable (RFC 7011 §3.2).
pub const VARIABLE_LENGTH: u16 = 65_535;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TemplateKey {
    pub source: IpAddr,
    pub template_id: u16,
}

impl TemplateKey {
    pub fn new(source: IpAddr, template_id: u16) -> Self {
        Self {
            source,
            template_id,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FieldSpec {
    /// IE estándar, sin el bit de empresa (bit 15 de IPFIX).
    pub id: u16,
    /// Longitud declarada; [`VARIABLE_LENGTH`] en IPFIX.
    pub length: u16,
    /// Private Enterprise Number cuando el bit de empresa está activo.
    pub enterprise: Option<u32>,
}

impl FieldSpec {
    pub fn standard(id: u16, length: u16) -> Self {
        Self {
            id,
            length,
            enterprise: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Template {
    pub id: u16,
    pub fields: Vec<FieldSpec>,
    /// Campos de scope de un options template (preceden a los de opción).
    pub scope_count: usize,
    /// Los options templates describen metadatos, no flujos: su data se ignora.
    pub is_options: bool,
    fixed_len: usize,
    variable_fields: usize,
}

impl Template {
    pub fn new(
        id: u16,
        fields: Vec<FieldSpec>,
        scope_count: usize,
        is_options: bool,
    ) -> Result<Self, ParseError> {
        if fields.is_empty() || fields.iter().any(|field| field.length == 0) {
            return Err(ParseError::InvalidTemplate(id));
        }

        let mut fixed_len = 0usize;
        let mut variable_fields = 0usize;
        for field in &fields {
            if field.length == VARIABLE_LENGTH {
                variable_fields += 1;
            } else {
                fixed_len = fixed_len
                    .checked_add(field.length as usize)
                    .ok_or(ParseError::InvalidTemplate(id))?;
            }
        }

        Ok(Self {
            id,
            fields,
            scope_count,
            is_options,
            fixed_len,
            variable_fields,
        })
    }

    /// Longitud de un registro fijo, o `None` si el template tiene IEs variables.
    pub fn fixed_record_len(&self) -> Option<usize> {
        (self.variable_fields == 0).then_some(self.fixed_len)
    }

    /// Mínimo de bytes que puede ocupar un registro (cada IE variable, 1 byte).
    pub fn min_record_len(&self) -> usize {
        self.fixed_len + self.variable_fields
    }
}

#[derive(Debug)]
struct CacheEntry {
    template: Template,
    inserted_at: Instant,
    tick: u64,
}

/// Cache LRU acotada con expiración por antigüedad de inserción.
#[derive(Debug)]
pub struct TemplateCache {
    capacity: usize,
    ttl: Duration,
    entries: HashMap<TemplateKey, CacheEntry>,
    /// tick → clave, para encontrar el menos usado en O(log n).
    order: BTreeMap<u64, TemplateKey>,
    clock: u64,
}

impl TemplateCache {
    pub fn new() -> Self {
        Self::with_limits(DEFAULT_TEMPLATE_CAPACITY, DEFAULT_TEMPLATE_TTL)
    }

    pub fn with_limits(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl,
            entries: HashMap::new(),
            order: BTreeMap::new(),
            clock: 0,
        }
    }

    pub fn insert(&mut self, key: TemplateKey, template: Template, now: Instant) {
        if self.entries.contains_key(&key) {
            self.remove(&key);
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
            CacheEntry {
                template,
                inserted_at: now,
                tick,
            },
        );
        self.order.insert(tick, key);
    }

    /// Devuelve el template vigente y lo marca como usado.
    pub fn get(&mut self, key: TemplateKey, now: Instant) -> Option<&Template> {
        let expired = {
            let entry = self.entries.get(&key)?;
            now.saturating_duration_since(entry.inserted_at) >= self.ttl
        };
        if expired {
            self.remove(&key);
            return None;
        }

        self.touch(key);
        self.entries.get(&key).map(|entry| &entry.template)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn touch(&mut self, key: TemplateKey) {
        self.clock += 1;
        let tick = self.clock;
        if let Some(entry) = self.entries.get_mut(&key) {
            let previous = entry.tick;
            entry.tick = tick;
            self.order.remove(&previous);
            self.order.insert(tick, key);
        }
    }

    fn remove(&mut self, key: &TemplateKey) {
        if let Some(entry) = self.entries.remove(key) {
            self.order.remove(&entry.tick);
        }
    }

    /// Descarta el template con el tick de uso más antiguo.
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

impl Default for TemplateCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    fn ip(last: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(10, 0, 0, last))
    }

    fn template(id: u16) -> Template {
        Template::new(
            id,
            vec![FieldSpec::standard(8, 4), FieldSpec::standard(1, 8)],
            0,
            false,
        )
        .expect("template válido")
    }

    #[test]
    fn inserta_y_recupera_por_origen_y_id() {
        let now = Instant::now();
        let mut cache = TemplateCache::new();
        let key = TemplateKey::new(ip(1), 256);
        cache.insert(key, template(256), now);

        assert!(cache.get(key, now).is_some());
        assert!(cache.get(TemplateKey::new(ip(2), 256), now).is_none());
        assert!(cache.get(TemplateKey::new(ip(1), 257), now).is_none());
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn ttl_expirado_produce_miss_y_libera_la_entrada() {
        let now = Instant::now();
        let ttl = Duration::from_secs(60);
        let mut cache = TemplateCache::with_limits(10, ttl);
        let key = TemplateKey::new(ip(1), 300);
        cache.insert(key, template(300), now);

        assert!(cache.get(key, now + ttl - Duration::from_secs(1)).is_some());
        assert!(cache.get(key, now + ttl).is_none());
        assert!(cache.is_empty(), "el template expirado se elimina");
    }

    #[test]
    fn evicta_el_menos_usado_al_superar_la_capacidad() {
        let now = Instant::now();
        let mut cache = TemplateCache::with_limits(2, DEFAULT_TEMPLATE_TTL);
        let a = TemplateKey::new(ip(1), 256);
        let b = TemplateKey::new(ip(1), 257);
        let c = TemplateKey::new(ip(1), 258);

        cache.insert(a, template(256), now);
        cache.insert(b, template(257), now);
        assert!(cache.get(a, now).is_some(), "a pasa a ser el más reciente");

        cache.insert(c, template(258), now);

        assert!(cache.get(a, now).is_some(), "a sobrevive por el acceso");
        assert!(cache.get(c, now).is_some(), "c es la inserción nueva");
        assert!(
            cache.get(b, now).is_none(),
            "b era el menos usado y se evicta"
        );
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn reinsertar_un_template_lo_actualiza_sin_crecer() {
        let now = Instant::now();
        let mut cache = TemplateCache::with_limits(2, DEFAULT_TEMPLATE_TTL);
        let key = TemplateKey::new(ip(1), 256);
        cache.insert(key, template(256), now);

        let actualizado = Template::new(
            256,
            vec![FieldSpec::standard(27, 16), FieldSpec::standard(1, 8)],
            0,
            false,
        )
        .expect("template válido");
        cache.insert(key, actualizado, now);

        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get(key, now).expect("vigente").fields[0].id, 27);
    }

    #[test]
    fn cien_mil_templates_quedan_acotados_por_la_capacidad() {
        let now = Instant::now();
        let capacity = 10_000;
        let mut cache = TemplateCache::with_limits(capacity, DEFAULT_TEMPLATE_TTL);

        for index in 0..100_000u32 {
            let source = IpAddr::V4(Ipv4Addr::from(index.to_be_bytes()));
            cache.insert(
                TemplateKey::new(source, (index % 60_000) as u16 + 256),
                template(256),
                now,
            );
        }

        assert_eq!(cache.len(), capacity);
    }

    #[test]
    fn template_sin_campos_es_invalido() {
        assert_eq!(
            Template::new(256, vec![], 0, false),
            Err(ParseError::InvalidTemplate(256))
        );
        assert_eq!(
            Template::new(256, vec![FieldSpec::standard(8, 0)], 0, false),
            Err(ParseError::InvalidTemplate(256))
        );
    }

    #[test]
    fn distingue_registros_fijos_de_variables() {
        let fijo = template(256);
        assert_eq!(fijo.fixed_record_len(), Some(12));
        assert_eq!(fijo.min_record_len(), 12);

        let variable = Template::new(
            257,
            vec![
                FieldSpec::standard(8, 4),
                FieldSpec::standard(82, VARIABLE_LENGTH),
            ],
            0,
            true,
        )
        .expect("template válido");
        assert_eq!(variable.fixed_record_len(), None);
        assert_eq!(variable.min_record_len(), 5);
    }
}
