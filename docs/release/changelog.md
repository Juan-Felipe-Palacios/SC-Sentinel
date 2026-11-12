# Changelog del proyecto (+ plantilla)

Formato: Keep a Changelog 1.1 (semantic entries) publicado también en cada GitHub Release.

## [0.1.1] — 2026-11-11

Cierra el gap de instalación: release publicada con binario + sumas SHA256 e instalador de un clic para Windows.

### Added
- (M5) Instalador de un clic para Windows (`scripts/instalar-sc-sentinel.bat`): se auto-eleva con UAC, pide el `device_id` y el token, instala el servicio y lo deja en ejecución. Modo desatendido: `instalar-sc-sentinel.bat <device_id> <token> [puertos]`. Bitácora sin secretos en `%TEMP%\sc-sentinel-instalador.log`.
- (M5) Desinstalador de un clic (`scripts/desinstalar-sc-sentinel.bat`): pregunta si se borran los datos (spool, `.host-key`) y propaga el código de salida.
- (M5) Guía `scripts/LEEME-INSTALACION.txt` en lenguaje llano para usuarios sin conocimientos de informática (requisitos, enrolment en el panel, instalación, verificación y qué hacer si algo falla).
- (M5) `scripts/package-release.ps1`: empaquetado por plataforma (`windows-x64` en ZIP, `linux-x64` en tar.gz) con `SHA256SUMS.txt` dentro del paquete y `SHA256SUMS-<target>.txt` como sidecar del artefacto.
- (M5) Workflow `.github/workflows/release.yml`: al publicar un tag `v*` compila en Windows y Ubuntu, empaqueta y publica los artefactos con sus sumas SHA256 en la GitHub Release.

### Changed
- (M5) Runbook de instalación Windows: documenta las dos vías (un clic desde la release y PowerShell desde el repo), la verificación del hash del ZIP y el formato real de credenciales (`dev_…` + `sc_dev_…`).
- (M5) Runbook de instalación Linux reescrito: `config.toml` con el esquema real de `sc-config`, unit de systemd con `EnvironmentFile`, `--no-capture` y hardening, y descarga desde la release con verificación de sha256.

### Fixed
- (M5) `install-agent.ps1` ya no se queda en silencio con la versión antigua del binario: el `Copy-Item` sobre el `.exe` instalado fallaba con «Acceso denegado» (ACL sin herencia de una instalación previa) y el servicio arrancaba con la build previa; ahora ajusta los permisos del fichero, borra, copia y **verifica el SHA256** antes de continuar.
- (M5) `SHA256SUMS.txt` se escribe sin BOM (con BOM, `sha256sum -c` falla en Linux).

## [0.1.0] — 2026-11-11

Primer release funcional: agente con captura y colector NetFlow/IPFIX, dashboard completo, IA, exports, Trust Pages y servicio Windows.

### Added
- (Fase 0–4 IA) Cadena multi-proveedor Gemini → OpenRouter → Groq con `AI_PROVIDER` como primario y respaldos que entran solo con su key; cooldown por 429 que respeta `Retry-After`; backoff exponencial 1 s / 2 s ante 5xx/503; logging estructurado sin secretos (`ai_call`, `ai_provider_fallback`, `ai_ratelimit`, `ai_rate_limited`, `chat_ok`, `chat_fallback`) y monitoreo de headers `x-ratelimit-*` para anticipar cuotas agotadas.
- (Fase 3 IA) Presupuesto diario opcional `AI_DAILY_CALL_BUDGET` y early-return del cron cuando no hay ventanas nuevas; contexto del chat acotado a 8 mensajes / 1.200 chars por mensaje; límite de invitados de 100 chats/día.
- (Dashboard) Heurística de respaldo en la nube (`web/lib/risk/heuristic.ts`, ADR-0005): cuando el agente envía `risk_score: null` y `alerts: []`, la nube evalúa señales deterministas del payload (severidad de alertas del agente, salud de captura, puertos de riesgo, ratio de paquetes caídos) y rellena `host_stats.risk_score` con un piso de banda baja; agrega una alerta `cloud_heuristic` (dedup 1 h) solo si la ventana llega a banda media/alta y el agente no emitió alertas propias. El valor del agente siempre tiene prioridad.
- (M0) Estructura inicial del monorepo (agent/, web/, docs/); documentación completa: spec v2.2, 13 ADRs, contratos v1, diagramas, runbooks, testing, ux, legal, release.
- (M2) Ingesta `/api/ingest` en Neon + dashboard v0 (`/dashboard/overview`) con SWR 5 s.
- (M3) Landing pública SSG (`/`, `/funcionalidades`, `/security`, `/contacto`, `/legal/privacy`, `/legal/terms`, `/legal/third-party-notices`), `sitemap.xml`, `robots.txt`, OG image y Vercel Web Analytics.
- (M3) IA asistente por lotes: tabla `ai_insights` (retención 15 d), `/api/ai/analyze`, `/api/ai/cron`, dedup por `facts_hash` y fallback determinista `degraded`; panel «Análisis IA» en el dashboard (refresh 30 s).
- (M3.5) Security Chatbot MVP: `/api/chat` con auth admin, RAG agregado de 24 h por device, streaming SSE, persistencia de conversaciones e historial scoped; widget flotante cyberpunk en el dashboard.
- (M3.5) Migración `0007_chat.sql`: tablas `chat_conversations` y `chat_messages` con FK cascade e índices; endpoints `GET /api/chat/history` y `DELETE /api/chat/history/[id]`.
- (M1) Health del agente con `hostname` y `boot_id` reales (antes `localhost`/`boot-001` fijos).
- (M1) Log de descartes por backpressure (`capture_drops`) y del fallback de GeoIP (`NoLookup`).
- (M4) Colector pasivo NetFlow v5/v9 + IPFIX integrado en el agente: listeners UDP configurables, cache de templates, normalización al pipeline, métricas en `agent_health` y migración `0012`.
- (M4) Validación con MikroTik RouterOS CHR 7.20.4, fixtures reales de Wireshark, property tests y benchmark de throughput.
- (M5) Servicio Windows `SC-Sentinel-Agent` con control SCM, stop con drenaje, recovery automático, logging a archivo e instalador/desinstalador PowerShell idempotentes.
- (M5) Runbook de instalación Windows verificado con elevación real, incluido recovery tras `taskkill` y desinstalación sin residuos.
- (Dashboard) Vistas dedicadas de Hosts, Conexiones y Alertas, con drill-down, mapa de calor, filtros por severidad y exportación.
- (Dashboard) Rotación de token de device desde Settings (`POST /api/devices/:id/rotate`), con invalidación inmediata del token anterior.

### Changed
- (Fase 3 IA) Cron de IA de 5 min → **15 min** vía GitHub Actions (`.github/workflows/ai-cron.yml`); `/api/ai/analyze` sigue con gate de 5 min por `facts_hash`.
- (Marketing) Copy de «1 análisis cada 5 minutos» → «hasta 1 análisis cada 15 minutos» (landing, funcionalidades y `docs/ux/copywriting.md`) para alinear la promesa pública con la cadencia real del cron.
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
- (M7) Rotación de tokens de device desde el dashboard; el token anterior deja de autenticar al instante y el nuevo se muestra una sola vez.
- (M6) El contexto RAG del chatbot se sanea (caracteres de control, espacios y longitud) y se declara como datos no confiables; el grounding ahora valida IPv4 e IPv6.
- (M3) Trust Pages evalúa el rate limit antes de registrar el acceso y responde 404 sin escribir en `trust_page_access_logs`.
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
