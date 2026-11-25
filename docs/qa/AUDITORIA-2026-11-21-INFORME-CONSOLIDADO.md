# Informe consolidado — auditoría SC-Sentinel del 2026-11-21

**Para:** agente analista (sin contexto previo de la sesión de auditoría).
**Tipo de trabajo original:** N0 (solo lectura y diagnóstico), con dos excepciones documentadas en §1.
**Estado de este archivo:** consolidado de `QA-2026-11-21.md`, `REVISION-2026-11-21-RONDA2.md`, `PLAN-DE-SOLUCION-2026-11-21.md`, `HALLAZGOS.md`, `FASE3-DATOS.md`, `INVENTARIO-FUNCIONAL.md`, `CHATBOT-RAG-TEST.md` y `DASHBOARD-SESION-SUPERVISADA.md`. **Sin versionar.** No se corrigió código, configuración ni datos al consolidarlo.

**Advertencia de lectura:** este informe mezcla **medido**, **estimado** e **inferencia**. Cada tabla lo indica. Si algo no tiene comando, no es medición.

---

## 1. Método, entorno y límites (leer antes que nada)

| Dimensión | Dato |
|---|---|
| Entorno | Windows 11; Git Bash + Windows PowerShell 5.1 y `pwsh`; repo `D:\ProyectosWeb\SC-Sentinel`, rama `main` |
| Commit auditado | `40c30a8` (snapshot de estado y diagramas), 1 commit local por delante de `origin/main` al inicio |
| Producción | `https://sc-sentinel.vercel.app` (solo GET; nunca POST de escritura) |
| Agente local | `0.1.9` en `127.0.0.1:8387` |
| Escrituras realizadas | Ninguna en producción ni en la base; el servicio no se detuvo ni se reinició |
| Excepción N1 | Test versionado y código de logging del chat (ronda 2) |
| Excepción N2 | Tres deployments de **Preview** para forzar `AI_PROVIDER=gemini`, con rollback verificado (ronda 2) |

**Límites que invalidan conclusiones si se ignoran:**

1. **No hubo sesión de administrador.** El dashboard real, `/api/query` con sesión admin, las mutaciones de alertas y las vistas de dispositivos **no se verificaron**. Todo lo que diga «dashboard» en este informe se refiere a la demo con cookie de visitante.
2. **Había dos bases.** `web/.env.local` apunta a desarrollo (`ep-snowy-mode…`) y `web/.env.production.local` a producción (`ep-delicate-rain…`). La primera consulta devolvió 36 filas de `host_stats`; producción tiene 219.757. **Toda cifra de este informe sale de producción**, salvo indicación contraria.
3. **Herramientas parciales.** `browser.network.list` falló (`Expected JSON value`); no hubo viewport (real 800×574), así que capturas a 1440/390 px y Lighthouse móvil no se ejecutaron. Se suplió con `curl -sSI`.
4. **`cargo audit` no se ejecutó** en la primera ronda (no estaba instalado); `cargo deny` no se ejecutó en ninguna. CI sí los corre.
5. **Los skills EGM no existen** en el workspace (`external/elephant-goldfish-model` ausente, sin `egm-*` en `.agents/skills`). No se simularon.
6. **Presupuesto agotado:** 3/3 consultas a la base de reconciliación y 20/20 llamadas de IA. No quedan consultas libres sin nueva autorización.

**Corrección explícita respecto de la ronda 1:** la ronda 1 cerró con **27 hallazgos (0 críticos, 5 altos, 13 medios, 9 bajos)**. La ronda 2 re-clasificó y amplió a **32 hallazgos (0 críticos, 8 altos, 17 medios, 7 bajos)**. La diferencia no es un cambio de criterio arbitrario: B-028 (rotación de secretos), B-029 (clase C con IPs) y B-025 (Neon sin medir) no se habían abierto; B-008 y B-009 se separaron; B-006 pasó de «H7 alto» a «medio contingente» tras comprobar que las cabeceras existen. **Usar 32/8/17/7 como cifra vigente.**

---

## 2. Alcance auditado (inventario real)

