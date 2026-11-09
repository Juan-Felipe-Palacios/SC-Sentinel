// web/lib/query/__tests__/evals.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { queryEvals } from '@/lib/query/evals';
import type { QueryDb } from '@/lib/query/db-rows';
import type { SQL } from 'drizzle-orm';

function fakeDb(results: unknown[][]): QueryDb {
  let call = 0;
  return { execute: (_query: SQL) => Promise.resolve({ rows: results[call++] ?? [] }) };
}

describe('queryEvals', () => {
  it('calcula success_rate y mapea agregados', async () => {
    const result = await queryEvals(
      '24h',
      fakeDb([
        [{ total: '10', succeeded: '8' }],
        [{ p50: '210.5', p95: '880.2' }],
        [{ day: '2026-01-01', cost_usd: '0.123456' }],
        [{ model: 'm1', total: '8', cost_usd: '0.1', p50: '200' }],
      ]),
    );
    expect(result).toMatchObject({
      success_rate: 0.8,
      total: 10,
      succeeded: 8,
      latency_p50_ms: 210.5,
      latency_p95_ms: 880.2,
      daily_cost: [{ day: '2026-01-01', cost_usd: 0.123456 }],
      by_model: [{ model: 'm1', total: 8, cost_usd: 0.1, latency_p50_ms: 200 }],
    });
  });

  it('devuelve null cuando no hay filas', async () => {
    const result = await queryEvals('24h', fakeDb([[{ total: '0', succeeded: '0' }], [{ p50: null, p95: null }], [], []]));
    expect(result.success_rate).toBeNull();
    expect(result.latency_p50_ms).toBeNull();
    expect(result.daily_cost).toEqual([]);
  });
});
