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

## Ledger único y prohibición de `drizzle-kit`

- **Único ledger:** `sc_schema_migrations (name, applied_at)`. Lo crea y lo
  actualiza `scripts/apply-migrations.mjs`, con una fila por archivo aplicado.
  Es la única fuente para decidir qué migración falta.
- **`drizzle.__drizzle_migrations` está congelado** (13 filas; la última,
  `1794450000000`, es anterior a `0014`–`0016`). No es autoritativo: no se usa
  para decidir pendientes, no se migra, no se "repara" y no se borra sin
  autorización N4. El checker lo informa sólo como conteo.
- **`drizzle-kit generate`, `drizzle-kit migrate` y `drizzle-kit push` están
  prohibidos.** `web/drizzle.config.ts` apunta `out` a `./lib/db/drizzle-out`
  para que un `generate` accidental no escriba en `web/lib/db/migrations/`, el
  directorio que consume el runner. Ese directorio de salida no es un ledger ni
  se aplica.
- **Comprobar drift (sólo lectura):**

  ```bash
  node scripts/verify-migration-ledger.mjs --env-file web/.env.local
  ```

  Compara los `.sql` del repo contra el ledger, imprime el host del destino, las
  pendientes y las filas huérfanas, y sale con código 1 si hay drift. No crea ni
  modifica nada. Si hay pendientes, se revisan y se aplican con el runner; si hay
  huérfanas, se investiga el archivo renombrado o borrado antes de tocar el
  ledger.
- **Prueba offline del checker:** `node scripts/test-migration-ledger.mjs`. Monta un
  `web/` temporal con un módulo falso de Neon y comprueba los códigos de salida (sin
  drift 0; pendiente, huérfana o ledger ilegible 1) sin abrir red ni tocar la base.
- **Limitación:** el ledger no guarda checksum. Editar un `.sql` ya aplicado no
  se detecta; todo cambio de esquema va en una migración nueva.

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

## Reversión

Las migraciones del repo son aditivas (nunca destructivas sin plan de rollback,
ver `docs/governance/versioning.md`). Para una migración **aditiva** (una
`CREATE TABLE` con sus índices, como `0016_asn-stats.sql`), la reversión es
devolver la base al estado anterior de la migración y sacarla del ledger:

```sql
-- Reversión de 0016_asn-stats.sql (aplicada 2026-11-14):
-- 1. Borrar la tabla (los índices caen con ella; son de la propia tabla).
DROP TABLE IF EXISTS asn_stats;
-- 2. Sacarla del ledger para que el runner vuelva a considerarla pendiente
--    (si se reaplica, crea la tabla de nuevo; los datos no se recuperan).
DELETE FROM sc_schema_migrations WHERE name = '0016_asn-stats.sql';
```

Reglas: la tabla es derivada del snapshot (`snapshot_json->'top_asns'`), así
que los datos perdidos se reconstruyen con los reintentos del agente solo si el
spool local aún los tiene; si ya se sincronizaron, se pierden. Una reversión de
una migración **destructiva** (columnas que el código ya usa) requiere plan
escrito previo: primero revertir el código, después la base. Backup: Neon
retiene el historial de restore point-in-time; antes de una migración grande se
puede crear una rama de Neon como snapshot puntual.

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
