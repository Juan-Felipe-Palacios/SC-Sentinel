# Roadmap SC-Sentinel — decisiones del propietario (2026-11-15, actualizado 2026-11-25)

> Documento de planificación. **Solo documentación**: no cambia código, contratos ni
> despliegues. Las piezas citadas son el estado del árbol actual; las líneas pueden
> moverse con refactors futuros, pero los símbolos y rutas se mantienen como ancla.
>
> Fecha de redacción de esta versión: 2026-11-15. Los límites de proveedores se
> verificaron en las URLs indicadas en §7.
>
> **Actualización 2026-11-26:** se agrega D7 (renombre del id de cruce IT→OT).
>
> **Actualización 2026-11-25:** se agrega D6 (M6 OT aprobado, F1 OT en allowlist).
> Las etiquetas M6/M7/M8 de §5 se mantienen.

## 1. Decisiones cerradas por el propietario

| # | Decisión | Consecuencia directa |
|---|----------|----------------------|
| D1 | **Sync a la nube cada 30 minutos** (no cada ventana de 30 s). | Con una ventana por petición, cada sync drena hasta ~60 ventanas → ~60 requests; ~48 syncs/día → hasta ~2.900 requests/día por device. El spool local sigue siendo la fuente de verdad entre syncs. |
| D2 | **Sin Resend ni email.** Las alertas salen por **webhook** (Slack, Discord o URL propia). | No se agregan proveedores de email; se reutiliza el patrón log + POST opcional ya existente. |
| D3 | **Sin exportar PCAP.** El replay queda como herramienta interna de pruebas. | No se expone descarga de capturas en dashboard ni API pública; las fixtures de `docs/testing/fixtures/` siguen siendo internas. |
| D4 | **Fuera del roadmap**: multi-tenant, macOS y móvil. | Single-device/Windows-first; sin abstracciones de tenant ni targets Apple/iOS/Android. |
| D5 | **`flush_on_critical_alert` activado por defecto.** | Un evento crítico dispara un sync fuera de ciclo. Costo marginal (1-5 requests/día por device). |
| D7 | **Renombre del id de cruce IT→OT decidido (2026-11-26):** `ot_ot_in_it_zone` pasa a **`ot_it_zone_crossing`** antes de que el id entre en `alerts`. | Cierra el gate pendiente de `docs/OT/plan-implementacion.md` §6. Hoy no hay ninguna referencia al id en código (`grep -rn ot_ot_in_it_zone` sin coincidencias en `agent/`), así que el renombre es de nomenclatura futura: E6 no emite ese id y las reglas que lo emitan deben nacer con el nombre nuevo. |
| D6 | **M6 OT aprobado (2026-11-25)**: identificación pasiva de Modbus TCP, S7comm, DNP3 e IEC 60870-5-104 como hito nuevo, con **F1 OT en allowlist + descubrimiento manual**; baseline automático diferido a F1.5/F2, condicionado a un piloto OT real. | Desbloquea E2.0–E10 por etapas: E2.0 → E2 → checkpoint → E3–E10. La aprobación no autoriza ejecución (AGENTS §3.2). `ot_new_master` evalúa allowlist; `baseline_*` en `disabled`/null; la evidencia usa `allowlist_version`. P11 (licencia DEFCON) y P12 (piso Neon) siguen pendientes y no bloquean E2.0. |

## 2. SYNC-30 — Sync cada 30 minutos

### 2.1 Objetivo

Pasar de un sync casi continuo (1 s de ticker, lotes de hasta 10 ventanas) a un
ciclo de **30 minutos por defecto**, configurable (mínimo 10 min), con sync
inmediato al arrancar el servicio y disparo manual para verificación. El contrato de ingest **propuesto (no implementado aún)** evoluciona a ingest
por lotes: varias ventanas por request, manteniendo la idempotencia por
`window_id`.

### 2.2 Piezas afectadas (archivo y línea)

