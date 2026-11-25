# Plan de solución — auditoría integral SC-Sentinel (2026-11-21)

**Alcance:** N0. Diagnóstico y planificación; no se corrigió código, configuración ni datos. Las pruebas de escritura se limitaron a datos sintéticos/locales. Producción se consultó solo con GET y una sesión de visitante. No se tocó el servicio del agente ni el registro.

**Fuentes:** `docs/qa/INVENTARIO-FUNCIONAL.md`, `docs/qa/FASE3-DATOS.md`, `docs/qa/HALLAZGOS.md`, `docs/qa/QA-2026-11-21.md`, `docs/qa/REVISION-2026-11-21-RONDA2.md`, código del repo, GitHub Actions, `/status` local y lecturas de solo lectura a Neon.

**Limitación de método:** los skills EGM (`egm-drift-report`, `egm-bootstrap`, `egm-brainstorm`, `egm-draft`, `egm-review`, `egm-review-loop`) **no existen en este workspace** ni en `external/elephant-goldfish-model`. No se simularon. El análisis se hizo con lectura de código y documentación, y se indica cuando una conclusión es inferencia.

---

## 1. Registro único de baches y errores

Escala de severidad: **Crítico** = pérdida/exposición de datos o secretos, producción caída o datos falsos mostrados como reales; **Alto** = función principal rota, seguridad explotable, licencia incumplida o límite gratuito a punto de romperse; **Medio**; **Bajo**.

Probabilidad: **Alta (3)**, **Media (2)**, **Baja (1)**. Esfuerzo: **S (1)**, **M (2)**, **L (3)**.

**Prioridad v2 (reemplaza la fórmula anterior):** primero **severidad** (Crítico → Alto → Medio → Bajo). Dentro de cada severidad: `(Probabilidad × Impacto) ÷ Esfuerzo`, con P/I/E en 1–3 (Impacto: 1 bajo, 2 medio, 3 alto; Esfuerzo: S=1, M=2, L=3). A igual puntaje se ordena seguridad y datos primero. Los ID se mantienen estables; el orden renumerado está en `docs/qa/REVISION-2026-11-21-RONDA2.md` §7 (32 hallazgos: 8 altos, 17 medios, 7 bajos).

