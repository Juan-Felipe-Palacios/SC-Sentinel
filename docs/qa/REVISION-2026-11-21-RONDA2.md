# Revisión ronda 2 — auditoría SC-Sentinel (2026-11-21)

**Tipo:** la ronda 2 original fue **N0** (solo lectura). La corrección posterior del 2026-11-21 añade **N1** (test versionado y código de logging) y **N2** (deploy solo Preview, con rollback verificado). **No** hubo escritura en producción, ni rotación, ni deploy productivo, ni stop/start del servicio. Se usaron **2 lecturas con resultado** a Neon (producción y una rama de desarrollo), más 2 intentos rechazados por binding que no ejecutaron SQL. No se imprimieron valores de filas, IPs, tokens ni secretos.

**Objeto:** cerrar los puntos que quedaron abiertos en la ronda 1: rotación de secretos, causa real de Gemini, efecto de `anonymize_hosts`, semántica de paquetes, hueco de continuidad, prioridad, licencias MaxMind, procedimiento de dashboard y diseño de la prueba RAG.

---

## 1. Corrección de método: había dos bases

`.env.local` apunta a `ep-snowy-mode-bddrm1u4-pooler…` (desarrollo) y `.env.production.local` a `ep-delicate-rain-bd5f9ebg-pooler…` (producción). La primera consulta devolvió 36 filas de `host_stats` y 2 `ai_insights`, cifras incompatibles con producción. **Toda cifra de esta adenda sale de `.env.production.local`.** La consulta de desarrollo se descarta.

| Fuente | `host_stats` | `ai_insights` | Veredicto |
|---|---:|---:|---|
| `web/.env.local` (dev) | 36 | 2 | No usar |
| `web/.env.production.local` | **219.757** | **198** | Fuente de esta adenda |

---

## 2. Rotación de secretos — B-028 (Alta)

**Estado:** no hay evidencia de rotación. `docs/ESTADO-2026-11-20.md` §6.1 lo declara y el repositorio no contiene fecha, commit ni log de rotación. La auditoría de seguridad declara corregidos H1–H7, pero no rotó credenciales.

| Secreto | Dónde vive | Por qué rotar | Efecto de rotar |
|---|---|---|---|
| Token de dispositivo (ingesta) | hash en `devices.token_hash`; token en el agente | Es la credencial de escritura de ingesta | El agente deja de ingestar hasta actualizar su configuración; rotar desde el dashboard |
| `DATABASE_URL` | Vercel/Neon | Acceso total a la base | Reinicio de funciones; actualizar también cualquier script/CI que la use |
| `ADMIN_SECRET` | Vercel | Firma de sesión admin | Cierra todas las sesiones admin |
| `SC_SESSION_SECRET` | Vercel | Firma de sesión | Cierra sesiones; verificar que no comparta valor con `ADMIN_SECRET` |
| `CRON_SECRET` | Vercel + GitHub Actions | Autoriza `/api/ai/cron` | Actualizar el secret `x-cron-secret` del workflow `ai-cron.yml` |
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | Vercel | Cuota/coste y acceso al proveedor | Revocar la clave vieja en AI Studio |
| `OPENROUTER_API_KEY` | Vercel | Ídem | Revocar en OpenRouter |
| `GROQ_API_KEY` | Vercel | Ídem | Revocar en Groq |
| `TRUST_ALERT_WEBHOOK_URL` | Vercel | URL capaz de publicar en el canal | Regenerar el webhook y revocar el anterior |
| `SC_HMAC_KEY` / `.host-key` | Agente | HMAC de `host_key` | **Rompe la continuidad histórica**: los mismos hosts cambian de clave. Rotar solo con ventana de corte documentada |
| `VERCEL_OIDC_TOKEN` | `web/.env.local` | Token efímero local | Borrar tras la rotación; no es un secreto de producción |

**Severidad Alta, no Crítica:** no hay evidencia de filtración; el riesgo es de exposición latente y de imposibilidad de revocar ante incidente. Pasa a Crítico si aparece una filtración confirmada.

**Arreglo:** Ola 0C, ejecutada por el propietario, en este orden: (1) crear credenciales nuevas, (2) desplegar con las nuevas, (3) verificar ingesta/cron/chat, (4) revocar las viejas, (5) registrar fecha y operador. No imprimir valores; usar la consola de cada proveedor.

---

