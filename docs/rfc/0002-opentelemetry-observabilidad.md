# RFC-0002 — OpenTelemetry en agente y route handlers

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §10
**ADRs relacionados:** —

## 1. Resumen

Adoptar OpenTelemetry (traces + métricas) en el agente Rust y en los route handlers de Next.js para sustituir los logs estructurados actuales y habilitar observabilidad distribuida.

## 2. Motivación

`docs/operations/observability.md` indica que OTel no está implementado en v1 y es candidato para v2. Hoy la observabilidad se basa en logs estructurados y métricas puntuales; no hay trazas end-to-end del pipeline de ingest.

## 3. Propuesta

- **Agente:** instrumentar `sc-capture`, `sc-aggregate`, `sc-sync` con `tracing` + `opentelemetry` (exportador OTLP). Spans por ventana de agregación y por sync.
- **Web:** instrumentar route handlers (`/api/ingest`, `/api/query`, `/api/chat`) con el SDK de OTel para Node/Edge.
- **Exportador:** OTLP hacia un collector configurable (`OTEL_EXPORTER_OTLP_ENDPOINT`); sin vendor lock-in.
- **Sampling:** 100% en dev, tail-based o 10% en prod según coste.
- **Métricas:** reutilizar las ya definidas en `docs/operations/slo.md` (latencia ingest p95, tasa de duplicados, etc.).

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| Seguir con logs estructurados (estado actual) | Sin dependencias nuevas | Sin trazas; correlación manual |
| Vendor específico (Datadog, New Relic) | DX completo | Lock-in, coste |
| OTel (recomendado) | Estándar, portable | Complejidad de configuración |

## 5. Impacto

- **Compatibilidad:** non-breaking; opt-in vía env vars.
- **Rendimiento:** overhead de spans (~1-3% CPU); mitigar con sampling.
- **Operación:** nuevo runbook de despliegue del collector; dashboards en Grafana/Tempo.
- **Testing:** tests de integración con collector en memoria.

## 6. Plan de implementación

1. Añadir crate `sc-telemetry` (o feature flag en sc-core) con OTLP.
2. Instrumentar spans en sc-sync y route handlers.
3. Documentar env vars en `docs/reference/env-vars.md`.
4. Actualizar `docs/operations/observability.md` y `slo.md`.

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Overhead en el agente | Media | Medio | Sampling configurable; desactivable |
| Coste de almacenamiento de trazas | Media | Medio | Retención corta (7 d) + sampling |

## 8. Preguntas abiertas

- ¿Collector propio o servicio gestionado (Grafana Cloud)?
- ¿Métricas custom además de las estándar?

## 9. Referencias

- `docs/operations/observability.md`
- `docs/operations/slo.md`
- spec §10