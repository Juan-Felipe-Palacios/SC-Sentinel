// web/lib/ai/metrics.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Utilidades de métricas/coste de IA. Los proveedores ya reportan tokens y
// latencia (ver logAiCall); aquí se tipan y se estima el coste.

export interface AiCallMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  statusCode: number;
}

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export type PricingTable = Record<string, ModelPricing>;

/** Tabla de precios desde AI_PRICING_JSON: {"modelo":{"inputPerMTok":0.15,"outputPerMTok":0.60}} */
export function parsePricing(env: Record<string, string | undefined> = process.env): PricingTable {
  const raw = env['AI_PRICING_JSON'];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const table: PricingTable = {};
    for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as { inputPerMTok?: unknown; outputPerMTok?: unknown };
      const input = Number(candidate.inputPerMTok);
      const output = Number(candidate.outputPerMTok);
      if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
        table[model] = { inputPerMTok: input, outputPerMTok: output };
      }
    }
    return table;
  } catch {
    return {};
  }
}

/** Coste en USD; 0 si el modelo no tiene precio (free) o faltan conteos. */
export function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null, pricing: PricingTable): number {
  const entry = pricing[model];
  if (!entry || inputTokens === null || outputTokens === null) return 0;
  return (inputTokens / 1_000_000) * entry.inputPerMTok + (outputTokens / 1_000_000) * entry.outputPerMTok;
}
