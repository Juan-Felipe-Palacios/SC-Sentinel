# Operaciones — SLOs y SLIs

## Objetivos

| SLI | SLO | Medición |
|---|---|---|
| Ingesta (POST → 200) | < 100 ms p95 | logs de Vercel / métricas |
| Dashboard TTFB | < 500 ms p95 | Vercel Analytics |
| Cron IA | ≤ 30 s por lote | `/api/ai/cron` respuesta |
| Disponibilidad del dashboard | 99.9% mensual | uptime monitor |
| Pérdida de ventanas | 0% (spool garantiza entrega) | `ingest_batches` vs ventanas generadas |

## Alertas recomendadas

- Ingesta p95 > 200 ms sostenido.
- Tasa de 401/403 en `/api/ingest` > 1% (token comprometido o desincronizado).
- `spool_bytes` > 400 MB en un agente.
- `capture_status` degraded/error en cualquier device.
- Cron IA con `status: degraded` consecutivo.

## Revisión

Revisar SLOs trimestralmente o tras un incidente. Documentar desviaciones en `docs/operations/incident-response.md` (si existe).