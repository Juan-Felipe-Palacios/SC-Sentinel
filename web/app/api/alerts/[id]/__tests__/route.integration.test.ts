// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { queryRows, type QueryDb } from '@/lib/query/db-rows';
import { authorize } from '@/lib/auth/resolve';

const { state } = vi.hoisted(() => ({ state: { db: null as PgliteDatabase | null } }));

vi.mock('@/lib/db', () => ({
  db: new Proxy({} as PgliteDatabase, {
    get(_target, prop) {
      return state.db ? (state.db as unknown as Record<string | symbol, unknown>)[prop] : undefined;
    },
  }),
}));

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
}));

import { GET, PATCH } from '../route';

const migrationsFolder = fileURLToPath(new URL('../../../../../lib/db/migrations', import.meta.url));

let client: PGlite | undefined;
const mockedAuthorize = vi.mocked(authorize);

async function seedAlert(status = 'open', id = 'alert_1') {
  await state.db!.execute(sql`
    INSERT INTO operators (id, email, name, password_hash)
    VALUES ('op_1', 'ana@example.com', 'Ana Operadora', 'scrypt$test')
  `);
  await state.db!.execute(sql`INSERT INTO devices (id, token_hash) VALUES ('dev_1', 'hash_1')`);
  await state.db!.execute(sql`
    INSERT INTO ingest_batches (id, device_id, window_id, payload_hash, status)
    VALUES ('batch_1', 'dev_1', 'win_1', 'payload_hash_1', 'processed')
  `);
  await state.db!.execute(sql`
    INSERT INTO flow_windows (id, batch_id, device_id, window_id, start_at, end_at, sequence, snapshot_json)
    VALUES ('fw_1', 'batch_1', 'dev_1', 'win_1', '2026-11-11T11:00:00Z', '2026-11-11T11:00:30Z', 1, '{}'::jsonb)
  `);
  await state.db!.execute(sql`
    INSERT INTO alerts (
      id, window_id, rule_id, severity, title, description, evidence, status,
      acknowledged_at, resolved_at, sla_due_at, expires_at, updated_at
    )
    VALUES (
      ${id},
      'win_1',
      'port_scan',
      'high',
      'Escaneo de puertos',
      'Un peer tocó muchos puertos distintos.',
      '{"distinct_ports":25}'::jsonb,
      ${status},
      ${status === 'acknowledged' || status === 'resolved' ? '2026-11-11T11:10:00Z' : null},
      ${status === 'resolved' ? '2026-11-11T11:20:00Z' : null},
      '2026-11-11T12:00:00Z',
      '2026-11-18T11:00:00Z',
      '2026-11-11T11:00:00Z'
    )
  `);
}

function context(id = 'alert_1') {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown, id = 'alert_1'): NextRequest {
  return new NextRequest(`http://localhost/api/alerts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(id = 'alert_1'): NextRequest {
  return new NextRequest(`http://localhost/api/alerts/${id}`);
}

function admin() {
  mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
}

function visitor() {
  mockedAuthorize.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
  });
}

beforeAll(async () => {
  client = new PGlite();
  state.db = drizzle(client);
  await migrate(state.db, { migrationsFolder });
}, 30_000);

beforeEach(async () => {
  mockedAuthorize.mockReset();
  await state.db!.execute(sql`
    TRUNCATE TABLE alert_audit_log, alert_notes, alerts, flow_windows, ingest_batches, devices, operators CASCADE
  `);
  await seedAlert();
});

afterAll(async () => {
  await client?.close();
});

describe('PATCH /api/alerts/:id contra PGlite', () => {
  it('rechaza al visitante sin mutar la alerta', async () => {
    visitor();

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(403);
    const rows = await queryRows<{ status: string }>(state.db as unknown as QueryDb, sql`
      SELECT status FROM alerts WHERE id = 'alert_1'
    `);
    expect(rows[0]?.status).toBe('open');
  });

  it('reconoce una alerta abierta y persiste el cambio', async () => {
    admin();

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      alert: { id: 'alert_1', status: 'acknowledged' },
      changed: true,
    });

    const rows = await queryRows<{ status: string; acknowledged_at: unknown }>(
      state.db as unknown as QueryDb,
      sql`SELECT status, acknowledged_at FROM alerts WHERE id = 'alert_1'`
    );
    expect(rows[0]).toMatchObject({ status: 'acknowledged' });
    expect(rows[0]?.acknowledged_at).toBeTruthy();
  });

  it('devuelve 409 al intentar reconocer una alerta resuelta', async () => {
    admin();
    await state.db!.execute(sql`UPDATE alerts SET status = 'resolved', resolved_at = '2026-11-11T11:20:00Z' WHERE id = 'alert_1'`);

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'alert_resolved' });
  });

  it('devuelve 409 al intentar reconocer una alerta vencida', async () => {
    admin();
    await state.db!.execute(sql`UPDATE alerts SET status = 'expired' WHERE id = 'alert_1'`);

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'alert_expired' });
  });

  it('devuelve 404 si la alerta no existe', async () => {
    admin();

    const response = await PATCH(patchRequest({ action: 'acknowledge' }, 'alert_missing'), context('alert_missing'));

    expect(response.status).toBe(404);
  });

  it('devuelve 404 en GET si la alerta no existe', async () => {
    admin();

    const response = await GET(getRequest('alert_missing'), context('alert_missing'));

    expect(response.status).toBe(404);
  });

  it('rechaza una acción desconocida con 400', async () => {
    admin();

    const response = await PATCH(patchRequest({ action: 'delete' }), context());

    expect(response.status).toBe(400);
  });

  it('no duplica auditoría con dos acknowledge simultáneos', async () => {
    admin();

    const [first, second] = await Promise.all([
      PATCH(patchRequest({ action: 'acknowledge' }), context()),
      PATCH(patchRequest({ action: 'acknowledge' }), context()),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);
    expect([firstBody.changed, secondBody.changed].filter(Boolean)).toHaveLength(1);

    const audits = await queryRows<{ total: string | number }>(
      state.db as unknown as QueryDb,
      sql`SELECT COUNT(*)::int AS total FROM alert_audit_log WHERE alert_id = 'alert_1' AND action = 'acknowledge'`
    );
    expect(Number(audits[0]?.total)).toBe(1);
  });
});