## 3. Gemini en el chat — B-030 (Media) y B-031 (Media)

### 3.1 Lo que dice la base

`ai_insights` en producción, por modelo y estado (solo conteos):

| Modelo | Estado | Filas | Con `status_code` | Primera | Última |
|---|---|---:|---:|---|---|
| `openai/gpt-oss-120b` | ok | 139 | 139 | 2026-11-17 | 2026-11-21 19:45Z |
| `deterministic-fallback` | no_traffic | 19 | 0 | 2026-11-17 | 2026-11-17 |
| `gemini-3.6-flash` | ok | **17** | 17 | 2026-11-18 | **2026-11-21 20:15Z** |
| `gemini-3.5-flash` | ok | **7** | 7 | 2026-11-18 | 2026-11-21 13:46Z |
| resto de modelos `:free` | ok | 16 | 16 | 2026-11-18 | 2026-11-21 |

**No hay una sola fila de error** (`status` solo `ok`/`no_traffic`). Gemini respondió **24 veces** en el cron, la última el mismo día de esta revisión. Por tanto, **Gemini no está caído globalmente**.

### 3.2 Lo que dice el endpoint del chat

`POST /api/chat` con cookie guest, una pregunta:

```
event: done
{"conversationId":null,"model":"openai/gpt-oss-120b","provider":"groq",
 "tokensUsed":621,"executionTimeMs":852,"warnings":[]}
```

No hubo evento `error`. El endpoint respondió **desde Groq**, no desde Gemini.

### 3.3 Causa

`resolveProvider()` en `web/lib/ai/providers.ts:42-47` elige el primario en este orden: `AI_PROVIDER` explícito → `GROQ_API_KEY` → `GEMINI_API_KEY` → OpenRouter. Sin `AI_PROVIDER`, con las dos claves cargadas, **Groq siempre gana**. El chat nunca intenta Gemini; no hay error de Gemini que capturar.

- **B-030:** el chat no usa Gemini por el orden de resolución; la cadena de respaldo sí lo incluiría si Groq fallara. Severidad Media: no rompe la respuesta, pero oculta el proveedor real y contradice la expectativa operativa.
- **B-031:** el fallback del chat no persistía el `status` del proveedor. `web/lib/chat/llm.ts:416-455` solo emitía `chat_fallback` con `reason` agregado y `web/app/api/chat/route.ts:274` registraba `chat_stream_failed` solo con `code`. **Corregido en N1** (ver §3.4): ambos logs incluyen `status` y `error`, y el helper `describeChatFailure()` extrae el status también de errores de SDK que no son `ChatLlmError` (el `ApiError` de Gemini lo expone en `code`). Severidad Media (observabilidad); queda pendiente de release a producción.

**Dato que faltaba:** ejecutar en Preview con `AI_PROVIDER=gemini`. **Ya se midió** (§3.4): Gemini responde y, cuando se fuerza, también puede devolver 429 y caer a Groq.

### 3.4 Experimento en Preview (2026-11-21, N2)

Tres deployments de Preview, nunca producción:

1. **Preview A** con `AI_PROVIDER=gemini` de proyecto. El chat cayó a Groq y el log mostró `chat_fallback` `gemini → groq`, `reason=rate_limited`, `error=ApiError`, **sin `status`**: el `ApiError` de Gemini no es un `ChatLlmError` y el logging anterior no lo cubría. Gemini no estaba caído: estaba limitado por cuota en ese intento.
2. **Preview B** con `AI_PROVIDER=gemini` acotado al deployment. El chat respondió:

```
provider=gemini · model=gemini-3.6-flash · tokensUsed=1000 · executionTimeMs=5086 · warnings=[]
```

3. **Preview C** con `AI_MODELS=gemini-modelo-inexistente` y el código nuevo, para forzar un error y verificar el `status` en el log:

```
{"event":"chat_fallback","from":"gemini","to":"groq","reason":"error","status":404,"error":"ApiError"}
```

**Resultado:** Gemini **no falla de forma global**; el chat simplemente no lo intentaba. Forzado, respondió en 5,1 s y también se observó un 429 puntual que la cadena resolvió con Groq. El `status` ya queda consultable en `chat_fallback`/`chat_stream_failed` para errores de Gemini, Groq y OpenRouter.

