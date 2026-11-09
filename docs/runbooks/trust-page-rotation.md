# Runbook — Rotación y revocación de Trust Pages

## Cuándo rotar
- Un token se compartió por un canal inseguro.
- Hay >1000 accesos en 24h (ver `/dashboard/admin/trust-access`).
- Cambio de proveedor o auditoría anual.

## Rotar (nuevo token, el anterior deja de funcionar de inmediato)
1. Entrar a `/dashboard/settings` como admin.
2. En "Trust Pages públicas", pulsar **Rotar** sobre la página.
3. Copiar la nueva URL pública (se muestra una sola vez).
4. Verificar abriendo la URL nueva (200) y la vieja (404).

## Revocar (desactivación inmediata)
1. En la misma sección, pulsar **Revocar**.
2. La página pasa a 404 para cualquier visitante. No hay reutilización.

## Expirar
- Al crear, se puede fijar `expires_at` (ISO datetime). Tras esa fecha la página devuelve 404 sin revelar que existió.

## Detección de filtración
- Accesos >1000 en 24h: log `trust_leak_suspected` + webhook `TRUST_ALERT_WEBHOOK_URL` si está definido.
- Rate limit: 100 accesos/hora por token (token bucket en memoria; en serverless la mitigación es por instancia, ADR-0011).
