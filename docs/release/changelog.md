# Changelog del proyecto (+ plantilla)

Formato: Keep a Changelog 1.1 (semantic entries) publicado también en cada GitHub Release.

## [No lanzado]

### Added
- (Fase 0–4 IA) Cadena multi-proveedor Gemini → OpenRouter → Groq con `AI_PROVIDER` como primario y respaldos que entran solo con su key; cooldown por 429 que respeta `Retry-After`; backoff exponencial 1 s / 2 s ante 5xx/503; logging estructurado sin secretos (`ai_call`, `ai_provider_fallback`, `ai_ratelimit`, `ai_rate_limited`, `chat_ok`, `chat_fallback`) y monitoreo de headers `x-ratelimit-*` para anticipar cuotas agotadas.
- (Fase 3 IA) Presupuesto diario opcional `AI_DAILY_CALL_BUDGET` y early-return del cron cuando no hay ventanas nuevas; contexto del chat acotado a 8 mensajes / 1.200 chars por mensaje; límite de invitados de 100 chats/día.
- (M0) Estructura inicial del monorepo (agent/, web/, docs/); documentación completa: spec v2.2, 13 ADRs, contratos v1, diagramas, runbooks, testing, ux, legal, release.
- (M2) Ingesta `/api/ingest` en Neon + dashboard v0 (`/dashboard/overview`) con SWR 5 s.
- (M3) Landing pública SSG (`/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`), `sitemap.xml`, `robots.txt`, OG image y Vercel Web Analytics.
- (M3) IA asistente por lotes: tabla `ai_insights` (retención 15 d), `/api/ai/analyze`, `/api/ai/cron`, dedup por `facts_hash` y fallback determinista `degraded`; panel «Análisis IA» en el dashboard (refresh 30 s).
- (M3.5) Security Chatbot MVP: `/api/chat` con auth admin, RAG agregado de 24 h por device, streaming SSE, persistencia de conversaciones e historial scoped; widget flotante cyberpunk en el dashboard.
- (M3.5) Migración `0007_chat.sql`: tablas `chat_conversations` y `chat_messages` con FK cascade e índices; endpoints `GET /api/chat/history` y `DELETE /api/chat/history/[id]`.
- (M1) Health del agente con `hostname` y `boot_id` reales (antes `localhost`/`boot-001` fijos).
- (M1) Log de descartes por backpressure (`capture_drops`) y del fallback de GeoIP (`NoLookup`).

### Changed
- (Fase 3 IA) Cron de IA de 5 min → **15 min** vía GitHub Actions (`.github/workflows/ai-cron.yml`); `/api/ai/analyze` sigue con gate de 5 min por `facts_hash`.
- (Fase 0 IA) Modelos Gemini por defecto `gemini-3.6-flash` / `gemini-3.5-flash` con timeout 15 s por intento: `gemini-1.5-flash` está retirado (404) y `gemini-3.8-flash` responde 503/timeout.
- (M1) La clave HMAC de `host_mark` sale del binario: se resuelve de `SC_HMAC_KEY` → `privacy.hmac_key_file` → generación y persistencia en `config/.host-key`. El device id pasa a ser obligatorio (sin fallback `dev-001`).
- (M1) El envelope usa los extremos reales de la ventana agregada (antes `now-30..now`) y la cota del spool (`max_bytes`/`max_age_days`) se aplica periódicamente con FIFO.
- (M3) `/contacto` pasa a canal único por LinkedIn (`linkedin.com/in/juanfpalacios`): se retira el formulario y `POST /api/contact`. El sitio público ya no recaba datos personales (`/legal/privacy` §1/§4/§6 y `/legal/terms` §7 actualizados).
- (M3.5) `/api/chat` reemplaza el esqueleto por token de device por auth de admin; body estricto y `device_id` resuelto por query param/`DEFAULT_DEVICE_ID`, nunca por `body.context.deviceId`.

### Fixed
- (Fase 1 IA) Salida de análisis de 1.000 → 4.000 tokens: el JSON se truncaba y Groq respondía 400 `json_validate_failed`.
- (Fase 0 IA) Sin `AI_PROVIDER` el código priorizaba Groq para todos los entornos (cuota free más chica); ahora el primario es el proveedor elegido y la cadena respeta el orden Gemini → OpenRouter → Groq.
- (M1) Spool sin cota efectiva: `enforce_retention` existía pero no se invocaba e ignoraba `max_bytes`/`max_age_days` (riesgo de disco lleno con el backend caído).
- (M1) `window.start`/`window.end` del ingest no correspondían a la ventana real agregada.
- (M1) `parse_errors` contaba tráfico válido descartado (fragmentos, ICMP y flujos de otros hosts en modo promiscuo) y disparaba un falso «REVISAR COMPATIBILIDAD» en el dashboard.
- (M3) El lector de `recommendations_json` devolvía `findings: []` al leer el formato objeto `{ findings, recommendations }`.
- (M3) `/api/query?metric=ai` ya no consulta la base con `device_id` vacío cuando no hay device resuelto.
- (M3) Runbook de limpieza: columnas correctas (`flow_windows.start_at`, `agent_health.recorded_at`).
- (M3.5) RAG de alertas: el filtro de 24 h usa `flow_windows.start_at` y `alerts.window_id`; antes comparaba `alerts.id` con una fecha y devolvía vacío.

### Security
- (M1) Se elimina la clave HMAC hardcodeada `sc-sentinel-dev-key` compartida por todos los dispositivos; la clave generada se persiste con modo 0600 en Unix. Migración: fijar `SC_HMAC_KEY=sc-sentinel-dev-key` para conservar los `host_key` históricos hasta rotar.
- (M3.5) Aislamiento por device en RAG, historial y borrado; una conversación de otro device devuelve 404.
- (M3.5) SSE con tope de 2000 tokens, timeout de 30 s, fallback de modelo y logs sin prompts ni claves.
- (M3.5) Validador de grounding: las IPv4 inventadas se marcan con warnings en la respuesta.

## Plantilla (copiar al preparar release)

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- ...
### Changed
- ...
### Fixed
- ...
### Security
- ...             # (ej: rotación de secret, CVE cerrado de dependencia)
### Breaking      # solo si bump major o cambio rompiente en pre-1.0
- migraciones/nuevos pasos necesarios
```

## Reglas

1. Una entrada por release: preparar PR **antes** del tag (checklist `testing/release-checklist.md`).
2. Cada entrada se refiere al usuario/operador reads: runbook actualizado, pasos de upgrade del agente, cambios del API/dashboards.
3. Cambios de contratos y schemas se narran igualmente (schema_version: ¿v1 sigue? ¿v2 con plan de compatibilidad?).
4. Refs de issues/PRs cuando existan.
5. Comentarios de seguridad SIEMPRE cuentan: si un release incluye fix de Vectores conocidos (cargo audit / npm audit), generar entrada Security.