| Pieza | Ubicación actual | Cambio propuesto |
|---|---|---|
| Intervalo de sync | `agent/crates/sc-agent/src/main.rs:35` (`SYNC_INTERVAL = 1 s`) | Hacerlo configurable, default 30 min, mínimo 10 min (`[sync] interval_minutes`). |
| Ticker de spool/retención | `agent/crates/sc-agent/src/main.rs:519` (1 s) | Mantener 1 s para métricas/spool; solo el sync pasa a 30 min. |
| Loop principal | `agent/crates/sc-agent/src/main.rs:900-924` (`sync_loop`) | Tick cada `interval_minutes`; sync inmediato al arrancar (primer tick sin esperar). |
| Confirmación de sync | `agent/crates/sc-agent/src/main.rs:981-987` (`sync_confirmed`, `status.note_sync`) | Sin cambio de contrato; alimenta `last_sync_at`. |
| Drenaje final | `agent/crates/sc-agent/src/main.rs:32-34, 1021-1047` (`DRAIN_TIMEOUT`, `DRAIN_ATTEMPTS`, `drain_spool`) | Tope 45 s; hasta 60 ventanas pendientes (5 pasadas × 10; evaluar 6 pasadas o lote 12). |
| Config | `agent/crates/sc-config/` (sin clave de intervalo hoy) | Agregar `[sync] interval_minutes`, `flush_on_critical_alert`. |
| Umbral de sync en GUI | `agent/crates/sc-gui/src/actions.rs:121-124` (`SYNC_STALE_SECS = 5 min`) | Derivar del intervalo (p. ej. 2× intervalo, mínimo 5 min). |
| Semáforo GUI | `agent/crates/sc-gui/src/actions.rs:148-175` (`health_level`) | Usar el umbral derivado; sin sync reciente → ámbar/rojo. |
| Subestados | `agent/crates/sc-gui/src/actions.rs:203-240` (`substatuses`) | `connection` usa el mismo umbral derivado. |
| Última sync en GUI | `agent/crates/sc-gui/src/app.rs:456-462` (`Última sync`) | Mostrar “último dato hace X” y edad del dato, no solo timestamp. |
| Ingest por device | `web/app/api/ingest/route.ts:73` (60 req/min, burst 30) | Mantener límite por minuto; el lote cuenta como 1 request. |
| Ingest por IP | `web/app/api/ingest/route.ts:46` (20/20) | Sin cambio. |
| Cuerpo y tamaño | `web/app/api/ingest/route.ts:82` (`readIngestBody`) | Límite de lote por debajo de 4.5 MB (Vercel). Ver §2.3 (b). |
| Persistencia | `web/app/api/ingest/route.ts:138-210` (Zod + transacción) | Lote en una transacción; idempotencia por `window_id`. |
| Token bucket | `web/lib/rate-limit/ingest.ts:1-70` | Reutilizar para el endpoint por lotes (1 token por lote). |
| Despliegue del agente | `scripts/deploy-agent-service.ps1:44` (`SyncTimeoutSec = 60`) | Alinear a 45 s o documentar por qué 60. |
| Espera de sync | `scripts/deploy-agent-service.ps1:475, 682` (`Wait-SyncAfter`) | Mantener espera de `sync_confirmed` posterior al arranque. |
| Drenaje en parada | `scripts/deploy-agent-service.ps1:195-210, 649` (`Wait-SpoolDrained`, abort 16) | Ver §2.5. |
| Cron de IA | `.github/workflows/ai-cron.yml:11-12` (`*/15 * * * *`) | Reemplazar por disparo al terminar un lote + limpieza diaria. |
| Intervalo mínimo IA | `web/lib/ai/analyze.ts:51` (`AI_CRON_MIN_INTERVAL_MS = 15 min`) | Parametrizar o eliminar en favor del disparo por lote. |
| Desarrollo local | `docs/runbooks/local-development.md:208-210, 247, 250` | Actualizar expectativas de `sync_confirmed` y tiempos. |

### 2.3 Diseño propuesto

**(a) Intervalo configurable + sync inmediato al arrancar**

