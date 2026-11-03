# M0 — Scaffold + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo completo con estructura del spec §4 (workspace Rust `agent/` de 11 crates esqueleto + Next.js 15 en `web/` + CI workflows verdes) que compila en Windows y Linux.

**Architecture:** Monorepo (ADR-0001): `agent/` workspace Cargo con crates por responsabilidad, `web/` Next.js 15 + Tailwind v4 CSS-first, `docs/` ya existente. M0 solo crea esqueletos que compilan y testean trivialmente — la lógica real (extracción de Sniffnet TCP) es M1.

**Tech Stack:** Rust stable (tokio stub), Next.js 15 + TypeScript + Tailwind v4 + pnpm, GitHub Actions (`dtolnay/rust-toolchain`, `pnpm/action-setup@v4`), Node scripts para validación de contratos.

**Fuente de verdad:** `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §4 (estructura), §14.3 (criterios M0), §15.1 (CI). Cada task referencia su sección.

## Global Constraints

- Licencia: PROPIETARIA Strategic Connex. Archivos fuente llevan como primera línea el header `// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.` (los headers MIT/Apache se agregan en M1 solo a archivos heredados de Sniffnet).
- Prohibido usar la marca "Sniffnet" en nombres, UI o copy propio.
- Español internacional profesional (rioplatense neutro) en comentarios/docs/UI; identificadores de código en inglés.
- Rust workspace con `[workspace.package]` compartido: `version = "0.1.0"`, `edition = "2021"`, `rust-version = "1.75"`; crates nombrados `sc-*`.
- `sc-core` NO depende de ningún otro crate interno (jerarquía ADR-0002); la jerarquía entre crates es un DAG estricto, sin ciclos, declarado mediante dependencias explícitas en Cargo.toml.
- Web: Next.js 15, TypeScript estricto, Tailwind v4 CSS-first (tokens en `@theme` dentro de `globals.css`, sin `tailwind.config.js`), pnpm como package manager. Recharts SOLO cuando se agregue el primer gráfico (M2 — YAGNI, no instalar en M0).
- Contratos: números de schema `v1`; snapshots agregados con campo de versión `"v"`. Los JSON Schemas y ejemplos YA EXISTEN en `docs/contracts/` — M0 solo los valida en CI, no los reescribe.
- Todos los paths del plan son relativos a `D:\ProyectosWeb\SC-Sentinel\` (raíz repo, branch `main`, historia actual `9f4cbc0` ← `17c5ee1` ← `96cd047`).
- Windows es la plataforma de desarrollo de Juan: cada task debe quedar compilando en Windows; el CI matrix garantiza Linux en la nube.

---

### Task 1: Workspace Cargo + sc-core con tipos dominio

**Files:**
- Create: `agent/Cargo.toml`
- Create: `agent/README.md`
- Create: `agent/crates/sc-core/Cargo.toml`
- Create: `agent/crates/sc-core/src/lib.rs`
- Create: `agent/crates/sc-core/src/types.rs`
- Test: `agent/crates/sc-core/src/types.rs` (tests inline)

**Interfaces:**
- Consumes: nada (crate raíz de la jerarquía).
- Produces: tipos dominio que M1+ consume — `pub struct FlowKey { pub src_ip: u128, pub dst_ip: u128, pub src_port: u16, pub dst_port: u16, pub protocol: Protocol }`, `pub enum Protocol { Tcp, Udp, Other }`, `pub struct HostStats { host_key: String, ip_display: Option<String>, country: Option<String>, bytes_in: u64, bytes_out: u64, packets_in: u64, packets_out: u64, connections: u32 }`, `pub struct WindowSnapshot { v: u8, created_at: String, window: Window, top_hosts: Vec<HostStats>, top_ports: Vec<PortStat>, top_countries: Vec<CountryStat>, alerts: Vec<Alert>, health: AgentHealth }` — nombres y campos EXACTOS de `docs/contracts/window-snapshot.v1.schema.json`, con `Serialize`/`Deserialize`/`PartialEq`/`Debug`/`Clone` derivados.

- [ ] **Step 1: Crear `agent/Cargo.toml` (workspace)**

```toml
[workspace]
resolver = "2"
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
license-file = "../LICENSE"
authors = ["Strategic Connex"]

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"
tokio = { version = "1.40", features = ["rt-multi-thread", "macros", "sync", "time"] }
uuid = { version = "1.11", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
```

- [ ] **Step 2: Crear `agent/crates/sc-core/Cargo.toml`**

```toml
[package]
name = "sc-core"
description = "Tipos de dominio compartidos (FlowKey, HostStats, Alert, WindowSnapshot)"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license-file = "../../../LICENSE"
authors.workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true
chrono.workspace = true
```

- [ ] **Step 3: Crear `agent/crates/sc-core/src/lib.rs` y `src/types.rs`**

`lib.rs`:
```rust
//! sc-core — Tipos de dominio compartidos de SC-Sentinel.
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

pub mod types;

pub use types::{
    AgentHealth, Alert, AlertSeverity, CountryStat, FlowKey, HostStats, PortStat, Protocol,
    Window, WindowSnapshot, SC_CORE_SCHEMA_VERSION,
};
```

`types.rs`:
```rust
//! Tipos de dominio — espejo exacto de `docs/contracts/*.schema.json` (v1).
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Versión del contrato de snapshot soportada (campo `v` del JSON).
pub const SC_CORE_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
    Other,
}

