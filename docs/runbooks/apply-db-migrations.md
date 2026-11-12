# Aplicar migraciones a la base de datos

El agente dejó de sincronizar durante días porque producción se quedó en la
migración `0007` y el ingest escribía columnas que aún no existían (`42703`).
Este runbook evita que vuelva a pasar sin ruido.

## Comprobación rápida

```bash
node scripts/apply-migrations.mjs --dry-run
```

Lista los `.sql` pendientes según el ledger `sc_schema_migrations` (tabla que
crea el propio runner). Si imprime `pendientes: 0`, la base está al día.

## Aplicar

```bash
node scripts/apply-migrations.mjs                       # web/.env.production.local
node scripts/apply-migrations.mjs --env-file web/.env.local
DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
```

- Ejecuta las sentencias en orden y registra cada fichero en el ledger **solo si
  todas sus sentencias terminan bien**; al primer fallo se detiene con código 1
  e imprime la sentencia que falló.
- Las migraciones del repo **no** son idempotentes (`CREATE TABLE` / `ADD
  COLUMN` sin `IF NOT EXISTS`), así que el ledger es la fuente de verdad: no
  edites el ledger a mano salvo para sembrar una base ya existente.

## Sembrar el ledger en una base creada antes del runner

Si la base ya tenía aplicadas `0000`–`0007` antes de existir el ledger,
insértalas una sola vez para que el runner no intente recrearlas:

```sql
INSERT INTO sc_schema_migrations (name) VALUES
  ('0000_init.sql'), ('0001_ai-insights.sql'), ('0002_ai-risk-level.sql'),
  ('0003_device-token-expiry.sql'), ('0004_device-token-permanent.sql'),
  ('0005_host-ip-and-ai-language.sql'), ('0006_flow-windows-device-start.sql'),
  ('0007_chat.sql')
ON CONFLICT DO NOTHING;
```

## Verificación posterior

```sql
-- Debe haber una fila por ventana reciente: si falta, el ingest no completó.
SELECT count(*) FROM agent_health WHERE recorded_at > now() - interval '10 minutes';
-- No deben aparecer ventanas huérfanas de host_stats cuando el agente reporta hosts.
SELECT count(*) FROM flow_windows fw
WHERE fw.start_at > now() - interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM host_stats hs WHERE hs.window_id = fw.window_id);
```

Si `agent_health` no crece, revisa el log de Vercel: ahora el evento
`ingest_db_failed` incluye `detail` con el mensaje del driver (código SQLSTATE)
y la migración que falta se identifica al instante.
