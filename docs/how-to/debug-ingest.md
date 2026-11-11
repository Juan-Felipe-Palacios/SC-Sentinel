# How-to — depurar un ingest rechazado

## Síntomas y causas

| Síntoma en el agente | HTTP | Causa probable | Acción |
|---|---|---|---|
| 401/403 | 401 | token inválido/revocado | rotar token (runbook) |
| 400 validation_failed | 400 | schema zod (límites 128/512 KB, campos) | revisar payload y fixtures |
| 413 payload_too_large | 413 | gzip bomb o cuerpo excesivo (H3) | reducir ventana o compresión |
| 429 rate_limited | 429 | límite por instancia | esperar/backoff |
| 5xx | 5xx | DB o Vercel | revisar logs estructurados |

## Pasos

1. Revisar logs del agente (`sc-sync`): estado (Idle/Sending/Backoff/NeedsEnrollment/DeadLetter).
2. Reproducir con el fixture `docs/contracts/examples/ingest-request.valid.json` vía curl.
3. Validar el payload con `scripts/test-contracts-zod.mjs`.
4. Verificar el hash del token: `SHA-256(token)` vs `devices.token_hash`.
5. Si el batch quedó en dead letter, no reintentar automáticamente: inspeccionar y corregir.

## Herramientas

- `scripts/verify-contracts.sh`, `scripts/test-contracts-zod.mjs`.
- `docs/contracts/ingest-api.v1.md` para el contrato completo.