| Bloque | Cantidad | Fuente |
|---|---|---|
| Páginas públicas | 10 (`/`, `/funcionalidades`, `/security`, `/contacto`, `/novedades`, 3 legales, `/login`, `/p/[token]`) | `INVENTARIO-FUNCIONAL.md` |
| Vistas de dashboard | 12, con 3 de solo admin (`settings`, `admin/trust-access`, `admin/exports`) y 1 admin para escritura (`alerts`) | idem |
| APIs | 14 grupos | idem |
| Archivos del paquete Windows | 14 entradas, 15.705.138 B | ZIP 0.1.9 |
| Tablas de datos auditadas | `flow_windows`, `host_stats`, `asn_stats`, `alerts`, `alert_notes`, `alert_audit_log`, `ai_insights`, `devices`, `trust_pages`, `export_logs` | consultas de solo lectura |

**Métricas de producción usadas como ground truth (24 h, 2026-11-21 16:0x UTC):** 1.623 ventanas · 26.525 filas de host · 715 hosts únicos · 2.757.856 paquetes atribuidos · 2.546.033.409 bytes (2,313 GB in / 232 MB out) · 428 alertas (428 `open`) · 19 países (top AR) · 41 ASN (top 22927) · retención 6,78 días · ~129,7 MB en total.

---

## 3. Veredictos por área

| Área | Veredicto | Motivo en una línea |
|---|---|---|
| Funciones públicas | Aceptable | 9 rutas 200, enlaces resueltos, 404/307/401 correctos |
| Dashboard real | **No verificado** | Requiere login admin; nunca se inició |
| Demo | Defectuosa en IA | El dashboard sintético funciona; el chat responde 0 |
| Fidelidad de datos | Parcial | 60/60 ventanas del agente en la base; 14 huérfanos; 37 ventanas vacías; 1 hueco de 10 h 28 min |
| IA (cron/insights) | Parcial | 26/50 runs históricos en success, últimos 12 en success; sin estado de error persistido |
| Chatbot | Defectuosa | 0/7 respuestas numéricas correctas en demo; rechaza secretos e inyección |
| Calidad técnica | Verde con deuda | `pnpm typecheck/lint/test/build` y `cargo fmt/clippy/test` verdes; 3 advisories moderadas en `pnpm audit --prod` |
| Instalador | Deficiente | Sin metadatos, sin firma, GUI instalado ≠ ZIP, Npcap sin resolver, token por argv en la ruta PowerShell |
| Release/CI | Deficiente | v0.1.9 publicada con el workflow en failure y sin asset Linux |

**Gates medidos (no estimados):** Rust 296 passed / 0 failed / 1 ignored; web 334 tests en 61 archivos + 6 contratos TAP (6/6); `pnpm lint` con 3 warnings y 0 errores; `next build` OK (Next 15.5.28).

---

## 4. Registro de los 32 hallazgos (ID inmutable)

Severidad: **Crítico** = pérdida/exposición de datos o secretos, producción caída o datos falsos mostrados como reales; **Alto** = función principal rota, seguridad explotable, licencia incumplida o límite gratuito por romperse; **Medio**; **Bajo**.
Prioridad v2 = primero severidad, luego `(Probabilidad × Impacto) ÷ Esfuerzo`, con P/I/E en 1–3.

