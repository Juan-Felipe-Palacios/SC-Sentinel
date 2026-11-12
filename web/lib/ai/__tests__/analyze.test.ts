import { afterEach, describe, expect, it, vi } from 'vitest';
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
  risk_level: 'medium',
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

const legacyRowWithoutRiskLevel = {
  id: 'ins_cached_no_risk',
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
  facts_hash: 'hash-existente-legacy',
  created_at: '2026-11-03T10:01:00.000Z',
};

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(result.insight?.risk_level).toBe('medium');
  });

  it('expone risk_level null en filas históricas sin la columna (pre-0002)', async () => {
    const db = fakeDb([[legacyRowWithoutRiskLevel]]);
    const result = await runAnalysisPipeline(facts, 'dev_x', db);
    expect(result.insight?.risk_level).toBeNull();
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

describe('modo cron (Estrategias A y B)', () => {
  const cronOptions = { minIntervalMs: 15 * 60_000 };

  it('A: cached si el último insight es más reciente que el intervalo', async () => {
    const recentRow = {
      ...insightRow,
      id: 'ins_recent',
      created_at: new Date(Date.now() - 60_000).toISOString(),
    };
    // 1) dedup por hash sin match; 2) último insight reciente ⇒ sin más queries.
    const db = fakeDb([[], [recentRow]]);

    const result = await runAnalysisPipeline(facts, 'dev_x', db, 'es', cronOptions);

    expect(result.status).toBe('cached');
    expect(result.insight?.id).toBe('ins_recent');
  });

  it('B: cached sin llamar a la IA si no hay ventanas nuevas desde el insight', async () => {
    const oldRow = {
      ...insightRow,
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(), // > intervalo
    };
    // 3ª query: MAX(start_at) = 09:59 anterior a period_end (10:00:30) ⇒ sin datos nuevos.
    const db = fakeDb([[], [oldRow], [{ start_at: '2026-11-03T09:59:00.000Z' }]]);

    const result = await runAnalysisPipeline(facts, 'dev_x', db, 'es', cronOptions);

    expect(result.status).toBe('cached');
    expect(result.insight?.id).toBe('ins_cached');
  });

  it('B: analiza cuando hay ventanas nuevas posteriores al último insight', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    const oldRow = {
      ...insightRow,
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    };
    // Tras detectar ventana nueva: cadena sin keys ⇒ degraded (sin INSERT ni
    // fetch) y la relectura posterior no devuelve filas.
    const db = fakeDb([[], [oldRow], [{ start_at: '2026-11-07T23:00:00.000Z' }], []]);

    const result = await runAnalysisPipeline(facts, 'dev_x', db, 'es', cronOptions);

    expect(result.status).toBe('degraded');
    expect(result.insight?.model).toBe('deterministic-fallback');
  });

  it('sin tráfico en el período declara no_traffic sin llamar a la IA', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    // Primera consulta: no hay insight previo con el mismo hash. La segunda es
    // el INSERT del insight determinista (no debe faltar).
    const db = fakeDb([[]]);
    const emptyFacts: AiFacts = { ...facts, total_bytes: 0, total_packets: 0 };

    const result = await runAnalysisPipeline(emptyFacts, 'dev_x', db, 'es');

    expect(result.status).toBe('no_traffic');
    expect(result.insight?.status).toBe('no_traffic');
    expect(result.insight?.summary).toMatch(/Sin tráfico observado/);
    // Sin hallazgos ni recomendaciones inventadas: el período está vacío.
    expect(result.insight?.findings).toEqual([]);
    expect(result.insight?.recommendations).toEqual([]);
  });
});