/// Clave de flujo: identidad de una conexión agregada.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FlowKey {
    pub src_ip: u128,
    pub dst_ip: u128,
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: Protocol,
}

/// Ventana de agregación: [start, end) en epoch seconds, duración 30–60 s.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Window {
    pub start: i64,
    pub end: i64,
    pub duration_ms: u64,
}

/// Un host agregado dentro de una ventana (top N).
/// `ip_display` es None cuando anonymize_hosts=true (regla normativa del contrato ingest-api.v1.md).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HostStats {
    pub host_key: String,
    pub ip_display: Option<String>,
    pub country: Option<String>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub packets_in: u64,
    pub packets_out: u64,
    pub connections: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PortStat {
    pub port: u16,
    pub protocol: Protocol,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub connections: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CountryStat {
    pub country: String, // ISO alpha-2
    pub bytes_in: u64,
    pub bytes_out: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Alert {
    pub rule_id: String, // ^[a-z0-9_]+$ ≤64 — ver docs/contracts/alert.v1.schema.json
    pub severity: AlertSeverity,
    pub title: String,       // ≤200
    pub description: String, // ≤1000
    pub evidence: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureStatus {
    Ok,
    Degraded,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentHealth {
    pub capture_status: CaptureStatus,
    pub packets_seen: u64,
    pub packets_dropped: u64,
    pub parse_errors: u64,
    pub spool_bytes: u64,
    pub last_error: Option<String>,
}

/// Snapshot agregado de una ventana (~2–10 KB JSON).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowSnapshot {
    pub v: u8,
    pub created_at: DateTime<Utc>,
    pub window: Window,
    pub top_hosts: Vec<HostStats>,
    pub top_ports: Vec<PortStat>,
    pub top_countries: Vec<CountryStat>,
    pub alerts: Vec<Alert>,
    pub health: AgentHealth,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> WindowSnapshot {
        WindowSnapshot {
            v: SC_CORE_SCHEMA_VERSION,
            created_at: Utc::now(),
            window: Window { start: 1_736_000_000, end: 1_736_000_030, duration_ms: 30_000 },
            top_hosts: vec![HostStats {
                host_key: "a1b2c3d4e5f6a7b8".into(),
                ip_display: None,
                country: Some("AR".into()),
                bytes_in: 1024,
                bytes_out: 2048,
                packets_in: 10,
                packets_out: 20,
                connections: 3,
            }],
            top_ports: vec![],
            top_countries: vec![],
            alerts: vec![],
            health: AgentHealth {
                capture_status: CaptureStatus::Ok,
                packets_seen: 100,
                packets_dropped: 0,
                parse_errors: 0,
                spool_bytes: 0,
                last_error: None,
            },
        }
    }

    #[test]
    fn snapshot_serializa_json_roundtrip() {
        let json = serde_json::to_string(&sample_snapshot()).unwrap();
        let back: WindowSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back, sample_snapshot());
    }

    #[test]
    fn campo_v_es_la_version_del_contrato() {
        let json = serde_json::to_value(sample_snapshot()).unwrap();
        assert_eq!(json["v"], 1);
    }
}
```

- [ ] **Step 4: Crear `agent/README.md`** (mapa de crates + jerarquía de dependencias de ADR-0002 en 10 líneas, referenciado a `docs/adr/0002-rust-agent.md` y `docs/README.md`).

- [ ] **Step 5: Compilar y testear**

Run: `cargo test` (en `agent/`)
Expected: PASS — 2 tests de sc-core + warning 0 (crate compila standalone).

- [ ] **Step 6: Commit**

```bash
git add agent/
git commit -m "feat(agent): workspace cargo + sc-core con tipos dominio v1"
```

---

### Task 2: Crates esqueleto con jerarquía de dependencias (sc-gui NO se crea en M0)

**Files:**
- Create: `agent/crates/sc-capture/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-collector/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-geo/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-detect/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-aggregate/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-sync/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-config/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-telemetry/Cargo.toml` + `src/lib.rs`
- Create: `agent/crates/sc-agent/Cargo.toml` + `src/main.rs` (bin)
- Create: `agent/deny.toml`
- Test: 1 test smoke por crate (stub `assert!(true)` reemplazado por comportamiento real en M1+; sc-agent agrega test de binario que ejecuta `--version`)

**Interfaces:**
- Consumes: `sc-core` primario de Task 1 (ruta `sc-core = { path = "../sc-core" }` desde los que lo necesiten).
- Produces: `sc-agent::main()` (bin `sc-agent`), `pub fn name() -> &'static str` por crate (útil para smoke tests), `agent/deny.toml` con la matriz de licencias externas permitidas (MIT, Apache-2.0, BSD, Unicode-3.0, Zlib, CC0-1.0, ISC).

- [ ] **Step 1: Crear los 8 crates fuente con su Cargo.toml**

Cada `Cargo.toml` sigue el patrón de sc-core (workspace heredado, `license-file = "../../../LICENSE"`) y su `lib.rs` publica una función de identidad para smoke tests:
```rust
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
pub fn name() -> &'static str { "sc-capture" }

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() { assert_eq!(super::name(), "sc-capture"); }
}
```
(Cambiar el string literal por el nombre de cada crate: `sc-collector`, `sc-geo`, `sc-detect`, `sc-aggregate`, `sc-sync`, `sc-config`, `sc-telemetry`.)

Jerarquía de dependencias a declarar en cada `[dependencies]` (ADR-0002, SOLO interiores; dejar `sc-agent` para el bin):
- `sc-capture`, `sc-collector`, `sc-geo`: solo deps externas (por ahora ninguna de workspace; pcap y maxminddb llegan en M1 — YAGNI).
- `sc-aggregate`: `sc-core = { path = "../sc-core" }`, `tokio.workspace = true`
- `sc-detect`: `sc-core = { path = "../sc-core" }`
- `sc-sync`: `sc-core = { path = "../sc-core" }`
- `sc-config`: sin deps de workspace (toml llega en M1).
- `sc-telemetry`: sin deps de workspace.

`sc-agent/Cargo.toml` declara el bin:
- `sc-agent`: `[package]` completo + `[[bin]] name = "sc-agent" path = "src/main.rs"` + `license-file = "../../../LICENSE"`. En M0 NO tiene dependencias de workspace (el daemon real se cablea en M1).

- [ ] **Step 2: Crear `agent/crates/sc-agent/src/main.rs` (bin `sc-agent`)**

```rust
//! sc-agent — daemon headless (esqueleto M0: solo imprime versión).
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("sc-sentinel-agent {}", env!("CARGO_PKG_VERSION"));
    } else {
        eprintln!("sc-sentinel-agent: el daemon real se implementa en M1. Use --version.");
        std::process::exit(2);
    }
}
```

- [ ] **Step 3: Crear `agent/deny.toml`** (minimal cargo-deny)

```toml
[graph]
# Sección vacía en M0: solo se auditan las dependencias que existan.

[licenses]
version = 2
# Crates externos permitidos. Los módulos propios del workspace (propietarios)
# se gestionan vía dependencias path internas, no entra a la matriz de
# licencias externas.
allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "Unicode-3.0", "Zlib", "CC0-1.0", "ISC"]
```

- [ ] **Step 4: Verificar jerarquía (cumplir ADR-0002 vía dependencias)**

Run: `cargo tree -e normal --depth 1` (en `agent/`)
Expected: cada crate fuente depende solo de lo declarado; sin ciclos; `sc-core` NO aparece debajo de nada; `sc-agent` sin deps de workspace en M0.

- [ ] **Step 5: Compilar y testear todo el workspace**

Run: `cargo test && cargo build --release` (en `agent/`)
Expected: PASS todos los smoke tests; `sc-agent` binario existe en `target/release/`.

- [ ] **Step 6: Commit**

```bash
git add agent/
git commit -m "feat(agent): crates esqueleto con jerarquia de dependencias ADR-0002"
```

---

### Task 3: CI Rust (`agent/` Windows + Linux)

**Files:**
- Create: `.github/workflows/rust.yml`
- Modify: `agent/Cargo.toml` (agregar `[profile.release] lto = false` para velocidad CI — opcional, omitir si no hace falta)

**Interfaces:**
- Consumes: workspace de Tasks 1–2.
- Produces: workflow verde en GitHub en ambos OS; pasos exactos copiados del spec §15.1 con paths filtrados al workspace.

- [ ] **Step 1: Crear `.github/workflows/rust.yml` exactamente así**

```yaml
name: Rust CI
on:
  push:
    paths: ["agent/**", ".github/workflows/rust.yml"]
  pull_request:
    paths: ["agent/**", ".github/workflows/rust.yml"]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest]
    defaults:
      run:
        working-directory: agent
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-deny,cargo-audit
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test
      - run: cargo audit
      - run: cargo deny check licenses
      - run: cargo build --release
```

Defaults `working-directory: agent` evitan correr los comandos en la raíz (que no es workspace). `taiki-e/install-action` instala las binarias sin compilarlas (mucho más rápido que `cargo install`).

- [ ] **Step 2: Formatear el workspace para que fmt --check pase localmente**

Run: `cargo fmt` (en `agent/`)
Expected: sin diff significativo tras formateo inicial.

- [ ] **Step 3: Pre-validar clippy localmente (Windows)**

Run: `cargo clippy -- -D warnings` (en `agent/`)
Expected: PASS con warning 0 (esqueletos leves). Ajustar cualquier `#[warn]` real que aparezca.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/rust.yml agent/
git commit -m "ci(agent): workflow rust windows+linux (fmt clippy test audit deny build)"
```

- [ ] **Step 5: Empujar y verificar CI verde en GitHub**

Run: `git push`
Expected: workflow "Rust CI" matrix windows-latest/ubuntu-latest en verde (verificar en GitHub Actions). Si falla por lockdown de OS, iterativa: fix → commit → push.

---

### Task 4: Contratos — validación script + workflow `contracts.yml`

**Files:**
- Create: `scripts/validate-contracts.js` (Node ≥20, sin deps)
- Create: `.github/workflows/contracts.yml`
- Test: el script mismo tested contra los 4 ejemplos y 3 schemas ya existentes en `docs/contracts/`

**Interfaces:**
- Consumes: `docs/contracts/window-snapshot.v1.schema.json`, `alert.v1.schema.json`, `agent-health.v1.schema.json`, `examples/snapshot-minimal.json`, `examples/snapshot-with-alerts.json`, `examples/ingest-request.invalid.json`.
- Produces: `npm run validate-contracts` equivalent en CI vía `node scripts/validate-contracts.js`; exit 1 con mensaje claro contratando el archivo/linea.

- [ ] **Step 1: Crear `scripts/validate-contracts.js`**

```javascript
#!/usr/bin/env node
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Valida ejemplos JSON contra los JSON Schemas del contrato v1 SIN dependencias.
// Schema engine minima inline (draft 2020-12 subset: type, required, properties,
// additionalProperties=false, enum, minimum, maximum, pattern, minLength/maxLength).
// M1+ puede migrar a ajv si la validación se vuelve compleja (YAGNI ahora).

const fs = require("fs");
const path = require("path");

const CONTRACTS = path.join(__dirname, "..", "docs", "contracts");
let failures = 0;

function fail(msg) { console.error(`FAIL: ${msg}`); failures++; }
function load(rel) { return JSON.parse(fs.readFileSync(path.join(CONTRACTS, rel), "utf8")); }

// --- Subset de validación JSON Schema ---
function validate(value, schema, canonical, errors, pathStr) {
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return errors.push(`${canonical || pathStr}: se esperaba objeto, se recibió ${typeof value}`), false;
    if (schema.required)
      for (const req of schema.required)
        if (!(req in value)) errors.push(`${canonical || pathStr}: falta propiedad requerida "${req}"`);
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) sub && validate(value[k], sub, null, errors, pathStr ? `${pathStr}.${k}` : k);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const k of Object.keys(value))
        if (!allowed.has(k)) errors.push(`${canonical || pathStr}: propiedad adicional "${k}" no permitida`);
    }
    return true;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return errors.push(`${canonical || pathStr}: se esperaba array`), false;
    value.forEach((item, i) => item && schema.items && validate(item, schema.items, null, errors, `${pathStr}[${i}]`));
    return true;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return errors.push(`${canonical || pathStr}: se esperaba string`), false;
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${pathStr}: "${value}" no está en enum [${schema.enum.join(", ")}]`);
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${pathStr}: longitud ${value.length} < minLength ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${pathStr}: longitud ${value.length} > maxLength ${schema.maxLength}`);
    if (schema.pattern && new RegExp(schema.pattern).test(value) === false) errors.push(`${pathStr}: "${value}" no matchea patrón ${schema.pattern}`);
    return true;
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || (schema.type === "integer" && !Number.isInteger(value)))
      return errors.push(`${pathStr}: se esperaba ${schema.type}`), false;
    if (schema.minimum != null && value < schema.minimum) errors.push(`${pathStr}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${pathStr}: ${value} > maximum ${schema.maximum}`);
    return true;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${pathStr}: se esperaba boolean`);
    return true;
  }
  if (schema.type === "null") {
    if (value !== null) errors.push(`${pathStr}: se esperaba null`);
    return true;
  }
  return true;
}

// Snapshot: los ejemplos válidos del doc set deben pasar el schema
// window-snapshot.v1. Los $defs internos del schema se resuelven en línea.
function resolveRefs(schema, root) {
  if (Array.isArray(schema)) return schema.map((s) => resolveRefs(s, root));
  if (schema === null || typeof schema !== "object") return schema;
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/$defs/")) {
    const def = root.$defs?.[schema.$ref.slice("#/$defs/".length)];
    return def ? resolveRefs(def, root) : {};
  }
  const out = {};
  for (const [k, v] of Object.entries(schema)) out[k] = resolveRefs(v, root);
  return out;
}

function validateValid(name, schemaFile, exampleFile) {
  const root = load(schemaFile);
  const schema = resolveRefs(root, root);
  const example = load(exampleFile);
  const errors = [];
  validate(example, schema, false, errors, "$");
  if (errors.length) fail(`${name}: ${errors.join("; ")}`);
  else console.log(`OK: ${name} valida contra ${schemaFile}`);
}

function validateInvalid(name, schemaFile, exampleFile) {
  const root = load(schemaFile);
  const schema = resolveRefs(root, root);
  const example = load(exampleFile);
  const errors = [];
  validate(example, schema, false, errors, "$");
  if (!errors.length) fail(`${name} (inválido): no generó ningún error y debería`);
  else console.log(`OK: ${name} rechazado correctamente (${errors.length} errores detectados)`);
}

// --- Casos principales (agregar más cuando aparezcan nuevos contratos) ---
validateValid("snapshot-minimal", "window-snapshot.v1.schema.json", "examples/snapshot-minimal.json");
validateValid("snapshot-with-alerts", "window-snapshot.v1.schema.json", "examples/snapshot-with-alerts.json");
// El envelope completo de /api/ingest (§5.1) se valida desde M2 con ajv.

if (failures > 0) { console.error(`\n${failures} fallos de validación.`); process.exit(1); }
console.log("\nContratos OK.");
```