| ID | Severidad | Área | Síntoma | Evidencia | Causa raíz | Reproducir | Arreglo propuesto | Esf. | Prob. | Prioridad (v2; ranking en addendum §7) |
|---|---|---|---|---|---|---|---|---|---|---|
| B-001 | Alto | Release/CI | v0.1.9 se publicó aunque el workflow de release falló; no hay artefacto reproducible por CI ni tarball Linux | `gh run list --workflow=release.yml`: run `44815520838` = failure; `gh run view --log-failed`: `[FALLO] docs/runbooks/install-agent-windows.md:35 cita 0.1.8` | El tag se creó antes de corregir el runbook; el release se completó fuera de CI | Ver el run y comparar assets con `git tag` | Corregir versiones, re-ejecutar CI, publicar 0.1.10; no reemplazar assets de 0.1.9 | S | 3 | 9 |
| B-002 | Alto | Release/instalador | `sc-gui.exe` instalado no coincide con el del ZIP 0.1.9 ni con el build local | Instalado: 9.505.792 B / `B1CB2ACF…`; ZIP: 9.419.264 B / `E439A8A4…`; build local: 9.424.384 B / `26BE7031…` | El instalador copia un GUI de otro origen; el ZIP y el equipo no son el mismo artefacto | `Get-FileHash` de los tres; comparar tamaños | Reconstruir el ZIP desde un árbol limpio; verificar hash del GUI en `verify-agent.ps1`; reinstalar y comparar | S | 3 | 9 |
| B-003 | Alto | IA/datos | El chatbot de `/demo` responde 0 ventanas/0 bytes/0 alertas mientras el dashboard muestra datos sintéticos | 6 preguntas numéricas: todas 0; ground truth SQL: 1.623 ventanas, 2.757.856 paquetes, 428 alertas, 715 hosts | `app/api/chat/route.ts:102,124` usa `auth.guest.deviceId` y `fetchChatContext` contra la base; `app/api/query/route.ts:123` sí usa el dataset sintético | Abrir `/demo`, preguntar «¿cuántas ventanas?»; comparar con `/api/query?metric=overview` | En modo guest sintético, construir el contexto del chat desde `synthetic*()` (o marcar «demo sin datos reales») y no consultar la base | M | 3 | 4,5 |
| B-004 | Alto | Licencias/costos | Npcap free permite 5 instalaciones y no permite redistribución; el producto asume que cada cliente lo instala gratis | `npcap.com/license`: «limited to installation on five systems… may not be redistributed»; `docs/legal/npcap-notice.md` ya reconoce no redistribuir | El plan gratuito no escala a base comercial; el instalador no detecta ni guía | Leer la licencia oficial y contar instalaciones previstas | Decidir: OEM redistribution (pago) o detectar/guidar y exigir licencia al cliente; registrar ADR | M | 3 | 4,5 |
| B-005 | Medio | Release/web | La web anuncia 0.1.8; el agente instalado es 0.1.9 | `web/package.json:3`, `web/lib/product-facts.ts`, `web/lib/releases.ts`; `/status.agent_version=0.1.9` | 0.1.9 fue release de agente y no se actualizó el anuncio web | `curl` a `/novedades` y `/status` | Añadir 0.1.9 a `releases.ts`/`product-facts` o declarar explícitamente que es solo agente | S | 3 | 6 |
| B-006 | Medio | Seguridad/CSP | Producción sirve CSP en Report-Only; no bloquea; consola muestra error por `upgrade-insecure-requests` | `curl -sSI https://sc-sentinel.vercel.app/` → `Content-Security-Policy-Report-Only`; `docs/security/csp-nonce-plan.md` P3–P5 pendientes | Rollout deliberado sin cierre de enforce | `curl -sSI` y abrir consola | P3–P5: analizar reportes, corregir violaciones, `CSP_ENFORCE=1` en producción y verificar | S | 3 | 6 |
| B-006 (nota) | — | — | **Por qué Medio y no Alto como H7:** H7 era Alto porque no existía ninguna cabecera (sin CSP, XFO ni HSTS). Hoy sí existen `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy`, y la CSP con nonce se emite en Report-Only. Falta el bloqueo de `script-src` (defensa en profundidad ante XSS), no una exposición abierta. Ver `REVISION-2026-11-21-RONDA2.md` §7.1. | — | — | — | — | — | — | — |
| B-007 | Medio | Datos/integridad | 14 filas de `host_stats` sin `flow_windows`; no hay FKs entre métricas y ventanas | `docs/qa/FASE3-DATOS.md` §2.6; `web/lib/db/schema.ts:42,57,84` (sin `.references()`) | Diseño sin integridad referencial; ventanas borradas por retención dejan hijos | SQL de huérfanos | Añadir FK o limpieza transaccional; migración aditiva y test de retención | M | 3 | 3 |
| B-008 | Medio | Datos/continuidad | 37 ventanas sin bytes/host_stats en 24 h; hueco máximo de 10 h 28 min (2026-11-20 11:48:41Z → 22:17:11Z) | `docs/qa/FASE3-DATOS.md` §2.5; `REVISION-2026-11-21-RONDA2.md` §6: sin 41/42/107/109, sin reinicio, servicio arrancó 22:17:11Z, `.bak-20261120191711` | **Parada del servicio durante reinstalación/despliegue**, no energía ni suspensión | `Get-WinEvent` Kernel-Power; `Get-CimInstance Win32_Process`; marca `.bak` | Instrumentar `service_started_at`/`stopped_at` y motivo; mostrar «sin datos por mantenimiento»; **correr el agente en host always-on (NUC/servidor/VM) con Ethernet, sin suspensión, arranque automático y watchdog**, no en una laptop de trabajo; reinstalar en ventana acordada | M | 2 | 3 |
| B-009 | Medio | Datos/UI | «PAQUETES TOTALES» suma paquetes atribuidos, no los capturados; `packets_in/out` repiten el total | `web/lib/query/overview.ts:414-416` asigna el mismo total a ambos; agente cuenta en `sc-capture/live.rs:87` antes de atribuir | Dos semánticas distintas con una etiqueta única | Comparar `/status.packets_seen` con `SUM(host_stats.packets)` | Etiquetar «paquetes atribuidos» o exponer ambos contadores; separar in/out reales | S | 3 | 6 |
| B-010 | Medio | Operación/alertas | 428 alertas en 24 h, todas `open`; sin triage | SQL ground truth: 428/428 open, 0 acknowledged, 0 resolved | No hay proceso de triage; posible fatiga por volumen | Abrir `/dashboard/alerts` con sesión admin | Definir SLA/umbral y automatizar cierre/expiración; revisar reglas ruidosas | S | 3 | 6 |
| B-011 | Medio | IA/observabilidad | `ai_insights` solo registra `ok`/`no_traffic`; los errores de proveedor no quedan como estado | `web/lib/ai/analyze.ts` (`AnalysisStatus`); 187 filas, 19 `no_traffic`, 0 error | El fallo se degrada a `degraded` pero no se persiste con diagnóstico | Consultar conteos por status | Persistir `degraded`/`error` con código y modelo; alertar tasa de fallo | M | 2 | 2 |
| B-012 | Medio | Seguridad/rate limit | Límites en memoria por instancia; no globales | `docs/security/audit-2026-11-09.md` M4; `web/lib/rate-limit/*` | Serverless multi-instancia | Dos instancias locales contra la misma DB | Limitador distribuido en Postgres o WAF; mantener memoria como primera barrera | L | 3 | 2 |
| B-013 | Medio | Instalador/release | Sin firma de código ni metadatos de versión en los `.exe`; SmartScreen «Unknown Publisher» | `(Get-Item …).VersionInfo` vacío para agente y GUI; no hay paso de firma en `release.yml` | No se configuró Authenticode | `Get-AuthenticodeSignature` | Firmar con Azure Artifact Signing u OV; si no, SHA256SUMS + verificación y aviso | M | 3 | 3 |
| B-014 | Medio | Instalador/seguridad | `install-agent.ps1` recibe `-IngestToken` como parámetro obligatorio; invocado directo, el token queda en argv | `scripts/install-agent.ps1:31-33`; el `.bat` sí usa entorno/Read-Host | Dos rutas de instalación con garantías distintas | Ejecutar `Get-CimInstance Win32_Process` durante una instalación directa | Eliminar el parámetro y usar `Read-Host -AsSecureString`/entorno; probar que no aparece en argv | S | 2 | 4 |
| B-015 | Medio | Instalador/docs | El LEEME dice «NO NECESITAS NPCAP»; el runbook/legal dicen que la captura live lo requiere | `scripts/LEEME-INSTALACION.txt` vs `docs/legal/npcap-notice.md` | Dos modos (colector vs captura) explicados como uno solo | Leer ambos y comparar con `-CaptureInterface` | Separar requisitos por modo; detectar Npcap y guiar solo si se elige captura | M | 2 | 2 |
| B-016 | Alto | GUI/estabilidad | `sc-gui` se queda en spin (~85 % de un core, 0 líneas) tras ~180 min | `docs/designs/sc-gui-stage0/informe-cierre.md`; issue #10; CPU 134.701 s / 158.400 s | Mecanismo de stall/spin no identificado; oclusión descartada | Dejar la GUI abierta ≥3 h y medir CPU/hilos | Watchdog + perfilado de hilos; reproducir con dump; prueba de 72 h | L | 3 | 3 |
| B-017 | Medio | Release | v0.1.9 no incluye Linux, aunque el producto declara Linux colector | `gh release view v0.1.9` solo Windows; `README.md` y `docs/runbooks/install-agent-linux.md` | El workflow falló antes del job Linux | Comparar assets con 0.1.8 | Re-publicar 0.1.10 con ambos targets y CI verde | S | 3 | 6 |
| B-018 | Medio | Documentación | `docs/README.md` omite `/novedades`, `/api/alerts`, `/api/operators` y el estado real de release | Rutas reales en `web/app`; índice en `docs/README.md` | Índice no actualizado tras cambios | Comparar `glob` de rutas con el índice | Actualizar el índice y añadir gate de rutas | S | 3 | 6 |
| B-019 | Bajo | SEO | `meta description` ausente; Lighthouse SEO 0.8 en 3 páginas | `docs/qa/HALLAZGOS.md` H-03 | No hay `<meta name="description">` | Lighthouse | Añadir descripción por página | S | 3 | 3 |
| B-020 | Bajo | Accesibilidad | `label-content-name-mismatch` en 3 páginas | `docs/qa/HALLAZGOS.md` H-04 | Etiqueta visible ≠ nombre accesible | Lighthouse/axe | Alinear nombre accesible y texto visible | S | 3 | 3 |
| B-021 | Bajo | UX | `/login` no tiene enlaces de vuelta | `docs/qa/HALLAZGOS.md` H-08 | Diseño de la página | `document.querySelectorAll('a[href]').length` | Añadir enlace a inicio | S | 3 | 3 |
| B-022 | Medio | UX/estado | `/dashboard/hosts` muestra «Sin hosts» durante la carga | `docs/qa/HALLAZGOS.md` H-09; `HostDrillDown.tsx:173` | No distingue `isLoading` de vacío | Navegar y observar primer render | Estado de carga separado | S | 3 | 6 |
| B-023 | Bajo | i18n | «1 HOSTS» con plural fijo | `docs/qa/HALLAZGOS.md` H-12 | Falta pluralización | Ver tabla de países | `1 host`/`N hosts` | S | 3 | 3 |
| B-024 | Medio | Rendimiento | 1.937 ms de bloqueo del hilo principal en la landing | `docs/qa/HALLAZGOS.md` H-06 (trace) | Inicialización pesada (DroneShow/canvas/chunk) | Lighthouse/trace | Diferir animación, dividir chunks, medir de nuevo | M | 2 | 2 |
| B-025 | **Alto** | Costos/Neon | Consumo de CU-horas no medido; base ~130 MB, 219.757 filas de `host_stats` y retención 6,78 días | `docs/qa/FASE3-DATOS.md` §2.7-2.8; SQL de producción 2026-11-21; `docs/roadmap.md` §4 | Crecimiento continuo sin telemetría de consumo; el límite de 100 CU-h/mes puede agotarse sin aviso | Consola Neon / métricas | Medir 7 días, alertar al 70 %, ajustar retención/sync | L | 2 | 2,00 |
| B-026 | Bajo | Operación | `.bak-<marca>` acumulados en Program Files (5 archivos, 4,5 MB) | Inventario del 2026-11-21 | `deploy-agent-service.ps1` los rota y no los limpia | `Get-ChildItem` | Limpieza con retención N y verificación del `.bak` oficial | S | 3 | 3 |
| B-027 | Bajo | Proceso | `main` local está 1 commit por delante de `origin/main`; el informe de estado dice «main==producción» | `git log origin/main..HEAD` → `40c30a8`; `git status` → `M scripts/backup-agent-binary.ps1`, `?? docs/qa/` | Commit docs local no empujado; snapshot anterior | `git log`/`git status` | Decidir push o revert; actualizar el estado | S | 3 | 3 |
| B-028 | **Alto** | Seguridad/operación | No hay evidencia de rotación de secretos: token de dispositivo, `DATABASE_URL`, `ADMIN_SECRET`, `SC_SESSION_SECRET`, `CRON_SECRET`, claves de IA y webhook | `docs/ESTADO-2026-11-20.md` §6.1; sin fecha/commit/log de rotación en el repo | Credenciales de larga vida; ante una filtración no hay revocación probada | Revisar el runbook y el historial de Vercel/Neon/proveedores | Ola 0C: crear nuevas → desplegar → verificar ingesta/cron/chat → revocar viejas → registrar fecha/operador. No imprimir valores | M | 3 | 4,50 |
| B-029 | **Alto** | Privacidad/clase C | `anonymize_hosts` está desactivado: 219.757/219.757 filas de `host_stats` tienen `ip_display`; 0 `host_key` con forma IPv4 | SQL producción 2026-11-21; `agent/crates/sc-config/src/lib.rs:22-23` (default `false`); `accumulator.rs:338-345` | La anonimización es opt-in y la config instalada no la activa; la nube guarda IPs de clase C | `grep anonymize config.toml` (sin clave); SQL de `ip_display` | Decidir política: si la IP no es necesaria, `anonymize_hosts=true` y verificar `ip_display=null` al 100 %; si es necesaria, documentarlo y limitar retención/acceso | M | 3 | 4,50 |
| B-030 | Medio | IA/ruteo | El chat siempre responde con Groq; Gemini no se intenta aunque tenga clave | `POST /api/chat` → `provider=groq`, `model=openai/gpt-oss-120b`; `providers.ts:42-47` prioriza `GROQ_API_KEY` sobre `GEMINI_API_KEY` | `AI_PROVIDER` sin definir; el orden de detección decide | Forzar `AI_PROVIDER=gemini` en Preview y observar `chat_fallback` | Fijar `AI_PROVIDER` por entorno o documentar que Groq es el primario; añadir el proveedor efectivo a la telemetría | S | 3 | 6,00 |
| B-031 | Medio | IA/observabilidad | El fallback del chat no persiste el `status` ni la clase del error de proveedor | `web/lib/chat/llm.ts:416-455`; `web/app/api/chat/route.ts:274` | Solo se registra `reason` agregado y `code`; el error original se pierde | Forzar un fallo de proveedor y revisar logs | Registrar `{provider, model, status, error_name}` sin mensajes ni claves; persistir el último error en `ai_insights` o en un log consultable | S | 2 | 4,00 |
| B-032 | Bajo | Legal/docs | Tres menciones a MaxMind dicen «CC BY-SA 4.0» o mezclan ambas licencias | `docs/legal/THIRD_PARTY_NOTICES.md:17`; `docs/qa/QA-2026-11-21.md:249`; `docs/superpowers/plans/2026-11-03-m0-scaffold-ci.md:837` | La licencia vigente es el GeoLite EULA (12-feb-2026), que incorpora obligaciones de CC BY-SA 4.0 pero no es CC BY-SA | `grep -rn "CC BY-SA"` | Unificar la fórmula: «GeoLite EULA (incorpora atribución CC BY-SA 4.0)» — **resuelto en lo versionado** (`d213436`, `488a828`, `33b9943`, `7f01d1b`); remanente: versionar `docs/qa/QA-2026-11-21.md` | S | 2 | 4,00 |

