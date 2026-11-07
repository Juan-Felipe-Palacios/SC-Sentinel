# Criterios de aceptación por hito (v1)

Fuente: spec §14.3. Cada hito cierra cuando TODOS los checks correspondientes pasan (y el checklist del `release-checklist.md` si aplica).

## M0 — Scaffold + CI (3–4 días)

- [x] Repo con estructura completa del árbol §4 del spec (agent/, web/, docs/).
- [x] Rust workspace compila en Windows y Linux (CI matrix verde).
- [x] Next.js compila sin errores.
- [x] CI básico verde: fmt, clippy, test, build (+ audits Rust).
- [x] Licencias iniciales documentadas (THIRD_PARTY_NOTICES + headers en código heredado).
- [x] Contratos skeleton creados y validables en CI.
- [x] Diagramas C4 context/container iniciales creados.
- [x] README con instrucciones de desarrollo local.

> M0 verificado 2026-11-03: `cargo test` (11 passed, Windows local), `pnpm --dir web` lint/typecheck/test/build exit 0, `node scripts/validate-contracts.js` OK, `sc-agent.exe --version` OK, workflows Rust CI / Web CI / Validate Contracts verdes en GitHub (runs hasta 2026-11-03). Cierre de hito: commit `9780475`.

## M1 — Capture + aggregate + sync end-to-end (2 semanas)

- [x] Captura real desacoplada de iced (eventos tokio mpsc).
- [x] FlowUpdate por canal bounded con backpressure; drops reflejados en métricas.
- [x] Ventanas de 30 s estables (golden tests).
- [x] Spool SQLite soporta offline (reintentos, cota, FIFO).
- [x] Mock server recibe batches idempotentes (duplicate aceptado).
- [x] Métricas de drops/spool visibles en logs y en el health del snapshot.
- [x] Compresión gzip funcionando; flag zstd compila (off por defecto).
- [x] Smoke: tráfico real del propietario publicado end-to-end.

> M1 verificado 2026-11-07 sobre el binario `sc-agent` con `--features sc-capture/live`:
>
> - Gates: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` y `cargo test --workspace` verdes (47 tests; incluye ventana de 30 s alineada, retención FIFO del spool y los escenarios de sync 200/400/401/429/500 contra mock HTTP real).
> - Captura live compilada con Npcap SDK, `--list-interfaces` OK y ejecución real sobre Wi-Fi (`\Device\NPF_{5ED97C9D-…}`) con 3 ventanas cada ~30 s.
> - Smoke contra `https://sc-sentinel.vercel.app/api/ingest`: todas las ventanas confirmadas por 2xx (el spool quedó en 0 pendientes, 0 dead-letter y sin reintentos); solo un 2xx borra filas del spool, así que la publicación quedó verificada.
> - Corregidos dos baches que impedían el cierre: (1) el envelope enviaba `now-30..now` en vez de los extremos reales de la ventana agregada; (2) la cota del spool (`max_bytes`/`max_age_days`) existía pero nunca se aplicaba, así que el spool podía crecer sin límite con el backend caído. También se registran en logs los drops por backpressure de cada ventana.
> - Pendiente de sign-off visual (requiere contraseña de admin): confirmar la última ventana y el health del agente en el dashboard de producción.

## M2 — API + Neon + dashboard v0 (1,5 semanas)

- [ ] `/api/ingest` valida con zod; errores 400 con JSON de problema.
- [ ] Token auth: Bearer + hash SHA-256; 401/403 según estado del device.
- [ ] Insert idempotente en Neon (duplicado → 200 duplicate; sin doble métrica).
- [ ] Rate limit activo (60/min burst 30 por device; 20/min por IP sin token).
- [ ] `/api/query` + dashboard overview con datos reales (SWR 5 s).
- [ ] Health del agente visible; alertas operativas automáticas.
- [ ] Cron de cleanup corre automáticamente (log de espacio liberado).

## M3 — Landing + tokens + IA (1,5 semanas)

