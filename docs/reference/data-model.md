# Referencia — modelo de datos (Neon Postgres)

**ERD:** `docs/diagrams/mermaid/database-erd.mmd` (Mermaid `erDiagram`).

## Tablas principales

| Tabla | Clave | Descripción |
|---|---|---|
| `devices` | `id` (text) | dispositivo enrolado; `token_hash` SHA-256, `status` active/enrolled_pending/revoked, `token_rotated_at` |
| `flow_windows` | `id` (window_id) | ventana agregada; `snapshot_json` (hosts/puertos/países/alerts/health); UNIQUE(device_id, window_id) para idempotencia |
| `alerts` | `id` | alertas emitidas; `status` open/acknowledged/resolved; retención 30 d |
| `agent_health` | `id` | métricas de salud del agente por ventana |
| `ai_insights` | `id` | análisis IA por lotes; `facts_hash` para dedup; `status` ok/degraded |
| `ingest_batches` | `id` | ledger independiente de ingesta (sin FK por diseño) |
| `settings` | `key` | configuración runtime (jsonb) |
| `trust_page_access_logs` | — | auditoría de accesos a Trust Pages |
| `rate_limits` | `key` | (futuro, M4) limitador distribuido en Postgres |

## Relaciones

`devices 1—N flow_windows`, `flow_windows 1—N alerts`, `flow_windows 1—N agent_health`, `devices 1—N ai_insights`.

## Migraciones

Drizzle en `web/drizzle/` y `web/lib/db/migrations/`. Aplicar en release; la app usa rol sin DDL en runtime. Verificar con `scripts/verify-migrations.mjs`.