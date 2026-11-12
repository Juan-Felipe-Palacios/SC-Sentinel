// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  acknowledgeAlert,
  addAlertNote,
  assignAlert,
  getAlertDetail,
  resolveAlert,
} from '../alerts';
import { queryRows, type QueryDb } from '../db-rows';

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url));

let client: PGlite | undefined;
let db: PgliteDatabase;
let queryDb: QueryDb;

async function seedAlert() {
  await db.execute(sql`
    INSERT INTO operators (id, email, name, password_hash)
    VALUES ('op_1', 'ana@example.com', 'Ana Operadora', 'scrypt$test')
  `);
  await db.execute(sql`INSERT INTO devices (id, token_hash) VALUES ('dev_1', 'hash_1')`);
  await db.execute(sql`
    INSERT INTO ingest_batches (id, device_id, window_id, payload_hash, status)
    VALUES ('batch_1', 'dev_1', 'win_1', 'payload_hash_1', 'processed')
  `);
  await db.execute(sql`
    INSERT INTO flow_windows (id, batch_id, device_id, window_id, start_at, end_at, sequence, snapshot_json)
    VALUES ('fw_1', 'batch_1', 'dev_1', 'win_1', '2026-11-11T11:00:00Z', '2026-11-11T11:00:30Z', 1, '{}'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO alerts (id, window_id, rule_id, severity, title, description, evidence, sla_due_at, expires_at)
    VALUES (
      'alert_1',
      'win_1',
      'port_scan',
      'high',
      'Escaneo de puertos',
      'Un peer tocó muchos puertos distintos.',
      '{"distinct_ports":25}'::jsonb,
      '2026-11-11T12:00:00Z',
      '2026-11-18T11:00:00Z'
    )
  `);
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  queryDb = db as unknown as QueryDb;

  await migrate(db, { migrationsFolder });
}, 30_000);

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE alert_audit_log, alert_notes, alerts, flow_windows, ingest_batches, devices, operators CASCADE
  `);
  await seedAlert();
});

afterAll(async () => {
  await client?.close();
});

describe('alert lifecycle contra Postgres', () => {
  it('aplica la migración 0013 y deja las columnas y tablas del ciclo de vida', async () => {
    const columns = await queryRows<{ column_name: string }>(
      queryDb,
      sql`SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'alerts'
            AND column_name IN ('status', 'assignee', 'acknowledged_at', 'resolved_at', 'updated_at')`
    );
    expect(columns.map((column) => column.column_name).sort()).toEqual([
      'acknowledged_at',
      'assignee',
      'resolved_at',
      'status',
      'updated_at',
    ]);

    const tables = await queryRows<{ table_name: string }>(
      queryDb,
      sql`SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('operators', 'alert_notes', 'alert_audit_log')`
    );
    expect(tables.map((table) => table.table_name).sort()).toEqual([
      'alert_audit_log',
      'alert_notes',
      'operators',
    ]);

    await expect(
      db.execute(sql`UPDATE alerts SET status = 'closed' WHERE id = 'alert_1'`)
    ).rejects.toThrow();
  });

  it('reconoce una alerta y registra la transición en la auditoría', async () => {
    const result = await acknowledgeAlert('alert_1', {
      database: queryDb,
      actor: { operatorId: 'op_1', name: 'Ana Operadora', email: 'ana@example.com' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.changed).toBe(true);
    expect(result.alert).toMatchObject({
      status: 'acknowledged',
      assignee: null,
    });
    expect(result.alert.acknowledged_at).not.toBeNull();
    expect(result.alert.updated_at).not.toBeNull();

    const rows = await queryRows<{
      status: string;
      acknowledged_at: unknown;
      updated_at: unknown;
    }>(
      queryDb,
      sql`SELECT status, acknowledged_at, updated_at FROM alerts WHERE id = 'alert_1'`
    );
    expect(rows[0]).toMatchObject({ status: 'acknowledged' });
    expect(rows[0]?.acknowledged_at).toBeTruthy();
    expect(rows[0]?.updated_at).toBeTruthy();

    const audit = await queryRows<{
      action: string;
      actor: string;
      details: Record<string, unknown> | null;
    }>(
      queryDb,
      sql`SELECT action, actor, actor_operator_id, details FROM alert_audit_log WHERE alert_id = 'alert_1'`
    );
    expect(audit).toEqual([
      {
        action: 'acknowledge',
        actor: 'Ana Operadora',
        actor_operator_id: 'op_1',
        details: { previous_status: 'open' },
      },
    ]);
  });

  it('asigna, agrega una nota y resuelve la alerta con su historial', async () => {
    const assigned = await assignAlert('alert_1', 'op_1', {
      database: queryDb,
      actor: { operatorId: 'op_1', name: 'Ana Operadora', email: 'ana@example.com' },
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.changed).toBe(true);
    expect(assigned.alert.assignee).toBe('Ana Operadora');
    expect(assigned.alert.assignee_operator_id).toBe('op_1');

    const noted = await addAlertNote('alert_1', 'Revisado con el cliente.', {
      database: queryDb,
      actor: { operatorId: 'op_1', name: 'Ana Operadora', email: 'ana@example.com' },
    });
    expect(noted.ok).toBe(true);
    if (!noted.ok) return;
    expect(noted.note).toMatchObject({
      alert_id: 'alert_1',
      author: 'Ana Operadora',
      author_operator_id: 'op_1',
      body: 'Revisado con el cliente.',
    });
    expect(noted.alert.notes_count).toBe(1);

    const resolved = await resolveAlert('alert_1', {
      database: queryDb,
      actor: { operatorId: 'op_1', name: 'Ana Operadora', email: 'ana@example.com' },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.changed).toBe(true);
    expect(resolved.alert.status).toBe('resolved');
    expect(resolved.alert.resolved_at).not.toBeNull();

    const rows = await queryRows<{
      status: string;
      assignee: string | null;
      resolved_at: unknown;
    }>(
      queryDb,
      sql`SELECT status, assignee, resolved_at FROM alerts WHERE id = 'alert_1'`
    );
    expect(rows[0]).toMatchObject({ status: 'resolved', assignee: 'Ana Operadora' });
    expect(rows[0]?.resolved_at).toBeTruthy();

    const detail = await getAlertDetail('alert_1', queryDb);
    expect(detail?.alert.status).toBe('resolved');
    expect(detail?.alert.assignee).toBe('Ana Operadora');
    expect(detail?.alert.notes_count).toBe(1);
    expect(detail?.notes).toHaveLength(1);
    expect(detail?.notes[0]?.body).toBe('Revisado con el cliente.');
    expect(detail?.audit.map((event) => event.action).sort()).toEqual([
      'assign',
      'note_added',
      'resolve',
    ]);

    const repeated = await resolveAlert('alert_1', { database: queryDb });
    expect(repeated).toMatchObject({ ok: true, changed: false });

    const rejected = await acknowledgeAlert('alert_1', { database: queryDb });
    expect(rejected).toEqual({ ok: false, reason: 'resolved' });
  });
});
