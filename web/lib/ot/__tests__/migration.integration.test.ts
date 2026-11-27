// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Prueba real de `0017_ot-assets.sql` contra PostgreSQL (PGlite, WASM):
// DDL, CHECK, UNIQUE, índice y la idempotencia del upsert que fija E3.
// No abre red ni toca Neon.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { queryRows, type QueryDb } from '@/lib/query/db-rows';
import {
  buildOtAssetsUpsertStatement,
  buildUpsertOtAssetsStatements,
  type SqlTag,
} from '../upsert';

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url));

const DEVICE_ID = 'dev_1';
const HOST_KEY = 'a'.repeat(32);
const WINDOW_1 = new Date('2026-11-20T10:00:00.000Z');
const WINDOW_1_RETRY = new Date('2026-11-20T10:00:00.000Z');
const WINDOW_2 = new Date('2026-11-20T10:00:30.000Z');

let client: PGlite | undefined;
let db: PgliteDatabase;
let queryDb: QueryDb;

async function upsertWindow(windowEnd: Date) {
  const statements = buildUpsertOtAssetsStatements(sql as unknown as SqlTag, {
    deviceId: DEVICE_ID,
    windowEnd,
    assets: [
      {
        deviceId: DEVICE_ID,
        hostKey: HOST_KEY,
        windowEnd,
        role: 'server',
        protocols: ['modbus'],
        peers: [],
        riskFlags: [],
      },
    ],
  });
  for (const statement of statements) {
    await db.execute(statement as SQL);
  }
}

interface AssetRow {
  seen_windows: number | string;
  first_seen: Date | string;
  last_seen: Date | string;
  protocols: unknown;
}

async function readAsset(): Promise<AssetRow> {
  const rows = await queryRows<AssetRow>(
    queryDb,
    sql`SELECT seen_windows, first_seen, last_seen, protocols
        FROM ot_assets WHERE device_id = ${DEVICE_ID} AND host_key = ${HOST_KEY}`
  );
  return rows[0];
}

/**
 * Extrae el error real de PostgreSQL: Drizzle envuelve la consulta en un
 * DrizzleQueryError cuyo `cause` trae el código SQLSTATE y el nombre de la
 * constraint. Se recorre la cadena de causas para no afirmar sobre el wrapper
 * (cuyo mensaje incluye los params y produciría falsos positivos).
 */
async function pgError(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    let code: string | undefined;
    const messages: string[] = [];
    for (let depth = 0; current && depth < 5; depth++) {
      const candidate = current as { code?: string; message?: string; cause?: unknown };
      if (candidate.code) code = String(candidate.code);
      if (candidate.message) messages.push(candidate.message);
      current = candidate.cause;
    }
    return { code, message: messages.join(' | ') };
  }
  throw new Error('se esperaba un rechazo de PostgreSQL y la consulta pasó');
}

let insertSeq = 0;