| ID | Sev. | Área | Síntoma | Evidencia (archivo:línea o comando) | Arreglo | Esf. | Prior. |
|---|---|---|---|---|---|---|---|
| B-001 | Alto | Release/CI | v0.1.9 publicada con el workflow de release en failure; sin artefacto reproducible por CI | run `44815520838` failure; `gh run view --log-failed` → `[FALLO] install-agent-windows.md:35 cita 0.1.8` | Release 0.1.10 desde CI verde | S | 9,00 |
| B-002 | Alto | Release/instalador | `sc-gui.exe` instalado ≠ ZIP ≠ build local | instalado 9.505.792 B `B1CB2ACF…`; ZIP 9.419.264 B `E439A8A4…`; build 9.424.384 B `26BE7031…` | Reconstruir desde árbol limpio; verificar hash del GUI instalado | S | 9,00 |
| B-003 | Alto | IA/datos | Chat de `/demo` responde 0 ventanas/0 bytes/0 alertas mientras el dashboard muestra datos sintéticos | `web/app/api/chat/route.ts:102,124` usa `auth.guest.deviceId` + `fetchChatContext`; `web/app/api/query/route.ts:123` usa `syntheticResponse` | Rama sintética también en el chat | M | 4,50 |
| B-004 | Alto | Licencias | Npcap free: 5 instalaciones, sin redistribución | `npcap.com/license` (2026-11-21); `docs/legal/npcap-notice.md` | OEM pago o detectar/guiar | M | 4,50 |
| B-005 | Medio | Release/web | Web anuncia 0.1.8; agente 0.1.9 | `web/package.json:3`, `web/lib/product-facts.ts`, `web/lib/releases.ts` | Anunciar o declarar release solo-agente | S | 6,00 |
| B-006 | Medio | Seguridad/CSP | Producción en `Content-Security-Policy-Report-Only`; no bloquea | `curl -sSI` en 9 rutas; `web/middleware.ts:27-42` | P3–P5 y `CSP_ENFORCE=1` | S | 6,00 |
| B-007 | Medio | Datos/integridad | 14 `host_stats` sin `flow_windows`; sin FK | `web/lib/db/schema.ts:42,57,84` | FK o limpieza transaccional | M | 3,00 |
| B-008 | Medio | Datos/continuidad | 37 ventanas vacías; hueco 10 h 28 min | sin ventanas 41/42/107/109; servicio arrancó 2026-11-20 22:17:11Z; `.bak-20261120191711` | Host always-on + instrumentar motivo | M | 3,00 |
| B-009 | Medio | Datos/UI | «PAQUETES TOTALES» son atribuidos, no capturados; in/out duplican el total | `web/lib/query/overview.ts:414-416`; conteo previo en `agent/crates/sc-capture/src/live.rs:87` | Etiquetar o exponer ambos | S | 6,00 |
| B-010 | Medio | Alertas | 428/428 `open`, 0 acknowledged | SQL producción | SLA + expiración + revisar reglas ruidosas | S | 6,00 |
| B-011 | Medio | IA/observabilidad | `ai_insights` solo `ok`/`no_traffic`; errores no persistidos | `web/lib/ai/analyze.ts` | Persistir `degraded`/`error` con código y modelo | M | 2,00 |
| B-012 | Medio | Rate limit | Límites en memoria por instancia | `web/lib/rate-limit/*`; `docs/security/audit-2026-11-09.md` M4 | Limitador en Postgres o WAF | L | 3,00 |
| B-013 | Medio | Instalador | Sin firma ni `FileVersion`/`ProductVersion` | `(Get-Item …).VersionInfo` vacío; sin paso de firma en `release.yml` | Azure Artifact Signing u OV; si no, SHA + aviso | M | 4,50 |
| B-014 | Medio | Instalador/seguridad | `-IngestToken` es parámetro de `install-agent.ps1`: invocado directo, va por argv | `scripts/install-agent.ps1:31-33` | `Read-Host -AsSecureString` o entorno | S | 4,00 |
| B-015 | Medio | Instalador/docs | LEEME dice «NO NECESITAS NPCAP»; legal dice que la captura live lo requiere | `scripts/LEEME-INSTALACION.txt` vs `docs/legal/npcap-notice.md` | Separar modos | M | 2,00 |
| B-016 | Alto | GUI | Stall/spin ~85 % de un core tras ~180 min, 0 líneas de log | `docs/designs/sc-gui-stage0/informe-cierre.md`; issue #10; CPU 134.701 s/158.400 s | Watchdog + dump de hilos | L | 3,00 |
| B-017 | Medio | Release | v0.1.9 sin asset Linux (v0.1.8 sí lo tenía) | `gh release view v0.1.9`; comparación con v0.1.8 | 0.1.10 con ambos targets | S | 6,00 |
| B-018 | Medio | Docs | `docs/README.md` omite `/novedades`, `/api/alerts`, `/api/operators` | índice vs `glob` de rutas | Actualizar índice + gate | S | 6,00 |
| B-019 | Bajo | SEO | Sin `meta description`; Lighthouse SEO 0.8 | 3 páginas medidas | Añadir descripción | S | 3,00 |
| B-020 | Bajo | A11y | `label-content-name-mismatch` | axe/Lighthouse en 3 páginas | Alinear nombre accesible | S | 3,00 |
| B-021 | Bajo | UX | `/login` sin enlaces (`a[href]` = 0) | `browser.evaluate` | Añadir vuelta al inicio | S | 3,00 |
| B-022 | Medio | UX/estado | «Sin hosts» durante la carga | `HostDrillDown.tsx:173` | Estado de carga separado | S | 6,00 |
| B-023 | Bajo | i18n | «1 HOSTS» | texto de la demo | Pluralizar | S | 3,00 |
| B-024 | Medio | Rendimiento | 1.937 ms de long task en la landing | trace: `longTasks=4` | Diferir animación, dividir chunks | M | 2,00 |
| B-025 | Alto | Costos/Neon | Consumo de CU-h no medido; ~130 MB y 219.757 filas con retención 6,78 d | SQL producción; `docs/roadmap.md` §4 | Medir 7 días, alerta al 70 % | L | 2,00 |
| B-026 | Bajo | Operación | 5 `.bak-*` acumulados (4,5 MB) en Program Files | inventario 2026-11-21 | Retención N + `.bak` oficial | S | 3,00 |
| B-027 | Bajo | Proceso | `main` local 1 commit por delante; el estado decía «main == producción» | `git log origin/main..HEAD` → `40c30a8` | Push o revert (D7) | S | 3,00 |
| B-028 | Alto | Seguridad/operación | Sin evidencia de rotación de secretos | `docs/ESTADO-2026-11-20.md` §6.1; sin log en repo | Ola 0C: crear→desplegar→verificar→revocar→registrar | M | 4,50 |
| B-029 | Alto | Privacidad/clase C | `anonymize_hosts` off: 219.757/219.757 filas con `ip_display`; 0 `host_key` IPv4 | SQL producción; `agent/crates/sc-config/src/lib.rs:22-23` (default `false`) | Decidir política y verificar al 100 % | M | 4,50 |
| B-030 | Medio | IA/ruteo | El chat siempre usa Groq; Gemini no se intenta | `POST /api/chat` → `provider=groq`; `web/lib/ai/providers.ts:42-47` | Fijar `AI_PROVIDER` por entorno | S | 6,00 |
| B-031 | Medio | IA/observabilidad | El fallback del chat no persistía `status` del proveedor | `web/lib/chat/llm.ts:416-455`; `web/app/api/chat/route.ts:274` | Log con `status`+`error` (hecho en N1, sin release) | S | 4,00 |
| B-032 | Bajo | Legal/docs | 3 menciones decían «CC BY-SA 4.0» como si fuera la licencia | `THIRD_PARTY_NOTICES.md:17`; `QA-2026-11-21.md:249`; `m0-scaffold-ci.md:837` | Wording canónico (resuelto en lo versionado) | S | 4,00 |

