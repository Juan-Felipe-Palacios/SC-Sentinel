# Referencia — contratos de API

**Fuente de verdad:** `docs/contracts/` (congelados v1). La CI `contracts.yml` falla si hay desbalance entre zod (web) y serde (agent).

## Endpoints

| Método | Ruta | Contrato | Schema |
|---|---|---|---|
| POST | `/api/ingest` | `docs/contracts/ingest-api.v1.md` | `window-snapshot.v1.schema.json`, `alert.v1.schema.json`, `agent-health.v1.schema.json` |
| GET/POST | `/api/query` | métricas agregadas por device y rango | (sin schema formal; tipos en `web/lib/api-types.ts`) |
| POST | `/api/chat` | `docs/contracts/chat-api.v1.md` | SSE streaming, historial |
| POST | `/api/auth/login` | cookie `sc_session` (HS256) | — |
| POST | `/api/auth/guest-login` | cookie `sc_guest` (1 h, solo lectura) | — |
| POST | `/api/auth/logout` | invalida cookie | — |
| POST | `/api/devices` / `/api/devices/:id` | enrolamiento y borrado | — |
| POST | `/api/devices/:id/rotate` | rotación de token (M7) | — |
| POST | `/api/ai/analyze` | análisis bajo demanda (cookie admin) | — |
| POST | `/api/ai/cron` | análisis por lotes (cron secret) | — |
| POST/GET | `/api/export` | CSV/XLSX streaming + auditoría | — |
| GET | `/api/trust` / `/api/trust/access` | Trust Pages + log de accesos | — |

## Ejemplos

`docs/contracts/examples/` contiene `ingest-request.valid.json`, `ingest-request.invalid.json`, `snapshot-with-alerts.json`. Usados por tests anti-drift.

## Regla de cambio

Cambio de contrato = tocar en el mismo PR: spec + `contracts/*` (schema y ejemplos) + zod↔serde + fixtures de tests (ADR-0001).