> Nota para el implementador: este script es un validador mínimo sin dependencias (subset de JSON Schema draft 2020-12: type, required, properties, additionalProperties:false, enum, minimum/maximum, pattern, min/maxLength, resolución de `$ref` hacia `$defs` del mismo documento). Restricción dura: los dos casos `validateValid` deben pasar con exit 0 contra los schemas y ejemplos REALES de `docs/contracts/` (ya commiteados en `96cd047`); todo lo que el subset no pueda validar se reporta explícitamente, jamás se silencia. Si M2 exige una validación que exceda este subset, migrar a `ajv` (agregar setup-node + install en el workflow) — no extender el parser manual más allá de lo mostrado (YAGNI).

- [ ] **Step 2: Ejecutar script localmente contra contratos reales**

Run: `node scripts/validate-contracts.js`
Expected: `OK: snapshot-minimal valida...`, `OK: snapshot-with-alerts valida...`, exit 0. Si algún ejemplo del doc set no valida contra su schema real, corregir el schema o el ejemplo (son artefactos del spec — lo que esté mal se arregla, la discrepancia jamás se oculta).

- [ ] **Step 3: Crear `.github/workflows/contracts.yml`**

```yaml
name: Validate Contracts
on:
  push:
    paths: ["docs/contracts/**", "scripts/**", ".github/workflows/contracts.yml"]
  pull_request:
    paths: ["docs/contracts/**", "scripts/**", ".github/workflows/contracts.yml"]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/validate-contracts.js
```

