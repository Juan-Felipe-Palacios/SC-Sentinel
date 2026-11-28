# Plan de implementación: reducir el consumo de CU-horas de Neon para que la cuota mensual dure el mes

**Proyecto:** SC-Sentinel
**Autor:** agente (ingeniero senior SC-Sentinel)
**Fecha:** 2026-11-27 (actualizado 2026-11-28)
**Estado:** Plan aprobado por el propietario (bundle A+B+C+D + G como botón en Settings). Pendiente de implementación.
**Objetivo:** que el proyecto Neon de producción (`dawn-salad-70652393`) no vuelva a superar las 100 CU-horas/mes del plan Free, manteniendo la funcionalidad de monitoreo.

---

## 1. Contexto y motivación

El 2026-11-27 el endpoint `/api/query?metric=evals` (y el cron `/api/ai/cron`) empezaron a devolver HTTP 500. La causa raíz no era de código: la base Neon de producción excedió la cuota mensual de CU-horas del plan Free (HTTP 402). El compute quedó suspendido hasta el reset del 2026-12-01.

Se corrigió un bug de clasificación (`web/lib/errors/classify.ts`) para que ese error se reporte como 503 (`db_quota`) en vez de 500 (`internal_error`), pero el problema de fondo es operativo: el compute está despierto ~18 h/día, lo que consume ~104 CU-horas/mes frente a un límite de 100.

Este plan propone reducir el tiempo despierto del compute para que la cuota dure el mes, con margen.

## 2. Medición verificada (fuentes oficiales + Neon API)

### 2.1 Límites del plan Free (fuente: https://neon.com/pricing, última actualización 2026-11-04)

- **100 CU-horas/proyecto/mes.**
- 1 CU-hora = tamaño de compute × horas en ejecución (ej. 0.25 CU × 4 h = 1 CU-h).
- Compute suspendido (scale-to-zero) = $0.
- En Free, scale-to-zero tras **5 min de inactividad** (no se puede desactivar).
- Autoscaling hasta 2 CU; mínimo 0.25 CU.
- Cuota agotada → compute suspendido hasta el próximo período (2026-12-01), sin borrar datos.
- Se puede fijar un **límite de consumo por proyecto** vía la API de Neon (suspensión automática al alcanzar la cuota).

### 2.2 Consumo medido (Neon API, 2026-11-27)

Proyecto `dawn-salad-70652393` (SC-Sentinel, región `aws-us-east-2`):

| Métrica | Valor |
|---|---|
| min_cu / max_cu | 0.25 / 2.0 |
| suspend_timeout | 0 (= default 5 min) |
| Quota reset | 2026-12-01 00:00 UTC |
| Production branch active_time | 1 494 215 s = 415,1 h → ×0,25 = **103,8 CU-hr** |
| Production branch compute_time (CPU) | 389 520 s = 108,2 h |
| m2-preview branch (archivado) | 26 344 s = 7,3 h → 1,8 CU-hr |
| **Total proyecto** active_time | 1 521 567 s = 422,7 h → **105,7 CU-hr** |
| Exceso sobre límite | **+5,7 CU-hr** (causa del HTTP 402) |

**Conclusión:** el compute está despierto ~18 h/día. Para caber en 100 CU-hr/mes con margen, hay que bajar a ~10-11 h/día despierto (~75-80 CU-hr/mes).

### 2.3 Drivers del tiempo despierto (por impacto)

1. **Agente sync (dominante).** Ventanas de 30 s → sync cada ~1-2 s mientras captura. Como 30 s < 5 min de suspensión, el compute **nunca** se suspende mientras el agente corre.
2. **AI cron externo (cron-job.org) cada 5 min.** Golpea `/api/ai/cron` → `checkDailyBudget` + `resolveDeviceId` (DB) cada 5 min, aunque el pipeline se deduplique a 15 min. Mantiene el compute despierto.
3. **Dashboard (cuando está abierto).** SWR refresh cada 5 s (overview/alerts/health, network map, admin).
4. **Cleanup cron diario.** Negligible.

## 3. Objetivo y criterio de éxito

- **Objetivo:** consumo mensual ≤ 80 CU-hr (margen de 20 CU-hr sobre el límite de 100).
- **Criterio de éxito:** en el próximo ciclo (diciembre 2026), `active_time` del branch de producción ≤ 320 h (80 CU-hr / 0,25 CU). Verificado vía Neon API al cierre del mes.
- **Restricción:** no romper la detección (§9 de AGENTS.md): la detección es local en el agente; solo se retrasa la visibilidad en la nube.

## 4. Cambios propuestos

### A. Sync del agente cada 15 min (código Rust) — APROBADO

**Archivos:** `agent/crates/sc-agent/src/main.rs` (const `SYNC_INTERVAL`, función `sync_pass`, `sync_loop`).

