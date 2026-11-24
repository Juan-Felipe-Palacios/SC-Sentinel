# Changelog del proyecto (+ plantilla)

Formato: Keep a Changelog 1.1 (semantic entries) publicado también en cada GitHub Release.

## [0.1.10] — 2026-11-24

Release publicada con el tag `v0.1.10`: versión reproducible e instaladores
NSIS/`.sh`. Sustituye a 0.1.9, que queda publicada como está.

### Added
- (Ops) Instalador NSIS `sc-sentinel-agent-v0.1.10-windows-x64-setup.exe`:
  asistente y `/S`, detección de instalación existente (estados 0/1/3/4),
  actualización que conserva `config.toml`, `.host-key`, token y spool, aviso de
  degradación con código `7` y salida `19` cuando la actualización se aplica sin
  `sync_confirmed` en 30 s. Los scripts de la actualización viajan incrustados y
  se ejecutan desde `$INSTDIR\installer` (R13).
- (Ops) `.github/workflows/installer-windows.yml` (`workflow_dispatch`, sin tags
  ni release): NSIS 3.10 y SDK de Npcap 1.13 fijados por SHA256, agente compilado
  con `sc-capture/live` y gate que lo verifica, T1 y T4–T9/T13–T18 con servicio
  real y servidor de ingesta local simulado.
- (Agent) `FileVersion`/`ProductVersion` en `sc-sentinel-agent.exe` y
  `sc-gui.exe`, con gate en CI y en `verify-agent.ps1`.

### Changed
- (Docs) Runbooks, diseño y changelog unificados en **0.1.10**; el workflow del
  instalador toma 0.1.10 por defecto.

### Fixed
- (Ops) `package-release.ps1` y `build-installer.ps1` incluían
  `lib<BEL>gent-binpath.psm1` (carácter BEL en el nombre): el build del instalador
  abortaba siempre. Corregido y verificado byte a byte.