- [ ] **Step 4: Commit + push + verificar CI verde**

```bash
git add scripts/ .github/workflows/contracts.yml
git commit -m "ci(contracts): validador de contratos v1 sin deps + workflow"
git push
```
Expected: "Validate Contracts" verde.

---

### Task 5: Web Next.js 15 esqueleto + Tailwind v4 CSS-first

**Files:**
- Create: `web/` completamente vía `create-next-app@15` y luego ediciones manuales
- Create: `web/app/globals.css` (tokens @theme)
- Create: `web/app/page.tsx` (placeholder "SC-Sentinel")
- Modify: `web/package.json` (agregar scripts `lint`, `typecheck`, `test`)
- Create: `web/.gitignore` (generado por create-next-app)

**Interfaces:**
- Consumes: pnpm 9+ instalado.
- Produces: `web/` compila — scripts pnpm lint/typecheck/test/build todos exit 0; tokens CSS `--sc-*` en globals.css para M3; estructura de carpetas del spec §4 creada con README placeholder: `app/(marketing)`, `app/(dashboard)/dashboard/{overview,hosts,connections,alerts,ai,settings}`, `app/api`, `components/{ui,marketing,dashboard}`, `lib/schemas`, `content`, `public/og`.

- [ ] **Step 1: Scaffold con create-next-app**

