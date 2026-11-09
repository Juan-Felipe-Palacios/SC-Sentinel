// web/lib/query/__tests__/export.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { EXPORT_ROW_LIMIT, queryHostsExport } from '@/lib/query/export';
import type { QueryDb } from '@/lib/query/db-rows';
import type { SQL } from 'drizzle-orm';

function fakeDb(rows: unknown[]): QueryDb {
  return { execute: (_query: SQL) => Promise.resolve({ rows }) };
}

describe('export row limit', () => {
  it('fija el límite en 10000', () => {
    expect(EXPORT_ROW_LIMIT).toBe(10_000);
  });
  it('devuelve vacío sin device_id sin tocar la base', async () => {
    const failing: QueryDb = { execute: () => Promise.reject(new Error('no debe llamar')) };
    await expect(queryHostsExport('1h', null, failing)).resolves.toEqual({ rows: 0, hosts: [] });
  });
  it('mapea filas del fake DB', async () => {
    const result = await queryHostsExport('1h', 'dev_1', fakeDb([
      { host_key: 'hk_1', ip: '10.0.0.5', country: 'AR', bytes_in: 100, bytes_out: 50, packets: 12, risk_score: '0.9', first_seen: '2026-01-01T00:00:00.000Z', last_seen: '2026-01-01T01:00:00.000Z' },
    ]));
    expect(result).toMatchObject({ rows: 1, hosts: [{ host_key: 'hk_1', bytes_in: 100 }] });
  });
});
