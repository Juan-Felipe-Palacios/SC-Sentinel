# Plan de pruebas (v1)

Referencias: spec §14. Pruebas por capa, con gate de CI asociado.

## 1. Rust (agente)

| Categoría | Qué verifica | Crates | Herramienta |
|---|---|---|---|
| Unit | Golden snapshots de agregación (ventanas 30 s estables) | sc-aggregate | `insta` + golden files en `docs/testing/fixtures/` |
| Unit | Spool FIFO y cota 500 MB / 7 d (incluye `data_loss_*`) | sc-sync | unit |
| Unit | Backoff exponencial 1→60 s + jitter | sc-sync | unit |
| Unit | Serialización de contratos (schema v1 = serde + schemars) | sc-core, sc-aggregate | unit + `docs/contracts/*.schema.json` |
| Unit | Compresión gzip (flate2) y zstd (flag opcional) | sc-sync | unit |
| Unit | Motor determinista: reglas de servicios, umbrales, blacklist, umbrales de riesgo | sc-detect | unit + proptest |
| Unit | Anonimización: HMAC truncado estable; `anonymize_hosts=true` ⇒ `ip_display:null` | sc-core/sc-aggregate | unit (regla normativa del contrato) |
| Integration | PCAP fijo de loopback + HTTP mock server para sc-sync end-to-end | sc-capture→sc-sync | integration tests + fixtures pcap |

## 2. Web (Next.js)

| Categoría | Qué verifica | Herramienta |
|---|---|---|
| Contratos | Zod ↔ Serde: los MISMOS fixtures (`docs/contracts/examples/`) validan en ambos lados | Vitest + zod |
| API | `/api/ingest` auth (Bearer+SHA-256), idempotencia (duplicado→`200 duplicate`), rate limit (60/min burst 30; IP sin token 20/min→401), compresión gzip (y zstd fzstd) | Vitest contra Neon **preview branch** |
| Unit hooks/lib | auth.js, db helpers, transformaciones de métrica | Vitest |
| E2E | Landing + dashboard (login, overview, hosts, connections, alerts, AI, settings): al final de M2/M3 | Playwright |

## 3. Contratos (CI)

- Workflow `contracts.yml`: valida schemas JSON Schema + ejemplos (válidos deben pasar; `ingest-request.invalid.json` debe fallar por cada razón esperada — ver `_description` del fixture).
- Regla zod↔serde: un cambio de contrato sin fixtures actualizados no se mergea (ADR-0001).

## 4. Smoke / aceptación (humano, por hito)

- M1 smoke: tráfico real del propietario publicado end-to-end contra mock y luego contra main.
- M2 smoke: dashboard con datos del agente real; alerta operativa forzada (bajar interfaz) visible.
- M3 smoke: IA ok / degraded probado (agotar modelos deliberadamente con env de test).
- M4 smoke: MikroTik exportando IPFIX real; comparar agregación pcap vs flow.
- M5 smoke: instalar/desinstalar servicio Windows y verificar recovery.

Rango de trazabilidad: cada criterio de aceptación por hito (`acceptance-criteria.md`) apunta a un set de pruebas de este plan.
