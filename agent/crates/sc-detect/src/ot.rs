// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Reglas OT de F1 (M6 · etapa E6): `ot_new_master` contra la allowlist local.
//!
//! Alcance de F1 (`docs/OT/plan-implementacion.md` §3.4): la regla de allowlist,
//! su configuración local y el anti-storm. `ot_baseline`, el arming y las reglas
//! que necesitan PDU de aplicación (escrituras fuera de horario, descarga de
//! programa, cambio de estado de CPU, cruce IT→OT) quedan para F1.5/F2.
//!
//! La allowlist se acota a lo que el plan admite como representable sin cadenas
//! libres: `host_key` + protocolo + puerto, con un máximo de 64 entradas
//! (criterio de aborto de E6).
//!
//! Anti-storm: como mucho [`MAX_EVENTS_PER_WINDOW`] eventos por ventana y una
//! ventana de supresión por clave (regla + cliente + servidor + protocolo), de
//! modo que un maestro estable no repita la alerta en cada ventana y un
//! reintento de la misma ventana no duplique nada.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use sc_core::OtEvent;
use sc_ot::Protocol;
use thiserror::Error;

/// Máximo de entradas de la allowlist (criterio de aborto del plan E6).
pub const MAX_ALLOWLIST_ENTRIES: usize = 64;

/// Máximo de eventos por ventana: el tope de `ot.events` del contrato.
pub const MAX_EVENTS_PER_WINDOW: usize = 8;

/// Códigos de función que caben en la evidencia de un evento.
pub const MAX_FN_CODES: usize = 8;

/// Largo máximo de un valor de evidencia (corrección 8 del plan).
pub const MAX_EVIDENCE_VALUE_LEN: usize = 128;

/// Ventanas durante las que se suprime un evento ya emitido.
///
/// Supuesto, no medido: 120 ventanas de 30 s son una hora. Alcanza para que un
/// maestro estable no repita la alerta ventana a ventana sin ocultar un cambio
/// de un día para otro.
pub const DEFAULT_COOLDOWN_WINDOWS: u64 = 120;

/// Protocolos de F1 admitidos en la allowlist.
const PROTOCOLS: [Protocol; 5] = [
    Protocol::Modbus,
    Protocol::S7Comm,
    Protocol::S7CommPlus,
    Protocol::Dnp3,
    Protocol::Iec104,
];

/// Error de configuración de la allowlist.
#[derive(Debug, Error)]
pub enum AllowlistError {
    #[error("no se pudo leer la allowlist {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error(
        "línea {line} inválida en la allowlist: {value:?} (formato: host_key protocolo puerto)"
    )]
    InvalidLine { line: usize, value: String },
    #[error("protocolo desconocido en la allowlist, línea {line}: {value:?}")]
    UnknownProtocol { line: usize, value: String },
    #[error("la allowlist tiene {count} entradas y el tope es 64")]
    TooMany { count: usize },
}

/// Endpoint autorizado a actuar como maestro OT.
///
/// Los tres campos son obligatorios: no hay comodines ni expresiones regulares,
/// para que la lista sea auditable a ojo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllowlistEntry {
    /// `host_key` del maestro (misma derivación que `top_hosts`).
    pub host_key: String,
    /// Protocolo en el que puede iniciar conversación.
    pub protocol: Protocol,
    /// Puerto del servidor OT al que puede conectarse.
    pub port: u16,
}

/// Allowlist local de maestros OT, con su versión para la evidencia.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Allowlist {
    version: String,
    entries: Vec<AllowlistEntry>,
}

impl Default for Allowlist {
    fn default() -> Self {
        Self {
            version: "unversioned".to_string(),
            entries: Vec::new(),
        }
    }
}

impl Allowlist {
    /// Construye la lista validando el tope de entradas.
    pub fn new(
        version: impl Into<String>,
        entries: Vec<AllowlistEntry>,
    ) -> Result<Self, AllowlistError> {
        if entries.len() > MAX_ALLOWLIST_ENTRIES {
            return Err(AllowlistError::TooMany {
                count: entries.len(),
            });
        }
        Ok(Self {
            version: version.into(),
            entries,
        })
    }

