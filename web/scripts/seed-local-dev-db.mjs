#!/usr/bin/env node
// Siembra la base de desarrollo local (PGlite) con un device **no demo** que
// tiene activos OT y alertas OT, para poder ejercitar por HTTP
// `GET /api/query?metric=topology` sin Neon.
//
// Uso:  cd web && pnpm dev:seed [-- --dir .local-db] [--reset]
//       --dir    directorio de datos (por defecto web/.local-db)
//       --reset  borra el directorio antes de migrar (lo demás es idempotente)
//
// Aplica las migraciones reales del repo (0000–0016 con el migrator de Drizzle
// y 0017 a mano, porque aún no está en el journal) y luego deja un dataset
// mínimo y determinista. No toca Neon ni la red.

import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const DEVICE_ID = 'dev_local_ot';
const WINDOW_ID = 'w_local_0001';
// Host keys hasheadas: el read model nunca ve IP ni MAC.
const CLIENT_KEY = 'a1b2c3d4e5f60718';
const SERVER_KEY = '18f60718a1b2c3d4';
const IDLE_KEY = 'c0ffee00c0ffee11';
// Extremo de una alerta que NO es nodo activo: su arista debe quedar filtrada.
const UNKNOWN_KEY = 'ffffffffffffffff';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const reset = process.argv.includes('--reset');
const configuredDir = arg('--dir');
const dataDir = configuredDir
  ? resolve(process.cwd(), configuredDir)
  : fileURLToPath(new URL('../.local-db', import.meta.url));
const migrationsFolder = fileURLToPath(new URL('../lib/db/migrations', import.meta.url));
const otAssetsMigration = fileURLToPath(
  new URL('../lib/db/migrations/0017_ot-assets.sql', import.meta.url)
);

if (reset) {
  rmSync(dataDir, { recursive: true, force: true });
}

const client = new PGlite(dataDir);
const db = drizzle(client);

async function applyOtAssetsMigrationIfMissing() {
  const result = await db.execute(sql`SELECT to_regclass('public.ot_assets')::text AS reg`);
  if (result.rows[0]?.reg != null) return false;
  const statements = readFileSync(otAssetsMigration, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  return true;
}

function countOf(result) {
  return Number(result.rows[0]?.n ?? 0);
}

try {
  await migrate(db, { migrationsFolder });
  const appliedOtAssets = await applyOtAssetsMigrationIfMissing();

  const now = new Date();
  const windowStart = new Date(now.getTime() - 90_000);
  const windowEnd = new Date(now.getTime() - 60_000);
  const lastSeen = windowEnd;
  const future = new Date(now.getTime() + 60 * 60 * 1000);

  await db.execute(sql`TRUNCATE TABLE ot_assets, alerts, flow_windows, devices CASCADE`);

  await db.execute(sql`
    INSERT INTO devices (id, token_hash, name, last_seen_at, status)
    VALUES (${DEVICE_ID}, ${`local_dev_token_hash_${DEVICE_ID}`}, ${'Device local (PGlite)'}, ${lastSeen}, 'active')
  `);

  await db.execute(sql`
    INSERT INTO flow_windows (id, device_id, window_id, start_at, end_at, sequence, snapshot_json)
    VALUES (${`fw_${WINDOW_ID}`}, ${DEVICE_ID}, ${WINDOW_ID}, ${windowStart}, ${windowEnd}, 1, '{}'::jsonb)
  `);

  const assets = [
    { id: 'ota_local_1', hostKey: CLIENT_KEY, role: 'client', protocols: ['modbus'], label: 'HMI de línea 2' },
    { id: 'ota_local_2', hostKey: SERVER_KEY, role: 'server', protocols: ['s7comm'], label: 'PLC de mezcla' },
    { id: 'ota_local_3', hostKey: IDLE_KEY, role: 'unknown', protocols: [], label: 'Activo sin alertas' },
  ];
  for (const asset of assets) {
    await db.execute(sql`
      INSERT INTO ot_assets (id, device_id, host_key, first_seen, last_seen, seen_windows, role, protocols, label)
      VALUES (${asset.id}, ${DEVICE_ID}, ${asset.hostKey}, ${windowStart}, ${lastSeen}, 1, ${asset.role},
              ${JSON.stringify(asset.protocols)}::jsonb, ${asset.label})
    `);
  }

  // Dos alertas del par client→server (arista con count 2) y una cuyo extremo
  // servidor no es nodo activo (no debe inventar arista).
  const alerts = [
    { id: 'al_local_1', ruleId: 'ot_new_master', evidence: { client: CLIENT_KEY, server: SERVER_KEY, fn_codes: '1,2' }, severity: 'high' },
    { id: 'al_local_2', ruleId: 'ot_new_master', evidence: { client: CLIENT_KEY, server: SERVER_KEY, fn_codes: '3' }, severity: 'high' },
    { id: 'al_local_3', ruleId: 'ot_unexpected_peer', evidence: { client: CLIENT_KEY, server: UNKNOWN_KEY }, severity: 'medium' },
  ];
  for (const alert of alerts) {
    await db.execute(sql`
      INSERT INTO alerts (id, window_id, rule_id, severity, title, description, evidence, status, sla_due_at, expires_at)
      VALUES (${alert.id}, ${WINDOW_ID}, ${alert.ruleId}, ${alert.severity},
              ${`${alert.ruleId} (siembra local)`}, ${'Alerta OT sintética para la base de desarrollo local.'},
              ${JSON.stringify(alert.evidence)}::jsonb, 'open', ${future}, ${future})
    `);
  }

  const nodes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ot_assets WHERE device_id = ${DEVICE_ID}`);
  const alertCount = await db.execute(sql`SELECT COUNT(*)::int AS n FROM alerts a INNER JOIN flow_windows fw ON fw.window_id = a.window_id WHERE fw.device_id = ${DEVICE_ID} AND a.rule_id LIKE 'ot_%'`);
  // Migraciones aplicadas según el journal de Drizzle (0000–0016) + 0017 a mano.
  const applied = await db.execute(sql`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dataDir,
        device: DEVICE_ID,
        windowId: WINDOW_ID,
        otAssetsMigrationApplied: appliedOtAssets,
        nodes: countOf(nodes),
        otAlerts: countOf(alertCount),
        migrationsApplied: countOf(applied) + (appliedOtAssets ? 1 : 0),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error('No se pudo sembrar la base local:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
