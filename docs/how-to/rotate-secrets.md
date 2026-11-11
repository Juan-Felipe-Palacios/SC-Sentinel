# How-to — rotar secretos sin downtime

## ADMIN_SECRET / SC_SESSION_SECRET

1. Generar nuevo valor: `openssl rand -base64 48`.
2. Cargar en Vercel (Environment Variables) para Preview y Production.
3. Desplegar (las sesiones existentes se invalidan al cambiar `SC_SESSION_SECRET`).
4. Verificar login y `/dashboard` en la nueva URL.
5. Rotar `ADMIN_SECRET` por separado; actualizar tooling que use el bearer.

## CRON_SECRET

1. Generar y cargar en Vercel.
2. Actualizar el secret en GitHub Actions (`.github/workflows/ai-cron.yml`).
3. Verificar `POST /api/ai/cron` con el nuevo secret.

## DATABASE_URL (Neon)

1. Crear rol con permisos limitados (sin DDL) para runtime.
2. Rotar la contraseña del rol en Neon.
3. Actualizar `DATABASE_URL` en Vercel y redeplegar.
4. Verificar `/api/ingest` y `/api/query`.

## Token de device

Ver `docs/runbooks/rotate-device-token.md` (rotación desde el dashboard, invalidación inmediata). No requiere redeploy.