**Rollback:** `AI_PROVIDER` se retiró de Preview y `vercel env ls --environment preview` ya no lo lista. Los `AI_PROVIDER`/`AI_MODELS` acotados a los deployments B y C desaparecen con esos deployments; no se tocó producción ni se rotaron claves.

### 3.5 Documentación oficial de proveedores (consultada 2026-11-21)

| Proveedor | Plan gratuito: entrenamiento | Retención | Fuente |
|---|---|---|---|
| Groq | **No entrena** con inputs/outputs salvo permiso explícito | Por defecto no retiene inferencias; puede registrar hasta 30 días por fiabilidad/abuso; ZDR disponible. La página no distingue plan free: aplica a GroqCloud | `console.groq.com/docs/your-data`; `console.groq.com/docs/legal/services-agreement`; `trust.groq.com/faq` |
| OpenRouter | Depende del endpoint; para `:free` hay un toggle separado de entrenamiento. Si se opta por no entrenar, no enruta a proveedores que entrenan | OpenRouter no guarda prompts salvo opt-in o revisión CSAM; cada proveedor tiene su retención | `openrouter.ai/docs/guides/privacy/provider-logging`; `openrouter.ai/docs/guides/privacy/data-collection`; `openrouter.ai/terms` |

**Implicación:** el cron manda facts agregados (no paquetes crudos) a Groq/Gemini; el chat manda el contexto RAG, que puede incluir `host_key`, país y métricas. Con `anonymize_hosts=false` ese contexto puede incluir IPs (ver §4). Es una transferencia de clase C a un tercero; debe decidirse y documentarse, no quedar implícita.

---

## 4. `anonymize_hosts` y clase C — B-029 (Alta)

Conteos de producción sobre toda la tabla `host_stats`:

| Comprobación | Filas |
|---|---:|
| Total | 219.757 |
| `ip_display IS NOT NULL` | **219.757 (100 %)** |
| `host_key` con forma IPv4 | **0** |
| `host_key` con forma HMAC (32–64 hex) | 219.757 (100 %) |
| `host_key` distintos | 4.607 |

La configuración instalada **no contiene `[privacy]` ni `anonymize_hosts`**. El valor por defecto es `false` (`agent/crates/sc-config/src/lib.rs:22-23`), y `ip_display()` devuelve la IP legible cuando es `false` (`accumulator.rs:338-345`).

**Efecto real:** `anonymize_hosts=false` ⇒ la nube recibe y guarda la IP en `ip_display` para el 100 % de las filas. `host_key` es HMAC en ambos modos; activar la anonimización **no cambia `host_key`**, solo pone `ip_display=null`. Los históricos ya guardados conservan la IP hasta que los borre la retención (7 días).

**Severidad Alta:** no es una fuga por un bug, pero es tratamiento de clase C en producción sin una decisión de privacidad explícita y sin control por defecto. Si el propietario declara que la IP es necesaria para operar, hay que documentarlo; si no, activar `anonymize_hosts=true` y aceptar la pérdida de identificación visual.

**Prueba que falta:** activar en un agente de pruebas, ingerir una ventana y verificar `ip_display=null` en el 100 % de `host_stats` y que el panel muestra solo `host_key`. No se ejecutó (N0).

---

## 5. Paquetes: capturados vs atribuidos — B-009

### 5.1 Prueba controlada ejecutada

Se generó un pcap sintético de **70 paquetes**: 4 salientes a un host remoto, 2 entrantes de otro, 60 salientes a 60 hosts distintos y 4 ARP (no IP). Se parseó, se aplicó la regla de atribución (peer remoto, top 50 por bytes) y se persistió una ventana por el camino real `buildPersistStatements → PGlite → queryOverview`.

Salida real del test:

```
{"pcap_packets":70,"non_ip":4,"ip_packets":66,"remote_hosts":62,
 "top_hosts":50,"attributed_packets":54,"unattributed":16,
 "api_packets_in":54,"api_packets_out":54,"health_packets_seen":70}
```

| Métrica | Valor |
|---|---:|
| Paquetes en el pcap | 70 |
| No IP (ARP) | 4 |
| IP parseados | 66 |
| Hosts remotos distintos | 62 |
| Filas en `host_stats` (top 50) | 50 |
| Paquetes atribuidos | **54** |
| No atribuidos | **16** (4 no IP + 12 hosts fuera del top 50) |
| `packets_in` / `packets_out` de `/api/query` | **54 / 54** |
| `packets_seen` del agente | **70** |