- Clave `[sync] interval_minutes` (default 30, rango 10-60).
- Al arrancar el servicio, ejecutar un sync antes del primer tick.
- Mantener `ENROLLMENT_RETRY = 60 s` (`main.rs:37`) mientras no haya enrolamiento.

**(b) Endpoint de ingest por lotes (obligatorio)**

- Aceptar `N` ventanas por request (default 10, máximo a definir).
- Límite de cuerpo: Vercel permite 4.5 MB por request/response
  (`vercel.com/docs/functions/limitations`, actualizado 2026-08-24). Diseñar
  lotes para que el JSON sin comprimir quede por debajo de ~1 MB; verificar en
  pruebas si Vercel acepta `Content-Encoding: gzip` en el request y si el límite
  se aplica a bytes transmitidos o descomprimidos.
- Idempotencia por `window_id`: duplicado → 200 `{status:"duplicate"}`.
- Si una ventana del lote falla: el endpoint devuelve 200 con resultados por
  ventana (`{results:[{window_id,status}]}`); las ventanas inválidas se marcan
  `rejected` y no se reintentan; las válidas se persisten en una transacción.
- Mantener el límite de peticiones por minuto (60/min device, burst 30) sin
  cambios: un lote cuenta como una petición.
- Cada sync vacía **todo** el spool, a ritmo menor que 60/min y respetando
  `Retry-After` en caso de 429.

**(c) Disparo manual**

- `--sync-now` en el agente o endpoint loopback `127.0.0.1` autenticado.
- Usar para verificación post-despliegue y troubleshooting; no como flujo normal.

**(d) Umbrales de salud derivados del intervalo**

- GUI (`health_level`, `substatuses`) y panel web usan un umbral derivado del
  intervalo configurado, no un valor fijo de 5 min.
- Valor sugerido: `max(5 min, 2 × intervalo)`.

**(e) Scripts y drenaje final**

- `SyncTimeoutSec` y `Wait-SyncAfter` siguen exigiendo `sync_confirmed` posterior
  al arranque.
- El drenaje final queda acotado a 45 s; con hasta 60 ventanas pendientes puede
  quedar un remanente, que se sincroniza en el próximo arranque.

**(f) Cron de IA alineado al procesamiento**

- El análisis se dispara al terminar el procesamiento de un lote, con dedup
  (`AI_CRON_MIN_INTERVAL_MS` o equivalente), no por cron separado.
- La limpieza diaria se ejecuta si es posible en el mismo flujo.
- El workflow externo queda como respaldo, no como disparador principal.

**(g) Indicador “último dato hace X”**

- Panel web y GUI muestran edad del último dato, no solo timestamp.
- Base actual: `last_sync_at` en `agent/crates/sc-telemetry/src/status.rs:108` y
  GUI `app.rs:456-462`.

**(h) Opción `[sync] flush_on_critical_alert`**

- Si está activa, un evento crítico dispara un sync fuera de ciclo.
- Costo: requests adicionales ocasionales (estimado 1-5/día por device).
- Default: activado (decisión D5).

### 2.4 Plan de pruebas SYNC-30

| ID | Escenario | Criterio de aceptación |
|---|---|---|
| T1 | Arranque con spool vacío | Sync inmediato; `sync_confirmed` posterior; `last_sync_at` no nulo. |
| T2 | Intervalo de 30 min | No hay sync intermedio si no hay evento crítico; spool acumula ventanas. |
| T3 | Desconexión de 2 h | Al volver, drena por lotes sin superar 60 req/min; sin 429 por device. |
| T4 | `--sync-now` | Dispara sync y devuelve confirmación; no altera el siguiente ciclo. |
| T5 | 60 ventanas pendientes al apagar | Drenaje ≤ 45 s; log `spool_pending` si queda remanente. |
| T6 | Umbral derivado | GUI ámbar solo cuando la edad supera `2 × intervalo`. |
| T7 | Endpoint por lotes | Idempotencia por `window_id`; duplicado → 200; límite de tamaño respetado; resultados por ventana. |
| T8 | `flush_on_critical_alert` | Sync fuera de ciclo solo si la opción está activa; costo medido. |

