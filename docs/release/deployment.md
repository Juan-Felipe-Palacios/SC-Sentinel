# Guía de despliegue (Vercel + Neon + crons)

Mapa del deployment de producción. Espec de fuente: §5.4, §15, §20; DB ADR-0003.

## Topología desplegada

```text
GitHub (main) ──► Vercel (sc-sentinel.vercel.app)
                     ├─ app/(marketing)  público SSG
                     ├─ app/(dashboard)  middleware + cookie admin
                     ├─ api/ingest query ai/cron cron/cleanup
                     └─ crons: ai cada 5 min · cleanup diario 03:00 UTC
                            ├──► Neon Postgres (branch main free)
                            └──► OpenRouter (:free, fallback chain)
```

## 1. Vercel (web)

1. Import del repo (monorepo) y Root Directory = `web/`.
2. Framework preset: Next.js; build `pnpm build`.
3. Dominio: `sc-sentinel.vercel.app` (OFICIAL, ADR-0012); alias futuro post-v1 si se compró dominio propio.
4. Rules deploy: `paths` del workflow `web.yml` evitan deploys innecesarios si solo cambia el agente.

## 2. Environment variables (server-only: NUNCA expuestas al client)

| Variable | Dónde | Nota |
|---|---|---|
| `DATABASE_URL` | Vercel env (main) | Neon pooled connection string |
| `SC_SESSION_SECRET` | Vercel env (main + preview, valores distintos) | firma cookie admin (`sc_session`) — el código lee `SC_SESSION_SECRET`, no `SESSION_SECRET` |
| `ADMIN_SECRET` | Vercel env (server) | contraseña del login admin + `x-sc-admin-secret` para tooling |
| `OPENROUTER_API_KEY` | Vercel env (server; solo producción y previews) | jamás a browser (ADR-0005). Sin valor ⇒ IA en modo `degraded` |
| `AI_MODELS` | Vercel env (server, opcional) | cadena de modelos separada por comas; defaults `:free` en código |
| `DEFAULT_DEVICE_ID` | Vercel env (server, opcional) | device único de v1; si falta se usa el primer device enrolado |
| `CRON_SECRET` | Vercel env (server) | header `x-cron-secret` de los crons |
| `SC_SENTINEL_TOKEN` | Servicio agente (Windows/Linux) | Bearer del agente — no es env de Vercel |

## 3. Neon

1. Crear project + branch `main` (producción) y branch automática para previews (branching)-  ADR-0003.
2. Aplicar migraciones (Drizzle) en `main` cuando el release las incluya.
3. Retención: los datos se purgan según §12.1 — el cron cleanup ejecuta los DELETE reales (runbook `database-cleanup.md`).

## 4. Crons

- `/api/ai/cron` cada ~5 min → **NO** va en `vercel.json` (D1: Hobby no garantiza crons de 5 min y los previews no disparan crons). Se ejecuta con **cron externo** (cron-job.org) vía `POST` + header `x-cron-secret: <CRON_SECRET>`.
- `/api/cron/cleanup` diario 03:00 UTC vía Vercel Cron (+ secret en producción).
- Verificación post-deploy: ejecutar una llamada manual y ver resultado en logs de Vercel.

## 5. Checks por deployment (smoke mínimo)

- [ ] Landing renderiza y notas legales linkadas.
- [ ] Dashboard login (cookie admin) de la sesión propia funciona.
- [ ] `/api/ingest` rechaza 401 sin token y acepta con token de test.
- [ ] `/api/query` devuelve datos una vez hay snapshots.
- [ ] Cron de IA corre o plan B standby activo (no "silencio").
- [ ] Cleanup del día ejecutó y logueó.

## 6. Rollback

- Vercel: redeploy de commit anterior (instant roll-back).
- Neon: puntos de restauración — para versión delete masivo manual, branched desde `main` primero (runbook `database-cleanup.md`).
- Agente: el spool local preserva datos durante cualquier downtime de la nube (§8.1); no se re-protege nada por el rollback del dashboard.