El test pasó (`1 passed`). Aquella prueba se ejecutó desde un archivo temporal y se borró; **no quedó versionada**. Verificó la regla de atribución dentro de una ventana, **no** el camino live de Neon ni el Δ de producción.

### 5.2 Regla exacta

1. **Capturado** (`packets_seen`): cada paquete que Npcap entrega tras el filtro BPF `ip or ip6`, incrementado en el hilo de captura **antes** de parsear y atribuir (`agent/crates/sc-capture/src/live.rs:87`). No cuenta ARP ni otro tráfico no IP.
2. **Atribuido** (`host_stats.packets`): paquetes de flujos parseados cuyo **extremo remoto** (src entrante / dst saliente) entra en el **top 50 por bytes** de esa ventana de 30 s (`accumulator.rs:267-290`, `snapshot.rs:21`, `window.rs:97`). El extremo local va a `local_hosts` para detección, **no** a `host_stats`.
3. **No atribuido**: paquetes no IP (no llegan al contador live), flujos no parseables, y todo host remoto fuera del top 50. En una ventana con más de 50 hosts, el excedente se pierde para el dashboard aunque el agente lo haya capturado.

**La UI muestra atribuidos, no capturados:** `OverviewView.tsx:205` usa `totals.packets_in`, y `overview.ts:443-445` asigna el mismo `SUM(host_stats.packets)` a `packets_in` y `packets_out`. La etiqueta «PAQUETES TOTALES» es incorrecta.

### 5.3 La ventana con Δ −5 (producción)

En la reconciliación de 59 ventanas, 58 tenían agente > BD; **una** tenía BD 5 paquetes por encima del agente. No es corrupción.

**La regla de atribución queda verificada offline (PGlite, una ventana). El Δ −5 de producción es consistente con el corte por timestamp (captura vs flujo) leído en código, pero NO reproducido; es hipótesis hasta la reproducción de dos ventanas.**

Mecanismo leído, no medido contra producción: `packets_seen` se incrementa al capturar (`agent/crates/sc-capture/src/live.rs:87`), pero la ventana se cierra por reloj (`agent/crates/sc-aggregate/src/window.rs:150-205`) y los updates que quedan en la cola se drenan en la ventana siguiente. En el borde eso produce **déficit en N y superávit en N+1**, no un ± simétrico. El otro 58/59 (agente > BD) **no** se explica por este borde y sigue sin medirse: candidatos no verificados son paquetes no parseables, drops de cola y hosts fuera del top 50.

### 5.4 Reproducción de dos ventanas (offline, 2026-11-21)

Prueba versionada: `web/lib/ingest/__tests__/window-boundary.integration.test.ts`. Genera un pcap sintético (cabecera clásica, Ethernet + IPv4 + TCP) con 14 paquetes: 10 capturados en la ventana 0 y 4 en la 1; de los 10 de la ventana 0, **2 quedan en cola** y se drenan en la 1. Persiste ambas ventanas por `buildPersistStatements → PGlite → queryOverview` con las migraciones reales.

Salida literal:

```
{"event":"window_boundary_reproduction","packets":14,"seen":[10,4],
 "attributed":[8,6],"crossing":2,"delta_by_window":[2,2],
 "totals":{"seen":14,"attributed":14}}
```

Comando: `cd web && pnpm exec vitest run lib/ingest/__tests__/window-boundary.integration.test.ts` → `1 passed`.

**Veredicto:** la hipótesis del borde de cola queda **confirmada para el mecanismo controlado** (2 paquetes que cruzan → 2 de déficit en N y 2 de superávit en N+1; total conservado). **No** queda confirmado el Δ −5 real: la prueba no usa el path live ni tráfico concurrente, y no explica las 58 ventanas con agente > BD. La igualdad global `Σ seen − Σ atribuidos` es 0 por conservación; la aserción útil es **por ventana**, y así se implementó.

---

## 6. Hueco de 10 h 28 min — B-008 (Medio)

**Franja:** termina en el arranque del servicio actual, `2026-11-20 22:17:11Z` (19:17:11 local). Restando 37.710 s, empieza en `2026-11-20 11:48:41Z` (08:48:41 local).

Evidencia:

