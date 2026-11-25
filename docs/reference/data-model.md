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
| `ot_assets` | `id` | **M6, no implementada**: requiere la migración `0017_ot-assets.sql`. Inventario OT por dispositivo, `UNIQUE(device_id, host_key)`, `fillfactor=80`; fuera de la retención 7/15/30 d, con poda manual >180 d opt-in (ADR-0021) |

## Relaciones

`devices 1—N flow_windows`, `flow_windows 1—N alerts`, `flow_windows 1—N agent_health`,
`devices 1—N ai_insights`, `devices 1—N ot_assets` (M6).

## Escritura y idempotencia

Reglas que sigue el camino de ingesta y que cualquier tabla nueva debe respetar:

1. **Una sola transacción no interactiva** (`sql.transaction` del driver HTTP de Neon).
   O se guarda todo o no se guarda nada: un fallo a mitad no deja ventanas huérfanas
   (ADR-0008, ADR-0015). Implementación: `web/lib/ingest/persist.ts`.
2. **Ids deterministas** con `stableId(prefix, …)` (sha256 → 24 hex) derivados del
   contenido. Con `ON CONFLICT DO NOTHING`, reenviar la misma ventana es un no-op y
   repara lo que faltara, sin duplicar.
3. **`sql` con parámetros enlazados**, no el query builder de Drizzle, en el camino de
   ingesta.
4. **Migraciones aditivas** con entrada en el ledger; el presupuesto de sentencias se
   cuenta con el patrón de `web/lib/ingest/__tests__/persist.test.ts`.
5. **Excepción para contadores** (por ejemplo `ot_assets.seen_windows`): un
   `ON CONFLICT (device_id, host_key) DO UPDATE … WHERE` que fije `last_seen = window_end`
   **en el mismo statement**. Sin esa guarda, cada reintento incrementa el contador y
   rompe la idempotencia.

## Migraciones

- **Directorio único:** `web/lib/db/migrations/` (`.sql` versionados; hoy `0000`…`0016`).
- **Ledger autoritativo:** `sc_schema_migrations`, que mantiene
  `scripts/apply-migrations.mjs`. Las migraciones no son idempotentes (`CREATE TABLE` /
  `ADD COLUMN` sin `IF NOT EXISTS`), así que el ledger es la fuente de verdad.
- **Aplicar:** `node scripts/apply-migrations.mjs --dry-run` y después sin `--dry-run`.
  Procedimiento, siembra del ledger y reversión: `docs/runbooks/apply-db-migrations.md`.
- **Comprobar drift:** `node scripts/verify-migration-ledger.mjs --env-file web/.env.local`
  (sólo lectura; código 1 si hay pendientes o filas huérfanas).
- **`drizzle.__drizzle_migrations` está congelado** (13 filas, la última anterior a
  `0014`) y **no es autoritativo**. `drizzle-kit generate|migrate|push` está prohibido en
  este repositorio; el detalle y la causa están en `docs/OT/plan-implementacion.md` §5.
- La aplicación usa un rol sin DDL en runtime. La URL de administración va aparte, fuera
  del repo y de Vercel (AGENTS.md §7.4).