### 2.5 Tope del spool y política de descarte

- Tope sugerido: 10.080 ventanas (7 días a ~1 ventana/min) o límite configurable.
- Si el sync falla por mucho tiempo y se alcanza el tope, descartar las ventanas
  más antiguas (FIFO) con métrica `spool_dropped` y alerta.
- Alertar al 80 % del tope.

### 2.6 Drenaje final vs `deploy-agent-service.ps1`

El script aborta con código 16 si no confirma `spool_flushed pending=0`. Con
sync cada 30 min y hasta 60 ventanas por sync, el drenaje final de 45 s puede no
vaciar todo.

Opciones:

1. **Remanente persistido como advertencia**: cambiar abort 16 por warning si el
   remanente ≤ 60 ventanas; el remanente se sincroniza en el próximo arranque.
   Impacto: `verify-m5-cycle` acepta `spool_pending > 0` como no fatal si ≤
   tope y registra advertencia.
2. **Forzar un sync antes de parar**: añadir un sync completo previo al stop,
   con tope de 45 s adicional. Impacto: despliegue más lento pero sin
   remanente.

Recomendación: opción 1 para no alargar el despliegue; documentar el remanente.

## 3. Alertas por webhook

### 3.1 Decisiones

- Sin email/Resend; canal webhook (Slack, Discord, URL propia).
- Reutilizar `web/lib/ai/cost-alert.ts` y `web/lib/trust/leak-alert.ts` como patrón.
- Variables: `AI_COST_ALERT_WEBHOOK_URL`, `TRUST_ALERT_WEBHOOK_URL` (ver
  `docs/reference/env-vars.md`).

### 3.2 Diseño base

- **URL como secreto**: nunca en logs, nunca en respuestas, nunca en commits.
- **Validación de destino**:
  - Solo HTTPS.
  - Bloquear loopback, direcciones privadas y link-local.
  - Rechazar redirecciones a destinos no permitidos.
- **Contenido clase B por defecto**: sin identificadores de host (sin `host_key`,
  IP ni device id); solo agregados, severidad, conteos y timestamp.
- **Rate limit y reintentos**:
  - Máximo 1 alerta por tipo y ventana (p. ej. 15 min).
  - Reintentos con backoff corto (1 s, 2 s, 4 s); timeout 5 s; best-effort,
    nunca rompe el pipeline.

### 3.3 Alertas de seguridad

Eventos sugeridos:

| Evento | Severidad | Dedup |
|---|---|---|
| `auth_failure_burst` (3+ fallos en 10 min) | Alta | 15 min |
| `device_reenrollment_required` | Alta | 15 min |
| `spool_overflow` / `sync_failed_24h` | Media | 30 min |
| `leak_detected` (Trust) | Crítica | 15 min, reabrir con nuevo incidente |
| `cost_threshold_exceeded` | Media | 1 h |
| `tamper_or_integrity_failure` | Crítica | Sin dedup |

- **Deduplicación al reabrir**: si un incidente se resuelve y vuelve a ocurrir,
  enviar nueva notificación con el mismo incident key + marca `reopened`.
- **Formato Slack**: bloques, texto hasta 3.000 caracteres por bloque; dividir si
  excede.
- **Formato Discord**: mensaje hasta 2.000 caracteres; truncar a 1.800 para
  margen.
- **Límites de longitud**: truncar payload a 4 KB antes de enviar.

### 3.4 Comparación: webhook desde el agente vs desde la nube

| Aspecto | Agente (detección local) | Nube (post-sync) |
|---|---|---|
| Latencia | Inmediata | Hasta 30 min |
| Dependencia de red | Requiere salida HTTPS local | Requiere sync exitoso |
| Dedup entre devices | No | Sí |
| Secreto (URL) | En config local (riesgo) | En env del servidor |
| Trabajo offline | Sí | No |