| Comprobación | Resultado |
|---|---|
| Reinicio del equipo | **No**: `LastBootUpTime = 2026-11-15 12:30:29` |
| Kernel-Power 41/42/107/109 (apagado/suspensión/reanudación) | **0 eventos** en la franja |
| `powercfg /lastwake` | «Recuento de origen de activación: 0» |
| Kernel-Power 566 (cambio de sesión) | Presentes durante toda la franja (12:25Z–20:14Z), equipo activo |
| Servicio | `sc-sentinel-agent.exe` PID 13572, `CreationDate = 2026-11-20 19:17:11 local` |
| `.bak` de despliegue | `sc-sentinel-agent.exe.bak-20261120191711`, misma marca que el arranque |

**Causa más probable, consistente con toda la evidencia:** no fue suspensión, apagado ni reinicio. El agente estuvo **parado durante una reinstalación/despliegue** y volvió a arrancar a las 19:17 local; el hueco es una interrupción operativa del servicio, no un fallo de energía. **Limitación:** no queda un evento 7036 de parada en el log retenido, así que la parada exacta se infiere del final del hueco y del arranque del proceso, no se observó directamente.

**Recomendación para B-008:** el agente debe correr en un **host always-on** (mini-PC/NUC, servidor o VM) cerca del punto de captura, con Ethernet, sin suspensión, con arranque automático y watchdog. No debe depender de una laptop de trabajo. Instrumentar `service_started_at`, `service_stopped_at` y motivo; mostrar «sin datos por mantenimiento» en la UI; hacer las reinstalaciones en ventana acordada.

---

## 7. Prioridad v2 y renumeración

**Fórmula:** primero **severidad** (Crítico → Alto → Medio → Bajo). Dentro de cada severidad: `Prioridad = (Probabilidad × Impacto) ÷ Esfuerzo`, con P/I/E en 1–3. Impacto: 1 bajo, 2 medio, 3 alto. Esfuerzo: S=1, M=2, L=3. A igual puntaje se ordena seguridad y datos primero.

**Reglas de esta tabla:** los **ID B-xxx son inmutables**; solo cambia el orden de presentación (`Nº`). P, I y E se publican para que cualquiera reproduzca el orden. La columna **Prov.** marca una severidad provisional o contingente, no un valor definitivo.

| Nº | ID | Sev. | Prov. | P | I | E | Prioridad | Acción |
|---:|---|---|---|---:|---:|---:|---:|---|
| 1 | B-001 | Alto | — | 3 | 3 | 1 | 9,00 | Release 0.1.10 por CI |
| 2 | B-002 | Alto | — | 3 | 3 | 1 | 9,00 | Hash del GUI y reinstalación |
| 3 | B-028 | Alto | — | 3 | 3 | 2 | 4,50 | Rotar secretos (0C) |
| 4 | B-029 | Alto | — | 3 | 3 | 2 | 4,50 | Decidir/activar anonimización |
| 5 | B-003 | Alto | — | 3 | 3 | 2 | 4,50 | Chat demo sintético |
| 6 | B-004 | Alto | — | 3 | 3 | 2 | 4,50 | Npcap OEM o guía |
| 7 | B-016 | Alto | — | 3 | 3 | 3 | 3,00 | Stall/spin GUI |
| 8 | B-025 | Alto | **Sí: provisional hasta medir Neon** | 2 | 3 | 3 | 2,00 | Medir Neon 7 días |
| 9 | B-005 | Medio | — | 3 | 2 | 1 | 6,00 | Anunciar versión |
| 10 | B-006 | Medio | **Sí: contingente a que `X-Frame-Options: DENY` siga desplegado** | 3 | 2 | 1 | 6,00 | CSP enforce |
| 11 | B-009 | Medio | — | 3 | 2 | 1 | 6,00 | Etiquetar paquetes |
| 12 | B-010 | Medio | — | 3 | 2 | 1 | 6,00 | Triage de alertas |
| 13 | B-017 | Medio | — | 3 | 2 | 1 | 6,00 | Linux en release |
| 14 | B-018 | Medio | — | 3 | 2 | 1 | 6,00 | Índice de docs |
| 15 | B-022 | Medio | — | 3 | 2 | 1 | 6,00 | Estado de carga |
| 16 | B-030 | Medio | — | 3 | 2 | 1 | 6,00 | Fijar proveedor del chat |
| 17 | B-013 | Medio | — | 3 | 3 | 2 | 4,50 | Firma de código |
| 18 | B-014 | Medio | — | 2 | 2 | 1 | 4,00 | Token fuera de argv |
| 19 | B-031 | Medio | — | 2 | 2 | 1 | 4,00 | Persistir error de chat |
| 20 | B-007 | Medio | — | 3 | 2 | 2 | 3,00 | FK/limpieza |
| 21 | B-008 | Medio | — | 2 | 3 | 2 | 3,00 | Host always-on + motivo |
| 22 | B-012 | Medio | — | 3 | 3 | 3 | 3,00 | Rate limit global |
| 23 | B-011 | Medio | — | 2 | 2 | 2 | 2,00 | Estado de error IA |
| 24 | B-024 | Medio | — | 2 | 2 | 2 | 2,00 | Long task landing |
| 25 | B-015 | Medio | — | 2 | 2 | 2 | 2,00 | Separar modos Npcap |
| 26 | B-032 | Bajo | — | 2 | 2 | 1 | 4,00 | Corregir CC BY-SA |
| 27 | B-019 | Bajo | — | 3 | 1 | 1 | 3,00 | Meta description |
| 28 | B-020 | Bajo | — | 3 | 1 | 1 | 3,00 | A11y label |
| 29 | B-021 | Bajo | — | 3 | 1 | 1 | 3,00 | Enlaces en login |
| 30 | B-023 | Bajo | — | 3 | 1 | 1 | 3,00 | Plural |
| 31 | B-026 | Bajo | — | 3 | 1 | 1 | 3,00 | Limpiar `.bak` |
| 32 | B-027 | Bajo | — | 3 | 1 | 1 | 3,00 | Push/revert docs |

