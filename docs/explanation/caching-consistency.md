# Explicación — caching y consistencia

## Dashboard

- SWR para refresco de métricas (ADR-0004: SSE descartado por Vercel Edge serverless).
- `Cache-Control: no-store, max-age=0` en rutas que leen la DB (`/api/query`, `/api/export`).
- `/p/[token]` (Trust Page): `private, no-store, max-age=0` + `Referrer-Policy: no-referrer` (H7).

## Ingesta

- Idempotencia por `UNIQUE(device_id, window_id)` → `ON CONFLICT DO NOTHING` + ledger `ingest_batches`.
- El agente conserva el batch hasta confirmación (2xx); 408/429/5xx → backoff.

## IA

- Dedup por `facts_hash`: mismos hechos no se re-analizan.
- Gate de 15 min + datos nuevos en `/api/ai/cron`.

## Consistencia eventual

- El dashboard refleja la última ventana confirmada; el agente puede tener spool pendiente.
- Tras rotación de token, el spool drena a ~60 req/min (ADR-0011).