- (Ops) El paquete Windows incluye `deploy-agent-service.ps1` y `lib\`
  (`agent-binpath.psm1`, `config-toml.psm1`); el ZIP 0.1.10 anterior no los
  tenía y `build-installer.ps1` ahora se niega a compilar sin ellos.
- (Ops) `install-agent.ps1` nunca reescribe un `config.toml` existente: si hacen
  falta claves nuevas deja `config.toml.nuevo`, y todo cambio en `ProgramData`
  va precedido de un respaldo verificado (`.sha256`).
- (Ops) `verify-agent.ps1 -Service` compara el `sc-gui.exe` instalado contra el
  manifiesto del paquete (B-002).

## [0.1.9] — 2026-11-20

> Sustituye a **0.1.8**, publicada el 2026-11-20 pero **no desplegada**: el
> servicio siguió corriendo 0.1.7. Sin re-tag: `v0.1.8` queda como está.

### Added
- (Agent) Monitor de IPs locales cada 5 s: `local_ips_usable`, `local_ips_ipv4`
  y `local_ips_last_refresh` en `/status`, con los eventos
  `local_ips_refreshed` y `local_ips_degraded`. Emite refresh ante un cambio de
  **contenido** del conjunto aunque el conteo no cambie, que es el bug de 0.1.7.
- (GUI) Estado de captura degradada: badge ámbar de advertencia y detalle
  «sin IPv4 local utilizable (vacío/APIPA)» en vez de mostrar verde con la
  captura inservible.
- (Docs) Runbook `docs/runbooks/test-dhcp-refresh.md` (etapas A y B) y la
  evidencia medida de ambas en `docs/evidence/local-ip-refresh-2026-11-20.md`.

### Changed
- (GUI) Retirada la instrumentación temporal de Stage 0: sin `SC_GUI_STAGE0`,
  sin `gui.log` de métricas y sin sonda `spool_open`. El gate de relectura del
  spool se mantiene.
- (CI) `cargo audit` ignora `RUSTSEC-2026-0257` con el motivo documentado en
  ADR-0020.

### Fixed
- (Agent) La captura ya no queda «ok» con una tabla de IPs locales vieja: el
  monitor consulta el resolver de Npcap y el refresh se propaga a `/status`.
- (CI) El workflow de Rust instala las dependencias GTK en Linux y no cancela el
  job de Windows ante un fallo de entorno.

## [0.1.8] — 2026-11-18

### Added
- (Web) Colector CSP Report-Only (P2): reporte de violaciones sin bloquear.
- (GUI) Instrumentación Stage 0 de sc-gui bajo la variable `SC_GUI_STAGE0`.
- (Docs) Brief, anclaje y design draft de Stage 0 para la GUI.

### Changed
- (Web) CSP con nonce por request (P1) en lugar de política estática.
- (Web) Resolución de la IP del cliente endurecida contra spoofing.
- (Web) Fallback de autenticación en desarrollo endurecido.
- (GUI) Gate de relectura del spool cuando `/status` ya alimenta la vista (perf).
- (Web) Alineación de las tarjetas KPI del dashboard y del diagrama de arquitectura.
- (Web) Restauración del componente Vercel Web Analytics.
- (Web) Restauración de la demo pública y del cron de IA en producción.
- (Web) Indicación del último tráfico cuando las ventanas están vacías.

### Fixed
- (Web) Eliminada la referencia duplicada al script de Vercel Web Analytics.

## [0.1.7] — 2026-11-15

### Added
- (Legal) Anexo A con los textos completos de MIT y Apache-2.0 de Sniffnet
  v1.5.1, en la página pública y en `docs/legal/THIRD_PARTY_NOTICES.md`.
- (Release) El ZIP incluye `THIRD_PARTY_NOTICES.md` y `licenses/` con ambas
  licencias; `verify-agent.ps1` valida los 14 ficheros esperados.

### Changed
- (Legal) Headers de copyright restaurados en `parser.rs`, `flow.rs` y
  `geolite2.rs`, con el titular correcto (Giuliano Bellini y colaboradores).
  ADR-0019 y los avisos dejan de afirmar que no hay código de terceros.

## [0.1.6] � 2026-11-14

### Added
- (Agent) Soporte opcional de GeoLite2-ASN: `top_asns` en el snapshot y flags
  `geo_asn_loaded`/`geo_country_loaded` en `/status`. La base ASN se carga de
  forma independiente; si falta, `top_asns` queda vac�o sin impedir el arranque.

### Changed
- (Agent) `WindowSnapshot` y Zod/JSON Schema aceptan `top_asns` como campo opcional.

### Fixed
- (Ops) Tres defectos del paquete Windows que destapó el ciclo físico M5 del
  2026-11-14 (verificado con `scripts/verify-m5-cycle.ps1`, 10 etapas, 0 fallos):
  `uninstall-agent.ps1` no cerraba `sc-gui.exe` (proceso de usuario que
  sobrevive al stop del servicio y bloqueaba el borrado de
  `C:\Program Files\SC-Sentinel`); `install-agent.ps1` escribía
  `SC_GEOIP_ASN_DB` con doble barra; `verify-m5-cycle.ps1` buscaba en el log el
  texto de carga GeoLite2 anterior a la 0.1.6 (ahora el patrón acepta las líneas
  de Country y ASN por separado). El ZIP se reempaquetó desde el árbol ya
  corregido; los binarios de la release no cambian.
- (Agent) El código derivado de terceros (parser, tipos de flujo y
  geolocalización MaxMind) fue reescrito como implementación original con la
  misma semántica y API pública (ADR-0019); sin cambio de comportamiento.

## [0.1.5] — 2026-11-13

El paquete de Windows pasa a incluir la GUI y sus sumas se calculan desde el
binario compilado, no desde la copia temporal que se comprime.

### Changed
- (Ops) El token de ingesta ya no viaja por argumentos: el ciclo M5 se relanza
  elevado sin él, pide el token con `Read-Host -AsSecureString` (o lo toma de
  `SCS_INSTALL_TOKEN` y la borra) y se lo pasa al instalador por el entorno del
  hijo. `instalar-sc-sentinel.bat` solo acepta device id y puertos por línea de
  comandos y registra únicamente el origen del token. Así deja de aparecer en el
  `argv` de los procesos y en la cabecera del transcript de `Start-Transcript`
  (hallazgo de la auditoría de temporales del 2026-11-13).

### Added
- (Ops) El paquete de Windows incluye `sc-gui.exe` y `abrir-gui.bat`:
  `install-agent.ps1` los copia a `C:\Program Files\SC-Sentinel\` (la GUI hereda
  el `Usuarios: lectura y ejecución` de Program Files, no la ACL del servicio) y
  `uninstall-agent.ps1` los borra antes del directorio, sin residuos.

### Fixed
- (Ops) `package-release.ps1` calcula `SHA256SUMS.txt` desde el origen
  (`agent/target/release` y `scripts/`) y aborta si lo copiado al stage de
  `%TEMP%` difiere: antes las sumas se tomaban de la copia temporal, así que una
  sustitución entre la copia y el zip se publicaba como válida.

## [0.1.4] — 2026-11-12

Cierra el último hueco de la entrega: la guía de instalación que viaja dentro
del paquete de Linux apuntaba a una release antigua (y rota).

### Fixed
- (M5) La guía `INSTALACION-LINUX.md` que se empaqueta con el artefacto de Linux
  fijaba `VER=0.1.1`, es decir, enviaba al usuario a descargar la release v0.1.1,
  cuyo binario arrancaba con `runtime: captura live no compilada` y código de
  salida 2. El empaquetador reescribe ahora esa línea con la versión real del
  artefacto, de modo que el paquete nunca puede apuntar a otra release.
- (M5) El empaquetador aborta si algún fichero de texto del paquete (guía,
  README, script, `.bat`) menciona una versión distinta de la que se publica:
  es preferible cortar la release a publicar instrucciones que descargan un
  binario roto o ya retirado.

### Added
- (M5) `scripts/check-doc-versions.ps1`: comprueba que los runbooks y los
  scripts de entrega no apunten a una release distinta de la del workspace de
  Rust. Se ejecuta como gate en el workflow de release, de modo que una
  versión desalineada entre el binario y la documentación detiene la
  publicación en lugar de llegar al usuario.
- (M5) Entrada en el checklist de release para verificar la coherencia de
  versiones antes de etiquetar.

## [0.1.3] — 2026-11-12

Cierra la auditoría de parabilidad del agente en Windows: el binario publicado
deja de estar incompleto y de filtrar rutas de la máquina de compilación.

### Added
- (M5) Motor determinista de detección local (`sc-detect`): reglas de blacklist, escaneo de puertos, escaneo entrante, anomalías DNS, umbral de volumen y estado de salud del enlace. Las reglas se evalúan **antes** de persistir el sobre en el spool, de modo que una alerta se genera aunque el backend esté caído. La blacklist es un fichero de texto (una IP o CIDR por línea, `#` para comentarios, IPv4 e IPv6); si está configurada y no existe, el agente **falla al arrancar** en lugar de empezar sin ella.
- (M5) La ventana agregada transporta ahora las **señales internas** (`DetectionInput`) además del snapshot contractual: el motor de detección ve hasta 500 hosts remotos (no solo el top visual de 50), que es lo que hace falta para detectar un escaneo de puertos de poco volumen.
- (M5) `docs/runbooks/npcap-install.md`: runbook de instalación del runtime y del SDK de Npcap, con el diagnóstico de los seis síntomas más frecuentes (incluido `--list-interfaces` que responde «captura live no compilada»).
- (M5) `docs/adr/0015-geolite2-runtime.md`: decisión de resolver la base GeoLite2 **en runtime** en lugar de embeberla en el binario.
- (M5) Runbook de Npcap, notas legales de MaxMind y runbook de instalación Windows actualizados con la base GeoLite2, la variable `SC_GEOIP_DB` y el requisito de Npcap en runtime.