Decisión pendiente del propietario (P8).

### 3.5 Piezas afectadas

| Pieza | Ubicación |
|---|---|
| Alerta de coste | `web/lib/ai/cost-alert.ts:1-36` |
| Alerta de fuga Trust | `web/lib/trust/leak-alert.ts:1-40` |
| Variables de entorno | `docs/reference/env-vars.md` (`TRUST_ALERT_WEBHOOK_URL`) |
| Auditoría | `docs/security/audit-2026-11-09.md` (webhook HTTPS, sin secretos en URL) |

## 4. Estimaciones (rangos) — modelo de cómputo Neon

### 4.1 Supuestos (explícitos)

- Neon Free: **100 CU-horas por proyecto por mes**, 1 GB de storage, autoscaling
  hasta 2 CU, scale-to-zero tras **5 minutos de inactividad** (no desactivable en
  Free). Fuente: `https://neon.com/faqs/free-plan-limits-and-quotas`
  (Last updated: 2026-11-03) y `https://neon.com/docs/introduction/compute-lifecycle`.
  Consultado: 2026-11-15.
- Cada activación mantiene el cómputo despierto ~5 min (mínimo efectivo).
- Tamaño de cómputo asumido: 0.25 CU (≈1 GB RAM) por defecto; rango 0.25-1 CU.
- Un sync drena hasta 60 ventanas; si no hay tráfico intermedio, una activación
  por sync.
- El panel abierto mantiene el cómputo activo mientras haya consultas.

### 4.2 Escenarios (por proyecto, 30 días)

| Escenario | Activaciones/día | Minutos activos/día | CU-h/día (0.25 CU) | CU-h/mes (0.25 CU) |
|---|---|---|---|---|
| Solo sync (30 min) | 48 | 240 (4 h) | 1.0 | 30 |
| Sync + cron 15 min (sin alinear) | 48 + 96 | 720 (12 h) | 3.0 | 90 |
| Sync y análisis en la misma activación | 48 | 240 (4 h) | 1.0 | 30 |
| Panel abierto 2 h/día | +1 (solapado) | +120 (2 h) | +0.5 | +15 |

Con cómputo de 1 CU, multiplicar por 4. Con 2 h de panel abierto y sync, total
≈ 45 CU-h/mes a 0.25 CU (bajo el límite de 100). Si el cómputo sube a 1 CU,
el mismo escenario alcanza 180 CU-h/mes (excede).

### 4.3 Peticiones

| Concepto | Valor |
|---|---|
| Ventanas por sync | Hasta 60 |
| Requests por sync (1 ventana/request) | Hasta 60 |
| Syncs por día | 48 |
| Requests por día | Hasta ~2.900 |
| Con ingest por lotes (10 ventanas/lote) | Hasta 6 requests por sync |

### 4.4 Plan de medición

- Registrar consumo de CU-horas en la consola de Neon durante 7 días **antes** y
  7 días **después** del cambio.
- Comparar activaciones, minutos activos y CU-horas.
- Ajustar intervalo o tamaño de lote si se supera el 70 % del límite.

## 5. Fases M6 / M7 / M8

| Fase | Objetivo | Criterio de salida |
|---|---|---|
| M6 | Banco de pruebas (fixtures, pcap-vs-flow, throughput) | Benchmarks documentados y reproducibles. |
| M7 | Modbus de punta a punta (collector, decode, spool, ingest) | Flujo completo verificado en laboratorio. |
| M8 | Línea base local, correlación IT+OT, IA sobre candidatos | Baseline y correlación documentadas; IA genera candidatos. |

Orden acordado: M6 → M7 → M8.

> **Nota (2026-11-25):** «M6 OT» (backlog y `docs/OT/`) es el hito de
> identificación pasiva de Modbus/S7/DNP3/IEC-104. No es la fase «M6 — banco de
> pruebas» de esta tabla. Las etiquetas M6/M7/M8 se mantienen sin renombrar.
> Orden de estas fases: M6 (banco de pruebas) → M7 (Modbus) → M8 (baseline).