**Deduplicación:** B-002 y B-013 comparten el síntoma «artefacto no confiable», pero B-002 es identidad del binario y B-013 es firma/versionado; se mantienen separados. B-006 y B-019/B-020 son de áreas distintas. B-008 y B-007 se separan: uno es continuidad, el otro integridad. B-030 (ruteo) y B-031 (observabilidad) se separan: uno explica qué proveedor se usa, el otro por qué no se puede diagnosticar un fallo.

---

## 2. Plan por olas

### Ola 0 — Contención y seguridad (0–72 h)

**Objetivo:** dejar de publicar/distribuir artefactos no verificables y cerrar las exposiciones/licencias que bloquean el uso comercial.

| Orden | IDs | Acción | Autorización | Responsable | Prueba que demuestra el arreglo | Reversión | Límite gratuito | Estimación |
|---|---|---|---|---|---|---|---|---|
| 0.0 | B-028 | **Rotación de secretos ejecutada por el propietario** (0C): token de dispositivo, `DATABASE_URL`, `ADMIN_SECRET`, `SC_SESSION_SECRET`, `CRON_SECRET`, claves de IA y webhook; crear→desplegar→verificar→revocar→registrar | N4 (secretos) | Propietario | Ingesta, cron y chat funcionan con las claves nuevas; las viejas quedan revocadas | Credenciales viejas conservadas hasta verificar; no imprimir valores | Sin costo | 2–4 h |
| 0.1 | B-001, B-002, B-017 | **0A:** reconstruir 0.1.10 desde un worktree limpio de `origin/main`; CI verde en Windows+Linux; reinstalar agente y GUI con el script oficial y comparar SHA instalado vs ZIP | N2 (tag/release) + N3 (deploy) | Propietario autoriza; agente ejecuta | `release.yml` success; `verify-agent.ps1` TODO CORRECTO; hash instalado == ZIP | No reemplazar 0.1.9; nueva versión | 1 release más; sin costo | 0,5–1 día |
| 0.2 | B-004 | Decidir Npcap: OEM redistribution o detección+guía con licencia del cliente; registrar ADR | N0/N4 según compra | Propietario | ADR + texto del instalador + prueba en Sandbox sin Npcap | Mantener detección | OEM es pago; free no escala | 0,5 día + compra |
| 0.3 | B-005 | Anunciar 0.1.9/0.1.10 en web o declarar release solo-agente | N1/N2 | Agente | `curl /novedades` muestra la versión | Revertir commit | 1 deploy | 1 h |
| 0.4 | B-006 | **0B:** P3–P5 CSP: reportes de Preview y producción, corregir violaciones, enforce 48 h en Preview y luego producción; verificar 3xx/errores | N2 (deploy) | Agente + propietario | `curl -sSI` devuelve `Content-Security-Policy` (no Report-Only); consola limpia | `CSP_ENFORCE=0` | Sin costo | 1–2 días |
| 0.5 | B-013 | Firma de código o aceptar riesgo firmado; si no, SHA256SUMS visible | N4 (compra) | Propietario | `Get-AuthenticodeSignature` válido o decisión firmada | N/A | Azure ~US$9,99/mes; OV US$150–300/año | 1 día + compra |

