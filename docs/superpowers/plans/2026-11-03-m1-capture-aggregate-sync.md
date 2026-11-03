# M1 — Capture + Aggregate + Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captura de tráfico real desacoplada de GUI, agregación en ventanas de 30 s → `WindowSnapshot`, cliente de ingesta `/api/ingest` con spool SQLite (offline, cota 500 MB/7 días FIFO, dead_letter, backoff), gzip y mock server end-to-end. Todo compilando y testeando en Windows y Linux.

**Architecture:** Pipeline `sc-capture → (tokio mpsc bounded 10_000, backpressure §8.2) → sc-aggregate → (WindowSnapshot) → sc-sync → POST /api/ingest`. `sc-geo` enriquece hosts con país (GeoLite2 local). `sc-agent` (bin) cablea el pipeline. `sc-detect` queda esqueleto (sin reglas en M1; `alerts: []`). La captura live va detrás de una feature cargo `live` (dependencia `pcap`, ligada a libpcap/Npcap) para que CI compile en ambos OS sin privilegios ni SDKs; la extracción de Sniffnet se limita a los archivos verificados del tag **v1.5.1** (ver Nota 1).

**Tech Stack:** tokio, serde/serde_json, etherparse, pcap-file (fixture puro, dev/test), pcap (feature `live`), maxminddb + GeoLite2 (recursos de Sniffnet v1.5.1), rusqlite (bundled), flate2 (gzip) + zstd (flag opcional), reqwest (rustls + json), backoff, tracing/tracing-subscriber, ulid, sha2+hmac (host_key), config (TOML), insta (golden), thiserror/anyhow.