**Deduplicaciones decididas:** B-002 ≠ B-013 (identidad del binario vs firma/metadatos). B-007 ≠ B-008 (integridad vs continuidad). B-030 ≠ B-031 (qué proveedor se usa vs por qué no se puede diagnosticar un fallo).

---

## 5. Reconciliación de datos, por nivel

### 5.1 Agente (medido)

`/status` 2026-11-21: `agent_version=0.1.9`, `capture_status=ok`, 2,7 M paquetes creciendo, 0 drops, 0 parse_errors, `queue_depth=0`, `spool_bytes=0`, `geo_loaded/country/asn=true`, `mode=service`, `service_state=running`. Las 60 ventanas observadas son continuas de 30 s.

### 5.2 Base de datos (medido, 3 lecturas)

- 60/60 ventanas del agente presentes en `flow_windows`, todas con bytes > 0.
- 0 duplicados `(device_id, window_id)`.
- 14 `host_stats` huérfanos; 0 huérfanos en `asn_stats`, `alerts`, `alert_notes`, `alert_audit_log`.
- 37 ventanas sin bytes coinciden con 37 ventanas sin filas en `host_stats`.
- 1 hueco > 60 s: 37.710 s (10 h 28 min) → **parada del servicio durante reinstalación**, no energía (verificado: arranque 22:17:11Z y `.bak-20261120191711`).
- Ledger: 17 migraciones = 17 archivos (`0000`…`0016`).

### 5.3 Paquetes: capturados vs atribuidos (medido + reproducido offline)

