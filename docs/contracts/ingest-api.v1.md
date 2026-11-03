# Contrato de API — `/api/ingest` v1

**Estado:** Congelado para v1 · **Fuente:** spec v2.1 §5.1, §6, §8, §9 · **Última actualización:** 2026-11-03

> Cambiar este contrato = cambiar agente + web + `docs/contracts/*.schema.json` + ejemplos en el mismo PR (ADR-0001).

## 1. Request

```http
POST /api/ingest HTTP/1.1
Host: sc-sentinel.vercel.app
Authorization: Bearer <device-token>
Content-Type: application/json
Content-Encoding: gzip | zstd          # Opcional (solo si el cuerpo está comprimido)
```

- Autenticación: `Bearer` + device-token; el servidor guarda/valida el hash SHA-256 (`devices.token_hash`).
- `Content-Encoding` es del **payload**, no del transporte; el route descomprime explícitamente (zlib stdlib para gzip; `fzstd` para zstd) — ADR-0009. v1 envía gzip.

### 1.1 Cuerpo (JSON)

Estructura `{ v, device, window, snapshot }`. Esquemas normativos:

| Parte | Esquema |
|-------|---------|
| `snapshot.top_hosts` / `top_ports` / `top_countries` / `health` | `window-snapshot.v1.schema.json` |
| `snapshot.alerts[n]` | `alert.v1.schema.json` |
| `snapshot.health` (referencia salud extendida) | `agent-health.v1.schema.json` |

Ejemplo completo válido: `examples/ingest-request.valid.json`. Contraejemplo: `examples/ingest-request.invalid.json`.

### 1.2 Reglas de privacidad (normativas)

- Si `anonymize_hosts = true` (config del agente), `ip_display` se envía **`null`** — la IP real nunca sale del nodo; `host_key` (HMAC truncado) es el único identificador persistente.
- El snapshot contiene SOLO señales agregadas. Jamás raw packets ni flujos individuales.

### 1.3 Límites

- Payload máximo comprimido: **128 KB**; sin comprimir: **512 KB** (413 si se excede).
- `top_hosts` ≤ 50 · `top_ports` ≤ 50 · `top_countries` ≤ 30 · `alerts` ≤ 50 por ventana.

### 1.4 Rate limit

- Por device (token válido): token bucket **60 req/min, burst 30** (dimensionado para drenar spool en minutos — ADR-0011).
- Anti-abuse por IP sin token válido: **20 req/min → 401**.
- Excedido → `429` con `Retry-After`.

## 2. Respuestas

| Código | Body | Acción del agente |
|--------|------|-------------------|
| 200 | `{status:"processed"}` | batch confirmado → eliminado del spool |
| 200 | `{status:"duplicate"}` | `(device_id, window_id)` ya procesado (idempotente, ADR-0008) → eliminado del spool; el reenvío nunca es error |
| 400 | problema de schema | batch → dead_letter local; reportar error de contrato |
| 401 | token inválido/desconocido | estado `needs_enrollment` |
| 403 | token expirado/revocado | estado `needs_enrollment` |
| 408 | timeout | reintento backoff |
| 413 | payload too large | dividir batch o dead_letter |
| 429 | rate limit | reintento backoff (usar `Retry-After`) |
| 5xx | error servidor | reintento backoff con jitter |

Backoff del agente: exponencial 1→60 s + jitter; 2xx elimina del spool; 401/403 no reintentan indefinidamente (`needs_enrollment`, spool conservado).

## 3. Idempotencia

- `UNIQUE(device_id, window_id)` en `flow_windows` y en el ledger `ingest_batches`.
- Insert `ON CONFLICT DO NOTHING` → duplicado = `200 {status:"duplicate"}`, sin doble métrica.
- `ingest_batches.payload_hash` audita si el reenvío era idéntico. `ingest_batches` no tiene FK (ledger independiente, retención 2 días).

## 4. Errores de validación (400)

Body `application/problem+json` estilo RFC 7807 simplificado:

```json
{ "error": "validation_failed", "path": "snapshot.top_hosts[2].bytes_in", "message": "expected integer >= 0" }
```

Nunca se loguea ni se devuelve el payload completo (reglas §9.3 del spec).

## 5. Fuera del alcance de este documento

- `/api/query` y `/api/ai/analyze`: contratos de lectura en el spec §5.2–§5.4 (cookies admin; shapes según `metric`); endpoints de cron con `x-cron-secret`.
