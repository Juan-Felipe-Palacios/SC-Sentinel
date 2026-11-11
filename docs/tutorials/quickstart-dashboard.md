# Tutorial — dashboard en local

## Requisitos

- Node 20, pnpm 9.
- Base de datos Postgres (Neon branch o local).

## Pasos

1. `pnpm --dir web install`.
2. Copiar `web/.env.example` a `web/.env.local` y rellenar `DATABASE_URL`, `ADMIN_SECRET`, `SC_SESSION_SECRET` (≥32 chars), `CRON_SECRET`.
3. Aplicar migraciones: `cd web && pnpm drizzle-kit migrate` (o el script del proyecto).
4. `pnpm --dir web dev`.
5. Abrir `http://localhost:3000`, login con `ADMIN_SECRET`.
6. (Opcional) crear un device de demo y usar `SC_INGEST_DEV_TOKEN` para enviar datos de prueba.

## Verificación

- `pnpm --dir web typecheck && pnpm --dir web lint && pnpm --dir web test` en verde.
- `/dashboard/overview` carga (vacío si no hay datos).

## Siguiente

- `docs/how-to/debug-ingest.md` para enviar datos de prueba.
- `docs/reference/env-vars.md` para el catálogo completo.