    /// Carga la allowlist desde disco.
    ///
    /// Un archivo inexistente es error de configuración: el agente no debe
    /// arrancar en silencio sin la lista que el operador pidió aplicar (mismo
    /// criterio que la blacklist).
    pub fn from_path(path: &Path) -> Result<Self, AllowlistError> {
        let raw = std::fs::read_to_string(path).map_err(|source| AllowlistError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        Self::from_lines(&raw)
    }

    /// Parsea la lista en memoria.
    ///
    /// Formato: `version <etiqueta>` opcional y, por entrada,
    /// `host_key protocolo puerto` (separados por espacios). Se admiten
    /// comentarios con `#` y líneas vacías.
    pub fn from_lines(raw: &str) -> Result<Self, AllowlistError> {
        let mut version = String::from("unversioned");
        let mut entries = Vec::new();

        for (index, line) in raw.lines().enumerate() {
            let value = line.split('#').next().unwrap_or("").trim();
            if value.is_empty() {
                continue;
            }
            let fields: Vec<&str> = value.split_whitespace().collect();
            if fields.len() == 2 && fields[0].eq_ignore_ascii_case("version") {
                version = fields[1].to_string();
                continue;
            }
            if fields.len() != 3 {
                return Err(AllowlistError::InvalidLine {
                    line: index + 1,
                    value: value.to_string(),
                });
            }
            if !valid_host_key(fields[0]) {
                return Err(AllowlistError::InvalidLine {
                    line: index + 1,
                    value: fields[0].to_string(),
                });
            }
            let protocol =
                parse_protocol(fields[1]).ok_or_else(|| AllowlistError::UnknownProtocol {
                    line: index + 1,
                    value: fields[1].to_string(),
                })?;
            let port = fields[2]
                .parse::<u16>()
                .map_err(|_| AllowlistError::InvalidLine {
                    line: index + 1,
                    value: fields[2].to_string(),
                })?;
            entries.push(AllowlistEntry {
                host_key: fields[0].to_string(),
                protocol,
                port,
            });
        }

        Self::new(version, entries)
    }

    /// Etiqueta de versión que viaja en la evidencia de cada evento.
    pub fn version(&self) -> &str {
        &self.version
    }

    /// Cantidad de entradas.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// `true` si no hay entradas.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// `true` si el maestro puede usar ese protocolo contra ese puerto.
    ///
    /// Con la lista vacía no hay nada autorizado: toda conversación observada es
    /// un maestro nuevo, que es el modo de descubrimiento manual de F1.
    pub fn allows(&self, host_key: &str, protocol: Protocol, port: u16) -> bool {
        self.entries.iter().any(|entry| {
            entry.host_key == host_key && entry.protocol == protocol && entry.port == port
        })
    }
}

/// Conversación OT observada en la ventana, ya clasificada por `sc-ot`.
#[derive(Debug, Clone, PartialEq)]
pub struct OtObservation {
    /// `host_key` del maestro (inicia la conversación).
    pub client: String,
    /// `host_key` del servidor OT.
    pub server: String,
    /// Protocolo confirmado o probable.
    pub protocol: Protocol,
    /// Puerto del servidor.
    pub server_port: u16,
    /// Códigos de función vistos; se recortan a [`MAX_FN_CODES`].
    pub fn_codes: Vec<u8>,
    /// Confianza 0.0–1.0 aportada por la captura.
    pub confidence: f64,
}

/// Configuración de las reglas OT de F1.
#[derive(Debug, Clone)]
pub struct OtConfig {
    /// Maestros autorizados.
    pub allowlist: Allowlist,
    /// Tope de eventos por ventana.
    pub max_events: usize,
    /// Ventanas de supresión por clave; `0` desactiva el anti-storm temporal.
    pub cooldown_windows: u64,
}

impl Default for OtConfig {
    fn default() -> Self {
        Self {
            allowlist: Allowlist::default(),
            max_events: MAX_EVENTS_PER_WINDOW,
            cooldown_windows: DEFAULT_COOLDOWN_WINDOWS,
        }
    }
}

/// Clave de deduplicación y supresión: cliente, servidor y protocolo.
type EventKey = (String, String, &'static str);

#[derive(Debug)]
struct PendingEvent {
    protocol: Protocol,
    fn_codes: Vec<u8>,
    confidence: f64,
}

/// Motor de reglas OT con estado de anti-storm.
#[derive(Debug, Clone)]
pub struct OtDetector {
    config: OtConfig,
    /// Última ventana (sequence) en la que se emitió cada clave.
    last_emitted: BTreeMap<EventKey, u64>,
}

impl OtDetector {
    /// Crea el motor con su configuración.
    pub fn new(config: OtConfig) -> Self {
        Self {
            config,
            last_emitted: BTreeMap::new(),
        }
    }

    /// Configuración vigente.
    pub fn config(&self) -> &OtConfig {
        &self.config
    }

    /// Evalúa las observaciones de una ventana y devuelve los eventos a publicar.
    ///
    /// `sequence` es el número de ventana del agente: se usa como reloj del
    /// anti-storm, así que evaluar dos veces la misma ventana no duplica eventos.
    pub fn observe(&mut self, sequence: u64, observations: &[OtObservation]) -> Vec<OtEvent> {
        let mut pending: BTreeMap<EventKey, PendingEvent> = BTreeMap::new();

        for observation in observations {
            if self.config.allowlist.allows(
                &observation.client,
                observation.protocol,
                observation.server_port,
            ) {
                continue;
            }
            let key = (
                observation.client.clone(),
                observation.server.clone(),
                observation.protocol.as_str(),
            );
            let entry = pending.entry(key).or_insert_with(|| PendingEvent {
                protocol: observation.protocol,
                fn_codes: Vec::new(),
                confidence: 0.0,
            });
            entry.confidence = entry.confidence.max(observation.confidence.clamp(0.0, 1.0));
            for code in &observation.fn_codes {
                if entry.fn_codes.len() < MAX_FN_CODES && !entry.fn_codes.contains(code) {
                    entry.fn_codes.push(*code);
                }
            }
        }

        let mut events = Vec::new();
        for (key, pending_event) in pending {
            if events.len() >= self.config.max_events {
                break;
            }
            if self.is_suppressed(&key, sequence) {
                continue;
            }
            self.last_emitted.insert(key.clone(), sequence);
            events.push(build_event(&key, &pending_event, &self.config.allowlist));
        }
        events
    }

    fn is_suppressed(&self, key: &EventKey, sequence: u64) -> bool {
        self.last_emitted.get(key).is_some_and(|last| {
            self.config.cooldown_windows > 0
                && sequence.saturating_sub(*last) < self.config.cooldown_windows
        })
    }
}

fn build_event(key: &EventKey, pending: &PendingEvent, allowlist: &Allowlist) -> OtEvent {
    let mut fn_codes = pending.fn_codes.clone();
    fn_codes.sort_unstable();

    let mut evidence = BTreeMap::new();
    evidence.insert("fn_codes".to_string(), truncate(&fn_codes_csv(&fn_codes)));
    evidence.insert(
        "allowlist_version".to_string(),
        truncate(allowlist.version()),
    );

    OtEvent {
        rule: "ot_new_master".to_string(),
        host_key: key.0.clone(),
        protocol: pending.protocol.as_str().to_string(),
        confidence: pending.confidence,
        evidence,
        client: key.0.clone(),
        server: key.1.clone(),
    }
}

fn fn_codes_csv(fn_codes: &[u8]) -> String {
    fn_codes
        .iter()
        .map(u8::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

fn truncate(value: &str) -> String {
    if value.chars().count() <= MAX_EVIDENCE_VALUE_LEN {
        return value.to_string();
    }
    value.chars().take(MAX_EVIDENCE_VALUE_LEN).collect()
}

fn parse_protocol(value: &str) -> Option<Protocol> {
    PROTOCOLS
        .iter()
        .copied()
        .find(|protocol| protocol.as_str() == value)
}

fn valid_host_key(value: &str) -> bool {
    (8..=64).contains(&value.len()) && value.chars().all(|c| c.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master(host: &str) -> String {
        host.to_string()
    }

    fn observation(client: &str, server: &str, protocol: Protocol, port: u16) -> OtObservation {
        OtObservation {
            client: master(client),
            server: server.to_string(),
            protocol,
            server_port: port,
            fn_codes: vec![3, 16],
            confidence: 0.95,
        }
    }

    fn allowlist() -> Allowlist {
        Allowlist::from_lines("version 2026-11-26.1\n0123456789abcdef0123456789abcdef modbus 502\n")
            .expect("allowlist válida")
    }

    #[test]
    fn miembro_de_allowlist_no_genera_evento() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            ..OtConfig::default()
        });
        let events = detector.observe(
            1,
            &[observation(
                "0123456789abcdef0123456789abcdef",
                "fedcba9876543210fedcba9876543210",
                Protocol::Modbus,
                502,
            )],
        );
        assert!(events.is_empty(), "un maestro autorizado no alerta");
    }

    #[test]
    fn no_miembro_genera_ot_new_master_con_evidencia() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            ..OtConfig::default()
        });
        let events = detector.observe(
            1,
            &[observation(
                "89abcdef0123456789abcdef01234567",
                "fedcba9876543210fedcba9876543210",
                Protocol::Modbus,
                502,
            )],
        );
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.rule, "ot_new_master");
        assert_eq!(event.protocol, "modbus");
        assert_eq!(event.host_key, "89abcdef0123456789abcdef01234567");
        assert_eq!(event.client, "89abcdef0123456789abcdef01234567");
        assert_eq!(event.server, "fedcba9876543210fedcba9876543210");
        assert_eq!(
            event.evidence.get("fn_codes").map(String::as_str),
            Some("3,16")
        );
        assert_eq!(
            event.evidence.get("allowlist_version").map(String::as_str),
            Some("2026-11-26.1")
        );
    }

    #[test]
    fn el_protocolo_o_el_puerto_distinto_no_es_miembro() {
        let list = allowlist();
        assert!(list.allows("0123456789abcdef0123456789abcdef", Protocol::Modbus, 502));
        assert!(!list.allows("0123456789abcdef0123456789abcdef", Protocol::Modbus, 503));
        assert!(!list.allows("0123456789abcdef0123456789abcdef", Protocol::Dnp3, 502));
        assert!(!list.allows("00000000000000000000000000000000", Protocol::Modbus, 502));
    }

    #[test]
    fn anti_storm_suprime_dentro_del_cooldown() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            cooldown_windows: 10,
            ..OtConfig::default()
        });
        let observation = observation(
            "89abcdef0123456789abcdef01234567",
            "fedcba9876543210fedcba9876543210",
            Protocol::Modbus,
            502,
        );

        assert_eq!(
            detector
                .observe(1, std::slice::from_ref(&observation))
                .len(),
            1
        );
        assert!(detector
            .observe(2, std::slice::from_ref(&observation))
            .is_empty());
        assert!(detector
            .observe(10, std::slice::from_ref(&observation))
            .is_empty());
        assert_eq!(detector.observe(11, &[observation]).len(), 1);
    }

    #[test]
    fn reintento_de_la_misma_ventana_no_duplica() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            cooldown_windows: 10,
            ..OtConfig::default()
        });
        let observation = observation(
            "89abcdef0123456789abcdef01234567",
            "fedcba9876543210fedcba9876543210",
            Protocol::Modbus,
            502,
        );

        assert_eq!(
            detector
                .observe(7, std::slice::from_ref(&observation))
                .len(),
            1
        );
        assert!(
            detector.observe(7, &[observation]).is_empty(),
            "reintentar la misma ventana no debe duplicar la alerta"
        );
    }

    #[test]
    fn cooldown_cero_emite_en_cada_ventana() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            cooldown_windows: 0,
            ..OtConfig::default()
        });
        let observation = observation(
            "89abcdef0123456789abcdef01234567",
            "fedcba9876543210fedcba9876543210",
            Protocol::Modbus,
            502,
        );
        assert_eq!(
            detector
                .observe(1, std::slice::from_ref(&observation))
                .len(),
            1
        );
        assert_eq!(detector.observe(2, &[observation]).len(), 1);
    }

    #[test]
    fn tope_de_eventos_por_ventana() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            max_events: 2,
            cooldown_windows: 0,
        });
        let observations: Vec<OtObservation> = (0..5)
            .map(|index| {
                observation(
                    &format!("client{index}000000000000000000000"),
                    "fedcba9876543210fedcba9876543210",
                    Protocol::Modbus,
                    502,
                )
            })
            .collect();

        assert_eq!(detector.observe(1, &observations).len(), 2);
    }

    #[test]
    fn dedup_en_la_ventana_mezcla_codigos_de_funcion() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: allowlist(),
            cooldown_windows: 0,
            ..OtConfig::default()
        });
        let mut first = observation(
            "89abcdef0123456789abcdef01234567",
            "fedcba9876543210fedcba9876543210",
            Protocol::Modbus,
            502,
        );
        first.fn_codes = vec![3];
        let mut second = first.clone();
        second.fn_codes = vec![16];

        let events = detector.observe(1, &[first, second]);
        assert_eq!(events.len(), 1, "misma clave → un solo evento");
        assert_eq!(
            events[0].evidence.get("fn_codes").map(String::as_str),
            Some("3,16")
        );
    }

    #[test]
    fn allowlist_parsea_version_y_entradas() {
        let list = Allowlist::from_lines(
            "# comentario\nversion 2026-11-26.2\n0123456789abcdef0123456789abcdef dnp3 20000\n",
        )
        .expect("lista");
        assert_eq!(list.version(), "2026-11-26.2");
        assert_eq!(list.len(), 1);
        assert!(list.allows("0123456789abcdef0123456789abcdef", Protocol::Dnp3, 20000));
    }

    #[test]
    fn allowlist_rechaza_mas_de_64_entradas() {
        let raw = (0..65)
            .map(|index| format!("host{index:05}00000000000000000000 modbus 502"))
            .collect::<Vec<_>>()
            .join("\n");
        match Allowlist::from_lines(&raw) {
            Err(AllowlistError::TooMany { count }) => assert_eq!(count, 65),
            other => panic!("se esperaba TooMany, llegó {other:?}"),
        }
    }

    #[test]
    fn allowlist_rechaza_linea_y_protocolo_invalidos() {
        assert!(matches!(
            Allowlist::from_lines("0123456789abcdef0123456789abcdef modbus"),
            Err(AllowlistError::InvalidLine { line: 1, .. })
        ));
        assert!(matches!(
            Allowlist::from_lines("0123456789abcdef0123456789abcdef mms 102"),
            Err(AllowlistError::UnknownProtocol { .. })
        ));
        assert!(matches!(
            Allowlist::from_lines("0123456789abcdef0123456789abcdef modbus 99999"),
            Err(AllowlistError::InvalidLine { .. })
        ));
        assert!(matches!(
            Allowlist::from_lines("corto modbus 502"),
            Err(AllowlistError::InvalidLine { .. })
        ));
    }

    #[test]
    fn el_evento_respeta_los_topes_del_contrato() {
        let mut detector = OtDetector::new(OtConfig {
            allowlist: Allowlist::default(),
            cooldown_windows: 0,
            ..OtConfig::default()
        });
        let mut observation = observation(
            "89abcdef0123456789abcdef01234567",
            "fedcba9876543210fedcba9876543210",
            Protocol::Iec104,
            2404,
        );
        observation.fn_codes = (1..=20).collect();

        let events = detector.observe(1, &[observation]);
        let event = &events[0];
        assert!(event.rule.len() <= 64);
        assert!(!event.evidence.is_empty() && event.evidence.len() <= 32);
        for value in event.evidence.values() {
            assert!(value.chars().count() <= MAX_EVIDENCE_VALUE_LEN);
        }
        assert_eq!(
            event.evidence.get("fn_codes").map(String::as_str),
            Some("1,2,3,4,5,6,7,8")
        );
    }

    #[test]
    fn allowlist_vacia_es_modo_descubrimiento() {
        let mut detector = OtDetector::new(OtConfig::default());
        let events = detector.observe(
            1,
            &[observation(
                "89abcdef0123456789abcdef01234567",
                "fedcba9876543210fedcba9876543210",
                Protocol::S7Comm,
                102,
            )],
        );
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0]
                .evidence
                .get("allowlist_version")
                .map(String::as_str),
            Some("unversioned")
        );
    }
}
