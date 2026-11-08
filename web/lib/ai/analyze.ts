// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Pipeline de análisis por lotes (§11.3/§11.4): facts → hash → dedup (<5 min) → cadena → ai_insights.
// Degradado honesto: si la cadena falla, persistimos un insight status=degraded (sin hallazgos inventados).

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { defaultQueryDb, isoOrNull, queryRows, type QueryDb } from '@/lib/query/db-rows';
import { factsHash } from './hash';
import { callAiChain } from './providers';
import type { AiFacts } from './facts';
import type { AiLanguage } from './openrouter';

export type AnalysisStatus = 'ok' | 'degraded' | 'cached' | 'no_data';

export interface AiInsightRecord {
  id: string;
  device_id: string;
  period_start: string;
  period_end: string;
  model: string;
  status: AnalysisStatus;
  /** Idioma del texto generado (español por defecto). */
  language: AiLanguage;
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

export interface RunAnalysisOptions {
  /**
   * Dedup por tiempo (cron): si el device ya tiene un insight en este idioma
   * más reciente que el intervalo, se devuelve como `cached` sin llamar a la
   * IA. El panel manual no lo pasa y sigue controlando por facts_hash.
   */
  minIntervalMs?: number;
}

/** Cadencia del cron de IA: máximo un insight nuevo cada 15 min por device.
 *  Debe acompañar al scheduler de ai-cron.yml (dispara cada 15 minutos). */
export const AI_CRON_MIN_INTERVAL_MS = 15 * 60_000;



interface InsightRow {
  id: string;
  device_id: string;
  period_start: Date | string;
  period_end: Date | string;
  model: string;
  status: string;
  language: string | null;
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
    language: row.language === 'en' ? 'en' : 'es',
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

/** Último insight del device en el idioma pedido (sin importar facts_hash). */
async function findLatestInsight(
  deviceId: string,
  language: AiLanguage,
  database: QueryDb
): Promise<AiInsightRecord | null> {
  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT *
        FROM ai_insights
        WHERE device_id = ${deviceId}
          AND COALESCE(language, 'es') = ${language}
        ORDER BY created_at DESC
        LIMIT 1`
  );
  return rows[0] ? mapInsightRow(rows[0]) : null;
}

/**
 * Presupuesto diario de llamadas a la IA (aproximación de consumo de tokens):
 * cuenta las filas de `ai_insights` creadas hoy (UTC). `0` o ausente ⇒ sin límite.
 * Protege la cuota free ante rachas de cron o clicks repetidos del panel.
 */
function dailyCallBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.AI_DAILY_CALL_BUDGET ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

async function countInsightsToday(database: QueryDb): Promise<number> {
  const todayUtc = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const rows = await queryRows<{ total: string }>(
    database,
    sql`SELECT COUNT(*) AS total
        FROM ai_insights
        WHERE created_at >= ${todayUtc}::timestamptz`
  );
  return Number(rows[0]?.total ?? 0);
}

/** Inicio (ISO) de la ventana de flow más reciente del device; null si no hay. */
async function latestFlowWindowStart(
  deviceId: string,
  database: QueryDb
): Promise<string | null> {
  const rows = await queryRows<{ start_at: Date | string | null }>(
    database,
    sql`SELECT MAX(start_at) AS start_at
        FROM flow_windows
        WHERE device_id = ${deviceId}`
  );
  const raw = rows[0]?.start_at;
  if (raw === null || raw === undefined) return null;
  return isoOrNull(raw) ?? String(raw);
}

const DEGRADED_SUMMARY: Record<AiLanguage, string> = {
  es: 'El motor determinista analizó las ventanas con normalidad; el análisis con IA no está disponible en modo degradado. Revisa las alertas y las métricas de la ventana.',
  en: 'The deterministic engine analyzed the windows normally; the AI analysis is unavailable in degraded mode. Review the alerts and the window metrics.',
};

function buildDegradedOutput(language: AiLanguage = 'es'): {
  summary: string;
  risk_level: 'low';
  findings: [];
  recommendations: [];
} {
  return {
    summary: DEGRADED_SUMMARY[language],
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
  database: QueryDb = defaultQueryDb,
  language: AiLanguage = 'es',
  options: RunAnalysisOptions = {}
): Promise<AnalysisResult> {
  if (!facts) return { status: 'no_data', insight: null };

  const hash = factsHash(facts, language);

  const cached = await findRecentInsight(hash, deviceId, database);
  if (cached) return { status: 'cached', insight: cached };

  // Modo cron (Estrategia A + B):
  //  A) intervalo mínimo: un insight nuevo como máximo cada `minIntervalMs`;
  //  B) datos nuevos: si la última ventana de flow no llegó más allá de lo que
  //     cubrió el último insight (agente detenido o sin tráfico), se sale sin
  //     gastar una sola llamada a la IA.
  if (options.minIntervalMs && options.minIntervalMs > 0) {
    const latest = await findLatestInsight(deviceId, language, database);
    if (latest) {
      const ageMs = Date.now() - Date.parse(latest.created_at);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < options.minIntervalMs) {
        return { status: 'cached', insight: latest };
      }
      const lastWindowStart = await latestFlowWindowStart(deviceId, database);
      const coveredUntil = Date.parse(latest.period_end);
      const hasNewData =
        lastWindowStart !== null &&
        Number.isFinite(coveredUntil) &&
        Date.parse(lastWindowStart) >= coveredUntil;
      if (!hasNewData) {
        console.log(
          JSON.stringify({
            event: 'ai_cron_no_new_data',
            last_window_start: lastWindowStart,
            covered_until: latest.period_end,
          })
        );
        return { status: 'cached', insight: latest };
      }
    }
  }

  // Presupuesto diario de llamadas: agotado ⇒ no se gasta cuota free.
  const budget = dailyCallBudget();
  if (budget > 0) {
    const used = await countInsightsToday(database);
    if (used >= budget) {
      console.warn(JSON.stringify({ event: 'ai_budget_exhausted', used, budget }));
      const latest = await findLatestInsight(deviceId, language, database);
      if (latest) return { status: 'cached', insight: latest };
      return { status: 'degraded', insight: null };
    }
  }

  const chain = await callAiChain(facts, { language });
  const output = chain.ok && chain.output ? chain.output : buildDegradedOutput(language);
  const model = chain.ok && chain.model ? chain.model : 'deterministic-fallback';
  const status: AnalysisStatus = chain.ok ? 'ok' : 'degraded';

  const id = `ins_${randomUUID()}`;
  const recommendationsJson = {
    findings: output.findings,
    recommendations: output.recommendations,
  };

  await database.execute(
    sql`INSERT INTO ai_insights
          (id, device_id, period_start, period_end, model, status, language, risk_level, summary,
           recommendations_json, facts_hash)
        VALUES (
          ${id},
          ${deviceId},
          ${facts.period.start}::timestamptz,
          ${facts.period.end}::timestamptz,
          ${model},
          ${status},
          ${language},
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
        language,
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
  language: AiLanguage = 'es',
  database: QueryDb = defaultQueryDb
): Promise<AiInsightRecord | null> {
  const rows = await queryRows<InsightRow>(
    database,
    sql`SELECT *
        FROM ai_insights
        WHERE device_id = ${deviceId}
          AND COALESCE(language, 'es') = ${language}
        ORDER BY created_at DESC
        LIMIT 1`
  );
  return rows[0] ? mapInsightRow(rows[0]) : null;
}