**Fuente de verdad:** spec v2.1 `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §4.1 (interfaces), §5.1 + `docs/contracts/*.schema.json` (contratos normativos), §8.1–8.3 (resiliencia/backpressure/compresión), §9.3 (logging), §10 (observabilidad), §14.1/14.3 (testing y criterios M1), §16.2 (librerías), ADR-0002 (jerarquía), ADR-0006 (extracción), ADR-0008 (idempotencia), ADR-0009 (compresión).

**Fuente verificada (contexto Sniffnet):** árbol del tag v1.5.1 consultado el 2026-11-03 — https://github.com/GyulyVGC/sniffnet/tree/v1.5.1/src/networking

---

## Nota 1 — Realidad de Sniffnet v1.5.1 (contrastar con ADR-0006)

ADR-0006 afirma que v1.5.1 aporta `networking/{capture,parse_packets,manage_packets}.rs` e `ipfix/`. La verificación del árbol real del tag muestra:

- ✅ Existen en v1.5.1: `src/networking/parse_packets.rs`, `src/networking/manage_packets.rs`, `src/networking/types/`, `src/mmdb/` (`asn.rs`, `country.rs`, `types/mmdb_reader.rs`) y `resources/DB/*.mmdb` (GeoLite2 embebido).
- ❌ NO existen en v1.5.1: `src/networking/capture.rs` ni `src/networking/ipfix/` — están solo en `main` (post-v1.5.1, sin tag publicado). `Cargo.toml` v1.5.1: `pcap = "2.4.0"`, `etherparse = "0.20.3"`, `maxminddb = "0.30.0"`.

Consecuencias adoptadas en este plan:

1. `sc-capture` implementa con lógica propia el puente hilo-bloqueante → tokio mpsc (esa parte nunca estuvo en un tag) y se apoya en `parse_packets.rs`/`manage_packets.rs` de v1.5.1 para el parseo y la decisión de dirección (adaptación con headers MIT/Apache preservados).
2. La extracción de `ipfix/` para `sc-collector` **queda diferida a M4**, con pin explícito al commit de `main` que se fije en el plan de M4 (hoy `main` sigue sin tag). `sc-collector` permanece esqueleto en M1.
3. `sc-geo` hereda `src/mmdb/` y copia los `.mmdb` de `resources/DB/` (CC BY-SA, ya normado en `docs/legal/maxmind-notice.md`: "las versiones incluidas en Sniffnet (resource files) sirven a v1").

## Nota 2 — Corrección de sc-core respecto del M0 (contratos normativos)

Los tipos de `sc-core` (M0) se escribieron según el ejemplo del spec §5.1, pero el espejo real debe ser `docs/contracts/window-snapshot.v1.schema.json` + `alert.v1.schema.json` + `agent-health.v1.schema.json` (normativos; §14.1 "espejo exacto"). Diferencias detectadas:

| Tipo | sc-core (M0) | Schema normativo v1 | Corrección M1 |
|---|---|---|---|
| `HostStats` | `packets_in`, `packets_out`, `connections`, sin `risk_score` | `packets` (único), `risk_score` opcional | `packets: u64` + `risk_score: Option<f64>` (sin packets_in/out/connections) |
| `PortStat` | `bytes_in`, `bytes_out` | `bytes` (único) + `connections` | `bytes: u64`, `connections: u64` |
| `CountryStat` | `bytes_in`, `bytes_out` | `bytes` + `hosts` | `bytes: u64`, `hosts: u64` |
| `Alert.evidence` | `Vec<(String, String)>` | objeto (map string→string, min 1, max 32 props) | `Option<BTreeMap<String, String>>` (BTreeMap: orden estable para golden) |
| `AgentHealth` | todos los counters no-Option | opcionales: `queue_depth`, `spool_bytes`, `cpu_percent`, `memory_bytes`, `last_error` | opcionales pasan a `Option<T>` con `#[serde(skip_serializing_if = "Option::is_none")]` (el schema no admite null) |

**Estado (2026-11-03):** al poner el plan contra el código real, la mayor parte de la Nota 2 ya estaba aprobeda en el M0 (commit `9fe6465`): `HostStats` con `packets`/`risk_score`, `PortStat`/`CountryStat` con amplitud del contrato, `Alert` con `Option<BTreeMap>`, `AgentHealth` con opcionales con `skip_serializing_if`, y además `Window` con `id/sequence` y los wrapper `DeviceIdentity`/`IngestEnvelope`. La Task 1 queda reducida a: alias `Alpha2` + test que deserializa `docs/contracts/examples/ingest-request.valid.json` completo (test anti-drift).

## Global Constraints (heredados de M0 + propios de M1)

- Licencia: PROPIETARIA Strategic Connex. Archivos fuente propios llevan como primera línea el header `// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.`
- Los archivos **heredados/adaptados** de Sniffnet v1.5.1 conservan el header dual MIT/Apache-2.0 original y agregan la atribución y el aviso de modificación (requisito de la licencia MIT). Formato de encabezado:
  ```rust
  // Derived from Sniffnet v1.5.1 (original path: src/networking/parse_packets.rs),
  // Copyright (c) Guilherme ("Guly") Vardanyan and Sniffnet contributors, dual-licensed MIT OR Apache-2.0.
  // Adaptations and modifications for SC-Sentinel are proprietary:
  // Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
  ```
- Prohibido usar la marca "Sniffnet" en nombres, UI o copy propio (ADR-0006); en comentarios técnicos de código heredado sí está permitida la citación de la fuente (THIRD_PARTY_NOTICES §1).
- Español internacional profesional en comentarios/docs/UI; identificadores de código en inglés.
- Jerarquía de dependencias (ADR-0002, DAG estricto): `sc-capture` y `sc-geo` son fuentes consumibles por `sc-aggregate`; `sc-detect` es esqueleto sin reglas; `sc-sync` consume `WindowSnapshot`; `sc-config`/`sc-telemetry` son transversales (consumibles por cualquiera); `sc-core` raíz. Toda dependencia nueva entre crates debe respetar el DAG y quedar declarada en `agent/README.md` (Task 9 actualiza el mapa).
- Nunca silenciar pérdida de datos: todo drop/pérdida se refleja en métricas (regla crítica §8.1; backpressure §8.2).
- Sin datos sensibles en repo/tests/logs: el fixture pcap usa IPs sintéticas RFC 1918 y no contiene dominios ni hosts reales; los logs nunca contienen el token completo (§9.3).
- Windows es la plataforma de desarrollo de Juan: la captura live (`--features live`) debe poder correr ahí con Npcap instalado; los comandos del plan se verifican en Windows y CI cubre Linux.
- Los paths del plan son relativos a la raíz del repo `D:\ProyectosWeb\SC-Sentinel\`. Branch `main`.
- Los contratos de `docs/contracts/` están congelados (v1): M1 **no** reescribe schemas ni ejemplos; las tasks los consumen.
- Payload `/api/ingest`: envelope `{ v, device, window{id,start,end,duration_ms,sequence}, snapshot }` (§5.1). `window.id` y `window.sequence` los produce `sc-sync`: id = `"win_" + ulid` derivada de `(boot_id, window.start_ms)` — determinista; reenvíos tras reinicio conservan el mismo `(device_id, window_id)` ⇒ idempotencia (ADR-0008). `sequence` es un contador monotónico persistido en el spool.
- Límites del snapshot (§5.1): `top_hosts` ≤ 50, `top_ports` ≤ 50, `top_countries` ≤ 30, `alerts` ≤ 50; payload sin comprimir ≤ 512 KB, comprimido ≤ 128 KB (el 413 lo decide el servidor).

---

### Task 1: sc-core v1.1 — alinear tipos con los schemas normativos

**Files:**
- Modify: `agent/crates/sc-core/src/types.rs`
- Test: tests inline (roundtrip + deserialización del ejemplo del contrato)

**Interfaces:**
- Consumes: nada (`sc-core` sigue siendo la raíz; sin deps internas).
- Produces: tipos v1 exactos del wire: `HostStats{ host_key, ip_display, country, bytes_in, bytes_out, packets, risk_score }`, `PortStat{ port, protocol, bytes, connections }`, `CountryStat{ country, bytes, hosts }`, `Alert{ rule_id, severity, title, description, evidence }`, `AgentHealth{ capture_status, packets_seen, packets_dropped, parse_errors, queue_depth?, spool_bytes?, cpu_percent?, memory_bytes?, last_error? }`. `WindowSnapshot{ v, created_at, window, top_hosts, top_ports, top_countries, alerts, health }` sin cambios de forma. Nuevo: `pub type Alpha2 = String;` y `pub const SNAPSHOT_SCHEMA_VERSION: u8 = 1;` (reemplaza `SC_CORE_SCHEMA_VERSION`; mantener alias deprecated si algo lo referencia).

- [ ] **Step 1: Reescribir los structs según Nota 2.** (`host_key` min 8/max 64 según schema ⇒ sigue siendo `String`; la validación de formato es de los generadores, no del tipo.)

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HostStats {
    pub host_key: String,
    pub ip_display: Option<String>, // null bajo anonymize=true (regla normativa §5.1)
    pub country: Option<Alpha2>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub packets: u64,
    pub risk_score: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PortStat {
    pub port: u16,
    pub protocol: Protocol,
    pub bytes: u64,
    pub connections: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CountryStat {
    pub country: Alpha2,
    pub bytes: u64,
    pub hosts: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Alert {
    pub rule_id: String,
    pub severity: AlertSeverity,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentHealth {
    pub capture_status: CaptureStatus,
    pub packets_seen: u64,
    pub packets_dropped: u64,
    pub parse_errors: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queue_depth: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spool_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpu_percent: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}
```

- [ ] **Step 2: Actualizar `sample_snapshot()` y los tests.** Test nuevo: la sección `snapshot` de `docs/contracts/examples/ingest-request.valid.json` (leída desde la raíz del repo vía `CARGO_MANIFEST_DIR/../../..`) deserializa a `WindowSnapshot` sin error; roundtrip conserva `top_hosts[0]["packets"] == 1500`.
- [ ] **Step 3: Verificar workspace:** `cargo test` (en `agent/`) — los stubs de `sc-aggregate`/`sc-detect` aún no consumen estos campos; todo verde y cero warnings.
- [ ] **Step 4: Commit** `fix(sc-core): alinear tipos con schemas normativos v1 (packets/risk_score/bytes/evidence/health optional)`.

---

### Task 2: sc-capture — parse de paquetes → FlowUpdate (etherparse, fixture pcap puro)

**Files:**
- Create: `agent/crates/sc-capture/src/flow.rs` (FlowUpdate + Direction + LocalIpSet)
- Create: `agent/crates/sc-capture/src/parser.rs` (adaptación de `manage_packets.rs`; header de derivación Sniffnet)
- Create: `agent/crates/sc-capture/src/fixtures.rs` (escritura de pcap sintético determinista)
- Create: `agent/fixtures/loopback-trace.pcap` (generado por test helper y comiteado; IPs sintéticas RFC 1918)
- Test: `agent/crates/sc-capture/tests/parser_fixture.rs`
- Modify: `agent/crates/sc-capture/Cargo.toml` (deps + dev-deps)

**Interfaces:**
- Consumes: `sc-core::{FlowKey, Protocol}`.
- Produces:
  ```rust
  pub struct FlowUpdate { pub ts: i64, pub flow: FlowKey, pub bytes: u64, pub packets: u64, pub direction: Direction }
  pub enum Direction { In, Out } // In = hacia el nodo; Out = desde el nodo
  pub struct LocalIpSet(HashSet<u128>);
  // LocalIpSet::from_config(list: &[IpAddr]) y, solo cfg(feature = "live"), desde las direcciones del device pcap
  pub fn parse_packet(local: &LocalIpSet, link: L2Frame<'_>, ts: i64) -> Result<Option<FlowUpdate>, ParseError>;
  #[derive(thiserror::Error)] pub enum ParseError { LinkUnsupported, IpMalformed, TransportMalformed }
  ```
- `parse_packet` devuelve `Ok(None)` para paquetes sin oportunidad de flujo (ARP u otro L3 no-IP) y `Err(ParseError::*)` para malformed — ambos incrementan `parse_errors` en el llamador (driver), nunca se silencian.

- [ ] **Step 1: Deps**: `sc-core.workspace = true`, `thiserror.workspace = true`; dev-deps: `etherparse = "0.20"`, `pcap-file = "3"`.
- [ ] **Step 2: `flow.rs`** con la struct arriba + header de copyright propio.
- [ ] **Step 3: `parser.rs`** — adaptación del parseo de `manage_packets.rs` v1.5.1 (header de derivación de Global Constraints). Reglas de dirección:
  - Si `dst ∈ LocalIpSet` → `Direction::In` con `remote_ip = src_ip`; si `src ∈ LocalIpSet` → `Direction::Out` con `remote_ip = dst_ip`; si ambos (loopback) → `In` con `remote_ip = dst_ip`; si ninguno → `Err(ParseError::IpMalformed)` y el driver lo cuenta como `parse_errors` (paquete no atribuible a este nodo; no es pérdida de datos: queda en métrica).
  - Solo IPv4/IPv6 con TCP o UDP (`etherparse`); fragmentos IPv4: solo el primero con fragment offset 0 se procesa (M1 no re-ensambla; el resto se cuenta en `parse_errors`).
  - `bytes` = longitud del payload L4 (octetos TCP/UDP después de headers). Parseo sin estado (sin rDNS ni pool de hilos en M1).
- [ ] **Step 4: fixture y test de integración.** `fixtures.rs` escribe un pcap sintético (linktype EN10MB): 6 frames TCP entre `10.0.0.1:50000 ↔ 10.0.0.2:443` (3 en cada dirección, payload fijo ASCII, timestamps uniformes de 10 ms) + 1 frame ARP de relleno (~200 B en total). `tests/parser_fixture.rs` lee `agent/fixtures/loopback-trace.pcap` con `pcap-file`, parsea cada frame y prueba: exactamente 6 FlowUpdates con direcciones/contadores esperados (2 flujos: 3→In y 3→Out) y el frame ARP → `Ok(None)`.
  Run: `cargo test -p sc-capture` Expected: PASS.
- [ ] **Step 5: Commit** `feat(sc-capture): parser etherparse→FlowUpdate + fixture loopback sintético`.

---

### Task 3: sc-capture — canal mpsc bounded con backpressure (§8.2)

**Files:**
- Create: `agent/crates/sc-capture/src/channel.rs`
- Test: tests inline en `channel.rs`
- Modify: `agent/crates/sc-capture/src/lib.rs` (exporta `channel`, `flow`, `parser`)

**Interfaces:**
- Produces:
  ```rust
  pub const CHANNEL_CAPACITY: usize = 10_000; // spec §8.2
  pub struct CaptureChannel { pub rx: tokio::sync::mpsc::Receiver<FlowUpdate>, pub drops: Arc<AtomicU64>, pub sent: Arc<AtomicU64> }
  impl CaptureChannel {
      pub fn new() -> Self;                          // capacidad CHANNEL_CAPACITY
      pub fn producer(&self) -> FlowProducer;        // clonable; try_send no bloqueante
  }
  impl FlowProducer { pub fn try_push(&self, u: FlowUpdate) -> Result<(), Full>; } // on Full: drops += 1 (nunca bloquea ni espera)
  ```
- Filosofía: el productor (thread bloqueante del driver) JAMÁS espera; si el canal está lleno, el paquete se descarta y `drops` crece (spec §8.2). Los contadores son `Arc<AtomicU64>` que la HealthRegistry (Task 7) ingiere.

Tests: (1) canal de capacidad 1 lleno: `try_push` → `Err(Full)` e incrementa `drops`; (2) drenar `rx` libera espacio; (3) `sent` cuenta exactamente los entregados; (4) `drops == 0` en condiciones normales del fixture completo.

- [ ] **Step 1: Implementar** (tokio `sync::mpsc` bounded; jamás `unbounded`) + tests con `#[tokio::test]`. Run: `cargo test -p sc-capture` Expected: PASS.
- [ ] **Step 2: Commit** `feat(sc-capture): canal mpsc bounded con backpressure y contadores de drops`.

---

### Task 4: sc-capture — driver de captura (live feature-gated + replay offline)

**Files:**
- Create: `agent/crates/sc-capture/src/driver.rs` (thread bloqueante común: read → parse → try_push)
- Create: `agent/crates/sc-capture/src/live.rs` (`#[cfg(feature = "live")]`)
- Modify: `agent/crates/sc-capture/Cargo.toml`: `[features] live = ["dep:pcap"]` y `[dependencies] pcap = { version = "2.4", optional = true }`
- Test: `agent/crates/sc-capture/tests/driver_fixture.rs` (replay offline del fixture)

**Interfaces:**
- Produces:
  ```rust
  pub fn run_offline(path: &Path, local: LocalIpSet) -> Result<CaptureChannel, CaptureError>; // thread que lee el pcap file y try_push por paquete; EOF cierra el canal y retorna counts
  #[cfg(feature = "live")]
  pub fn run_live(iface: &str, local: LocalIpSet) -> Result<CaptureChannel, CaptureError>;    // thread bloqueante sobre pcap
  #[derive(thiserror::Error)] pub enum CaptureError { OpenFailure(String), InterfaceNotFound, Runtime(String) }
  pub struct CaptureStats { pub seen: u64, pub parsed: u64, pub parse_errors: u64, pub dropped: u64 }
  ```
- `run_live` sigue el patrón de `parse_packets.rs::thread_packet_stream` de v1.5.1: `pcap::Capture::from_device` con promiscuous=false, snaplen 1500, read timeout 1000 ms; read → parse → try_push; regla de calidad: el thread NUNCA escribe directamente en la HealthRegistry (usa los atomics del channel de Task 3 + retorna `CaptureStats`).
- Nota Npcap/Windows: compilar `--features live` en Windows requiere el SDK de Npcap (cabeceras/lib para el link del crate `pcap` — `LIBPCAP_DIR` según versión del crate; el runtime requiere Npcap instalado). No está en CI: por eso la feature es opt-in. Runbook: `docs/runbooks/npcap-install.md` (Task 9 agrega el detalle del SDK).

- [ ] **Step 1: Implementar `driver.rs` + `live.rs`** — smoke live-only detrás de env var `SC_LIVE_TESTS=<iface>`: si no está definida, el test se salta con mensaje explícito (nunca silencioso).
- [ ] **Step 2: Verificar gates sin feature:** `cargo build -p sc-capture` compila limpio sin `live` (igual en CI Windows/Linux). Opcional local: `cargo check -p sc-capture --features live` si el SDK está disponible.
- [ ] **Step 3: Test `driver_fixture.rs` PASS** (replay completo: entregados == 6, drops == 0, órdenes de timestamp conservadas).
- [ ] **Step 4: Commit** `feat(sc-capture): driver offline+live (feature live, pcap/Npcap) — CI sin SDKs`.

---

### Task 5: sc-geo — port de `src/mmdb/` v1.5.1 + GeoLite2 embebido

**Files:**
- Create: `agent/crates/sc-geo/src/lookup.rs` (trait + NoLookup)
- Create: `agent/crates/sc-geo/src/geolite2.rs` (adaptación de `mmdb/country.rs`; header de derivación)
- Create: `agent/resources/geolite2/README.md` (procedencia: tag v1.5.1 `resources/DB/`;SHA-256 de cada archivo; licencia → `docs/legal/maxmind-notice.md`)
- Copy: `agent/resources/geolite2/GeoLite2-Country.mmdb` y `agent/resources/geolite2/GeoLite2-ASN.mmdb` (del tag v1.5.1)
- Modify: `agent/crates/sc-geo/Cargo.toml` (deps: maxminddb; dev-deps: hex, sha2)
- Test: `agent/crates/sc-geo/tests/geolite2.rs`

**Interfaces:**
- Consumes: nada interno (crate puro).
- Produces:
  ```rust
  pub trait CountryLookup: Send + Sync { fn country(&self, ip: u128) -> Option<Alpha2>; }
  pub struct NoLookup;                                // para pruebas y para cuando no hay base disponible
  #[derive(thiserror::Error)] pub enum GeoError { Open(String), Format(String) }
  pub struct GeoLite2Country { reader: maxminddb::Reader<Vec<u8>> }
  impl GeoLite2Country {
      pub fn from_path(path: &Path) -> Result<Self, GeoError>;
      pub fn from_agent_resources() -> Result<Self, GeoError>; // ruta estándar <agent>/resources/geolite2/GeoLite2-Country.mmdb resuelta desde CARGO_MANIFEST_DIR en tests / config en runtime
  }
  impl CountryLookup for NoLookup { /* siempre None */ }
  impl CountryLookup for GeoLite2Country { ... }      // devuelve None para IPs privadas/absentes; assert formato ^[A-Z]{2}$
  ```
- Licencia: incluir los `.mmdb` es redistribución de datos CC BY-SA 4.0 con atribución — ya normado en `docs/legal/maxmind-notice.md` (las versiones incluidas en Sniffnet "sirven a v1"). `cargo deny` solo audita licencias de crates Rust; los recursos de datos no entran en su alcance (no hay conflicto).

- [ ] **Step 1: Descargar el tarball del tag v1.5.1 y copiar SOLO los dos `.mmdb` a `agent/resources/geolite2/`** (sin historial de terceros; se fija en README la versión y el SHA-256 de cada recurso).
- [ ] **Step 2: Implementar el lookup** (basado en `mmdb/country.rs` de v1.5.1): lookup de ISO alpha-2; IPs no encontradas → `None` (no error); el resultado debe matchear `^[A-Z]{2}$` (si no, `Err(GeoError::Format)`).
- [ ] **Step 3: Tests** (determinísticos, no dependen de "qué país tiene hoy una IP pública"):
  1. `NoLookup::country(ip) == None` siempre.
  2. Apertura válida/inválida del recurso → Ok/Err(GeoError::Open).
  3. Buscar una **IP privada RFC 1918** (`10.0.0.1`) → `None` (estable para cualquier build del recurso).
  4. Firma de integridad: SHA-256 de cada `.mmdb` == hash fijado en el README de resources (si MaxMind/Sniffnet actualiza el recurso, el test falla y el desarrollador re-fija el hash con una nota — nunca se actualiza el recurso silenciosamente).
- [ ] **Step 4: Commit** `feat(sc-geo): port mmdb (Sniffnet v1.5.1) + GeoLite2 country embebido con firma de integridad`.

---

### Task 6: sc-aggregate — ventanas de 30 s, tops-N y WindowSnapshot (golden tests)

**Files:**
- Create: `agent/crates/sc-aggregate/src/host_mark.rs` (HMAC host_key truncada)
- Create: `agent/crates/sc-aggregate/src/accumulator.rs` (stats de la ventana activa)
- Create: `agent/crates/sc-aggregate/src/window.rs` (reloj injectable, límites de ventana, flush)
- Create: `agent/crates/sc-aggregate/src/snapshot.rs` (construcción WindowSnapshot + top-N + health embebido)
- Create: `agent/crates/sc-aggregate/tests/golden_window.rs`
- Create: `agent/crates/sc-aggregate/tests/snapshots/` (insta `.snap` comiteados)
- Modify: `agent/crates/sc-aggregate/Cargo.toml` (deps: sc-core, sc-geo, tokio, hmac, sha2, hex; dev-deps: insta)

**Interfaces:**
- Consumes: `sc-capture::{FlowUpdate, Direction}`, `sc-geo::CountryLookup`, `sc-telemetry::HealthRegistry` (Task 7 — si Task 7 se reordena, cualquier task que use HealthRegistry la consume).
- Produces:
  ```rust
  pub struct AggregatorConfig {
      pub window_seconds: u32,        // default 30 (válido 30..=60, spec §4.1)
      pub anonymize_hosts: bool,      // default true
      pub hmac_key: Vec<u8>,          // persistente; viene de config/env; NUNCA se logea
      pub top_hosts: usize,           // 50
      pub top_ports: usize,           // 50
      pub top_countries: usize,       // 30
      pub max_alerts: usize,          // 50 (vacío en M1)
  }
  pub trait Clock: Send + Sync { fn now_epoch_s(&self) -> i64; }  // SystemClock | FixedClock(test)
  pub struct WindowAggregator { ... }
  impl WindowAggregator {
      pub fn new(cfg: AggregatorConfig, country: Arc<dyn CountryLookup>, health: Arc<HealthRegistry>) -> Self;
      pub async fn run(self, mut rx: mpsc::Receiver<FlowUpdate>, snapshots: mpsc::Sender<WindowSnapshot>);
  }
  ```
- Semántica clave (espeja el contrato):
  - Ventana activa `[start, end)`: `start = floor(now/window_seconds)*window_seconds`; al recibir `now >= end`, flush y nueva ventana. Los eventos llegan ordenados por `ts` del driver; los `ts` fuera de la ventana activa (ventanas ya cerradas) se cuentan como `parse_errors` (nunca perdidos en silencio).
  - `host_key` = `hex(HMAC-SHA256(hmac_key, ip_canonical))[0..32]` (schema min 8/max 64). Estable entre ejecuciones con la misma key.
  - `ip_display = Some(display(input))` **solo si** `anonymize_hosts=false`; con `true` (default v1) siempre `None` (regla normativa §5.1).
  - `packets` por host = suma de packets; `bytes_in/bytes_out` según `Direction`.
  - `PortStat`: `port` = puerto local del flujo; `bytes` = total In+Out; `connections` = conteo de `FlowKey` distintas por puerto+protocolo en la ventana (HashSet; se descarta al flush — el snapshot nunca contiene flujos individuales).
  - `CountryStat`: `bytes` = In+Out por país del host; `hosts` = host_keys únicos por país.
  - `top_*` orden estable para golden: sort por (bytes DESC, host_key ASC).
  - `risk_score: None` en M1 (el motor determinista de sc-detect llega post-M1; ausencia es válida por schema).
  - `alerts: vec![]` (M1).
  - `health` se vuelca de `HealthRegistry` al momento del flush (queue_depth reciente, drops, spool_bytes cuando exista; según schema: opcionales se omiten si el productor correspondiente aún no midió).
  - Los contadores internos de la ventana se descartan tras el flush (no hay memoria entre ventanas más allá de HMAC key/config).

- [ ] **Step 1: `host_mark.rs`** — HMAC truncada + tests: estable entre ejecuciones (misma key+ip ⇒ mismo host_key), distinta key ⇒ distinto, longitud 32, con la codificación de bytes de la IP documentada en docstring.
- [ ] **Step 2: `accumulator.rs`** — mapas por host/port/country con tests unitarios de agregación (bytes in/out, packets, conexiones únicas, países con `StubLookup`).
- [ ] **Step 3: `window.rs`** — `FixedClock`/`SystemClock`; cierre exacto en límites; test de atribución de eventos justo en `[start, end)` y en el tick siguiente sin solapes; flush determinista.
- [ ] **Step 4: `snapshot.rs`** — construcción de `WindowSnapshot` con health de la registry; test de roundtrip `serde_json` con todos los campos que produce (contrato no se re-escribe; si un campo falta, falla el roundtrip, no el schema).
- [ ] **Step 5: Golden tests** (`tests/golden_window.rs`): 3 ventanas contiguas con `FixedClock` y fuerza de eventos (2 hosts, 3 puertos con conexiones únicas, 2 países — uno por `NoLookup` —, anonymize=true, drops != 0 en la segunda ventana); `insta::assert_json_snapshot!` de cada `WindowSnapshot` (primera ejecución: `cargo insta accept` y commit de los `.snap`).
- [ ] **Step 6: Run** `cargo test -p sc-aggregate` Expected: PASS (con los `.snap` comiteados).
- [ ] **Step 7: Commit** `feat(sc-aggregate): ventanas de 30 s, tops-N y snapshots golden (insta) con health de sc-telemetry`.

---

### Task 7: sc-telemetry — HealthRegistry (transversal) + logging con redacción

**Files:**
- Modify: `agent/crates/sc-telemetry/src/lib.rs` (HealthRegistry + expose módulo logging)
- Create: `agent/crates/sc-telemetry/src/logging.rs` (init tracing + helpers de redacción §9.3)
- Modify: `agent/crates/sc-telemetry/Cargo.toml` (deps: tracing, tracing-subscriber con `env-filter`)

**Interfaces:**
- Produces:
  ```rust
  pub struct HealthRegistry {
      pub capture_status: AtomicU8,           // según CaptureStatus(u8), default Ok hasta primer update
      pub packets_seen: AtomicU64,
      pub packets_dropped: AtomicU64,         // += captures channel drops (Task 3)
      pub parse_errors: AtomicU64,
      pub queue_depth: AtomicU64,             // agregador: len del rx (lecturas puntuales)
      pub spool_bytes: AtomicU64,             // 0 interno hasta la primera medición (snapshot → None)
      pub data_loss_bytes: AtomicU64,          // spool FIFO (§8.1)
      pub data_loss_windows: AtomicU64,
      pub needs_enrollment: AtomicBool,
      pub last_error: std::sync::Mutex<Option<String>>, // máx 500 chars, sin tokens (§9.3)
  }
  impl HealthRegistry {
      pub fn new() -> Arc<Self>;
      pub fn snapshot(&self) -> AgentHealth;  // spool_bytes: None si nunca medido; cpu_percent/memory_bytes: None en M1
      pub fn note_error(&self, msg: impl Into<String>); // trunca a 500 y nunca registra Authorization/token
      // sincronización con el channel de sc-capture (Task 3): sc-agent copia por tick los
      // valores de los Arc<AtomicU64> del channel a los campos del registro (Task 9), sin métodos mágicos.
  }
  // logging: pub fn init() (nivel desde env SC_LOG, default "info") + pub fn redact_token(&str) -> String
  //          (primeros 8 chars + "…" — el token completo nunca aparece en el output).
  ```
- Decisiones:
  - `spool_bytes`: `None` en el snapshot hasta que sc-sync publique la primera medición (ser 0 sin medición sería falso; la ausencia es válida por schema).
  - `cpu_percent`/`memory_bytes`: `None` en M1 (requeriría sysinfo; se hace en M2/M5).
  - `snapshot()` no suaviza ni promedia: expone los valores exactos de las atomics.

- [ ] **Step 1: HealthRegistry + tests unitarios (defaults, note_error truncado, mapping de CaptureStatus).**
- [ ] **Step 2: logging.rs + test de `redact_token` (el valor completo de `SC_INGEST_TOKEN` nunca aparece en el output).**
- [ ] **Step 3: Commit** `feat(sc-telemetry): HealthRegistry transversal + logging con redacción de tokens`.

---

### Task 8: sc-sync — spool SQLite + cliente /api/ingest + mock e2e

**Files:**
- Create: `agent/crates/sc-sync/src/spool.rs` (rusqlite)
- Create: `agent/crates/sc-sync/src/envelope.rs` (device/window/snapshot wrap)
- Create: `agent/crates/sc-sync/src/client.rs` (reqwest + gzip + mapping de respuestas)
- Create: `agent/crates/sc-sync/src/syncer.rs` (loop drain: spool → POST → acción)
- Create: `agent/crates/sc-sync/tests/mock_server.rs` (harness de servidor mock con tokio TcpListener)
- Create: `agent/crates/sc-sync/tests/spool.rs`, `tests/client_mock.rs`, `tests/e2e_idempotent.rs`
- Modify: `agent/crates/sc-sync/Cargo.toml` (deps: sc-core, rusqlite bundled, flate2, reqwest json+rustls-tls, backoff, now, secrecy, ulid; zstd = { version = "0.13", optional = true }; feature `zstd = ["dep:zstd"]`; dev-deps: tempfile)

**Interfaces:**
- Produces:
  ```rust
  pub struct DeviceInfo { pub id: String, pub agent_version: String, pub hostname: String, pub boot_id: String } // device.id de config
  pub struct SpoolConfig { pub path: PathBuf, pub max_bytes: u64 /* 524_288_000 */, pub max_age_days: u32 /* 7 */ }
  #[derive(thiserror::Error)] pub enum SpoolError { Open(String), Db(rusqlite::Error), TooLarge }
  pub struct BatchRow { pub row_id: i64, pub window_id: String, pub payload: Vec<u8> /* JSON */, pub payload_hash: String, pub created_at: i64 }
  pub struct RetentionReport { pub dropped_bytes: u64, pub dropped_windows: u64 }
  impl Spool {
      pub fn open(cfg: SpoolConfig) -> Result<Spool, SpoolError>;  // batches(id INTEGER PK AUTOINCREMENT, window_id TEXT UNIQUE NOT NULL, payload BLOB NOT NULL, payload_hash TEXT NOT NULL, created_at INTEGER NOT NULL, dead_letter INTEGER NOT NULL DEFAULT 0, dead_reason TEXT)
      pub fn push_uncompressed(&mut self, window_id: &str, json: &[u8], created_at_s: i64) -> Result<(), SpoolError>; // valida raw ≤ 512 KB (SpoolError::TooLarge); si la fila ya existe (mismo window_id) se ACTUALIZA en transacción (no duplica fila)
      pub fn next_batch(&mut self, max: usize) -> Result<Vec<BatchRow>, SpoolError>; // FIFO por id ASC, `dead_letter = 0`
      pub fn confirm(&mut self, row_id: i64) -> Result<(), SpoolError>;        // DELETE tras 2xx processed|duplicate
      pub fn dead_letter(&mut self, row_id: i64, reason: &str) -> Result<(), SpoolError>; // dead_letter=1; NO se reenvía; visible para dump manual
      pub fn enforce_retention(&mut self, now_s: i64) -> RetentionReport;      // cota 500 MB y/o edad > 7 d: FIFO; registra bytes/ventanas descartadas
      pub fn len_bytes(&mut self) -> Result<u64, SpoolError>;                  // SUM(length(payload)) no dead_letter
      pub fn next_sequence(&mut self) -> Result<u64, SpoolError>;              // meta: contador monotónico persistido (>= 1)
  }
  ```
- Envelope:
  ```rust
  pub fn window_id_for(boot_id: &str, window_start_s: i64) -> String; // "win_" + ULID determinístico de (start_ms, boot hash) — estable ante reenvíos y reinicios con mismo boot
  pub struct IngestEnvelope { pub v: u8, pub device: DeviceInfo, pub window: IngestWindow, pub snapshot: WindowSnapshot }
  pub struct IngestWindow { pub id: String, pub start: String /* RFC3339 */, pub end: String /* RFC3339 */, pub duration_ms: u64, pub sequence: u64 }
  pub fn build_envelope(device: &DeviceInfo, window_id: String, sequence: u64, snap: &WindowSnapshot) -> IngestEnvelope;
  ```
- client + decisions:
  ```rust
  pub enum SyncDecision { Processed, Duplicate, NeedsEnrollment, Retriable { retry_after: Option<u64> }, InvalidContract, TooLarge, Transport }
  pub struct IngestClient { http: reqwest::Client, url: String, token: SecretString } // SecretString = crate `secrecy`; el token jamás se logea
  impl IngestClient {
      pub fn new(url: impl Into<String>, token_env: Option<String>) -> Result<Self, IngestError>; // token de env (SC_INGEST_TOKEN en config)
      pub async fn post_envelope(&self, env: &IngestEnvelope) -> SyncDecision; // comprime SIEMPRE el body con gzip (v1, ADR-0009; no confía en compresión de transporte), header Content-Encoding + Authorization Bearer; parsea las respuestas del contrato §2
  }
  ```
- Syncer: drain recurrente, máximo `30` batches por poll (compatible con rate 60/min burst 30 de §5.1):
  - 200 processed | duplicate → `confirm`
  - 408 / 429 / 5xx → `Retriable` — backoff exponencial con jitter: 1 s inicial, factor 2, techo 60 s, spread; sigue al next batch sin reintentos infinitos consecutivos
  - 400 invalid → `dead_letter("invalid_contract")` + error registrado en `HealthRegistry::note_error`
  - 401 / 403 → `needs_enrollment = true` (HealthRegistry), spool conservado; el loop solo re-poll cada 60 s (nunca intenta en ráfaga; comportamiento conservador)
  - 413 → dead_letter("too_large") (division no implementada en M1)
  - error de transport → Retriable (backoff igual)
- Retención: cada vez que se itera, `enforce_retention()` reporta las pérdidas a la HealthRegistry (`data_loss_bytes`, `data_loss_windows`). JAMÁS silencioso.

**Tests** (mock server en proceso: `tokio::net::TcpListener`, HTTP/1.1 hand-crafted, sin deps extra):
1. `tests/spool.rs` — push/next/confirm FIFO; re-push con la misma identity (mismo window_id) actualiza el payload sin duplicar fila; dead_letter excluye de `next_batch`; `enforce_retention` por cota y por edad con clock dummy; conteos de `RetentionReport` correctos; `next_sequence` monotónico (re-abrir el spool retoma el valor).
2. `tests/client_mock.rs` — tabla de respuestas: 200 processed, 200 duplicate, 400, 401, 403, 408, 413, 429 con Retry-After, 500, conexión abortada → cada caso produce el `SyncDecision` correcto; el mock valida que el body llegue gzip válido con `Content-Encoding: gzip`; la descompresión retorna el JSON original.
3. `tests/e2e_idempotent.rs` — pipeline completo sin pcap: FlowUpdates inyectados al channel de Task 3 → `WindowAggregator` con FixedClock → snapshot → envelope (window_id determinista, sequence 1 y 2) → spool → `IngestClient` → mock: primer POST → 200 processed → spool empty; re-push del mismo window (mismo JSON) → el mock responde `200 {status:"duplicate"}` (idempotencia ADR-0008, sin doble métrica) → spool sigue empty y no hay error; un payload con campo extra inválido → mock 400 → batch en dead_letter (assert de fila con dead_reason).

- [ ] **Step 1: spool.rs + tests (1).**
- [ ] **Step 2: envelope.rs + window_id_for + tests de determinismo (mismo boot + mismos window_start → mismo id).**
- [ ] **Step 3: mock_server.rs + client.rs + tests (2).**
- [ ] **Step 4: syncer.rs + tests del mapping completo (9 filas del contrato §2).**
- [ ] **Step 5: tests/e2e_idempotent.rs PASS** — es el criterio del hito "mock server recibe batches idempotentes (duplicate aceptado)".
- [ ] **Step 6: Commit** `feat(sc-sync): spool SQLite FIFO+cota+dead_letter, cliente /api/ingest (gzip, backoff, idempotencia) y mock e2e`.

---

### Task 9: sc-agent — bin cableado, config, logs y smoke offline; docs y CI

**Files:**
- Modify: `agent/crates/sc-agent/src/main.rs` (wiring del pipeline; shutdown graceful)
- Modify: `agent/crates/sc-agent/Cargo.toml` (deps: sc-capture, sc-aggregate, sc-geo, sc-sync, sc-config, sc-telemetry, sc-core; tokio; clap; config; anyhow)
- Create: `agent/crates/sc-agent/src/config.rs` (parseo TOML con crate `config`; defaults y validación)
- Create: `agent/config/sc-agent.toml.sample` (ejemplo committeado; NUNCA un config real con token)
- Modify: `agent/README.md` (mapa de crates y estado M1)
- Modify: `docs/legal/THIRD_PARTY_NOTICES.md` (rutas reales heredadas: `networking/parse_packets.rs`, `networking/manage_packets.rs`, `mmdb/`; nota de que `ipfix/` se hace en M4 desde `main@<sha>`; corregir nombre del autor: Guilherme "Guly" Vardanyan)
- Modify: `docs/adr/0006-sniffnet-extraction.md` — añadir abajo una nota aclaratoria (no retroeditar la decisión): verificación 2026-11-03 del tag: `capture.rs` e `ipfix/` existen solo en `main` sin tag; la extracción de sc-collector se realizará en M4 con pin a un `main@<sha>` a definir.
- Modify: `.github/workflows/rust.yml` (agregar `cargo check --features zstd` como gate; ver Step 5)
- Create: `agent/scripts/smoke-offline.md` (instrucciones del smoke local offline con el binario, no tracker/integration en CI)

**Interfaces:**
- CLI:
  ```text
  sc-agent --version
  sc-agent --config <path.toml>         # default ./sc-agent.toml
  sc-agent --capture-file <path.pcap>   # replay offline (no requiere privilegios, ni feature live)
  sc-agent --interface <name|auto>      # captura live; requiere binario compilado con --features live
  ```
  (Clap parsea y valida en orden; errores claros si se pide live sin feature: "compile --features live".)
- Config TOML (sample; claves respetan spec §9.4 salvo simplificaciones M1 anotadas):
  ```toml
  [device]
  id = "dev_01J..."           # asignado manualmente en v1 (enrollment via dashboard M2, ADR-0010)
  hostname = "auto"           # "auto" -> hostname real del host

  [network]
  interface = "auto"          # nombre del device pcap o "auto"
  local_ips = "auto"          # "auto" | lista explícita de IPs locales a clasificar (para las direcciones In/Out de los(hosts))

  [privacy]
  anonymize_hosts = true
  hmac_key_env = "SC_HOST_KEY"   # la clave vive en env; NUNCA se persiste en el archivo (§9.4)

  [ingest]
  url = "https://sc-sentinel.vercel.app/api/ingest"
  token_env = "SC_INGEST_TOKEN"  # Bearer según contrato §1
  compression = "gzip"           # gzip | zstd (zstd requiere feature binaria)

  [spool]
  path = "./spool/sc-spool.sqlite"
  max_bytes = 524288000
  max_age_days = 7

  [log]
  level = "info"                 # SC_LOG override
  ```
- Run loop (esqueleto main):
  1. `sc-telemetry::logging::init`; `HealthRegistry::new()`.
  2. Load config (env overrides SC_*); `Spool::open`.
  3. Spawn capture thread offline (o live con feature) → `CaptureChannel`.
  4. Task `WindowAggregator::run` consume `rx` y emite snapshots por un `mpsc::Sender<WindowSnapshot>`.
  5. Task syncer por snapshot: build envelope (window_id determinista; sequence de spool) → `serde_json` → size gate (512 KB sin comprimir; error bendito a HealthRegistry si se excede) → gzip → `Spool::push_uncompressed` (siempre push del JSON sin comprimir; el comprimido se genera en el client) → el client hace POST → decisions row de syncer → confirm/dead_letter/needs_enrollment (todo con HealthRegistry actualizada).
  6. Shutdown: `tokio::select!` sobre ctrl-c → cierre del capture thread (el canal se closea al dropear los producers), flush determinista de la ventana activa y del `Spool` → exit 0. Segundo Ctrl+C o crash: exit != 0 con `last_error` en log (nunca silencioso).
- Logs (criterio M1): al cierre de cada ventana, `tracing::info!` con `packets_seen/dropped/parse_errors/queue_depth/spool_bytes` (§10), token/time redactados.

- [ ] **Step 1: config.rs + sample + tests de parseo/validación (env not set → error claro; auto hostname; defaults).**
- [ ] **Step 2: main.rs wiring + shutdown graceful (ctrlc en tokio::select!, captura en thread bloqueante de Task 4).**
- [ ] **Step 3: Smoke offline manual** (documentado en `agent/scripts/smoke-offline.md`, no automatizado en CI):
  ```bash
  $env:SC_HOST_KEY="test"; $env:SC_INGEST_TOKEN="test"
  cargo run -p sc-agent -- --capture-file agent/fixtures/loopback-trace.pcap --config agent/config/sc-agent.toml.sample
  ```
  Esperado: pocas líneas INFO de ventanas cerradas con métricas no-cero y errores de conexión claros si la URL de ingest no responde — el pipeline corre, el spool guarda y los logs son visibles. La validación end-to-end completa la cubre el test e2e de Task 8; el smoke de tráfico real se hace en Task 10.
- [ ] **Step 4: docs: ADR-0006 nota aclaratoria + THIRD_PARTY_NOTICES (rutas reales + autor) + agent/README mapa actualizado (DAG de M1; sc-collector diferido a M4).**
- [ ] **Step 5: CI rust.yml** — agregar un step `cargo check --features zstd` al final (el resto de steps se mantienen): necesario para el criterio M1 "zstd flag compila". Si el workspace no compila con zstd (no debería, es puro), fail fast en CI.
- [ ] **Step 6: Commits**:
  - `feat(sc-agent): wiring del daemon con capture+aggregate+sync, config TOML y smoke offline`
  - `docs(agent): aclaración ADR-0006, THIRD_PARTY_NOTICES ruta reales, mapa de crates M1`
  - `ci(agent): gate cargo check --features zstd`

---

### Task 10: Verificación final M1 (§14.3) y smoke de tráfico real

**Files (sin código nuevo):**
- Modify: `docs/testing/acceptance-criteria.md` — marcar los checks M1 verificados con evidencia (comandos y fecha).

**Checklist de ejecución** (Windows local; todo exit 0):
1. `cargo test` (en `agent/`) — todo verde, incl. golden (insta) y e2e mock.
2. `cargo test -p sc-sync --test e2e_idempotent` explícito — idempotencia duplicate verificada.
3. `cargo check --features zstd` — compila (o falla con motivo documentado en plan/ADR).
4. `cargo build --release` + `target/release/sc-agent.exe --version` — `sc-sentinel-agent 0.2.0` (bump workspace.version a 0.2.0 al cerrar M1).
5. `cargo fmt --check && cargo clippy -- -D warnings` — requerido antes de push (gate del CI Rust).
6. Smoke de tráfico real del propietario (paso con interacción humana, Windows con Npcap):
   ```bash
   cargo run -p sc-agent --features live -- --config sc-agent.toml --interface auto
   ```
   En M1 no existe `/api/ingest` real (se publica en M2): el destino end-to-end NO es Vercel todavía; el smoke con tráfico real corre contra un servidor local (p. ej. reusar el harness de `tests/mock_server.rs` exponiéndolo como pequeño binario `sc-mock` opcional, o el smoke offline con `url = http://127.0.0.1:<puerto>`). Con el mock (o con Vercel cuando M2 publique `/api/ingest`) aceptando 200 processed/duplicate, los logs deben mostrar batches confirmados y el spool sin pendientes. El criterio "Smoke: tráfico real del propietario publicado end-to-end" se marca solo con esa salida visible.
7. Si el usuario no puede correr el smoke hoy (Npcap/token/config), la Task 10 marca solo los checks 1–5 y deja el check 6 pendiente con instrucciones concretas (nunca se marca porque sí).

**Criterios de cierre (git):**
- Workflow Rust CI verde (todo se **push** en cada task; la verificación de GitHub por steps es parte del cierre).
- Commit de cierre: `chore(agent): milestone M1 completo — capture+aggregate+sync end-to-end (mock)` `--allow-empty`.

**Out of scope de M1 (queda para M2+):**
- sc-detect: sin reglas (alerts vacíos; llega post-M1 cuando sc-aggregate expone su API de eventos).
- sc-collector: `ipfix/` se hace en M4 con pin a `main@<sha>` (ver Nota 1).
- Servidor `/api/ingest` real (M2), Neon, dashboard, IA, servicio Windows, GUI, auth device, cleanup Vercel.
- Cleanup del spool bajo carga de producción (la cota/FIFO ya está implementada; la verificación con carga se hace en la Task 10 o queda para M2).
