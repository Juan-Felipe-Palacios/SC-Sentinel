// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Prueba de la ruta real `/api/ingest` con los fixtures del contrato 0.1.8
// (M6 E7): el criterio es que un bloque `ot` malformado **no** produzca 4xx y
// que el bloque válido produzca alertas y activos OT en el lote persistido.
//
// Solo se sustituyen las fronteras externas: auth del dispositivo, Neon y la
// consulta de dedup. El parseo, las dos pasadas, el techo de confianza y el
// armado de statements son el código de producción.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const DEVICE_ID = 'dev_ot_fixture';

const h = vi.hoisted(() => {
  const state: { statements: { text: string; values: unknown[] }[] } = { statements: [] };
  const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = { text: strings.join('?'), values };
    state.statements.push(statement);
    return statement;
  };
  const sql = Object.assign(sqlTag, {
    transaction: async (queries: unknown[]) => {
      state.statements = queries as { text: string; values: unknown[] }[];
      return [[{ id: 'bat_test' }]];
    },
  });
  return { state, sql };
});

vi.mock('@neondatabase/serverless', () => ({ neon: () => h.sql }));

vi.mock('@/lib/auth/device', () => ({
  authenticateDeviceToken: async () => ({
    valid: true,
    deviceId: 'dev_ot_fixture',
    deviceName: 'fixture',
    deviceStatus: 'active',
  }),
}));

// Dedup de la alerta heurística: sin filas → no hay alerta previa.
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    }),
  },
  flowWindows: { windowId: 'flow_windows.window_id', deviceId: 'flow_windows.device_id', startAt: 'flow_windows.start_at' },
  alerts: { id: 'alerts.id', ruleId: 'alerts.rule_id', windowId: 'alerts.window_id' },
}));

const examples = fileURLToPath(new URL('../../../../../docs/contracts/examples/', import.meta.url));

function snapshot(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${examples}${name}`, 'utf-8')) as Record<string, unknown>;
}

function envelope(body: Record<string, unknown>) {
  return {
    v: 1,
    device: {
      id: DEVICE_ID,
      agent_version: '0.1.8',
      hostname: 'fixture-host',
      boot_id: 'boot-1',
    },
    window: {
      id: 'win_2026_11_20_1000',
      start: '2026-11-20T10:00:00Z',
      end: '2026-11-20T10:00:30Z',
      duration_ms: 30000,
      sequence: 7,
    },
    snapshot: body,
  };
}

async function post(body: Record<string, unknown>) {
  const raw = JSON.stringify(envelope(body));
  const request = new NextRequest('http://127.0.0.1/api/ingest', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(raw)),
    },
    body: raw,
  });
  const response = await POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

let POST: typeof import('../route').POST;

beforeEach(async () => {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost/placeholder';
  h.state.statements = [];
  ({ POST } = await import('../route'));
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

describe('POST /api/ingest · bloque ot (E7)', () => {
  it('el fixture 0.1.8 sin `ot` sigue en 200', async () => {
    const { status, json } = await post(snapshot('snapshot-0.1.8-no-ot.json'));
    expect(status).toBe(200);
    expect(json.status).toBe('processed');
    expect(h.state.statements.some((s) => s.text.includes('ot_assets'))).toBe(false);
  });

  it('el fixture válido responde 200 y persiste alertas y activos OT', async () => {
    const { status, json } = await post(snapshot('snapshot-ot-valid.json'));
    expect(status).toBe(200);
    expect(json.status).toBe('processed');

    const texts = h.state.statements.map((s) => s.text).join('\n');
    expect(texts).toContain('INSERT INTO ot_assets');
    // Un solo statement de activos aunque el fixture tenga dos hosts.
    expect(h.state.statements.filter((s) => s.text.includes('INSERT INTO ot_assets'))).toHaveLength(1);

    // Una alerta = un statement (comportamiento previo de `buildPersistStatements`):
    // el fixture trae dos eventos, así que hay dos inserts de alertas.
    const alertStatements = h.state.statements.filter((s) => s.text.includes('INSERT INTO alerts'));
    expect(alertStatements).toHaveLength(2);
    const flat = JSON.stringify(alertStatements.map((s) => s.values));
    expect(flat).toContain('ot_new_master');
    expect(flat).toContain('ot_write_outside_hours');
    // client/server viajan en evidence para que E8.1 dibuje aristas reales.
    expect(flat).toContain('9f2c1d4b7a5e3c8d1b0a6f4e2d9c7b3a');
    expect(flat).toContain('4e8a7c2b1d9f3a6e5c0b8d4f2a7e1c9b');
  });

  it('el fixture malformado responde 200 (nunca 4xx por `ot`) y descarta el bloque', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, json } = await post(snapshot('snapshot-ot-malformed.json'));

    expect(status).toBe(200);
    expect(json.status).toBe('processed');

    const texts = h.state.statements.map((s) => s.text).join('\n');
    expect(texts).not.toContain('INSERT INTO ot_assets');
    const logged = errorSpy.mock.calls.map((call) => String(call.join(' '))).join('\n');
    expect(logged).toContain('ot_block_discarded');
  });
});