**Puerta de salida Ola 0:** 0 baches críticos; 0 altos sin decisión firmada; **secretos rotados y registrados**; release reproducible con CI verde; CSP enforce en producción; Npcap decidido; web y agente con la misma versión.

### Ola 1 — Datos e IA (3–10 días)

| Orden | IDs | Acción | Autorización | Responsable | Prueba | Reversión | Límite gratuito | Estimación |
|---|---|---|---|---|---|---|---|---|
| 1.1 | B-003 | Contexto del chat guest desde dataset sintético o aviso explícito; test de no-consulta a DB en demo | N1 | Agente | 6 preguntas demo devuelven los valores sintéticos; test unitario | Revertir commit | 0 | 0,5 día |
| 1.2 | B-007 | FK o limpieza transaccional de huérfanos; migración aditiva | N3 (DB) | Agente | 0 huérfanos; test de retención | Migración reversible | 1 migración | 1 día |
| 1.3 | B-008, B-009 | Instrumentar motivo de ventana vacía; etiquetar paquetes atribuidos vs capturados | N1 | Agente | `/status` vs SQL vs UI con tolerancia documentada | Revertir UI | 0 | 1 día |
| 1.4 | B-010 | Triage: umbral de alertas, expiración, resumen diario | N1 | Agente + propietario | 24 h con acknowledged/resolved > 0 y sin alertas basura | Revertir reglas | 0 | 1–2 días |
| 1.5 | B-011 | Persistir `degraded`/`error` en `ai_insights` y alertar tasa | N1 | Agente | Conteo por status incluye error; alerta de prueba | Revertir | 0 | 0,5 día |