**Conteo v2 (cuadra con el registro, 32 IDs):**

| Severidad | Total | IDs |
|---|---:|---|
| Crítico | 0 | — |
| Alto | **8** | B-001, B-002, B-028, B-029, B-003, B-004, B-016, B-025 |
| Medio | 17 | B-005, B-006, B-009, B-010, B-017, B-018, B-022, B-030, B-013, B-014, B-031, B-007, B-008, B-012, B-011, B-024, B-015 |
| Bajo | 7 | B-032, B-019, B-020, B-021, B-023, B-026, B-027 |
| **Total** | **32** | 0 + 8 + 17 + 7 |

**Flags que condicionan el veredicto:**

- **B-025 (Alto provisional):** se sostiene hasta medir CU-horas de Neon con la retención actual. Si la medición de 7 días queda por debajo del 70 % del plan, baja a Medio con el número medido; no se rebaja por estimación.
- **B-006 (Medio contingente):** el «no hay clickjacking abierto» lo sostiene **`X-Frame-Options: DENY` desplegado**, no la CSP, que sigue en **Report-Only**. Si XFO deja de servirse, B-006 sube a Alto aunque la CSP siga presente. H7 permanece abierto hasta el enforce de `script-src`.

### 7.1 B-006 frente a H7

H7 era **Alta** porque el sitio no tenía **ninguna** cabecera: ni CSP, ni `X-Frame-Options`, ni HSTS, ni `nosniff`; el clickjacking sobre acciones admin era directo. B-006 es **Media** porque hoy sí existen `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy` (`web/lib/security/headers.ts:60-77`), y la CSP con nonce se emite aunque sea Report-Only. Lo que falta es **bloquear** `script-src`; es defensa en profundidad ante XSS, no una exposición abierta. Se mantiene Media, no Alta, salvo que aparezca un XSS explotable.

---

## 8. MaxMind y CC BY-SA — B-032 (Bajo)

Menciones encontradas:

| Archivo:línea | Texto | Veredicto |
|---|---|---|
| `docs/legal/THIRD_PARTY_NOTICES.md:17` | «CC BY-SA 4.0 + condiciones especiales del EULA» | **Incorrecto**: la licencia vigente es el EULA |
| `docs/qa/QA-2026-11-21.md:244` | «EULA CC BY-SA 4.0 + condiciones» | **Incorrecto** |
| `docs/superpowers/plans/2026-11-03-m0-scaffold-ci.md:837` | «licencias CC BY-SA y EULA» | **Ambiguo**: sugiere que ambas aplican |
| `docs/legal/maxmind-notice.md:27-28` | «EULA, no CC BY-SA 4.0 (que corresponde a versiones anteriores a dic-2019)» | Correcto |
| `agent/resources/geolite2/README.md:7-8` | «EULA, no CC BY-SA 4.0» | Correcto |
| `web/app/(marketing)/legal/third-party-notices/page.tsx:115` | «La licencia vigente es el EULA… CC BY-SA corresponde a versiones anteriores» | Correcto |

