// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Pipeline de análisis por lotes (§11.3/§11.4): facts → hash → dedup (<5 min) → cadena → ai_insights.
// Degradado honesto: si la cadena falla, persistimos un insight status=degraded (sin hallazgos inventados).

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { defaultQueryDb, isoOrNull, queryRows, type QueryDb } from '@/lib/query/db-rows';
import { factsHash } from './hash';
import { callAiChain } from './providers';
import type { AiFacts } from './facts';

export type AnalysisStatus = 'ok' | 'degraded' | 'cached' | 'no_data';

export interface AiInsightRecord {
  id: string;
  device_id: string;
  period_start: string;
  period_end: string;
  model: string;
  status: AnalysisStatus;
  /** §11.2: riesgo declarado por el modelo (null solo en filas previas a 0002). */
  risk_level: string | null;
  summary: string;
  findings: Array<{ type: string; description: string; severity: string }>;
  recommendations: string[];
  facts_hash: string;
  created_at: string;
}

export interface AnalysisResult {
  status: AnalysisStatus;
  insight: AiInsightRecord | null;
}



interface InsightRow {
  id: string;
  device_id: string;
  period_start: Date | string;
  period_end: Date | string;
  model: string;
  status: string;
  risk_level: string | null;
  summary: string;
  recommendations_json: Array<{ type: string; description: string; severity: string }> | null;
  facts_hash: string;
  created_at: Date | string;
}

function isFinding(value: unknown): value is AiInsightRecord['findings'][number] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['type'] === 'string' &&
    typeof candidate['description'] === 'string' &&
    typeof candidate['severity'] === 'string'
  );
}

/**
 * `recommendations_json` guarda { findings, recommendations } (formato §11.2).
 * Se tolera el formato histórico de array de strings para no perder filas viejas.
 */
function parseRecommendations(
  raw: unknown
): { findings: AiInsightRecord['findings']; recommendations: string[] } {
  if (Array.isArray(raw)) {
    return {
      findings: raw.filter(isFinding),
      recommendations: raw.filter((entry): entry is string => typeof entry === 'string'),
    };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { findings?: unknown; recommendations?: unknown };
    return {
      findings: Array.isArray(obj.findings) ? obj.findings.filter(isFinding) : [],
      recommendations: Array.isArray(obj.recommendations)
        ? obj.recommendations.filter((entry): entry is string => typeof entry === 'string')
        : [],
    };
  }
  return { findings: [], recommendations: [] };
}

function mapInsightRow(row: InsightRow): AiInsightRecord {
  const { findings, recommendations } = parseRecommendations(row.recommendations_json);
  return {
    id: row.id,
    device_id: row.device_id,
    period_start: isoOrNull(row.period_start) ?? String(row.period_start),
    period_end: isoOrNull(row.period_end) ?? String(row.period_end),
    model: row.model,
    status: (row.status as AnalysisStatus) ?? 'ok',
    risk_level: row.risk_level ?? null,
    summary: row.summary,
    findings,
    recommendations,
    facts_hash: row.facts_hash,
    created_at: isoOrNull(row.created_at) ?? String(row.created_at),
  };
}

/** Devuelve el insight si se creó o ya existía uno con los mismos facts en los últimos 5 min. */
async function findRecentInsight(
  factsHashValue: string,
  deviceId: string,
  database: QueryDb
): Promise<AiInsightRecord | null> {
  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT *
        FROM ai_insights
        WHERE facts_hash = ${factsHashValue}
          AND device_id = ${deviceId}
          AND created_at > (NOW() - INTERVAL '5 minutes')
        ORDER BY created_at DESC
        LIMIT 1`
  );
  return rows[0] ? mapInsightRow(rows[0]) : null;
}

function buildDegradedOutput(): {
  summary: string;
  risk_level: 'low';
  findings: [];
  recommendations: [];
} {
  return {
    summary:
      'El motor determinista analizó las ventanas con normalidad; el análisis con IA no está disponible en modo degradado. Revisa las alertas y las métricas de la ventana.',
    risk_level: 'low',
    findings: [],
    recommendations: [],
  };
}

/**
 * Ejecuta el pipeline. `database` es inyectable para tests.
 * `facts` null ⇒ `no_data` (sin llamada a la IA).
 */
export async function runAnalysisPipeline(
  facts: AiFacts | null,
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<AnalysisResult> {
  if (!facts) return { status: 'no_data', insight: null };

  const hash = factsHash(facts);

  const cached = await findRecentInsight(hash, deviceId, database);
  if (cached) return { status: 'cached', insight: cached };

  const chain = await callAiChain(facts);
  const output = chain.ok && chain.output ? chain.output : buildDegradedOutput();
  const model = chain.ok && chain.model ? chain.model : 'deterministic-fallback';
  const status: AnalysisStatus = chain.ok ? 'ok' : 'degraded';

  const id = `ins_${randomUUID()}`;
  const recommendationsJson = {
    findings: output.findings,
    recommendations: output.recommendations,
  };

  await database.execute(
    sql`INSERT INTO ai_insights
          (id, device_id, period_start, period_end, model, status, risk_level, summary,
           recommendations_json, facts_hash)
        VALUES (
          ${id},
          ${deviceId},
          ${facts.period.start}::timestamptz,
          ${facts.period.end}::timestamptz,
          ${model},
          ${status},
          ${output.risk_level},
          ${output.summary},
          ${JSON.stringify(recommendationsJson)}::jsonb,
          ${hash}
        )`
  );

  const inserted = await findRecentInsight(hash, deviceId, database);
  // Si por alguna razón el INSERT no se puede leer (p. ej. reloj/futuro), construimos el record completo.
  if (!inserted) {
    return {
      status,
      insight: {
        id,
        device_id: deviceId,
        period_start: facts.period.start,
        period_end: facts.period.end,
        model,
        status,
        risk_level: output.risk_level,
        summary: output.summary,
        findings: output.findings,
        recommendations: output.recommendations,
        facts_hash: hash,
        created_at: new Date().toISOString(),
      },
    };
  }
  return { status, insight: inserted };
}

export async function fetchLatestInsight(
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<AiInsightRecord | null> {
  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT *
        FROM ai_insights
        WHERE device_id = ${deviceId}
        ORDER BY created_at DESC
        LIMIT 1`
  );
  return rows[0] ? mapInsightRow(rows[0]) : null;
}