## 6. Presupuesto de recursos gratuitos

| Recurso | Límite gratuito | Fuente (consulta) |
|---|---|---|
| Neon (Free) | 100 CU-h/proyecto/mes, 1 GB storage, scale-to-zero 5 min | `https://neon.com/faqs/free-plan-limits-and-quotas` (2026-11-03; consultado 2026-11-15) |
| Vercel (Hobby) | 100 GB fast data transfer, 1M edge requests, 4 CPU-h, 360 GB-h memoria, 1M invocaciones, body 4.5 MB, duración 300 s | `https://vercel.com/docs/plans/hobby` (2026-11-12); `https://vercel.com/docs/functions/limitations` (2026-08-24); consultado 2026-11-15 |
| GitHub Actions (Free) | 2.000 min/mes (privado), ilimitado en público; 500 MB artifacts; 10 GB cache | `https://docs.github.com/en/billing/concepts/product-billing/github-actions` (consultado 2026-11-15) |
| Proveedor de IA (Freebuff API) | Sin tier gratuito fijo; financiado por el propietario | `https://freebuff.com/account/api` (consultado 2026-11-15) |

## 7. Clasificación de datos

| Clase | Descripción | Ejemplos |
|---|---|---|
| A | Públicos / no sensibles | Métricas agregadas, conteos |
| B | OT sin identificadores de host (default alertas) | Severidad, conteos, timestamps |
| C | Identificadores de host / PII | `host_key`, IP, device id (solo con consentimiento y cifrado) |

## 8. Definición de terminado

Una tarea se considera terminada cuando:

1. El código compila y los tests pasan.
2. El despliegue (si aplica) confirma `sync_confirmed`.
3. La documentación se actualiza.
4. No hay secretos en logs ni en el repositorio.

## 9. Plan de contingencia si Neon agota sus límites

- Reducir el intervalo de sync a 60 min.
- Reducir el tamaño de lote y la frecuencia de consultas del panel.
- Desactivar el análisis por IA temporalmente.
- Evaluar upgrade a Launch ($0.106/CU-h) si el proyecto lo requiere.

## 10. Tabla de decisiones pendientes

| ID | Decisión | Opciones | Recomendación |
|---|---|---|---|
| P1 | Default de `flush_on_critical_alert` | on / off | Activado (D5). |
| P2 | Intervalo exacto por defecto | 10 / 30 / 60 min | 30 min (D1). |
| P3 | Disparo del análisis | Por lote / cron 15 min | Por lote con dedup. |
| P4 | Tamaño máximo por lote (v2) | 10 / 25 / 50 ventanas | 10 (compatible con el spool actual). |
| P5 | Umbral de “dato viejo” | 1× / 2× intervalo | 2× intervalo. |
| P6 | Endpoint manual | `--sync-now` / loopback HTTP | Ambos, loopback solo en desarrollo. |
| P7 | Replay PCAP | interno / nunca | Interno (D3). |
| P8 | Fuente del webhook de seguridad | Agente / nube | Pendiente del propietario. |
| P9 | Tope del spool | 1.008 / 10.080 ventanas | 10.080 (7 días). |
| P10 | Drenaje final en despliegue | Advertencia / forzar sync | Advertencia (§2.6). |
| P11 | Licencia de las capturas DEFCON ICS CTF (OQ5 de M6) | usar / no usar | Pendiente del propietario. Sin licencia verificada, sólo pcaps sintéticos propios. |
| P12 | Piso de producción del plan Neon (OQ6 de M6) | Hobby / Launch (~$19/mes) | Pendiente del propietario. |

## 11. Fuera de alcance

- Multi-tenant.
- macOS.
- Móvil (iOS/Android).
- Exportación de PCAP.

## 12. PARADA

Este documento es solo planificación. No se modifica código, no se despliega y no se
rotan secretos. Las implementaciones de SYNC-30 y webhooks quedan para tareas
posteriores con sus propios planes y verificación.