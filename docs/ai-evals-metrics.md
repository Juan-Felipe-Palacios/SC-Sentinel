# Métricas de AI Evals

Fuente: `ai_insights` vía `GET /api/query?metric=evals`.

| Campo | Definición |
|---|---|
| `success_rate` | `succeeded / total`; `succeeded = status 'ok'`. `null` sin filas. |
| `daily_cost[]` | Suma de `cost_usd` por día UTC para la gráfica de línea. |
| `by_model[]` | Conteo, coste y latencia p50 por modelo. |
| `latency_p50_ms / latency_p95_ms` | Percentiles de `latency_ms` en el rango. `null` sin datos. |
| `status_code` | HTTP del proveedor ganador persistido en `ai_insights` (200 si OK; null en filas viejas). |

## Coste
- `cost_usd` se estima con `AI_PRICING_JSON` (`{ "modelo": { "inputPerMTok": 0.15, "outputPerMTok": 0.60 } }`). Sin entrada = modelo free = 0.

## Alertas
- Coste diario > `AI_DAILY_COST_BUDGET_USD`: log `ai_cost_budget_exceeded` + webhook `AI_COST_ALERT_WEBHOOK_URL` si existe.
- No hay envío de email: el repo no tiene servicio de email; el webhook es el canal configurado.