**Cambio:**
1. `SYNC_INTERVAL` de `Duration::from_secs(1)` a un valor configurable (default 15 min = 900 s), leído de la variable de entorno `SC_SYNC_INTERVAL_SECS` (consistente con los overrides `SC_*` del config).
2. `sync_pass` debe drenar **todo** el spool en cada invocación (hoy solo envía 10 batches y retorna). Agregar un bucle interno que repita `next_batch(10)` hasta que el spool esté vacío o haya un error. Así un sync cada 15 min drena los ~30 ventanas acumuladas en ~3 s.

**Efecto estimado:** awake de ~18 h/día a ~8 h/día → ~60 CU-hr/mes (−40%).

**Trade-off:** visibilidad en nube con hasta 15 min de retraso (aceptado por el propietario). La detección sigue en tiempo real (es local).

**Riesgo:** si el spool crece más rápido de lo que se drena (poco probable: 30 ventanas/15 min, drenaje en ~3 s), podría acumularse. Mitigación: el bucle interno drena todo; además `max_bytes` del spool (500 MB) da margen amplio.

**Gates:** `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace`. Tests de `sc-sync` (syncer) deben seguir en verde.

**Nivel de autorización:** N1 (código) + N3 (rebuild + restart del servicio Windows).

**Estado:** ✅ implementado (commit pendiente de push).

### B. AI cron cada 15 min (config externa) — APROBADO

**Ubicación:** cron-job.org (externo, no en el repo).

**Cambio:** modificar el schedule del job que llama a `POST /api/ai/cron` de "cada 5 min" a "cada 15 min". El pipeline ya dedup a 15 min (`AI_CRON_MIN_INTERVAL_MS = 15 * 60_000`), así que los pings de 5 min son desperdicio puro.

**Efecto estimado:** −192 hits DB/día. Marginal si A ya suspende el compute, pero reduce wake-ups standalone y el riesgo de 402 por picos.

**Trade-off:** insights de IA se actualizan cada 15 min en vez de 5 (aceptado por el propietario).

**Nivel de autorización:** N3 (servicio externo).

**Estado:** ⏳ pendiente de ejecutar en cron-job.org (pasos en §7).

### C. Refresh del dashboard 5 s → 30 s (código web) — APROBADO

**Archivos:** `web/components/dashboard/OverviewView.tsx` (const `REFRESH_MS = 5000`), `web/components/dashboard/NetworkMapCard.tsx` (5000), `web/components/dashboard/AdminExportsView.tsx` (5000), `web/components/dashboard/AdminTrustAccessView.tsx` (5000), `web/components/dashboard/AlertsView.tsx`, `ConnectionsView.tsx`, `HostDrillDown.tsx`, `traffic/TrafficHeatmap.tsx` (5000), `web/components/dashboard/EvalsView.tsx` (15000).

**Cambio:** subir `REFRESH_MS` a 30 000 en los archivos que usan 5000; evals de 15 000 a 30 000.

**Efecto estimado:** bajo (solo mientras el panel está abierto), pero fácil y sin riesgo.

**Trade-off:** panel menos "en vivo".

**Gates:** `tsc --noEmit`, `lint`, tests (con conteo), `build`.

**Nivel de autorización:** N1 (código) + N2 (push a main despliega producción).

**Estado:** ✅ implementado (commit pendiente de push).

### D. Límite de consumo por proyecto (Neon API) — APROBADO

**Ubicación:** Neon API / consola.

**Cambio:** fijar un consumption limit en el proyecto `dawn-salad-70652393` a 90 CU-hr (suspensión automática al alcanzarlo), para evitar otro 402 abrupto.

**Efecto:** red de seguridad. No reduce consumo, pero evita el corte sorpresivo.

**Nivel de autorización:** N3 (servicio externo).

**Estado:** ⏳ pendiente de ejecutar en Neon (pasos en §7).

### E. Borrar ramas no usadas — OPCIONAL (no en bundle)

**Ubicación:** consola Neon.

**Cambio:** verificar y borrar `m2-preview` (ya archivada, 1,8 CU-hr) y cualquier otra rama no usada.

**Efecto:** mínimo (~1,8 CU-hr) pero limpia.

**Nivel de autorización:** N3 (servicio externo, irreversible parcialmente — verificar antes).

### F. Bajar max_cu de 2 a 0,5-1 — OPCIONAL (no en bundle)

**Ubicación:** consola Neon, endpoint settings del proyecto.

**Cambio:** reducir el tope de autoscaling.

**Efecto:** mínimo (el autoscaling rara vez alcanza 2 CU en este workload).

**Trade-off:** menor capacidad de ráfaga.

**Nivel de autorización:** N3.

### G. Apagar el agente de noche — APROBADO (botón en Settings)

**Ubicación:** código web (Settings) + agente.

