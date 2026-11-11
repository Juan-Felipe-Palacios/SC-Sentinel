# Referencia — errores de la API

Códigos devueltos por los route handlers de `web/app/api/`. Todas las respuestas de error llevan `Cache-Control: no-store`.

## Ingesta (`/api/ingest`)

| HTTP | `error` | Cuándo |
|---|---|---|
| 401 | `unauthorized` | token ausente/inválido/revocado |
| 400 | `validation_failed` | schema zod inválido (límites 128/512 KB, campos fuera de rango) |
| 413 | `payload_too_large` | cuerpo o descomprimido supera el límite (H3) |
| 400 | `bad_request` | descompresión fallida |
| 429 | `rate_limited` | límite por instancia excedido |
| 500 | `internal_error` | fallo de DB (log estructurado, sin datos) |

Respuestas exitosas: `200 { status: "processed" | "duplicate" }`.

## Autenticación

| HTTP | `error` | Cuándo |
|---|---|---|
| 401 | `invalid_credentials` | contraseña incorrecta (delay 250 ms) |
| 429 | `rate_limited` | 5 intentos/min por IP excedidos (H4) |
| 404 | (sin body) | guest-login sin allowlist en producción (H2) |

## Dispositivos

| HTTP | `error` | Cuándo |
|---|---|---|
| 404 | `not_found` | device inexistente o revocado (rotate) |
| 401 | `unauthorized` | sin cookie admin válida |

## Query / Export / Chat

| HTTP | `error` | Cuándo |
|---|---|---|
| 403 | `forbidden` | métrica `evals` para no-admin (M5) |
| 429 | `rate_limited` | límites por instancia |
| 404 | `not_found` | token de Trust Page inválido o rate limit excedido (M3) |

## Convención de reintento

- 408/429/5xx del ingest → backoff exponencial 1–60 s + jitter en el agente.
- 400 (schema) → batch a dead letter local (no reintentar).
- 401/403 → estado `needs_enrollment` (spool conservado).