**Puerta:** reconciliación SQL/API/UI sin diferencias sin explicar; chat demo con exactitud ≥90 % en 12 preguntas; 0 huérfanos; alertas con triage.

### Ola 2 — Estabilidad y calidad (2–3 semanas)

| Orden | IDs | Acción | Autorización | Responsable | Prueba | Reversión | Límite | Estimación |
|---|---|---|---|---|---|---|---|---|
| 2.1 | B-016 | Watchdog + dump de hilos; reproducir spin 3 h y 72 h | N1/N3 (servicio) | Agente | CPU < 5 % en reposo 72 h; issue cerrado | Volver binario anterior | 0 | 3–5 días |
| 2.2 | B-012 | Rate limit distribuido (Postgres o WAF) | N3 | Agente | Dos instancias comparten límite; test concurrencia | Tabla reversible | 1 tabla | 1–2 días |
| 2.3 | B-019–B-024 | SEO, a11y, estados de carga, plural, rendimiento | N1 | Agente | Lighthouse ≥0.95 SEO; axe 0; LCP <2,5 s | Revertir | 0 | 2–3 días |

**Puerta:** 0 baches altos de estabilidad; CSP P3–P5 cerrado; rate limit global; accesibilidad sin fallos críticos.

### Ola 3 — Operación y release (2–4 semanas)

