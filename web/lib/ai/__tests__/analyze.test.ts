import { describe, expect, it, vi } from 'vitest';
import { runAnalysisPipeline } from '@/lib/ai/analyze';
import type { AiFacts } from '@/lib/ai/facts';

const facts: AiFacts = {
  period: { start: '2026-11-03T10:00:00.000Z', end: '2026-11-03T10:00:30.000Z' },
  total_bytes: 10,
  total_packets: 1,
  top_hosts: [],
  top_ports: [],
  top_countries: [],
  alerts: [],
  health: null,
};

const insightRow = {
  id: 'ins_cached',
  device_id: 'dev_x',
  period_start: '2026-11-03T10:00:00.000Z',
  period_end: '2026-11-03T10:00:30.000Z',
  model: 'm',
  status: 'ok',
  summary: 'Resumen previo',
  recommendations_json: {
    findings: [
      { type: 'volume_anomaly', description: 'Pico en la ventana', severity: 'medium' },
    ],
    recommendations: ['Observar'],
  },
  facts_hash: 'hash-existente',
  created_at: '2026-11-03T10:01:00.000Z',
};

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

describe('runAnalysisPipeline', () => {
  it('no_data sin facts (sin llamadas a la base)', async () => {
    const db = fakeDb([]);
    expect((await runAnalysisPipeline(null, 'dev_x', db)).status).toBe('no_data');
  });

  it('devuelve cached cuando ya existe un insight con el mismo facts_hash (<5min)', async () => {
    const db = fakeDb([[insightRow]]);
    const result = await runAnalysisPipeline(facts, 'dev_x', db);
    expect(result.status).toBe('cached');
    expect(result.insight?.id).toBe('ins_cached');
  });

  it('mapea findings y recommendations del jsonb { findings, recommendations }', async () => {
    const db = fakeDb([[insightRow]]);
    const insight = (await runAnalysisPipeline(facts, 'dev_x', db)).insight;
    expect(insight?.findings).toEqual([
      { type: 'volume_anomaly', description: 'Pico en la ventana', severity: 'medium' },
    ]);
    expect(insight?.recommendations).toEqual(['Observar']);
  });

  it('tolera filas históricas con array de strings (sin findings)', async () => {
    const legacyRow = { ...insightRow, recommendations_json: ['Revisar umbrales'] };
    const db = fakeDb([[legacyRow]]);
    const insight = (await runAnalysisPipeline(facts, 'dev_x', db)).insight;
    expect(insight?.findings).toEqual([]);
    expect(insight?.recommendations).toEqual(['Revisar umbrales']);
  });
});