```bash
cd D:\ProyectosWeb\SC-Sentinel
pnpm create next-app@15 web --ts --eslint --app --src-dir=false --import-alias "@/*" --tailwind --turbopack --use-pnpm --no-install
pnpm install --dir web
```
Si el prompt de `--turbopack` es interactivo, responder según el default (turbopack activado es válido). Verificar que NO se genere `tailwind.config.js` (Tailwind v4 va vía plugin de postcss ya configurado). Si algún prompt imprevisto aparece, elegir el default más cercano a "TypeScript, ESLint, App Router, sin src/, alias @/*".

- [ ] **Step 2: Escribir `web/app/globals.css` con tokens base**

```css
/* SC-Sentinel — Tailwind v4 CSS-first (ADR/spec complemento ADR-0012 + docs/ux/design-tokens.md) */
/* Los --sc-* verdaderos de marca se extraen de strategicconnex.com.ar en M3 (UX doc); estos son los neutrales del spec. */
@import "tailwindcss";

@theme {
  /* Base neutrales (de docs/ux/design-tokens.md) */
  --color-sc-bg: #0b1220;
  --color-sc-surface: #111827;
  --color-sc-surface-alt: #1f2937;
  --color-sc-text: #e5e7eb;
  --color-sc-text-muted: #94a3b8;

  /* Estados semánticos — NO cambian con la extracción de marca */
  --color-sc-ok: #10b981;
  --color-sc-warn: #f59e0b;
  --color-sc-degraded: #8b5cf6;
  --color-sc-risk-low: #22c55e;
  --color-sc-risk-medium: #eab308;
  --color-sc-risk-high: #f97316;
  --color-sc-risk-critical: #ef4444;

  /* Data-viz — NO cambian con la extracción de marca */
  --color-sc-viz-in: #38bdf8;
  --color-sc-viz-out: #a78bfa;
}

body {
  background: var(--color-sc-bg);
  color: var(--color-sc-text);
}
```

