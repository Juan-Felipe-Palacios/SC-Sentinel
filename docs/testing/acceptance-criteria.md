# Criterios de aceptación por hito (v1)

Fuente: spec §14.3. Cada hito cierra cuando TODOS los checks correspondientes pasan (y el checklist del `release-checklist.md` si aplica).

## SC Audit quick-wins v2 (Export + Evals + Trust Page)

- [x] CSV con `=CMD('calc')` se exporta como `'=CMD('calc')` (sanitización anti-injection).
- [x] Export con >10000 filas devuelve `413 { error: 'dataset_too_large' }`; CSV streaming en lotes de 500.
- [x] `format=xlsx&metric=overview` abre sheets Overview/Hosts/Windows.
- [x] `/dashboard/admin/exports` muestra uso de exportaciones (rol + device).
- [x] Cada insight nuevo trae `input_tokens`/`output_tokens`/`latency_ms`/`status_code` (null solo en filas viejas).
- [x] `/dashboard/evals` pinta coste diario, llamadas por modelo, p50/p95 y donut; modelos free = 0 USD.
- [x] Coste > `AI_DAILY_COST_BUDGET_USD`: log + webhook `AI_COST_ALERT_WEBHOOK_URL`.
- [x] Trust Page: token ausente/expirado/revocado → `404`; rotar invalida el anterior; revocar → `404`.
- [x] Cada visita a `/p/<token>` inserta en `trust_page_access_logs` con `ip_anon = x.y.*.*`.
- [x] Rate limit 100 accesos/hora por token; >1000 accesos/24h → log `trust_leak_suspected` + webhook `TRUST_ALERT_WEBHOOK_URL`.
- [x] Gates: `pnpm lint/typecheck/test/build`, `cargo fmt/test/clippy`, `verify-contracts.sh` en verde (ver checkpoints 1–3).

> Nota de nombres: el binario se llamó `sc-agent` hasta el 2026-11-08; desde entonces
> el artefacto es `sc-sentinel-agent` (el crate sigue siendo `sc-agent`). Las notas
> históricas conservan el nombre usado en su fecha.

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

- [x] IPFIX/NetFlow recibe tráfico real de router MikroTik (con RouterOS CHR en QEMU; pendiente repetir con Cisco o router físico si hay hardware).

> M4 (2026-11-10, actualizado): además de la validación sintética 2026-11-08/09
> (fixtures, `synthetic_exporter`, dashboard Vercel, recuperación de templates;
> fase 4: T4.1 métricas en health/dashboard + migración 0012, T4.2 fuzz proptest
> con fix de panic real en IPFIX, T4.3 fixtures reales Wireshark 23 payloads,
> benchmark 5,5–37,5M flows/s parser y 714–782k UDP con 0 drops), se cerró la
> validación con exportador real: **MikroTik RouterOS CHR 7.20.4 (QEMU)**
> exportando por `/ip traffic-flow` (IPFIX 2055 + NetFlow v9 9995) → agente
> real `--no-capture --collector` con `collector_started`, spool con ventanas
> de 30 s del tráfico del CHR (host LAN 192.168.88.2: 980 pkts/54 KB, NIC del
> CHR, slirp), y sniffer propio que captura **327 datagramas v9 desde la IP
> del router (10.0.2.15)**. Dedup P1 cerrado como decisión de diseño: **fuente
> exclusiva por segmento** + warning `source_overlap` (`pcap-vs-flow.md` §7).
> **M4 CERRADO** (2026-11-10): soak de 24 h completado con **0 panics y 0 aborts**
> (monitor cada 5 min: 288 muestras = 86 400 s exactas; RSS estable ~11,5 MB,
> spool estable en 12.500.640 B). Queda como pendiente de producto repetir con
> router físico si aparece hardware (no bloquea el cierre del módulo).
> Procedimiento y checklist: `docs/runbooks/collector-mikrotik.md` §4.
- [x] Topología IPFIX documentada (`diagrams/drawio/network-topology-ipfix.drawio` actualizada).
- [x] Fixtures de collector (paquetes de muestra, sin datos sensibles).
- [x] Diferencias pcap vs flow documentadas (sampling, timeouts, bytes por paquete) → `docs/testing/pcap-vs-flow.md`.
- [x] Marca la agregación de windows de la misma calidad que en capturas.

> M4 (2026-11-09): validación sintética end-to-end (fixtures saneados en
> `docs/testing/fixtures/` con test `fixtures_from_disk`, `synthetic_exporter`
> v5/v9/IPFIX, agente real con `--collector`, dashboard Vercel con 3 hosts
> TEST-NET y sumas exactas, recuperación de templates tras reinicio del
> agente) + fase 4 sin hardware: T4.1 métricas del colector en health/dashboard
> (5 contadores + fila + migración 0012), T4.2 property tests proptest con
> **fix de un panic real** en `ipfix.rs::read_fields` (IEs de empresa),
> T4.3 fixtures reales Wireshark (23 payloads UDP, gitignored por licencia
> con extractor commiteado), benchmark de throughput. Las pendientes de esa
> nota (router real, dedup P1, soak 24h) quedan cubiertas por la nota
> 2026-11-10 de arriba (soak cerrado).

## M5 — Servicio + instalador + GUI (1–2 semanas)

