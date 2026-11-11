# Referencia — variables de entorno

Consolidado desde `web/.env.example`, `docs/security/audit-2026-11-09.md` Anexo A y `agent/config/sc-agent.toml`. Los valores reales nunca se commitean (`.env*` en `.gitignore`).

## Web (Vercel)

| Variable | Obligatoria en prod | Uso |
|---|---|---|
| `DATABASE_URL` | sí | Neon Postgres (rol sin DDL en runtime) |
| `ADMIN_SECRET` | sí | contraseña del panel + bearer de tooling (≥24 chars) |
| `SC_SESSION_SECRET` | sí | firma HS256 de `sc_session`/`sc_guest` (≥32 chars, distinto de ADMIN_SECRET) |
| `CRON_SECRET` | sí | `/api/cron/cleanup` y `/api/ai/cron` |
| `NEXT_PUBLIC_APP_URL` | sí | origen público de la app |
| `SC_GUEST_DEVICE_ID` | sí (H2) | device expuesto a la demo; sin allowlist no hay demo en prod |
| `DEFAULT_DEVICE_ID` | no | fallback si falta `SC_GUEST_DEVICE_ID` (solo dev) |
| `SC_INGEST_DEV_TOKEN` | no (dev) | token de desarrollo para `/api/ingest` (nunca en prod) |
| `SC_DEV_AUTH` | no (dev) | habilita bypasses locales (`SC_DEV_AUTH=1`) |
| `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | recomendada ≥1 | cadena IA (Gemini → OpenRouter → Groq) |
| `AI_PROVIDER` | no | proveedor primario (`openrouter`\|`gemini`\|`groq`) |
| `AI_MODELS` | no | modelos del primario (coma-separados) |
| `AI_DAILY_CALL_BUDGET` | no | filas/día en `ai_insights` (0 = sin límite) |
| `TRUST_ALERT_WEBHOOK_URL` | no | alerta de fuga de Trust Page (HTTPS) |

## Agente (nodo del cliente)

| Variable | Uso |
|---|---|
| `SC_INGEST_TOKEN` | Bearer para `/api/ingest` (SHA-256 en DB) |
| `SC_INGEST_URL` | override de `ingest.url` |
| `SC_SPOOL_PATH` | override de `spool.path` |
| `SC_SPOOL_MAX_BYTES` | override de `spool.max_bytes` |
| `SC_LOG` | override de `log.level` |

## Rotación

Rotar invalida sesiones/tokens según el caso. Ver `docs/runbooks/rotate-device-token.md` y `docs/security/audit-2026-11-09.md` Anexo A. Generar valores con `openssl rand -base64 48`.