- [ ] **Step 3: Simplificar `web/app/layout.tsx` y `page.tsx`**

`layout.tsx`:
```tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import "./globals.css";

export const metadata = {
  title: "SC-Sentinel",
  description: "Monitoreo de red con motor determinista local. La nube recibe señales agregadas, no paquetes crudos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

`page.tsx`:
```tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">SC-Sentinel</h1>
        <p className="mt-2 text-[var(--color-sc-text-muted)]">
          Anomaly Shield — Strategic Connex
        </p>
        <p className="mt-8 text-sm">Esqueleto M0 — landing real en M3.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Crear las carpetas del árbol del spec §4**

Se crean las carpetas de grupos `(marketing)` y `(dashboard)` que create-next-app no genera, con un README.md placeholder de 2 líneas en cada una (nombre del módulo + "se puebla en M2/M3 según docs/README.md"):

```bash
for d in "app/(marketing)" "app/(dashboard)/dashboard/overview" "app/(dashboard)/dashboard/hosts" "app/(dashboard)/dashboard/connections" "app/(dashboard)/dashboard/alerts" "app/(dashboard)/dashboard/ai" "app/(dashboard)/dashboard/settings" "app/api" "components/ui" "components/marketing" "components/dashboard" "lib/schemas" "content" "public/og"; do mkdir -p "web/$d"; touch "web/$d/README.md"; done
```
(Si pwsh da problemas con los paréntesis en los nombres, crear los directorios individualmente con `mkdir` — el resultado debe ser idéntico al árbol §4.)