### Changed
- (M5) La release de Windows se compila **con captura live** (`--features sc-capture/live`) e instala el Npcap SDK en el runner. Antes se publicaba un binario sin la feature: arrancaba con `runtime: captura live no compilada` y código de salida 2.
- (M5) El artefacto de Windows incluye la base `geolite2/GeoLite2-Country.mmdb` y el instalador la copia al directorio de instalación con verificación SHA256 y ACLs de solo lectura. `SHA256SUMS.txt` pasa a listar **todos** los ficheros del paquete (antes solo el binario).
- (M5) El binario se compila con `--remap-path-prefix` sobre el directorio de Cargo: el `.exe` publicado ya no incluye la ruta del usuario de la máquina de build (`C:\Users\<usuario>\.cargo\registry\…`) ni la ruta de los fuentes del proyecto.
- (M5) CI: el check `cargo check -p sc-capture --features live` deja de ser exclusivo de Linux y se añade un gate que verifica que el binario de Windows no filtra rutas de compilación.

### Fixed
- (M5) La base GeoLite2 ya no se busca con `CARGO_MANIFEST_DIR` (una ruta absoluta de la máquina de compilación incrustada en el `.exe`). Ahora se resuelve **en runtime**: variable `SC_GEOIP_DB` → junto al ejecutable (`geolite2/`, `resources/geolite2/`) → ancestros del ejecutable → directorio de trabajo. Si no aparece, el agente sigue funcionando con `NoLookup` (los países salen vacíos) en lugar de morir.
- (M5) El fixture pcap de desarrollo ya no se busca con `CARGO_MANIFEST_DIR` (misma clase de fuga): se busca junto al ejecutable y en sus ancestros, y el error orienta a usar `--fixture <ruta>`.
- (M5) Las rutas relativas del `config.toml` de ejemplo apuntaban a `./spool/sc-spool.sqlite` y `./config/.host-key`. Como las rutas relativas se resuelven contra el **directorio del propio `config.toml`**, el spool acababa en `agent/config/spool/` y la clave HMAC en `agent/config/config/.host-key` (una clave nueva en cada arranque, con lo que el `host_mark` de los hosts cambiaba). Ahora son `../spool/sc-spool.sqlite` y `./.host-key`.
- (M5) El instalador de Windows incluye la copia de la base GeoLite2, las ACLs de solo lectura sobre ella y `SC_GEOIP_DB` en el entorno del servicio.
- (M5) La release de Linux se sigue publicando **sin** la feature `live` (modo colector), tal como documenta `docs/runbooks/install-agent-linux.md`: con `live` el binario enlaza dinámicamente con `libpcap.so` y dejaría de arrancar en equipos sin Npcap/libpcap.

## [0.1.2] — 2026-11-12

Corrige un defecto real en el cierre de las ventanas de métricas: la ventana solo se cerraba cuando llegaba tráfico nuevo.

### Fixed
- (M5) La ventana de métricas ya se cierra **por tiempo** y no solo al recibir tráfico. Antes, `WindowAggregator::run` rotaba la ventana únicamente dentro de la rama que consume actualizaciones del colector: si el tráfico cesaba, la última ventana con datos se quedaba en memoria y no se persistía en el spool hasta que llegaba el siguiente paquete (o se paraba el agente). En redes con tráfico esporádico eso retrasaba —y con una ventana sin tráfico previo, perdía— las métricas del dashboard y el envío al backend. Ahora el agregador comprueba el límite de la ventana cada segundo, con un test de regresión (`la_ventana_se_cierra_sin_trafico`) que falla sin el arreglo.

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