- [ ] Landing pública publicada en sc-sentinel.vercel.app (/, /funcionalidades, /contacto, /legal/*, /security).
- [ ] Design tokens de strategicconnex.com.ar aplicados (landing + dashboard, un solo sistema en lib/).
- [ ] Panel IA con insights: summary, risk_level, findings, recommendations; muestra modelo usado y estado.
- [ ] IA fallback agotado → `degraded` probado (no error de producto).
- [ ] Legal/privacy/notices publicados.
- [ ] SEO básico + analytics activo.

## M3.5 — Security Chatbot (MVP — 100% completado, 2026-11-07)

Alcance de cierre: backend seguro, RAG agregado de 24 h, streaming SSE, persistencia e interfaz flotante. El plan original F9 (exportar PDF/Markdown), F10 (incident response guiado) y la comparación de tendencias entre períodos quedan fuera de este MVP y pasan al backlog de M3.6; no se marcan como entregados.

- [x] Autenticación exclusiva de admin (`verifyAdminAuth`); el device se resuelve por `?device_id`/`DEFAULT_DEVICE_ID` y nunca por `body.context.deviceId`.
- [x] Aislamiento por device en RAG e historial: todas las consultas filtran `flow_windows.device_id` y la conversación se valida contra el device autorizado.
- [x] Body estricto (`message`, `conversationId`); rechazo de campos no previstos, incluido `context.deviceId`.
- [x] Persistencia en `chat_conversations` / `chat_messages` (migración `0007_chat.sql`), con FK cascade e índices; historial GET y DELETE scoped.
- [x] RAG corregido: últimas 24 h, joins por `window_id`, top hosts con `ip_display`, top ports/countries desde la última ventana, alertas y salud del agente.
- [x] Streaming SSE real con eventos `meta`, `token`, `done`, `error`; proveedores Groq/OpenRouter/Gemini, fallback de modelo, timeout 30 s y tope de 2000 tokens.
- [x] Validación de grounding: las IPv4 citadas se contrastan con el contexto y se devuelven warnings sin bloquear.
- [x] Widget flotante cyberpunk en el dashboard: launcher, panel responsive 420×600, mensajes con Markdown seguro, streaming, stop, nueva conversación, sugerencias y manejo de 401.
- [x] Accesibilidad base: `role=dialog`, `aria-modal`, cierre con Escape, autofocus, textos alternativos y `prefers-reduced-motion`.
- [x] Gates: `pnpm lint`, `pnpm typecheck`, `pnpm exec vitest run` (17 archivos / 95 tests) y `pnpm build` (21 páginas) verdes.
- [x] Contrato `docs/contracts/chat-api.v1.md`, ADR `docs/adr/0013-chatbot-mvp.md` y changelog actualizados.
- [x] Smoke productivo: sin auth 401; con admin SSE 200, 679 eventos token, `done` sin error; historial y borrado scoped verificados.

> M3.5 MVP verificado 2026-11-07 sobre el deployment `sc-sentinel-qxd8-6bc9a1iws-scteam1.vercel.app` (alias `https://sc-sentinel.vercel.app`). Commit de producto: `cb907c8`. Este cierre **no** incluye exportación PDF/Markdown ni workflow guiado de incident response; se registran como backlog M3.6 para no declarar como hechas funcionalidades ausentes.

## M4 — sc-collector MikroTik/Cisco (1,5 semanas)

- [ ] IPFIX/NetFlow recibe tráfico real de router MikroTik (y Cisco si hay hardware).
- [ ] Topología IPFIX documentada (`diagrams/drawio/network-topology-ipfix.drawio` actualizada).
- [ ] Fixtures de collector (paquetes de muestra, sin datos sensibles).
- [ ] Diferencias pcap vs flow documentadas (sampling, timeouts, bytes por paquete).
- [ ] Marca la agregación de windows de la misma calidad que en capturas.

## M5 — Servicio + instalador + GUI (1–2 semanas)

- [ ] Servicio Windows instala/desinstala limpiamente (sc.exe, sin residuos).
- [ ] Recovery automático: reinicio del servidor reinicia el daemon y el sync con el spool.
- [ ] Logs locales accesibles y sin datos sensibles (reglas §9.3).
- [ ] Config segura (permisos restrictivos a config y spool; token en env).
- [ ] Instalador documentado (runbook actualizado).
- [ ] GUI opcional separado del servicio (si aplica).
- [ ] Runbooks completos y verificados paso a paso contra una instalación real.