NOTA: el `page.tsx` de Step 3 vive en la raíz de `app/` temporalmente en M0; la home real se moverá a `app/(marketing)/page.tsx` en M3.

- [ ] **Step 5: Agregar scripts a `web/package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "echo \"sin tests web en M0\" && exit 0"
}
```
(No se agregan scripts `playwright` ni `vitest` en M0 — Playwright/Vitest se instalan en M2. Con el `test` stub, la CI web del Task 6 pasa sin cambios.)

- [ ] **Step 6: Verificar todo localmente**

```bash
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web test
```
Expected: 4 comandos exit 0 — build de Next.js 15 exitoso.

- [ ] **Step 7: Commit**

```bash
git add web/ .gitignore
git commit -m "feat(web): scaffold nextjs 15 + tailwind v4 css-first tokens base"
```

---

### Task 6: CI Web + CI raíz, filtros por path

**Files:**
- Create: `.github/workflows/web.yml`
- Modify: `.github/workflows/rust.yml` (ya filtrado por paths — verificar que la Task 3 lo hizo con filtro correcto: push paths `agent/**, .github/workflows/rust.yml` — sí).

**Interfaces:**
- Consumes: web/ de Task 5 con scripts lint/typecheck/test/build exit 0.
- Produces: workflow "Web CI" verde que corre solo cuando cambian `web/**` — no ejecutará cuando solo se modifica agent/ o docs/ (filtrado por paths exactamente igual que rust.yml).

- [ ] **Step 1: Crear `.github/workflows/web.yml`**

```yaml
name: Web CI
on:
  push:
    paths: ["web/**", ".github/workflows/web.yml"]
  pull_request:
    paths: ["web/**", ".github/workflows/web.yml"]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```
(NO incluir `pnpm playwright test` en M0 — Playwright se instala en M2. La CI queda preparada para agregarlas en M2.)

- [ ] **Step 2: Commit + push + verificar**

```bash
git add .github/workflows/web.yml
git commit -m "ci(web): workflow nextjs lint typecheck test build"
git push
```
Expected: workflows "Rust CI", "Web CI", "Validate Contracts" — los tres verdes en GitHub Actions.

- [ ] **Step 3: Verificar filtros de path (push sin cambios de código no debe disparar CI)**

Un commit vacío no modifica ningún archivo → con filtros `paths:` ninguno de los 3 workflows debe correr:
```bash
git commit -m "docs: test de filtros de path" --allow-empty
git push
```
Expected: GitHub Actions NO dispara ninguno de los 3 workflows. Si alguno corre, revisar su bloque `on.push.paths`.

---

### Task 7: Licencias + documentación de README raíz

**Files:**
- Create: `LICENSE` (texto propietario Strategic Connex)
- Create: `README.md` raíz
- Modify: `web/app/layout.tsx` (ya llevaba header de copyright en Task 5)
- Check: `agent/README.md`, `agent/crates/*/src/*` — header de copyright presente en todos (verificación, no creación)

**Interfaces:**
- Consumes: docs set ya commiteado en `96cd047`.
- Produces: LICENSE raíz referencedada por `agent/Cargo.toml` y `web/package.json` ("license" campo) + README con quickstart para nuevos developers.

- [ ] **Step 1: Crear `LICENSE` (texto propietario)**

```text
SC-Sentinel — Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

SOFTWARE PROPIO — LICENCIA PROPIETARIA

1. Este software y su código fuente son propiedad de Strategic Connex.
2. No se permite su distribución, modificación, ingeniería inversa ni uso
   comercial sin autorización escrita previa de Strategic Connex, salvo en los
   términos de un acuerdo específico firmado.
3. Los módulos derivados de proyectos de código abierto citan su licencia
   original en docs/legal/THIRD_PARTY_NOTICES.md y conservan los avisos de
   copyright correspondientes en sus encabezados.
4. Este producto incluye datos GeoLite2 creados por MaxMind, disponibles en
   https://www.maxmind.com (licencias CC BY-SA y EULA — ver docs/legal/maxmind-notice.md).
5. Npcap se distribuye DE MANERA INDEPENDIENTE y no forma parte de este
   software (ver docs/legal/npcap-notice.md).

Contacto: contact@strategicconnex.com.ar
```