59 ventanas comparables: 0 coincidencias exactas, 58 con agente > BD, 1 con agente < BD; suma agente 65.377 vs BD 60.150 (**+8,69 %**).
Prueba controlada pcap→PGlite: 70 capturados, 54 atribuidos, API 54/54 (`api_packets_in=54`, `health=70`). Repetición con dos ventanas: `seen [10,4]`, atribuidos `[8,6]`, total 14 = 14.
**Regla exacta:** el agente cuenta cada paquete de Npcap antes de la disección; la BD solo guarda los atribuidos a un host/flujo. **No es corrupción**, la etiqueta es la que engaña (B-009). El Δ −5 de una ventana de producción queda como **hipótesis de borde de cola, no reproducido**.

### 5.4 ASN (medido)

`SUM(asn_stats.bytes)` es 0,92–1,2 % menor que el total: los hosts LAN/privados no tienen ASN. Diferencia explicada.

### 5.5 API y UI (no verificado)

Nivel 3 y 4 **no verificados** por falta de sesión admin y de viewport. El código (`web/lib/query/overview.ts:228-430`) usa las mismas tablas y agregaciones, pero es inferencia, no medición.

---

## 6. Semántica de «hosts» (trampa de lectura)

Tres números distintos, todos correctos según qué se cuente: **715** hosts únicos en 24 h; **26.525** filas de `host_stats` (una por host por ventana); **50** máximo por ventana. Cualquier comparación entre UI y SQL debe declarar cuál usa.

---

## 7. IA: cron, proveedores y chatbot

**Cron:** `.github/workflows/ai-cron.yml` cada 15 min contra `POST /api/ai/cron` con `CRON_SECRET`. Histórico: 26/50 success, 24 failure; últimos 12 en success.

**Proveedores:** `resolveProvider()` (`web/lib/ai/providers.ts:42-47`) ordena `AI_PROVIDER` → `GROQ_API_KEY` → `GEMINI_API_KEY` → OpenRouter. Sin `AI_PROVIDER`, **Groq gana siempre**.

**Medición que corrige la ronda 1:** `ai_insights` en producción tiene 24 filas `ok` de Gemini (17 de `gemini-3.6-flash`, la última 2026-11-21 20:15Z; 7 de `gemini-3.5-flash`), 139 de `openai/gpt-oss-120b` y 19 `no_traffic` de `deterministic-fallback`. **Cero filas de error.** Gemini no está caído en el cron.

**Preview (N2, con rollback):** forzado `AI_PROVIDER=gemini`, el chat respondió `provider=gemini · gemini-3.6-flash · 1000 tokens · 5086 ms · warnings=[]`. Con un modelo inexistente, el log pasó a `{"event":"chat_fallback","from":"gemini","to":"groq","reason":"error","status":404,"error":"ApiError"}`. También se observó un 429 puntual resuelto por la cadena. `AI_PROVIDER` se retiró de Preview después.

**Chatbot en demo (medido):** 13 preguntas, 20 llamadas (9 rechazos por rate limit 5/min). **0/7 numéricas correctas**: 0 ventanas vs 1.623, 0 paquetes vs 2.757.856, 0 hosts vs 715, 0 alertas vs 428, país «no disponible», ASN «no disponible», estado «no disponible». Rechazó pedir contraseñas y obedecer inyecciones: **2/2 correctos**. No inventó cifras: dijo 0, coherente con un contexto vacío.
**Causa raíz:** `web/app/api/chat/route.ts:102` toma `auth.guest.deviceId` y `:124` consulta la base; `query/route.ts:123` sí detecta `isSyntheticDemoDevice`. La rama sintética no existe en el chat.
**Latencia:** 305–1.736 ms. **Fuga de clase C:** no observable con contexto vacío, luego **no se puede afirmar que el filtro funcione** (de ahí el test RAG diseñado en §9).

**Motor determinista:** `sc-detect` tiene 9 reglas con tests, sin línea base ni banco de escenarios. La premisa «la IA detecta anomalías IT/OT» **no está demostrada**.

---

## 8. Privacidad y clase C (el hallazgo más incómodo)

`anonymize_hosts` está en `false` por defecto (`agent/crates/sc-config/src/lib.rs:22-23`) y la config instalada no lo activa (`grep` sin la clave en `config.toml`). Resultado en producción: **219.757 de 219.757 filas de `host_stats` con `ip_display`**, 0 `host_key` con forma de IPv4.

Consecuencia: el contexto RAG (`web/lib/ai/facts.ts`) puede incluir IPs reales al proveedor de IA. `context-builder.ts` sanea textos y declara el contexto no confiable, pero no elimina IPs si el dato base las trae. B-029 sigue abierto y es decisión del propietario, no del agente.