| Orden | IDs | Acción | Autorización | Responsable | Prueba | Reversión | Límite | Estimación |
|---|---|---|---|---|---|---|---|---|
| 3.1 | B-013, B-014, B-015 | Instalador NSIS/WiX con asistente+silencioso, token seguro, detección Npcap, upgrade conservando datos, desinstalación sin residuos | N1/N3 | Agente | Sandbox: limpia, upgrade, rollback, sin residuos | Volver ZIP+scripts | 0 | 1–2 semanas |
| 3.2 | B-026 | Limpieza de `.bak-*` con retención | N4 | Propietario | 1 `.bak` oficial + N recientes | Restaurar desde `.bak` | 0 | 0,5 día |
| 3.3 | B-025 | **Alto hasta medir:** medir Neon 7 días; ajustar retención/sync | N3 | Propietario | Consumo <70 % de 100 CU-h y alerta al 70 % | Volver retención | 0 | 1 semana de observación |

**Puerta:** instalador probado en Sandbox; 0 residuos; `.bak` limpio; consumo Neon medido y bajo 70 %.

### Ola 4 — Documentación y deuda menor (1 semana)

| IDs | Acción | Autorización | Prueba |
|---|---|---|---|
| B-018, B-027 | Actualizar índice, estado, versiones; decidir push del commit local | N1/N2 | `docs/README.md` coincide con `glob`; `git status` limpio; `main==origin/main` |

