// web/lib/ai/cost-alert.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Alerta de coste diario: log estructurado + webhook opcional (AI_COST_ALERT_WEBHOOK_URL).
// Best-effort: un fallo aquí nunca rompe el pipeline de análisis.

/** Suma el coste de las filas de hoy. `env` inyectable para tests. */
export function dailyCostBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseFloat(env.AI_DAILY_COST_BUDGET_USD ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export async function maybeAlertCost(
  todayCostUsd: number,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ alerted: boolean; reason: string }> {
  const budget = dailyCostBudget(env);
  if (budget <= 0) return { alerted: false, reason: 'no_budget' };
  if (todayCostUsd < budget) return { alerted: false, reason: 'under_budget' };

  console.warn(JSON.stringify({ event: 'ai_cost_budget_exceeded', today_cost_usd: todayCostUsd, budget_usd: budget }));

  const webhook = env.AI_COST_ALERT_WEBHOOK_URL;
  if (!webhook) return { alerted: true, reason: 'webhook_not_configured' };

  try {
    await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Presupuesto diario de IA excedido: ${todayCostUsd.toFixed(6)} USD > ${budget} USD` }),
    });
  } catch {
    // best-effort
  }
  return { alerted: true, reason: 'webhook_sent' };
}