**Cambio:** añadir un botón/toggle en la página de configuración (`SettingsView`) que permita "apagar el agente de noche". Implementación propuesta:
- UI: toggle "Modo nocturno" con hora de inicio/fin en Settings, persistido como setting del dispositivo (o global).
- Backend: endpoint o campo en el estado del device que el agente consulta en su sync. Si el modo nocturno está activo en el horario configurado, el agente drena el spool y se suspende (no captura ni sincroniza) hasta el fin de la ventana.
- Alternativa más simple (si el mecanismo de settings no existe): el botón descarga/presenta instrucciones para programar una tarea de Windows (`schtasks`) que detiene/inicia el servicio en el horario configurado, y registra la preferencia en el dispositivo.

**Efecto:** alto (proporcional a horas apagado).

**Trade-off:** sin monitoreo en esas horas.

**Nivel de autorización:** N1 (código UI) + N3 (si implica detener el servicio).

**Estado:** ⏳ pendiente de implementar (requiere investigar el mecanismo de settings del device y del agente; se propone como sub-tarea separada).

## 5. Orden de implementación recomendado

1. **D** (límite de consumo) — primero, como red de seguridad. No depende de código.
2. **B** (cron-job.org) — cambio de configuración, inmediato.
3. **E** (borrar ramas) — limpieza, verificar antes.
4. **A** (sync agente) — requiere código + build + restart; es el mayor ahorro. ✅ código listo.
5. **C** (dashboard refresh) — código web, se despliega con push. ✅ código listo.
6. **F** (max_cu) — opcional, bajo impacto.
7. **G** (botón en Settings) — sub-tarea separada.

## 6. Autorizaciones requeridas (AGENTS.md §3)

- **A y C:** código N1 (autorizado por "dale" para la tarea) + gates verdes + push N2 (requiere "dale" explícito, despliega producción).
- **B, D, E, F, G:** N3, requieren "dale" explícito por cada acción, con plan previo. D y E son irreversibles parcialmente: confirmar antes.

## 7. Pasos exactos para B y D (servicios externos)

### B — cron-job.org

1. Ingresar a cron-job.org con la cuenta del propietario.
2. Localizar el job que llama a `POST https://sc-sentinel.vercel.app/api/ai/cron` con header `x-cron-secret`.
3. Cambiar el schedule de "cada 5 minutos" a "cada 15 minutos".
4. Guardar y verificar la próxima ejecución.

### D — Límite de consumo en Neon

Opción API (requiere `Neon_Api_Key`):

```bash
# (ejecutar en web/ con .env.production.local cargado; la clave NO se imprime)
export NEON_API_KEY="$(grep '^Neon_Api_Key=' .env.production.local | cut -d= -f2- | tr -d '\r')"
curl -s -X PATCH \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  "https://console.neon.tech/api/v2/projects/dawn-salad-70652393" \
  -d '{"consumption_limit":{"compute_time_seconds":324000}}'
```

(324 000 s = 90 CU-hr a 0,25 CU; ajustar si se quiere otro tope.)

Opción consola: Neon Console → proyecto SC-Sentinel → Settings → Consumption limits → fijar 90 CU-hr.

## 8. Verificación (§4, §15)

- **A:** `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace`. Prueba manual: arrancar el agente, verificar que `/status` muestra sync cada 15 min y que el spool se drena (`pending=0` tras cada sync). Medir `active_time` en Neon API a los 7 días.
- **C:** `tsc --noEmit`, `lint`, tests (con conteo), `build`. Verificar en producción con `curl` que el dashboard sigue cargando.
- **B/D/E/F:** verificar en las consolas correspondientes (cron-job.org, Neon console) que los cambios quedaron aplicados.
- **Métrica global:** consultar Neon API (`active_time` del branch de producción) a los 7 y 30 días; objetivo ≤ 320 h/mes (80 CU-hr).

## 9. Rollback

- **A:** revertir el commit del cambio de `SYNC_INTERVAL` y del bucle de drenaje; rebuild + restart. El agente vuelve a sync cada 1 s (comportamiento anterior).
- **C:** revertir el commit de `REFRESH_MS`.
- **B/D/E/F/G:** revertir la configuración en el servicio externo (cron-job.org / Neon console). No hay código que revertir.

## 10. Decisiones resueltas (2026-11-28)

1. ✅ Bundle A+B+C+D aprobado.
2. ✅ G como botón en la UI de configuración (Settings).
3. ✅ 15 min de retraso en la visibilidad en nube aceptable.
4. ✅ AI cron cada 15 min suficiente.

## 11. Referencias

- `AGENTS.md` §9 (detección), §10 (observación OT), §11 (planes gratuitos), §3 (niveles de autorización), §15 (verificación mínima).
- `docs/adr/` (numeración siguiente libre a verificar).
- Neon pricing: https://neon.com/pricing (verificado 2026-11-27).
- Código: `agent/crates/sc-agent/src/main.rs` (sync_loop, sync_pass, SYNC_INTERVAL), `web/components/dashboard/*View.tsx` (REFRESH_MS).
- Commit previo relacionado: `1a7c3bf` (clasificación 402→503), `adbdfdb` (EvalsView manejo de error).
