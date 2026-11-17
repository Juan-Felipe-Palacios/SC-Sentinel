# Bootstrap — Visión general del codebase SC-Sentinel

> Documento generado por `egm-bootstrap`. Solo documentación; no modifica código.

## 1. Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `agent/` | Agente Rust: captura/colector, agregación, detección, spool SQLite, sync HTTPS, servicio Windows. |
| `web/` | Aplicación Next.js 15: landing, dashboard, APIs, ingest, query, IA, trust pages. |
| `scripts/` | Despliegue del agente (`deploy-agent-service.ps1`), verificación de ciclo, utilidades. |
| `docs/` | Documentación completa (ver `docs/README.md` como índice). |
| `config/` | Configuración compartida. |
| `dist/` | Artefactos de build/evidencia (no fuente). |
| `external/` | Repositorios clonados (EGM); no forma parte del producto. |

## 2. Agente (Rust)

- **Crates principales:** `sc-config`, `sc-core`, `sc-capture`, `sc-collector`, `sc-geo`, `sc-detect`, `sc-aggregate`, `sc-sync`, `sc-telemetry`, `sc-gui`.
- **Entrada:** `agent/crates/sc-agent/src/main.rs` (sync loop, spool, drenaje).
- **Servicio Windows:** `agent/crates/sc-agent/src/service.rs`.
- **Configuración:** `agent/crates/sc-config/`.
- **Captura:** pcap/Npcap o colector IPFIX (sFlow/NetFlow/IPFIX).
- **Spool:** SQLite local, FIFO, drenaje ~60 req/min.
- **Sync:** HTTPS con gzip/zstd, backoff 1–60 s, estados Idle/Sending/Backoff/NeedsEnrollment/DeadLetter/SpoolFull.

## 3. Web (Next.js)

- **Framework:** Next.js 15, TypeScript, Tailwind.
- **Rutas principales:** `/`, `/dashboard/*`, `/p/[token]`, `/demo`, `/login`.
- **APIs:** `/api/ingest`, `/api/query`, `/api/chat`, `/api/auth/*`, `/api/devices/*`, `/api/ai/*`, `/api/cron/*`, `/api/export`, `/api/trust/*`.
- **Auth:** sesión admin HS256 (cookie httpOnly) + guest JWT; admin secret header/Bearer.
- **Base de datos:** Neon Postgres (Drizzle ORM).
- **Seguridad:** CSP, X-Frame-Options, rate limiting, límites de payload, gzip bomb protection.

## 4. Flujos clave

1. **Ingest:** agente → `/api/ingest` (auth device token) → Neon (transacción).
2. **Query:** dashboard → `/api/query` → métricas agregadas.
3. **IA:** `/api/ai/cron` (cada 15 min) → análisis por lotes sobre datos persistidos.
4. **Trust Pages:** `/p/[token]` → vista compartida con token en URL.

## 5. Comandos de desarrollo

### Web

```sh
cd web
pnpm install
pnpm dev
pnpm typecheck
pnpm test
```

### Agente

```sh
cd agent
cargo build
cargo test
```

### Despliegue del agente

Ver `docs/runbooks/local-development.md` §8 y `scripts/deploy-agent-service.ps1`.

## 6. Documentación de referencia

- Índice: `docs/README.md`.
- Spec completo: `docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`.
- Arquitectura C4: `docs/architecture/C4-overview.md`.
- Flujo de datos: `docs/architecture/data-flow.md`.
- ADRs: `docs/adr/`.
- Contratos: `docs/contracts/`.
- Roadmap: `docs/roadmap.md`.

## 7. Convenciones

- Idioma: español internacional profesional.
- Cambio de contrato = spec + contracts + zod/serde + tests en el mismo PR.
- Decisión nueva = ADR con número siguiente.
- Secretos nunca en código ni logs.

## PARADA

Bootstrap documental. No modifica código ni despliegues.