**Puerta:** documentación verificable; 0 baches críticos/altos abiertos; 0 diferencias de datos sin explicar; 72 h de observación sin fallos.

---

## 3. Decisiones del propietario (separadas)

| # | Decisión | Opciones | Recomendación | Consecuencia de no decidir |
|---|---|---|---|---|
| D1 | Vercel Hobby y uso comercial | Hobby (no comercial) / Pro (US$20/mes) / otro host | Pro si hay clientes o pago; Hobby solo demo | Riesgo de pausa por violar términos; el producto no puede venderse sobre Hobby |
| D2 | Proveedor de IA y datos | Gemini free / OpenRouter free / Groq free / crédito propio | Mantener cadena actual con presupuesto; revisar términos de cada plan | Cambio de términos o cuota puede romper el cron/chat sin aviso |
| D3 | Npcap | OEM redistribution (pago) / detectar y que el cliente instale | Detectar/guidar ahora; OEM si se vende a escala | Licencia incumplida o instalación fallida en clientes |
| D4 | Firma de código | Sin firma + SHA256 / Azure Artifact Signing / OV / EV | Azure Artifact Signing si califica; si no, OV | SmartScreen bloquea; los clientes no confían |
| D5 | ¿El stall de la GUI bloquea el cierre de Etapa 1? | Sí / no con riesgo firmado | Sí: es P0 y el sello no debe declarar estabilidad | Se cierra Etapa 1 con un defecto que afecta la operación |
| D6 | Tecnología del instalador | NSIS / Inno Setup / WiX MSI / scripts+ZIP | NSIS para propietario y costo cero; WiX si se necesita MSI empresarial | Retraso o licencia comercial inesperada |
| D7 | Push del commit local `40c30a8` | Push / revert / dejar | Push si el snapshot es correcto; luego actualizar producción | `main` local ≠ producción; el sello sería falso |

---

## 4. Deuda conocida verificada

