# ADR-0005 — IA solo por lotes (batch-only, ≤1 llamada por ~5 min)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §11

> **Nota de aclaración (2026-11-08, spec v2.2):** la cadencia operativa del cron pasó a **15 min** vía GitHub Actions (`ai-cron.yml`) con early-return cuando no hay datos nuevos; la cadena de fallback es ahora **multi-proveedor** (Gemini → OpenRouter → Groq) con cooldown 429 y backoff 1 s/2 s; la salida máxima subió a 4.000 tokens y se agregó el presupuesto diario opcional `AI_DAILY_CALL_BUDGET`. La decisión batch-only y el dedup por `facts_hash` siguen vigentes.
>
> **Nota de aclaración (2026-11-08):** el motor determinista local `sc-detect` está en fase de desarrollo. El backend aplica un enriquecimiento heurístico de respaldo (cloud heuristic, `web/lib/risk/heuristic.ts`) para garantizar la visibilidad operativa del dashboard: cuando el agente envía `risk_score: null` y `alerts: []`, la nube evalúa señales deterministas del payload (severidad de alertas, salud de captura, puertos de riesgo, ratio de paquetes caídos) y rellena `host_stats.risk_score` con un piso de banda baja; solo agrega una alerta `cloud_heuristic` (dedup 1 h) si la ventana llega a banda media o alta y el agente no emitió alertas propias. El valor del agente siempre tiene prioridad.

## Contexto

Se quiere análisis de anomalías con IA, pero lasquieras modelos de OpenRouter free tienen rate limits estrictos y la nube no debe ver tráfico por-flujo. El motor determinista (etherparse + ~6000 servicios + MaxMind) ya detecta y es la fuente de verdad.

## Decisión

- La IA **nunca opera por-flujo ni reemplaza al motor determinista**: solo enriquece, por encima de hechos agregados.
- **Máximo 1 llamada por lote de ~5 min** vía `/api/ai/cron` (o demanda manual `/api/ai/analyze`).
- **No hay colas**: si hay una llamada en curso, la siguiente se cancela.
- Dedup por `facts_hash` en `ai_insights`: los mismos hechos nunca se re-analizan.
- Cadena de fallback obligatoria entre modelos `:free`; si todos fallan: `ai_status = degraded` y el sistema sigue 100% determinista (degradación elegante, nunca error de producto).
- Límites de prompt: entrada ≤ 4.000 tokens, salida ≤ 1.000 tokens; timeout 30 s.
- Input IA: SOLO hechos agregados y normalizados (sin raw packets, sin instrucciones del tráfico, IPs anonimizadas). `OPENROUTER_API_KEY` solo en env server-side de Vercel.

## Alternativas consideradas

- **IA por-flujo**: costo (free tier inviable), latencia, prompt injection trivial. Descartado.
- **Cola con reintentos**: sobre-ingeniería para 1 llamada/5 min; cancel-first es más simple. Descartado.
- **Modelos pagos**: no en v1 (presupuesto cero).

## Consecuencias

- El dashboard puede mostrar `ok | degraded`; la marca no-funcional falla suave.
- La cancelación en curso + dedup hacen que OpenRouter free seja bastante dentro del límite.