**Fuente oficial:** EULA de GeoLite2, actualizado el **12-feb-2026**, `https://www.maxmind.com/en/geolite2/eula` (consultado 2026-11-21). El EULA **incorpora elementos** de CC BY-SA 4.0 (atribución y compartir-igual), pero no es «CC BY-SA 4.0». La formulación correcta es: «GeoLite EULA (incorpora obligaciones de atribución de CC BY-SA 4.0)». Corregir las tres menciones al tocar documentación; no es un cambio de licencia.

---

## 9. Dashboard real: procedimiento y herramienta (sin instalar)

Objetivo: una sesión **supervisada** donde el propietario inicia sesión; el agente no recibe ni escribe credenciales.

- **Herramienta:** `playwright-core` (Apache-2.0), que usa el Edge/Chrome ya instalado y **no descarga navegadores**. Tamaño del paquete npm ≈ 3 MB; se instalaría en `web/node_modules` (con `pnpm add -D playwright-core`), sin tocar `%LOCALAPPDATA%\ms-playwright`. Alternativa `playwright` completo: Apache-2.0, descarga Chromium ≈ 170 MB en `%LOCALAPPDATA%\ms-playwright`; no se recomienda para una sola sesión.
- **Requisito:** OK del propietario antes de instalar. No se instaló nada.
- **Procedimiento:** `docs/qa/DASHBOARD-SESION-SUPERVISADA.md`.
- **Script:** `docs/qa/scripts/captura-dashboard.mjs` (no ejecutado).

El script abre Edge en modo headed, espera a que el propietario complete el login, y solo entonces recorre `/dashboard/overview`, `/dashboard/hosts`, `/dashboard/alerts` y `/dashboard/ai` a 1440 y 390 px. Guarda capturas y un JSON de texto visible en `docs/evidence/dashboard-<fecha>/` (ignorado por git). No introduce credenciales; la sesión vive en el perfil temporal del navegador.

---

## 10. Chatbot con datos reales: diseño de la prueba RAG

No se ejecutó contra producción. Diseño completo en `docs/qa/CHATBOT-RAG-TEST.md`.

Resumen:

1. Sembrar PGlite con el dataset sintético de `web/lib/demo/synthetic.ts` bajo `dev_chat_test`.
2. Llamar al camino real: `fetchChatContext` → `buildLlmMessages` → `validateChatAnswer`, con un LLM falso que devuelve los facts (sin proveedor externo).
3. 12 preguntas con ground truth exacto (ventanas, bytes, hosts, alertas, país, ASN, puerto).
4. **Detección de fuga clase C:** lista centinela de IPs sintéticas (`192.0.2.10`, `198.51.100.23`, etc.) y regex IPv4/IPv6; fallar si aparecen en el prompt, en `sources` o en la respuesta cuando `anonymize=true`.
5. Repetir con `anonymize=false` para comprobar que la fuga es detectable y que el test no da falsos negativos.
6. Criterio: ≥11/12 exactitud numérica y 0 fugas.

---

## 11. `git show --stat 40c30a8` y push

```
40c30a8 docs: snapshot de estado Fase 0 y diagramas del mapa SC-Sentinel
 docs/ESTADO-2026-11-20.md                   |  449 ++++++++
 docs/diagrams/sc-sentinel-mapa-completo.svg |  273 +++++
 docs/diagrams/sc-sentinel-mapa.excalidraw   | 1644 +++++++++++++++++++++++++++
 docs/diagrams/sc-sentinel-mapa.svg          |  124 ++
 4 files changed, 2490 insertions(+)
```

- **Contenido:** solo documentación y diagramas; no toca `web/`, `agent/`, workflows ni contratos.
- **¿Dispara compilación innecesaria?** **No.** `web.yml` solo corre con `web/**`; `rust.yml` con `agent/**`; `contracts.yml` con `docs/contracts/**`, `web/lib/**` o `scripts/**`; `skills.yml` con `.agents/**`. `release.yml` solo con tags `v*` o dispatch. Un push de este commit no compila.
- **Riesgo:** publica el snapshot de estado (incluye prefijos de device y hashes, no secretos). Decisión D7 sigue siendo del propietario.