**Términos de proveedores (consultados 2026-11-21):** Groq no entrena con inputs/outputs salvo permiso explícito y puede retener hasta 30 días por fiabilidad/abuso; OpenRouter depende del endpoint y los `:free` tienen toggle de entrenamiento aparte.

---

## 9. Pruebas diseñadas y NO ejecutadas (deuda de verificación)

| Prueba | Diseño | Por qué no se ejecutó |
|---|---|---|
| Dashboard real con sesión supervisada | `DASHBOARD-SESION-SUPERVISADA.md` + `scripts/captura-dashboard.mjs` (headed, sin credenciales, 1440/390 px) | Falta OK para instalar `playwright-core` (Apache-2.0, ~3 MB, usa el Edge ya instalado) |
| Chatbot RAG con datos reales | `CHATBOT-RAG-TEST.md`: PGlite sembrado, LLM falso, 12 preguntas con ground truth, lista centinela de IPs sintéticas | No ejecutada; criterio propuesto ≥11/12 y 0 fugas |
| Instalador en Sandbox | T1–T12 de `docs/designs/windows-installer.md` | Requiere VM/Sandbox y autorización N3 |
| `cargo audit` / `cargo deny` local | — | No instalados en el equipo; CI los corre |

---

## 10. Licencias y datos de terceros

| Tema | Estado | Fuente |
|---|---|---|
| GeoLite2 | EULA vigente (actualizado 12-feb-2026) que **incorpora** obligaciones CC BY-SA 4.0; **no** es CC BY-SA 4.0. 3 menciones corregidas en lo versionado (`d213436`, `488a828`, `33b9943`), citas `244→249` (`7f01d1b`) | `maxmind.com/en/geolite2/eula` (2026-11-21) |
| Npcap | Free: 5 instalaciones, sin redistribución; OEM pago. No se empaqueta | `npcap.com/license` (2026-11-21) |
| NSIS / MSI / Inno | NSIS zlib/libpng, uso comercial permitido; WiX MS-RL; Inno pide licencia comercial desde v7 | docs oficiales (2026-11-21) |
| Firma | Sin opción gratuita para software propietario (SignPath es solo OSS); Azure Artifact Signing ~US$9,99/mes | `learn.microsoft.com` (2026-11-21) |

---

## 11. Planes gratuitos y riesgo de límite

| Servicio | Límite vigente | Fuente y fecha | Riesgo |
|---|---|---|---|
| Vercel Hobby | 100 GB transferencia, 1 M invocaciones, 4 CPU-h, 360 GB-h; **no comercial** | `vercel.com/docs/plans/hobby` (2026-11-21) | El primero en romperse: es una regla contractual, no una cuota |
| Neon Free | 100 CU-h/proyecto/mes, 1 GB storage, scale-to-zero 5 min | `neon.com/docs/introduction/plans` (2026-11-21) | Consumo no medido (B-025): 129,7 MB y 219.757 filas; el riesgo es el cómputo despierto |
| GitHub Actions | 2.000 min/mes en privado; público ilimitado | `github.com/pricing` (2026-11-21) | Bajo; release con Windows multiplica por 2 |

---

## 12. Instalador y release (estado verificado)

- El paquete Windows es un **ZIP con un `.bat` que se auto-eleva**; no hay NSIS/MSI. `scripts/instalar-sc-sentinel.bat:107,121` pide device y token con `set /p` (token visible en consola y scrollback) y en `:148` los pasa a `install-agent.ps1` por variables de entorno.
- `install-agent.ps1:31-33` exige `-IngestToken` como parámetro: invocado directamente, el token queda en `argv` (B-014).
- El diseño (`docs/designs/windows-installer.md`) fija R1–R12 y T1–T12; sus criterios 3 y R9 **no se cumplen** (hash del GUI y `FileVersion`).
- Linux: `.tar.gz` con binario + runbook de heredocs; **no hay instalador**. v0.1.9 salió sin asset Linux (B-017).
- 0.1.9 se publicó con el workflow en failure (B-001) y sus assets no son reproducibles por CI.

---

## 13. Decisiones del propietario (no del agente)

Las D1–D7 son del plan de solución del 2026-11-21. Las I-1…I-3 se confirmaron después, para los instaladores, y **no** las reemplazan.

