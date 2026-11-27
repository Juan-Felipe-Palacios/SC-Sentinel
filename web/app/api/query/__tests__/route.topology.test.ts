// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//
// Prueba de la ruta real `/api/query?metric=topology` (M6 E8.1) al estilo de
// `route.ot.test.ts`: solo se sustituyen las fronteras externas (auth del
// dispositivo, Neon y la consulta de dedup). El parseo de parámetros, la
// rama sintética y el read model `queryOtTopology` son código de producción.
//
// Casos: (1) un device real sin `ot_assets` produce payload vacío
// (nodes=[], edges=[]); (2) el device de demo sintético produce nodos y
// aristas sin tocar la base.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const DEVICE_ID = 'dev_topology_fixture';

const h = vi.hoisted(() => {
  const state: { nodeRows: unknown[]; alertRows: unknown[] } = {
    nodeRows: [],
    alertRows: [],
  };

  function sqlText(query: unknown): string {
    try {
      if (query && typeof query === 'object') {
        const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
        if (Array.isArray(chunks)) {
          return chunks
            .map((chunk) => {
              if (typeof chunk === 'string') return chunk;
              if (chunk && typeof chunk === 'object') {
                const c = chunk as Record<string, unknown>;
                if (Array.isArray(c.value)) return c.value.join('');
                if (typeof c.value === 'string') return c.value;
                if (typeof c.name === 'string') return c.name;
                if (typeof c.sql === 'string') return c.sql;
              }
              return '';
            })
            .join(' ');
        }
        return JSON.stringify(query);
      }
      return String(query);
    } catch {
      return '';
    }
  }

  const db = {
    execute: async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes('ot_assets')) return { rows: state.nodeRows };
      if (text.includes('alerts')) return { rows: state.alertRows };
      return { rows: [] };
    },
  };

  return { state, db };
});

vi.mock('@neondatabase/serverless', () => ({ neon: () => h.db }));

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
  clientIp: vi.fn(() => '203.0.113.50'),
}));

vi.mock('@/lib/rate-limit/guest', () => ({
  checkGuestRequestLimit: vi.fn(),
  guestRateLimitResponse: vi.fn(),
}));

vi.mock('@/lib/query/device', () => ({
  resolveDeviceId: vi.fn(async () => DEVICE_ID),
}));

vi.mock('@/lib/db', () => ({
  db: h.db,
  flowWindows: { windowId: 'flow_windows.window_id', deviceId: 'flow_windows.device_id', startAt: 'flow_windows.start_at' },
  alerts: { id: 'alerts.id', ruleId: 'alerts.rule_id', windowId: 'alerts.window_id' },
}));

import { authorize } from '@/lib/auth/resolve';
import { checkGuestRequestLimit } from '@/lib/rate-limit/guest';
import { SYNTHETIC_DEMO_DEVICE_ID } from '@/lib/demo/synthetic';
import { GET } from '../route';

const mockedAuthorize = vi.mocked(authorize);
const mockedLimit = vi.mocked(checkGuestRequestLimit);

function adminAuth() {
  mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } } as never);
}

function guestAuth(deviceId: string) {
  mockedAuthorize.mockResolvedValue({
    ok: true,
    auth: {
      role: 'guest',
      guest: { deviceId, expiresAt: Date.now() + 60_000, tokenId: 'token' },
    },
  } as never);
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost/placeholder';
  h.state.nodeRows = [];
  h.state.alertRows = [];
  mockedLimit.mockReturnValue({ allowed: true } as never);
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

describe('GET /api/query?metric=topology (E8.1)', () => {
  it('device real sin ot_assets produce payload vacío (nodes=[], edges=[])', async () => {
    adminAuth();
    // Sin filas en ot_assets ni en alerts.
    const response = await GET(
      new NextRequest('http://127.0.0.1/api/query?metric=topology&range=1h')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      nodes: unknown[];
      edges: unknown[];
      truncated: { nodes: boolean; edges: boolean };
    };
    expect(body.nodes).toHaveLength(0);
    expect(body.edges).toHaveLength(0);
    expect(body.truncated).toEqual({ nodes: false, edges: false });
  });

  it('device real con activos y alertas produce nodos y aristas reales', async () => {
    adminAuth();
    h.state.nodeRows = [
      { host_key: 'client-a', role: 'client', protocols: ['modbus'], label: 'Client A', last_seen: '2026-11-26T01:00:00.000Z' },
      { host_key: 'server-b', role: 'server', protocols: ['modbus'], label: 'Server B', last_seen: '2026-11-26T01:00:00.000Z' },
    ];
    h.state.alertRows = [
      { rule_id: 'ot_new_master', evidence: { client: 'client-a', server: 'server-b' } },
    ];

    const response = await GET(
      new NextRequest('http://127.0.0.1/api/query?metric=topology&range=1h')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      nodes: { host_key: string }[];
      edges: { client: string; server: string; count: number }[];
    };
    expect(body.nodes).toHaveLength(2);
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0]).toMatchObject({ client: 'client-a', server: 'server-b', count: 1 });
  });

  it('el device de demo sintético produce nodos y aristas sin tocar la base', async () => {
    guestAuth(SYNTHETIC_DEMO_DEVICE_ID);
    mockedLimit.mockReturnValue({ allowed: true } as never);

    const response = await GET(
      new NextRequest('http://127.0.0.1/api/query?metric=topology&range=1h')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(body.edges.length).toBeGreaterThan(0);
  });

  it('rechaza parámetros inválidos con 400', async () => {
    adminAuth();

    const response = await GET(
      new NextRequest('http://127.0.0.1/api/query?metric=topology&range=foo')
    );

    expect(response.status).toBe(400);
  });
});
