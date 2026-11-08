# Guía de despliegue (Vercel + Neon + crons)

Mapa del deployment de producción. Espec de fuente: §5.4, §15, §20; DB ADR-0003.

## Topología desplegada

```text
GitHub (main) ──► Vercel (sc-sentinel.vercel.app)
                     ├─ app/(marketing)  público SSG
                     ├─ app/(dashboard)  middleware + cookie admin
                     ├─ api/ingest query ai/cron cron/cleanup
                     └─ crons: ai cada 15 min (GitHub Actions) · cleanup diario 03:00 UTC
                            ├──► Neon Postgres (branch main free)
                            └──► Cadena IA: Gemini → OpenRouter (:free) → Groq
```

## 1. Vercel (web)

1. Import del repo (monorepo) y Root Directory = `web/`.
   > **Ojo con el directorio de despliegue:** el deploy a Vercel debe ejecutarse
   > desde la **raíz del repo**, no desde `web/`. La variable "Root Directory" en
   > Vercel está configurada como `web`, pero el comando `vercel --prod` debe
   > lanzarse desde la raíz para que resuelva correctamente la estructura del
   > proyecto. Ejecutarlo dentro de `web/` falla con
   > `The specified Root Directory "web" does not exist`.
2. Framework preset: Next.js; build `pnpm build`.
3. Dominio: `sc-sentinel.vercel.app` (OFICIAL, ADR-0012); alias futuro post-v1 si se compró dominio propio.
4. Rules deploy: `paths` del workflow `web.yml` evitan deploys innecesarios si solo cambia el agente.

## 2. Environment variables (server-only: NUNCA expuestas al client)

| Variable | Dónde | Nota |
|---|---|---|
| `DATABASE_URL` | Vercel env (main) | Neon pooled connection string |
| `SC_SESSION_SECRET` | Vercel env (main + preview, valores distintos) | firma cookie admin (`sc_session`) — el código lee `SC_SESSION_SECRET`, no `SESSION_SECRET` |
| `ADMIN_SECRET` | Vercel env (server) | contraseña del login admin + `x-sc-admin-secret` para tooling |
| `AI_PROVIDER` | Vercel env (server, opcional) | `gemini` \| `openrouter` \| `groq`: proveedor **primario** de la cadena. Si falta, se detecta por la key presente. La cadena completa (Fase 2) es Gemini → OpenRouter → Groq y los respaldos entran solo si tienen key |
| `OPENROUTER_API_KEY` | Vercel env (server; solo producción y previews) | jamás a browser (ADR-0005). Sin valor ⇒ ese eslabón se salta |
| `GEMINI_API_KEY` (o `GOOGLE_AI_API_KEY`) | Vercel env (server, opcional) | Google AI Studio, SDK `@google/genai`; modelos por defecto `gemini-3.6-flash, gemini-3.5-flash` (timeout 15 s por intento; `gemini-3.8-flash` responde 503/timeout y `gemini-1.5-flash` está retirado) |
| `GROQ_API_KEY` | Vercel env (server, opcional) | Groq, SDK `groq-sdk`; modelos por defecto `openai/gpt-oss-120b,openai/gpt-oss-20b` |
| `AI_MODELS` | Vercel env (server, opcional) | modelos separados por comas; aplica solo al proveedor primario. Si falta, se usan los defaults del proveedor |
| `AI_DAILY_CALL_BUDGET` | Vercel env (server, opcional) | fusible diario del cron de IA: máximo N insights/día (sugerido `150`). 0 o ausente = sin límite |
| `DEFAULT_DEVICE_ID` | Vercel env (server, opcional) | device único de v1; si falta se usa el primer device enrolado |
| `SC_GUEST_DEVICE_ID` | Vercel env (server, opcional) | demo pública de solo lectura: fija el device expuesto. Si falta, usa `DEFAULT_DEVICE_ID` o el primer device no revocado. `/demo` y `/api/auth/guest-login` emiten cookie `sc_guest` de 1 h, sin persistencia |
| `CRON_SECRET` | Vercel env (server) | header `x-cron-secret` de los crons |
| `SC_INGEST_TOKEN` | Servicio agente (Windows/Linux) | Bearer del agente (`sc_dev_…`) — no es env de Vercel |
| `SC_SENTINEL_DEVICE_ID` | Servicio agente (Windows/Linux) | id del device enrolado (`dev_…`); debe ser el dueño del token o el ingest responde 403 |

## 3. Neon

1. Crear project + branch `main` (producción) y branch automática para previews (branching)-  ADR-0003.
2. Aplicar migraciones (Drizzle) en `main` cuando el release las incluya.
3. Retención: los datos se purgan según §12.1 — el cron cleanup ejecuta los DELETE reales (runbook `database-cleanup.md`).

## 4. Crons