function insertAsset(overrides: {
  id?: string;
  hostKey?: string;
  role?: string;
  protocols?: string[];
  /** Bytes de oui_prefix en hexadecimal; ausente = NULL. */
  ouiHex?: string;
}) {
  insertSeq += 1;
  const id = overrides.id ?? `ota_${insertSeq}`;
  const hostKey = overrides.hostKey ?? HOST_KEY;
  const role = overrides.role ?? 'unknown';
  const protocols = JSON.stringify(overrides.protocols ?? []);
  const oui =
    overrides.ouiHex === undefined
      ? sql`NULL::bytea`
      : sql`decode(${overrides.ouiHex}, 'hex')`;
  return db.execute(sql`
    INSERT INTO ot_assets (id, device_id, host_key, first_seen, last_seen, role, protocols, oui_prefix)
    VALUES (
      ${id}, ${DEVICE_ID}, ${hostKey},
      '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z',
      ${role}, ${protocols}::jsonb, ${oui}
    )
  `);
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  queryDb = db as unknown as QueryDb;

  // El journal de Drizzle nombra 0017_ot-assets desde 2026-11-27: `migrate` la
  // aplica como cualquier otra, sin paso manual.
  await migrate(db, { migrationsFolder });
}, 30_000);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE ot_assets, devices CASCADE`);
  await db.execute(sql`INSERT INTO devices (id, token_hash) VALUES (${DEVICE_ID}, 'hash_1')`);
});

afterAll(async () => {
  await client?.close();
});

describe('migración 0017_ot-assets.sql', () => {
  it('crea ot_assets con las 24 columnas del diseño', async () => {
    const columns = await queryRows<{ column_name: string }>(
      queryDb,
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ot_assets'`
    );
    expect(columns).toHaveLength(24);
    expect(columns.map((column) => column.column_name)).toEqual(
      expect.arrayContaining(['role', 'protocols', 'peers', 'risk_flags', 'baseline_state'])
    );
  });

  it('crea el índice (device_id, last_seen DESC)', async () => {
    const indexes = await queryRows<{ indexdef: string }>(
      queryDb,
      sql`SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ot_assets'`
    );
    const deviceIndex = indexes.find((row) =>
      row.indexdef.includes('ot_assets_device_last_seen_idx')
    );
    expect(deviceIndex?.indexdef).toContain('(device_id, last_seen DESC)');
  });

  it('rechaza role fuera de client/server/both/unknown', async () => {
    const error = await pgError(insertAsset({ role: 'master' }));
    expect(error.code).toBe('23514');
    expect(error.message).toContain('ot_assets_role_check');
  });

  it('rechaza más de 6 protocolos (el mismo tope del contrato)', async () => {
    const error = await pgError(
      insertAsset({ protocols: ['modbus', 's7comm', 'dnp3', 'iec104', 'a', 'b', 'c'] })
    );
    expect(error.code).toBe('23514');
    expect(error.message).toContain('ot_assets_protocols_check');
  });

  it('exige host_key de 8 a 64 caracteres', async () => {
    const error = await pgError(insertAsset({ hostKey: 'corto' }));
    expect(error.code).toBe('23514');
    expect(error.message).toContain('ot_assets_host_key_check');
  });

  it('exige oui_prefix de exactamente 3 bytes', async () => {
    await insertAsset({ id: 'ota_oui_ok', hostKey: 'b'.repeat(32), ouiHex: '001122' });

    const error = await pgError(insertAsset({ ouiHex: '0011' }));
    expect(error.code).toBe('23514');
    expect(error.message).toContain('ot_assets_oui_prefix_check');
  });

  it('UNIQUE (device_id, host_key) impide el duplicado', async () => {
    const unique = await queryRows<{ conname: string; def: string }>(
      queryDb,
      sql`SELECT conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conrelid = 'ot_assets'::regclass AND contype = 'u'`
    );
    expect(unique.map((row) => row.def)).toEqual(['UNIQUE (device_id, host_key)']);

    await insertAsset({ id: 'ota_dup_1' });
    const error = await pgError(insertAsset({ id: 'ota_dup_2' }));
    expect(error.code).toBe('23505');
    expect(error.message).toContain(unique[0].conname);
  });

  it('la primera ventana inserta la fila con seen_windows = 1', async () => {
    await upsertWindow(WINDOW_1);

    const asset = await readAsset();
    expect(Number(asset.seen_windows)).toBe(1);
    expect(new Date(asset.first_seen).toISOString()).toBe(WINDOW_1.toISOString());
  });

  it('reaplicar la misma ventana no incrementa seen_windows', async () => {
    await upsertWindow(WINDOW_1);
    await upsertWindow(WINDOW_1_RETRY);

    const asset = await readAsset();
    expect(Number(asset.seen_windows)).toBe(1);
  });

  it('una ventana posterior incrementa seen_windows y conserva first_seen', async () => {
    await upsertWindow(WINDOW_1);
    await upsertWindow(WINDOW_2);

    const asset = await readAsset();
    expect(Number(asset.seen_windows)).toBe(2);
    expect(new Date(asset.first_seen).toISOString()).toBe(WINDOW_1.toISOString());
    expect(new Date(asset.last_seen).toISOString()).toBe(WINDOW_2.toISOString());
    expect(asset.protocols).toEqual(['modbus']);
  });
});

describe('E7 · plan del upsert batcheado de ot_assets', () => {
  it('el INSERT ... ON CONFLICT usa el índice único y no hace Seq Scan sobre ot_assets', async () => {
    const statement = buildOtAssetsUpsertStatement(sql as unknown as SqlTag, {
      deviceId: DEVICE_ID,
      windowEnd: WINDOW_2,
      assets: [
        { hostKey: HOST_KEY, role: 'server', protocols: ['modbus'], peers: [], riskFlags: [] },
        { hostKey: 'b'.repeat(32), role: 'client', protocols: ['s7comm'], peers: [], riskFlags: [] },
      ],
    }) as SQL;

    const result = await db.execute(sql`EXPLAIN (FORMAT JSON) ${statement}`);
    const plan = JSON.stringify(result.rows);
    // Evidencia en el log del test: el plan real, recortado.
    console.info(`EXPLAIN ot_assets: ${plan.slice(0, 600)}`);

    // Plan medido en PGlite (PostgreSQL 17): ModifyTable/Insert sobre ot_assets,
    // con el índice único como árbitro y un Values Scan del lote. No hay scan
    // nuevo sobre la tabla, ni Seq Scan del lado del INSERT.
    expect(plan).not.toContain('Seq Scan');
    expect(plan).toContain('"Node Type":"ModifyTable"');
    expect(plan).toContain('"Operation":"Insert"');
    expect(plan).toContain('"Relation Name":"ot_assets"');
    expect(plan).toContain('"Conflict Resolution":"UPDATE"');
    expect(plan).toContain('ot_assets_device_id_host_key_key');
    expect(plan).toContain('(ot_assets.last_seen < excluded.last_seen)');
    expect(plan).toContain('"Node Type":"Values Scan"');
  });
});