- [x] Servicio Windows instala/desinstala limpiamente (sc.exe, sin residuos).
- [x] Recovery automático: reinicio del servidor reinicia el daemon y el sync con el spool.
- [x] Logs locales accesibles y sin datos sensibles (reglas §9.3).
- [x] Config segura (permisos restrictivos a config y spool; token en env).
- [x] Instalador documentado (runbook actualizado).
- [x] GUI opcional separada del servicio (si aplica) → backlog documentado (fuera de M5, ver plan M5 §backlog).
- [x] Runbooks completos y verificados paso a paso contra una instalación real.

> M5 (2026-11-10, actualizado): el binario integra el control del SCM (crate
> `windows-service` 0.8): `SC-Sentinel-Agent` con StartPending/Running/StopPending,
> Stop y Shutdown aceptados, stop → watch global → mismo `shutdown_signal()` del
> agente (drain de ventana ≤30 s + sync + `spool flush` antes de `Stopped` con el
> código de salida real). Recovery: `sc.exe failure ... actions= restart/5000/
> restart/10000/restart/30000 reset= 86400` + `start= auto` (reinicio del servidor
> relanza el daemon con el spool persistente; sync reenvía `pending`). Logging en
> servicio → archivo (`[log] file`, default `C:\ProgramData\SC-Sentinel\logs\
> agent.log`) vía `tracing-appender`, sin tokens ni payloads (§9.3). Instalador
> `scripts/install-agent.ps1` (dir C:\Program Files, config.toml SOLO con claves
> reales de sc-config — corregido 2026-11-10: secciones inválidas y flag
> `--service` inexistente eliminados, binPath sin `--service`, `-BinaryPath` y
> `-CollectorPorts` parametrizables, reinstalación idempotente), icacls restrictivo
> sin herencia, token+device en `HKLM\...\Services\<nombre>\Environment`, failure
> actions) y `scripts/uninstall-agent.ps1` (`-PurgeData` opcional). Runbook
> `docs/runbooks/install-agent-windows.md` reescrito y alineado.
>
> **Bache 1 — prueba física del servicio (2026-11-11):** ejecutada con
> elevación real (UAC) sobre esta estación. Ciclo completo verificado:
> instalación → RUNNING (AUTO_START, log por archivo, `.host-key`, spool
> SQLite y colector UDP escuchando en 2056/4739) → **stop con drenaje y
> `Stopped`** → start → caída por `taskkill` con recovery de las failure
> actions (REINICIAR 5/10/30 s, reset 86400) → desinstalación **sin
> residuos** (`1060`, sin `C:\Program Files\SC-Sentinel` ni
> `C:\ProgramData\SC-Sentinel`) → reinstalación final RUNNING.
>
> Defectos reales encontrados y corregidos en esa prueba:
> 1. el SCM no entrega los tokens del `binPath` en `ServiceMain` (solo el
>    nombre del servicio): el agente arrancaba con la config por defecto
>    (`hmac_key_file` relativo al CWD) y moría con exit 2. Ahora se usa la
>    línea de órdenes real del proceso y, en modo servicio, el config
>    instalado y el modo collector-only son los defaults;
> 2. el servicio quedaba `RUNNING` con exit 0 aunque el agente ya había
>    muerto (el `bridge.join()` no terminaba nunca): ahora el servicio
>    reporta `Stopped` con el código real;
> 3. `rolling::never()` hace *panic* si no puede abrir el log (ACL): se usa
>    el `Builder`, que devuelve `Result`, y el error se propaga;
> 4. el watchdog de "segunda señal" y el drenaje escuchaban el mismo evento,
>    así que un solo Stop del SCM abortaba el drenaje (exit 130 → el SCM
>    reportaba 1067): ahora hay un contador de señales (la primera drena,
>    la segunda fuerza la salida);
> 5. `config.toml` con BOM (inocuo para `toml` pero normalizado) y rutas
>    relativas resueltas contra el directorio del config.
>
> Script de la prueba: `C:\Users\Juan\AppData\Local\Temp\m4-chr\run\m5-verify.ps1`
> (transcript a `run\m5-verify.log`).
>
> **Verificación final con la build definitiva (2026-11-11, 10:18–10:22 UTC):**
> repetida con elevación real y sin concurrencia de instancias, sobre el binario
> **idéntico bit a bit** al release del repo (`sha256
> 0868812ADC9266FAF1BD36B614D5D470FE57EE33777FF43ABAE24E89B33C891F`, 8.445.952 B,
> 11/11 02:10). Transcript en `run\final-check.log`:
> - servicio `RUNNING`, `AUTO_START`, LocalSystem, exit code 0, colector UDP en
>   2056 y 4739, `agent.log`, `.host-key` y spool presentes;
> - **stop → `Stopped` con exit code 0** (drenaje correcto:
>   `shutdown_signal` → `collector_stopped` → `sync_final_drain` →
>   `spool_pending` → `spool_flushed`; el `401/403` es el esperado con el token
>   de evaluación `local-eval-token` y el batch queda retenido en el spool);
> - **start → `RUNNING` con PID nuevo** (21028 → 17816).
> - Nota operativa: las corridas elevadas solapadas se pisan entre sí (una
>   instancia desinstala mientras otra consulta); el bucle de reintentos no debe
>   dejarse en paralelo con la ejecución de la prueba.