| Punto | Estado verificado | Evidencia |
|---|---|---|
| Rotación de secretos | **Confirmada como no hecha**: sin fecha/commit/log; pasa a B-028 (Alta) y a Ola 0C | `docs/ESTADO-2026-11-20.md` §6.1; `REVISION-2026-11-21-RONDA2.md` §2 |
| GUI issue #10 y «Salir» | Issue abierto; clic real sobre `--release` **sí** funcionó (2026-11-21), pero sobre el build local, no el instalado | `Get-Process sc-gui` → sin proceso; hash local distinto del instalado |
| CSP P3–P5 | Pendiente; producción Report-Only | `curl -sSI`; `docs/security/csp-nonce-plan.md` |
| Rate limit M4 + L1–L5 | Pendiente | `docs/security/audit-2026-11-09.md` |
| SYNC-30 / ingest por lotes | No implementado | `docs/roadmap.md` §2 |
| Neon | 129,7 MB; retención 6,78 días; consumo no medido | SQL ground truth; `FASE3-DATOS.md` |
| v0.1.9 fuera de CI / sin Linux | Confirmado | run `44815520838` failure; assets solo Windows |
| `.bak-*` y binario sin identificar | 5 `.bak-*`; el GUI instalado no coincide con el ZIP | inventario 2026-11-21 |
| Web 0.1.8 vs agente 0.1.9 | Confirmado | `package.json:3`; `/status` |
| PR #8 / ramas viejas | PR #8 cerrado; ramas locales múltiples | `gh pr list`; `git branch -a` |
| `docs/roadmap.md` / `AGENTS.md` | Roadmap con supuestos de fecha; AGENTS es normativo | lectura |
| Vercel Hobby | No comercial según términos oficiales | `vercel.com/docs/plans/hobby` (consultado 2026-11-21) |
| Proveedor IA free | Gemini/OpenRouter/Groq con cuotas free; datos según términos | `providers.ts`; revisar términos |
| Ejecutable sin metadatos | Confirmado: `VersionInfo` vacío | PowerShell |
| Instalador sin diseño/firma | Confirmado; este documento diseña, no implementa | — |
| M6 prerequisitos | Banco de pruebas y línea base no existen | `docs/roadmap.md` §5 |

---

## 5. Puerta para M6 (Etapa 2)

| Criterio | Estado actual | Cómo se mide |
|---|---|---|
| 0 baches críticos | **No cumple**: no hay críticos declarados, pero el release no es confiable | Registro |
| 0 altos sin decisión | **No cumple**: B-001/B-002/B-003/B-004/B-016/B-025/B-028/B-029 | Registro + ADRs |
| Datos reconciliados sin diferencias sin explicar | **Parcial**: diferencias explicadas (paquetes/ASN) y 14 huérfanos | SQL vs API vs UI |
| Cron y chatbot con métricas aceptables | **No cumple**: chat demo 0/7 exactitud; cron sin estado de error | 12 preguntas + `ai_insights` |
| Secretos rotados | **No cumple**: sin evidencia (B-028) | Runbook + evidencia |
| `main` = producción | **No cumple**: `40c30a8` local sin push | `git log origin/main..HEAD` |
| Instalador diseñado | **Cumple** este documento | `docs/designs/windows-installer.md` |
| 72 h de observación sin fallos | **No cumple**: issue #10 abierto | `/status` + CPU |

---

## 6. Dependencias y orden

`Ola 0.1` (release reproducible) → `Ola 0.4` (CSP enforce) → `Ola 1.1` (chat demo) → `Ola 1.2` (integridad) → `Ola 2.1` (GUI) → `Ola 3.1` (instalador) → `Ola 4` (docs/estado).

No empezar Ola 3 antes de que Ola 0.1 cierre: un instalador que empaqueta un GUI no reproducible perpetúa B-002.

---

## 7. Referencias

- `docs/qa/QA-2026-11-21.md` — informe completo.
- `docs/qa/PROMPTS-OLAS.md` — prompts de ejecución de Olas 0 y 1.
- `docs/qa/FASE3-DATOS.md` — reconciliación SQL.
- `docs/qa/INVENTARIO-FUNCIONAL.md` — inventario y plan de pruebas.
- `docs/qa/HALLAZGOS.md` — hallazgos de navegador, cabeceras y gates.
- `docs/designs/windows-installer.md` — diseño del instalador.