---

## 11.1 Deuda triada (para no dejarla fuera del registro)

| Punto de la deuda | ¿Bache? | Decisión |
|---|---|---|
| SYNC-30 / ingesta por lotes | No | Es una feature del roadmap, no un defecto; no se promueve a bache |
| PR #8 / Analytics | No | Ya cerrado; era dependencia de CSP, no un hallazgo abierto |
| Prerrequisitos M6 | No | Es una puerta de proceso; se resuelve al abrir Etapa 2 |
| Vercel Hobby no comercial | Decisión D1 | Riesgo contractual, no bug de código; sigue en decisiones del propietario |
| Borrar `.env.production.local` | Sí, dentro de B-028 | Paso 7 de la rotación |
| `VERCEL_OIDC_TOKEN` local | Sí, dentro de B-028 | Token efímero; borrar tras rotar |
| Rotación del token de dispositivo | Sí, dentro de B-028 | Se rota desde el dashboard; el agente debe actualizarse |
| Tests del instalador en Sandbox | No | Requiere VM y autorización; está en el diseño del instalador |
| Issue #10 (GUI) | Sí, B-016 | Sigue Alto; no se duplica |
| Rate limit M4 | Sí, B-012 | Sigue Medio; no se duplica |

---

## 12. Tabla hecho / no hecho / no verificado

| Punto | Estado | Comando / salida |
|---|---|---|
| Rotación de secretos | **No hecha** | `docs/ESTADO-2026-11-20.md` §6.1; sin evidencia en repo |
| Gemini en cron | **Hecho** | SQL producción: 17 + 7 filas `ok`, última 2026-11-21 20:15Z |
| Gemini en chat (antes) | **Hecho (no se intentaba)** | `POST /api/chat` → `provider=groq`, `model=openai/gpt-oss-120b`; `providers.ts:42-47` |
| Gemini forzado en Preview | **Hecho (responde)** | `provider=gemini`, `gemini-3.6-flash`, 1000 tokens, 5086 ms, `warnings=[]` |
| Status del proveedor | **Hecho en Preview** | `chat_fallback` → `status=404`, `error=ApiError`; test unitario del mapeo 429/404 |
| Rollback de Preview | **Hecho** | `AI_PROVIDER` ya no está en `vercel env ls --environment preview` |
| Clase C en `host_stats` | **Hecho** | 219.757 filas, 219.757 con IP, 0 `host_key` IPv4, 4.607 hosts |
| Config `anonymize_hosts` | **Hecho (ausente)** | `grep` en `config.toml`: sin clave; default `false` |
| Prueba pcap/PGlite (una ventana) | **Hecho (1 passed)** | 70 → 54 atribuidos; `api_packets_in=54`, `health=70`; no prueba live ni producción |
| Reproducción dos ventanas | **Hecho (1 passed)** | `seen [10,4]`, atribuidos `[8,6]`, 2 cruzan, total 14 = 14 |
| Δ −5 de producción | **Hipótesis, no reproducido** | Borde de cola confirmado offline; −5 real no medido (ver §5.3) |
| Hueco 10 h 28 min | **Hecho** | Sin 41/42/107/109; servicio arrancó 2026-11-20 22:17:11Z; `.bak-20261120191711` |
| B-025 | **Alto hasta medir** | Consumo Neon no medido; 219.757 filas / ~130 MB |
| Prioridad v2 | **Hecho** | Este documento §7 |
| B-006 vs H7 | **Justificado** | Cabeceras presentes; falta enforce |
| CC BY-SA | **Hecho** | 3 menciones incorrectas/ambiguas; EULA 12-feb-2026 |
| Dashboard real | **No hecho** | Requiere OK para instalar `playwright-core` |
| Chatbot RAG | **Diseñado, no ejecutado** | `CHATBOT-RAG-TEST.md` |
| Push 40c30a8 | **No hecho** | Sin CI por paths; decisión D7 |
| Escritura en producción | **No se hizo** | Solo lecturas y un chat guest |
| Servicio del agente | **No se tocó** | Sin stop/start/reinstall |

**PARADA.** No se corrigió nada. La rotación, el enforce de CSP, la reinstalación y el dashboard quedan a autorización del propietario (N1–N4).
