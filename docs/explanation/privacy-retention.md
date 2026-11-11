# Explicación — privacidad, anonimización y retención

## Principios

- **Mínimo necesario:** solo señales agregadas, nunca paquetes crudos (README).
- **Anonimización opcional:** `anonymize_hosts=true` redacta IPs y etiquetas de blacklist en evidencias (sc-detect).
- **Retención limitada:** `flow_windows`/`alerts` 30 días; `alert_audit_log` 90 días; spool local 7 días.

## Anonimización en código

- `sc-detect`: si `host.ip_display.is_none()`, destino y etiqueta se marcan como `redacted`.
- Trust Pages: IPs y evidencia se eliminan antes de pasar props al cliente (H1).
- Chat: `context-builder` sanea hostnames y descripciones (M6).

## Retención y cleanup

- Cron `/api/cron/cleanup` purga datos vencidos (CRON_SECRET).
- `ingest_batches` (ledger) se conserva para idempotencia.
- `ai_insights` se conserva (dedup por `facts_hash`).

## GDPR / datos personales

Los drafts legales (`docs/legal/privacy-policy-draft.md`, `terms-of-service-draft.md`) están pendientes de revisión legal antes de publicar. No publicar a producción sin sign-off (regla 4 de `docs/README.md`).