- `/api/ai/cron` cada **15 min** → **NO** va en `vercel.json` (el plan Hobby no garantiza crons cortos y los previews no disparan crons). Se ejecuta con **GitHub Actions** (`.github/workflows/ai-cron.yml`, `schedule: '*/15 * * * *'` + `workflow_dispatch`) vía `POST` + header `x-cron-secret: <CRON_SECRET>`.
- `/api/cron/cleanup` diario 03:00 UTC vía Vercel Cron (+ secret en producción).
- El cron de IA hace **early-return** si no hay ventanas nuevas desde el último análisis (sin llamada a la API) y respeta el dedup por `facts_hash` (5 min) y el presupuesto diario `AI_DAILY_CALL_BUDGET`.
- Verificación post-deploy: ejecutar una llamada manual y ver resultado en logs de Vercel.

### 4.1 Eventos de log de IA (diagnóstico sin secretos)

| Evento | Cuándo | Contenido clave |
|---|---|---|
| `ai_call` | cada llamada exitosa a un proveedor | `provider`, `model`, `input_tokens`, `output_tokens`, `latency_ms` |
| `ai_provider_fallback` | el primario falla y se cambia de proveedor | `from`, `to`, `reason` (`rate_limited` \| `error`) |
| `ai_ratelimit` | respuesta con headers de cuota | `provider`, `model`, headers `x-ratelimit-*` (para anticipar el 429) |
| `ai_rate_limited` | 429 detectado | `target`, `retry_after_s`, `cooldown_ms` |
| `ai_chain_failed` | un proveedor agotó sus modelos | `provider`, `attempts` (modelo + status + mensaje) |
| `ai_cron` | fin de cada ejecución del cron | `status` (`ok` \| `cached` \| `degraded` \| `no_data`), `duration_ms` |
| `ai_cron_no_new_data` | early-return por falta de datos | `last_window_start`, `covered_until` |
| `chat_ok` / `chat_fallback` | fin de un stream de chat / cambio de proveedor | `provider`, `model`, `tokens_used`, `execution_time_ms` / `from`, `to`, `reason` |

## 5. Checks por deployment (smoke mínimo)

- [ ] Landing renderiza y notas legales linkadas.
- [ ] Dashboard login (cookie admin) de la sesión propia funciona.
- [ ] `/api/ingest` rechaza 401 sin token y acepta con token de test.
- [ ] `/api/query` devuelve datos una vez hay snapshots.
- [ ] Cron de IA corre o plan B standby activo (no "silencio").
- [ ] Cleanup del día ejecutó y logueó.

## 6. Enrolamiento de dispositivos (ADR-0010)

Sin un device enrolado no llega ninguna ventana de tráfico: `/api/ai/cron` responde
`status: no_data`, el dashboard queda vacío y el panel IA muestra "Asistente AI pronto".

1. Dashboard → **Configuración** (`/dashboard/settings`, requiere cookie `sc_session`).
2. "Enrolar nuevo dispositivo" → el token se muestra **una sola vez** y **no expira**.
   Guardalo en un lugar seguro: no se puede volver a consultar.
3. Llevar token e id a la máquina del dispositivo (**no** a Vercel ni al repo):
   - `SC_INGEST_TOKEN` = token completo `sc_dev_…` (variable de entorno; el agente
     solo lo resuelve en memoria y lo redacta en logs).
   - `SC_SENTINEL_DEVICE_ID` = el `device_id` exacto que devolvió el panel (`dev_…`).
     Si no coincide con el dueño del token, `/api/ingest` responde `403`
     (`Device ID in payload does not match authenticated token`).
   - `config.toml` guarda solo `token_env = "SC_INGEST_TOKEN"`: nunca el valor.
   - PowerShell, por sesión:
     `$env:SC_INGEST_TOKEN = "sc_dev_…"` · `$env:SC_SENTINEL_DEVICE_ID = "dev_…"`.
   - Persistente del usuario (`[Environment]::SetEnvironmentVariable(..., 'User')`)
     o, mejor para servicio/Task Scheduler, un wrapper que fije ambas variables y
     ejecute `sc-agent` con ACL restringida.
   - El agente **no** lee archivos `.env`; `.env` y `env.local` están en `.gitignore`
     por si se usan desde un wrapper.
4. El primer `/api/ingest` exitoso promueve el device de `enrolled_pending` a `active`
   y actualiza `last_seen_at`.
5. Para revocar un token filtrado: "Eliminar" el device en Settings (borra el token y sus
   datos de forma permanente). El agente entra en `needs_enrollment` conservando su spool;
   luego se enrola un device nuevo y se actualiza `SC_INGEST_TOKEN`/`SC_SENTINEL_DEVICE_ID`.
6. Verificación: `curl -X POST .../api/ai/cron -H "x-cron-secret: …"` debe registrar
   `{"event":"ai_cron","status":"ok"}` en los logs de Vercel.

Migraciones asociadas: `0003_device-token-expiry.sql` (histórica) y
`0004_device-token-permanent.sql` (elimina `devices.token_expires_at`: los tokens son
permanentes y solo se revocan eliminando el device).

## 7. Rollback

- Vercel: redeploy de commit anterior (instant roll-back).
- Neon: puntos de restauración — para versión delete masivo manual, branched desde `main` primero (runbook `database-cleanup.md`).
- Agente: el spool local preserva datos durante cualquier downtime de la nube (§8.1); no se re-protege nada por el rollback del dashboard.
