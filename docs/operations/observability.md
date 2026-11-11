# Operaciones — observabilidad

## Logs

- Agente: nivel configurable (`log.level` / `SC_LOG`), salida a archivo en Windows (servicio) y stderr en Linux.
- Web: logs estructurados JSON (`{ event, ... }`), sin objetos de error crudos (M8).
- Vercel: retención según plan; no incluir datos de clientes.

## Métricas del agente (agent_health)

`packets_seen`, `packets_dropped`, `parse_errors`, `queue_depth`, `spool_bytes`, `cpu_percent`, `memory_bytes`, métricas del colector (M4).

## Métricas del dashboard

- Vercel Analytics (CWV), Vercel Speed Insights.
- `ai_insights` (coste, latencia, tasa de éxito) vía `/api/query?metric=evals` (solo admin, M5).

## Tracing

No implementado en v1. Candidato para v2: OpenTelemetry en el agente y en los route handlers.

## Dashboards operativos

- `/dashboard/overview`: salud global.
- `/dashboard/hosts`: top hosts y risk_score.
- `/dashboard/alerts`: ciclo de vida de alertas.
- `/dashboard/evals`: métricas de IA (solo admin).