// web/lib/query/evals.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Agregados de evals sobre ai_insights: percentiles, coste/latencia diarios,
// tasa de éxito y desglose por modelo. Fila sin métricas (vieja) se ignora
// donde corresponde (success_rate/latency/cost cuentan solo filas con datos).

import { sql } from 'drizzle-orm';
import { getRangeBounds } from './range';
import { defaultQueryDb, queryRows, type QueryDb } from './db-rows';
import type { QueryRange } from '@/lib/schemas/query';

export interface EvalsResult {
  success_rate: number | null;
  total: number;
  succeeded: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  daily_cost: Array<{ day: string; cost_usd: number }>;
  by_model: Array<{ model: string; total: number; cost_usd: number; latency_p50_ms: number | null }>;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function queryEvals(
  range: QueryRange = '24h',
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
): Promise<EvalsResult> {
  const { start } = getRangeBounds(range, now);
  const startIso = start.toISOString();

  const successRow = await queryRows<{ total: string; succeeded: string }>(
    database,
    sql`SELECT COUNT(*)::text AS total,
               COUNT(*) FILTER (WHERE status = 'ok')::text AS succeeded
        FROM ai_insights WHERE created_at >= ${startIso}::timestamptz`,
  );
  const total = Number(successRow[0]?.total ?? 0);
  const succeeded = Number(successRow[0]?.succeeded ?? 0);
  const success_rate = total > 0 ? succeeded / total : null;

  const latencyRows = await queryRows<{ p50: string | null; p95: string | null }>(
    database,
    sql`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95
        FROM ai_insights
        WHERE created_at >= ${startIso}::timestamptz AND latency_ms IS NOT NULL`,
  );
  const latency_p50_ms = num(latencyRows[0]?.p50);
  const latency_p95_ms = num(latencyRows[0]?.p95);

  const dailyRows = await queryRows<{ day: string; cost_usd: string }>(
    database,
    sql`SELECT (created_at AT TIME ZONE 'UTC')::date::text AS day,
               COALESCE(SUM(cost_usd), 0)::numeric::text AS cost_usd
        FROM ai_insights WHERE created_at >= ${startIso}::timestamptz
        GROUP BY 1 ORDER BY 1 ASC`,
  );
  const daily_cost = dailyRows.map((row) => ({ day: row.day, cost_usd: Number(row.cost_usd) }));

  const modelRows = await queryRows<{ model: string; total: string; cost_usd: string; p50: string | null }>(
    database,
    sql`SELECT model,
               COUNT(*)::text AS total,
               COALESCE(SUM(cost_usd), 0)::numeric::text AS cost_usd,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50
        FROM ai_insights WHERE created_at >= ${startIso}::timestamptz
        GROUP BY model ORDER BY COUNT(*) DESC LIMIT 20`,
  );
  const by_model = modelRows.map((row) => ({
    model: row.model,
    total: Number(row.total),
    cost_usd: Number(row.cost_usd),
    latency_p50_ms: num(row.p50),
  }));

  return { success_rate, total, succeeded, latency_p50_ms, latency_p95_ms, daily_cost, by_model };
}