- [ ] **Step 2: Ajustar `web/package.json` y verificar `license-file` en Cargo.toml**

`web/package.json`: agregar `"license": "SEE LICENSE IN ../LICENSE"` y `"private": true`.
Verificar los `license-file` ya declarados en Tasks 1–2: en `agent/Cargo.toml` es `../LICENSE` (un nivel hasta la raíz); en `agent/crates/*` es `../../../LICENSE` (tres niveles hasta la raíz). Ajustar cualquiera que no apunte a la raíz.

- [ ] **Step 3: Crear `README.md` raíz**

```markdown
# SC-Sentinel — Strategic Connex Anomaly Shield

Monitor de red con motor determinista local + dashboard en la nube. El agente captura tráfico en el dispositivo (pcap / NetFlow), lo agrega en ventanas de 30–60 s y envía señales de métricas (NUNCA paquetes crudos) a un dashboard en Vercel. La IA actúa como asistente de interpretación; el motor determinista Servicios/umbrales/GeoIP es la fuente de verdad.

## Estructura

- `agent/` — workspace Rust (agente local: captura, agregación, sincronización). Ver `agent/README.md`.
- `web/` — Next.js 15 (dashboard + landing). Ver `web/README.md`.
- `docs/` — spec (fuente de verdad), ADRs, contratos, runbooks, testing. Empezar por `docs/README.md`.

## Desarrollo local (requerido: Rust stable, Node 20, pnpm 9)

```bash
# Agente
cd agent && cargo test && cargo run -p sc-agent -- --version

# Web
pnpm --dir web install
pnpm --dir web dev
```

Requisitos detallados y gates diarios: `docs/runbooks/local-development.md`.

## Estatus

- M0 (actual): scaffold + CI verde.
- Roadmap M1–M5: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md` §13.
```

- [ ] **Step 4: Commit**

```bash
git add LICENSE README.md web/package.json agent/
git commit -m "docs(root): licencia propietaria + readme raiz con quickstart"
```

---

### Task 8: Criterios de aceptación M0 — verificación final

**Files:**
- Sin archivos nuevos. Checklist de `docs/testing/acceptance-criteria.md` sección M0.

**Interfaces:**
- Consumes: hits formados de Tasks 1–7.
- Produces: M0 DONE cuando los 8 items del criterio del spec §14.3 pasan todos.

- [ ] **Step 1: Ejecutar la checklist completa automáticamente**

```bash
cd D:\ProyectosWeb\SC-Sentinel
# 1. Rust workspace compila + tests
cargo test --manifest-path agent/Cargo.toml
# 2. Web compila
pnpm --dir web build
# 3. CI verdes en GitHub (verificar manualmente en Actions)
# 4. Contratos validan
node scripts/validate-contracts.js
# 5. Binary sc-agent existe y responde --version
agent/target/release/sc-agent.exe --version   # Windows
# 6. Licencia presente
cat LICENSE | head -3
# 7. Tree de estructura del spec §4
git ls-files | head -50
```

Expected: todos exit 0; confirmación manual: (i) 3 workflows verdes en GitHub, (ii) header de copyright presente en cada `.rs` y en `web/app/layout.tsx`/`page.tsx`/`globals.css`, (iii) los 8 ítems del checklist M0 de `docs/testing/acceptance-criteria.md` marcados.

- [ ] **Step 2: Si algún ítem falla, iterar hasta que pase antes del commit de cierre. Commit de cierre del hito cuando todo pasa:**

```bash
git commit -m "chore: milestone M0 completo — scaffold + CI verde" --allow-empty
git push
```
(El commit vacío marca el cierre del hito en la historia.)

---

## Fuera de alcance de este plan (hitos siguientes)

- M1: extracción real de módulos Sniffnet (sc-capture, sc-collector, sc-geo), FlowUpdate mpsc, ventanas golden, spool SQLite, gzip/zstd, mock server end-to-end. → plan `2026-XX-XX-m1-capture-aggregate-sync.md` a escribir con writing-plans al cierre de M0.
- M2-M5: API + Neon + dashboard, landing + IA, collector IPFIX, servicio + GUI.