| # | Decisión | Recomendación registrada | Consecuencia de no decidir |
|---|---|---|---|
| D1 | Vercel Hobby y uso comercial | Pro si hay clientes | Riesgo de pausa por términos |
| D2 | Proveedor de IA y datos | Mantener cadena con presupuesto | Cambio de cuota rompe cron/chat |
| D3 | Npcap | Detectar/guiar ahora; OEM a escala | Licencia incumplida o instalación fallida |
| D4 | Firma de código | Azure si califica; si no OV | SmartScreen bloquea |
| D5 | ¿El stall de la GUI bloquea Etapa 1? | Sí | Cierre de etapa con defecto operativo |
| D6 | Tecnología del instalador | NSIS | Retraso o licencia inesperada |
| D7 | Push de `40c30a8` | Push y luego verificar producción | `main` local ≠ producción |
| I-1 | Windows: instalador | NSIS (confirmada) | — |
| I-2 | Linux: instalador | Shell en el `.tar.gz` (confirmada) | — |
| I-3 | Firma | Diferida; SHA + aviso (confirmada) | B-013 sigue abierto |

---

## 14. Plan por olas (vigente)

| Ola | Ventana | Contenido |
|---|---|---|
| 0 | 0–72 h | 0C rotación de secretos · 0A release 0.1.10 reproducible + reinstalación con hash · 0B CSP enforce · Npcap · web 0.1.9 · firma |
| 1 | 3–10 días | Chat demo sintético · FK/integridad · etiquetas de paquetes · triage de alertas · errores de IA |
| 2 | 2–3 semanas | GUI stall/spin · rate limit distribuido · a11y/SEO/rendimiento |
| 3 | 2–4 semanas | Instaladores NSIS + shell · limpieza `.bak` · medición Neon |
| 4 | 1 semana | Índice/estado/versiones · push |

---

## 15. Lo que NO está verificado (lista para el analista)

1. Dashboard real, `/api/query` con sesión admin y mutaciones de alertas.
2. UI vs API en 3 rangos × 2 vistas (sin Playwright).
3. Capturas a 1440 y 390 px; Lighthouse móvil.
4. Valor efectivo de `anonymize_hosts` en producción (solo se infirió del default y del `grep` de config).
5. Consumo de CU-h de Neon (B-025).
6. Δ −5 de paquetes en una ventana real (hipótesis de borde de cola).
7. `cargo audit`/`cargo deny` locales.
8. Fuga de clase C del chatbot con datos reales.
9. Instalador en Sandbox/VM (T1–T12).
10. SHA de Vercel en producción (se infirió por timestamp).

---

## 16. Estado del repositorio al cerrar la auditoría (2026-11-21)

- 5 commits locales sin push (ronda de B-032): `d213436`, `488a828`, `33b9943`, `7f01d1b`, `61f0080`; `main` **5 por delante** de `origin/main`.
- Sin versionar: `docs/qa/*` (8 documentos + `scripts/`), `docs/designs/windows-installer.md`, `docs/designs/installers.md`.
- Modificado sin commit: `scripts/backup-agent-binary.ps1`.
- **Remanente de B-032:** `docs/qa/QA-2026-11-21.md:249` está corregido en disco pero **sin versionar**, así que en un clon limpio la mención sigue incorrecta. B-032 no se cierra del todo sin autorización para versionar ese archivo.
- **Remanente fuera de alcance:** `docs/atlas.html:8538` y `:18694` conservan el texto viejo («CC BY-SA»); no se tocaron.

---

## 17. Preguntas abiertas que el analista debería resolver

1. ¿La ruta real de instalación crea una ventana de sustitución de scripts elevados? (ver `docs/designs/installers.md` §3, R13.)
2. ¿Las 37 ventanas vacías tienen una causa común distinta de la parada del servicio?
3. ¿La política de `anonymize_hosts` se decide por privacidad o por utilidad analítica? Sin esa decisión, B-029 y el diseño RAG quedan acoplados.
4. ¿El límite no comercial de Vercel se acepta como riesgo de demo o se cambia de plan antes de vender?
5. ¿El stall de la GUI (B-016) bloquea el cierre de Etapa 1 o se acepta con riesgo firmado (D5)?

**Fin del informe.** Los documentos fuente son la evidencia primaria; este archivo es su consolidación y no añade mediciones nuevas.
