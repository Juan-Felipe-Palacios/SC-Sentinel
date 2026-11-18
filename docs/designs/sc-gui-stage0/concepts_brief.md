# `sc-gui`: recorte de lectura del spool y medición antes de optimizar

* **Author:** Juan (propietario)
* **Date:** 2026-11-17
* **Status:** Draft — pendiente de aprobación del propietario
* **Anclaje:** `docs/designs/sc-gui-spool-read-brief-anchor.md` (opción b, recorte de alcance)

## Overview

La GUI de `sc-gui` se siente lenta. El anclaje original hipotetizaba que la causa era el I/O del spool. Este brief recorta el problema a dos cosas y nada más:

1. **Stage 0 — Medir antes de tocar nada.** Sin instrumentación no hay evidencia. Se agregan cuatro métricas y se deja correr 1 día en producción. Lo que salga de esos números decide qué se optimiza y qué no.
2. **Quick win — Gate de relectura del spool.** El servicio escribe el spool cada 30 s; la GUI lo relee cada 5 s (6× sobre-lectura). El gate salta la relectura mientras `snapshot.windows.len() >= 2`.

Todo lo demás (facts worker, política de repaint oculto, rediseño visual, per-tab caching) queda **fuera de este brief** y se toma después, con los números de Stage 0.

**Contradicción técnica (nombrada):** la GUI debe leer el spool para obtener historial, pero el spool lo escribe SYSTEM y la GUI corre como usuario normal sin ACL — así que en producción la "lectura" es un *open* fallido cada 5 s, y la métrica mide el fallo, no la lectura. Esta es la contradicción que Stage 0 debe resolver: ¿el jank viene del I/O fallido, o del stall por timer?

## Goals

- **G1.** Stage 0 produce, en producción durante 1 día, un log `gui.log` con las líneas de `gui_timing` (spikes + agregadas 5 min) que permita un go/no-go decision por cada optimización candidata.
- **G2.** El gate reduce las relecturas del spool a casi cero en un agente sano (≥ 2 ventanas en `/status`), y los contadores `spool_reads`/`spool_skipped` lo cuantifican.

## Non-Goals

- Facts worker (mover el I/O de la UI a un hilo).
- Política de repaint oculto por eventos de bandeja (ADR-0017 §3, latido de 250 ms).
- Rediseño visual de la GUI.
- Per-tab caching (rechazado por 4 de 7 Goldfishes).
- Ningún ítem dentro de este brief modifica, extiende o re-decide estos. Un resultado de Stage 0 que apunte a uno de ellos es un hand-off, no un cambio de alcance.

## Alternatives Considered

### A1. Gate threshold `>= 2` ventanas (opción a) — **elegida**
- **Pros:** codifica que `/status` es fuente preferida y el spool es fallback; en producción con agente sano las lecturas caen a casi cero; no agrega estado nuevo ni constante mágica; reutiliza el umbral que el gráfico ya necesita (`app.rs:101`, `chart_series` requiere `>= 2` para dibujar la sparkline).
- **Cons:** no cubre el caso `windows = 0/1` (agente viejo, arranque, `/status` degradado) — el spool se sigue leyendo cada 5 s. Ver objeción D1.
- **Razón de elección:** mayor ganancia estructural; el caso 0/1 se documenta como residual y se resuelve con el plan B si Stage 0 lo requiere.

### A2. Gate threshold `spool_bytes > 0` — **rechazada**
- **Pros:** simple.
- **Cons:** los bytes pendientes no dicen nada sobre la frescura del historial; es otra semántica (¿hay datos por enviar? vs. ¿hay ventanas nuevas?).
- **Razón de rechazo:** semántica distinta; no codifica la prioridad de fuente.

### A3. Fijo `last_spool_read.elapsed() >= 30 s` — **Plan B documentado, no implementado**
- **Pros:** acota la staleness del fallback.
- **Cons:** agrega una constante mágica (`30 s`) que se pudre si alguien cambia `window_seconds`.
- **Regla de decisión (plan B):** si Stage 0 muestra `spool_reads > 1/min` sostenido **con el gate activo** (es decir, `/status` llegando seguido con < 2 ventanas), se suma `last_spool_read.elapsed() >= 30 s` como cota de staleness encima de A1. No es una puerta abierta, es un disparador con condición medible.
- **Nota (objeción D7):** el disparador `spool_reads > 1/min` es auto-referencial — el gate impulsa el contador a ~0, así que si Plan B dispara, significa que el gate está roto, no que se necesita la cota. El disparador debería definirse sobre la staleness del historial renderizado, no sobre la tasa de lecturas.

### A4. Per-tab caching — **rechazada (4 de 7 Goldfishes)**
- **Pros:** reduciría el costo de cambiar de pestaña.
- **Cons:** cambiar de pestaña no hace I/O (mecanismo de jank descartado); el caché agrega estado y complejidad sin win medible.
- **Razón de rechazo:** no ataca la causa real.

### A5. Mover `scm::query_service_state` al hilo del poller (transform inventiva) — **fuera de este brief, documentada**
- **Pros:** elimina la query SCM bloqueante de la UI (candidata a jank, medida por `scm_query_ms`); no agrega hilo nuevo (el poller ya existe).
- **Cons:** excede el alcance declarado del brief (el anclaje se recortó al spool); el owner debe bendecirla explícitamente.
- **Razón de deferir:** el owner fijó "no hilos nuevos, cero arquitectura nueva" — mover la SCM al poller no viola "hilos nuevos" (el hilo existe) pero sí viola "arquitectura nueva" en el sentido de "no tocar el pipeline de polling". Queda como el siguiente paso más probable tras Stage 0.

## Stage 0 — Instrumentación (medido, no supuesto)

### Métricas (cuatro)
- `spool_read_ms` — duración de `read_window_summaries` (abrir + query + gzip + JSON, la llamada completa).
- `scm_query_ms` — duración de `scm::query_service_state` (solo cuando el gate `scm_due` dispara, no por frame).
- `frame_gap_ms` — cadencia de frames efectivamente pintados (intervalo entre llamadas a `update()`), con tag `visible=0/1` obligatorio.
- `poll_fetch_ms` + `poll_age_ms` — duración del `fetch` de reqwest en el hilo del poller + edad del snapshot al momento de pintar. **Razón:** distinguen "dato viejo" de "UI trabada", dos síntomas distintos. `poll_fetch_ms` está acotada por el timeout de 2 s (`status_client.rs:26`), así que mide "hang", no "lentitud" — ver objeción D3.

`try_latest()` del poller **no** se mide (try_recv de mpsc es ruido, no evidencia).

### Modos de emisión (dos y nada más)
- **(a) Spike:** línea cuando una métrica cruza umbral:
  - `spool_read_ms > 50`
  - `scm_query_ms > 25`
  - `frame_gap_ms > 500` (solo `visible=1`)
  - `poll_age_ms` (reemplaza `poll_fetch_ms > 1000` — ver objeción D3: `poll_age_ms` es el síntoma real de "dato viejo"; `poll_fetch_ms > 1000` es un proxy de hang acotado por timeout).
- **(b) Agregada cada 5 min:** `n/min/p50/p95/max` por métrica. ≈ 288 agregadas/día + spikes.

### Destino y activación
- **No a `agent.log`**, por dos razones: (1) la GUI corre como usuario y no puede escribir a `C:\ProgramData\SC-Sentinel\logs` (ACL SYSTEM + Administrators — ver objeción D9 sobre los detalles exactos); (2) el timing de la GUI no es telemetría del agente.
- Archivo propio: `%LOCALAPPDATA%\SC-Sentinel\logs\gui.log`, evento `gui_timing`, formato `key=value` estable.
- **Grep:** `Select-String 'gui_timing kind=spike' "$env:LOCALAPPDATA\SC-Sentinel\logs\gui.log"`
- **Activación:** `SC_GUI_STAGE0=1` (instrumentación temporal; no queda encendida por defecto). Ver objeción D5: considerar un control por duración (`SC_GUI_STAGE0_SECONDS`) en vez de un binario on/off.
- **Mecanismo de escritura:** hand-rolled `std::fs` (precedente: `tray_balloon.rs:112-121`), sin nueva dependencia de log. `sc-gui/Cargo.toml` no trae `tracing` ni `log` (verificado).

### Contadores
- `spool_reads` / `spool_skipped` — lecturas realizadas vs. evitadas por el gate. Stage 0 cuantifica el propio quick win.
- **Unidad de emisión:** solo en la agregada de 5 min (`spool_reads:n`), no por evento — para acotar el volumen de `gui.log` (ver objeción B4).

### `frame_gap_ms`: sub-pasos de `refresh()`
Ver objeción D4: para que Stage 0 sea un procedimiento de decisión y no solo un categorizador, **también se mide el sub-paso dominante de `refresh()` en el frame lento** (máx. de: drain del poller, query SCM, lectura del spool). Eso convierte `frame_gap_ms` de "hubo un gap" en "hubo un gap por X".

### Formato grepeable (bloques de código)
```
event=gui_timing kind=spike metric=spool_read_ms value=87.3 visible=1
event=gui_timing kind=agg window=300s visible=1 spool_read:n=60,min=0.4,p50=1.1,p95=3.2,max=87.3 scm_query:n=60,min=0.2,p50=4.1,p95=12.0,max=45.0 frame_gap:n=120,min=200,p50=248,p95=260,max=512 poll_fetch:n=60,min=2,p50=5,p95=18,max=95 poll_age:n=60,min=0,p50=1,p95=3,max=12
```

### P50/P95 — método de cálculo (nearest-rank)
- `idx = max(1, ceil(p * n / 100))` sobre el arreglo ordenado ascendente, indexado en 1.
- **Razones:** índice entero sin interpolación → reproducible idéntico en PowerShell, Python o awk sin reglas de desempate; con `n` entre ~60 y ~1200 por ventana, interpolar añade precisión falsa por debajo del piso de ruido del scheduler; para detección de spikes conviene que p95 sea una observación real y no un valor sintetizado entre dos muestras.
- **Regla de borde:** si `n == 0` en la ventana, la línea se emite con `n=0` y se omiten los percentiles — nunca se emite `0`, que se leería como "rápido".

### Ventana de 5 min — reloj de pared (época)
- Fronteras fijas cada 300 s alineadas a epoch: `window_start = now - (now % 300s)`. Emisión al cierre (primer tick posterior a la frontera). Etiquetada `window=<ISO-8601 UTC del inicio>`.
- **No rolling:** las ventanas solapadas doble-contarían en cualquier análisis posterior por grep y romperían la invariante de 288 líneas agregadas por día. Con reloj de pared los conteos diarios suman exacto y las fronteras dividen limpio el ritmo de escritura del spool (30 s divide a 300 s).
- **Reglas de emisión:** (1) la línea se emite siempre, incluso con `n=0` — prueba de vida del logger durante ventanas ocultas o suspendidas. (2) Si dentro de una ventana hubo ambos regímenes, se emiten **dos líneas** (`visible=1` y `visible=0`) con sus propios `n`, para no mezclar los regímenes de repintado.

### `poll_age_ms` — stamp en el poller (opción b)
- El poller graba `fetched_at: Instant` en el momento en que un `fetch` termina con éxito y ese stamp viaja con el snapshot por el canal.
- La UI calcula `poll_age_ms = now - fetched_at` al pintar.
- **Razón:** la opción (a) mide "cuánto hace que la UI drenó algo", que queda sana aunque el poller esté reenviando dato viejo o mandando `None` con fetchs fallidos — justo el punto ciego que esta métrica existe para cubrir. Con (b), el age es la staleness real del dato mostrado (fetch → canal → paint), y el mismo par de `Instant` que abre y cierra el fetch alimenta `poll_fetch_ms`, así que ambas métricas comparten reloj sin derivas.
- **`Instant` y no `SystemTime`:** monotónico, inmune a saltos de reloj, y válido entre hilos del mismo proceso.

### `spool_open` — sonda ACL de un disparo (propiedad de seguridad, no bug)
- **Decisión fijada:** la ilegibilidad del spool por la GUI es una **propiedad de seguridad**, no un bug a reparar. No se relaja la ACL del spool para que la GUI lo lea.
- El canal sancionado de datos hacia la GUI es `/status` (loopback, sin secretos); el spool contiene flujos crudos y su postura SYSTEM-escritura / admin-lectura es correcta por diseño.
- **Verificación:** sonda runtime de un solo disparo, sin tocar `install-agent.ps1`. Verificar en el instalador no sirve: el instalador corre elevado y con otro token que el proceso de usuario de la GUI, así que solo probaría la ACL en contexto equivocado y en momento equivocado. El punto correcto de verificación es el primer intento de open del spool en la propia GUI: loguear una sola vez por tipo de error el resultado con el código de OS (`spool_open=denied os_error=5`), deduplicado, no cada 5 s.
- **Costo:** una línea de log. No amplía el scope del instalador. Convierte la suposición en evidencia en el contexto de seguridad correcto.

### N1 — Instrumentación fuera del hilo de UI (no perturbar lo medido)
- Las escrituras de `gui.log` (spikes y agregadas) van fuera del hilo de UI: canal mpsc hacia un hilo escritor best-effort.
- Un fallo de escritura nunca paniquea ni bloquea el repintado.
- **Razón:** un spike logueado sincrónicamente podría fabricar su propio `frame_gap` y la medición se mordería la cola.

### N2 — Tope duro de `gui.log`
- Rotación única o truncate a 10 MB.
- La corrida 1 no debería pasar de ~1 MB; el tope es red de seguridad, no expectativa.
- **Razón:** por si `SC_GUI_STAGE0` queda encendido por error semanas.

## Quick win — Gate de relectura del spool

- **Condición (fija, opción A1):** no releer el spool mientras `self.snapshot.windows.len() >= 2`.
- **Implementación:** un booleano `gated` ANDado al `spool_due` existente en `refresh()` (`app.rs:232-240`). Sin estado nuevo.
- **Caso `snapshot = None` (poll fallido):** el gate **no** dispara (se sigue leyendo el spool) — ver objeción B12.
- **Caso `windows = 0/1` (agente viejo / arranque / `/status` degradado):** el gate **no** dispara; el spool se sigue leyendo cada 5 s. Este es el caso que la nota de expectativa del anclaje no cubría — ver objeción D1.
- **Nota de expectativa (fijada):** en producción la GUI hoy **no puede** leer el spool del servicio (archivo escrito por SYSTEM, proceso de usuario sin ACL — ver la sección "spool_open" arriba). La "sobre-lectura" actual es un *open* fallido cada 5 s. El gate también elimina ese I/O periódico fallido y su camino de error; `spool_read_ms` en producción probablemente salga sub-milisegundo. Si sale así, el spool queda **exculpado** como causa del jank en producción (hipótesis condicional, no veredicto) y la evidencia apuntará al stall por timer — para lo que están `frame_gap_ms` y `scm_query_ms`.
- **El quick win es limpieza estructural y win real en máquinas dev** (donde el spool sí es legible), **no** el fix del jank en producción. Dicho ahora, no descubierto a posteriori.

### Gate vs. contadores — decisión cerrada
- **El gate es siempre-activo (código permanente).** Es una mejora de rendimiento semánticamente obvia (no releer una fuente que no vas a usar), tiene tests propios que corren sin la variable de entorno (skip con `windows >= 2`, lectura con `< 2`), y apagarlo durante el estudio dejaría a producción haciendo las lecturas wasteful justo ahora que sabemos que lo son.
- **Los contadores `spool_reads`/`spool_skipped` y las cuatro métricas de timing son telemetría pura:** viven solo bajo `SC_GUI_STAGE0=1`, cuantifican el efecto del gate durante el día de medición, y se eliminan junto con el resto de la instrumentación cuando Stage 0 decida. La evidencia del gate queda en el log de Stage 0 y en el mensaje del commit, no en código permanente.

## Criterio de aceptación

### Stage 0 DONE
- `gui.log` en `%LOCALAPPDATA%\SC-Sentinel\logs\gui.log` contiene ≥ 288 líneas agregadas en 24 h, las 4 métricas presentes en cada línea, spikes cuando se cruzan los umbrales, y `SC_GUI_STAGE0=1` es la única activación.
- **Diario de jank (corrida 1, sin código nuevo):** quien use la GUI ese día anota hora de pared (HH:MM) y acción (clic, cambio de pestaña, restore desde bandeja) de cada trabazón percibida. Al cierre se correlaciona el diario contra spikes y agregadas. Esto es correlación a reveal sin instrumentación adicional y convierte un "no-signal" en información usable.
- **N3 — Zona horaria en la correlación:** el diario es hora local y `gui.log` es UTC. La primera línea del diario fija el offset UTC del host ese día, y el análisis convierte el diario a UTC al cierre. Sin esto, la correlación diario↔spikes falla por horas y parece no-signal donde hay señal.
- **Regla de decisión prefijada:**
  - (a) Si las entradas del diario correlacionan con spikes o agregadas → hay señal, no hay corrida 2, se pasa al ticket de fix.
  - (b) Si hay entradas del diario (síntoma reproducido) y las métricas salen limpias → el punto ciego es input-to-paint y se autoriza exactamente una corrida 2 con la única métrica que falta, `input_to_paint_ms` (stamp del evento de input → siguiente frame pintado), sin corrida 3.
  - (c) Si no hay entradas del diario porque el síntoma no se reprodujo ese día → la captura es inconclusa, no no-signal: no se cierra como arreglado ni se repite a ciegas, se reprograma la captura a un día con el patrón de uso que reproduce el síntoma, y el ticket solo es cerrable como "sin repro bajo medición, reabrible con pasos de repro".
- **N4 — Definición cerrada de `input_to_paint_ms` para la corrida 2:** cuenta pointer-press, key-press y restore desde bandeja; excluye hover, move y scroll. Se fija ahora para que la corrida 2 no reabra esa discusión.
- **Tope duro:** dos días de captura en total. Después de la corrida 2 se decide con lo que haya; si no hay nada, se cierra con los logs archivados y el gate más los umbrales quedan como guardia de regresión permanente.

### Gate DONE
- `spool_skipped > spool_reads` en la misma ventana con agente sano.
- `spool_reads` rate < 1/min (est.) con el gate activo.
- No hay nueva ruta de código en el gate que exceda la opción A1 (sin staleness cota implementada; Plan B queda documentado pero no escrito).

### Brief-level
- **No se afirma un win perceptivo el día uno.** El win perceptivo depende de lo que `frame_gap_ms`/`scm_query_ms` muestren.
- Si Stage 0 muestra `spool_read_ms` sub-milisegundo, el siguiente sospechoso es un `frame_gap_ms > 500` que coincide con un clic, o un stall de `scm_query_ms > 25` en la query de 1 s (`app.rs:195`).

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| `gui.log` crece sin tope | N2: rotación única o truncate a 10 MB. La corrida 1 no debería pasar de ~1 MB; el tope es red de seguridad. |
| El gate `>= 2` degenera si `/status` devuelve < 2 ventanas | Documentar el comportamiento de fallback (se sigue leyendo el spool); Plan B como disparador. |
| `SC_GUI_STAGE0=1` queda encendido por error | Logar una línea al arrancar el GUI indicando el estado; considerar control por duración (D5). |
| La premisa de ACL (GUI no puede leer el spool) no está verificada en el repo | Sonda runtime de un disparo (`spool_open=denied os_error=5`) — ver sección "spool_open". |
| `frame_gap_ms` solo se emite con `visible=1` — un stall en ventana oculta queda sin medir | Correlación a eventos de reveal (`visible=0→1`) en la segunda captura (Z1). |
| El artefacto `gui.log` no declara que no lleva identificadores de dispositivo | Afirmar explícitamente: las líneas de `gui_timing` son puras duraciones + tag `visible`; no contienen device id, token ni host. |
| La instrumentación perturba lo medido | N1: escrituras fuera del hilo de UI (mpsc → hilo escritor best-effort); un fallo de escritura nunca paniquea ni bloquea el repintado. |

## Preguntas abiertas

1. **ACL del spool y del log directorio:** `install-agent.ps1` (líneas 314-326) otorga a SYSTEM `F` y a Administrators `F` en `logs/`, y `RX` en `spool/`. El anclaje decía "SYSTEM Modify + Administrators ReadAndExecute" en logs — **inexacto**: Administrators tiene `F` en logs. La GUI corre como usuario normal (no admin), así que **en cualquier caso** no puede escribir a `logs/` ni a `spool/`. La premisa del anclaje es razonable pero **no verificada en el repo** (los detalles de ACL están en un script que no se incluyó en la lista de lectura de los Goldfishes). **Pregunta:** ¿se verifica en `install-agent.ps1` antes de la corrida en producción, o se deja como suposición documentada?
   - **Resuelto:** suposición documentada + sonda runtime de un solo disparo. No se toca `install-agent.ps1`. La ilegibilidad del spool por la GUI es una propiedad de seguridad, no un bug. Ver sección "spool_open".
2. **`poll_age_ms`:** ¿qué referencia de timestamp? Opción (a): `last_poll_ok.elapsed()` al pintar (barato, siempre disponible, pero es "tiempo desde la última entrega exitosa", no "edad del snapshot"). Opción (b): sellar cada `fetch` con un `Instant` y propagarlo por el canal (requiere cambiar el tipo de mensaje del poller — ver objeción B3). ¿Cuál queda, y si es (b), el cambio al data-model del poller está en alcance?
   - **Resuelto:** opción (b), stamp en el poller. `fetched_at: Instant` viaja con el snapshot por el canal. Ver sección "poll_age_ms".
3. **P50/P95:** método de cálculo (nearest-rank en la muestra ascendente, interpolación lineal, u otro). ¿Cuál queda para reproducibilidad?
   - **Resuelto:** nearest-rank. Ver sección "P50/P95".
4. **Ventana de 5 min:** alineada a reloj de pared (00:00, 00:05, …) o rolling desde el arranque del proceso. ¿Cuál?
   - **Resuelto:** reloj de pared, alineada a época. Ver sección "Ventana de 5 min".
5. **`frame_gap_ms`:** ¿qué cuenta como "frame"? ¿Cada llamada a `update()` (gap = `Instant::now() - last_update_instant`), o solo los frames donde algo cambió? Si lo segundo, ¿cuál es el mecanismo para detectarlo?
   - **Resuelto (implícito):** cada llamada a `update()` (gap = `Instant::now() - last_update_instant`). El brief dice "cadencia de frames efectivamente pintados (intervalo entre llamadas a `update()`)". No se filtra por cambios — el mecanismo de detección de "algo cambió" no existe en el código y agregarlo sería arquitectura nueva.
6. **`spool_read_ms`:** ¿mide la llamada completa de `read_window_summaries` (open + query + gzip + JSON) o solo el I/O de open? El anclaje dice "duración de `read_window_summaries`" — la lectura natural es la llamada completa. Confirmar.
   - **Resuelto (implícito):** la llamada completa (open + query + gzip + JSON). El anclaje dice "duración de `read_window_summaries`".
7. **Gate vs. contadores:** ¿el gate es siempre-activo (fix de producto) y los contadores solo bajo `SC_GUI_STAGE0=1` (medición temporal)? ¿O todo bajo el mismo flag?
   - **Resuelto:** gate siempre-activo; contadores y telemetría solo bajo `SC_GUI_STAGE0=1`. Ver sección "Gate vs. contadores".
8. **Segunda captura:** si Stage 0 no-signal, ¿el owner acepta una segunda corrida de 1 día con correlación a reveal, o se cierra el ticket con "no hay evidencia"?
   - **Resuelto:** sí, pero condicionada, capeada, y con la capa de correlación ya metida en la corrida 1 a costo cero (diario de jank). Regla de decisión prefijada: (a) correlación con spikes/agregadas → hay señal, no hay corrida 2; (b) síntoma reproducido + métricas limpias → una corrida 2 con `input_to_paint_ms` como única métrica, sin corrida 3; (c) síntoma no reproducido → inconclusa, reprogramar a un día con el patrón de uso que reproduce el síntoma. Tope duro: dos días de captura en total. Ver sección "Criterio de aceptación → Stage 0 DONE".
9. **Ticket de seguimiento:** si Stage 0 confirma el stall por timer (`frame_gap_ms > 500` o `scm_query_ms > 25`), ¿quién abre el ticket de repaint-oculto + facts-worker (ADR-0017 §3)? ¿Se nombra aquí o queda a discreción del owner?
   - **Resuelto:** se pre-crea ahora como ticket contingente, status `blocked-pending-Stage-0`, owner = la pista `sc-gui` (el mismo owner de este brief y del mismo territorio de código: repaint en `app.rs` y facts en `actions.rs`). El informe de cierre de Stage 0 lo voltea a `open` con el extracto de log adjunto, o lo cierra como `blocked` si no hay confirmación. Su contenido queda fijado hoy: disparo cuantitativo (≥3 spikes de `frame_gap_ms > 500` con `visible=1` en un día, o p95 de `frame_gap` visible > 500 ms), dos work items (repaint-oculto por eventos de bandeja + facts-worker), no-goals explícitos (sin rediseño visual, sin per-tab caching). Ver sección "Ticket contingente pre-creado".

## Fuera de este brief (deferred, con disparador de decisión)

- **Facts worker** — entra en alcance si Stage 0 muestra `scm_query_ms` p95 > 25 ms o `poll_fetch_ms` p95 > 100 ms en el hilo del poller (mover el I/O de la UI).
- **Política de repaint oculto** — entra en alcance si Stage 0 muestra `frame_gap_ms > 500` con `visible=1` coincidiendo con un clic, o si la segunda captura (Z1) muestra un stall en `visible=0` que se manifiesta al revelar la ventana.
- **Mover SCM al poller (A5)** — entra en alcance si el owner la bendice explícitamente; no viola "no hilos nuevos" pero sí "no tocar el pipeline de polling".
- **Rediseño visual** — fuera por decisión del owner.
- **Per-tab caching** — rechazado.

## Ticket contingente pre-creado

- **Status:** `blocked-pending-Stage-0`
- **Owner:** pista `sc-gui` (mismo owner de este brief; territorio `app.rs` y `actions.rs`)
- **Volteo:** el informe de cierre de Stage 0 lo pasa a `open` con el extracto de log adjunto, o lo cierra como `blocked` si no hay confirmación.
- **Disparo cuantitativo ("confirma"):** ≥3 spikes de `frame_gap_ms > 500` con `visible=1` en un día, **o** p95 de `frame_gap` visible > 500 ms (el doble del latido de 250 ms de ADR-0017 §3).
- **Work items:** (1) repaint-oculto por eventos de bandeja (ADR-0017 §3); (2) facts-worker que saca `scm_query` y los facts del hilo de UI.
- **No-goals explícitos:** sin rediseño visual, sin per-tab caching.

## N5 — Archivo de evidencia y registro de los 4 Goldfishes vacíos

- **Archivo de evidencia:** al cierre, `gui.log` + diario + informe van a `docs/evidence/sc-gui-stage0-<fecha>/`.
- **Registro de los 4 Goldfishes vacíos:** 4 de 7 Goldfishes no produjeron hallazgos adicionales (egm-codebase-details verificó referencias, egm-comprehension identificó gaps de conocimiento, egm-inventive-catalyst propuso el transform, egm-zoom-out evaluó altitud). Se registran aquí para que no quede como trabajo perdido ni como convergencia implícita. Los 3 que produjeron hallazgos sustantivos (egm-design con 8 objeciones, egm-implementation-readiness con 12 blockers/ambiguities, egm-structural con 12 gaps + 4 leaks) son los que moldearon el brief.

## PARADA

Brief anclado. No implementa código ni despliegues. Pendiente de revisión EGM y aprobación del propietario. Nivel N0: solo lectura y documentación.

---

## Anotaciones de los 7 Goldfishes (consolidado)

### egm-codebase-details
- **Verificado:** todas las referencias de archivo:línea del anclaje son correctas.
- **Inexactitud:** el anclaje dice "ACL SYSTEM Modify + Administrators ReadAndExecute" en `logs/`. El `install-agent.ps1` otorga a Administrators **`F`** (FullControl), no `RX`. La GUI corre como usuario normal, así que la conclusión (no puede escribir) es correcta, pero el detalle de la ACL está mal.
- **No verificado en el repo:** que la GUI no puede leer el spool en producción (razonable: el spool tiene `RX` para Administrators, y la GUI no es admin; pero no está probado por el código).
- **Nit:** `window.rs:188-252` cubre la decisión de cierre por tiempo; la publicación real es `flush_window` en `:275-313` — el rango citado es ligeramente estrecho.
- **Stale:** `app.rs:100-112` es solo el primer branch de `chart_series`; la función completa va a `:99-129`.

### egm-comprehension
- **7 gaps de conocimiento asumido:** spool, SCM, `/status`, "windows" (ambiguo entre `snapshot.windows` y `spool_windows`), overlay, facts worker, prod vs. dev. Cada uno necesita una línea de definición.
- **5 riesgos de misread:** (1) "6× sobre-lectura" se lee como 6 lecturas reales cuando en producción son 6 *opens* fallidos por ACL; el ratio 6× solo aplica en dev. (2) "sub-milisegundo" es hipótesis, no garantía — confirmar en Stage 0, no suponer. (3) El gate "hace rara" la lectura del spool, no "la impide" — el *open* inicial al arrancar y las ventanas con < 2 de `/status` siguen intentando. (4) "win real" está acotado a dev; en producción el gate es un no-op para el jank perceptivo. (5) "spool exculpado" es condicional a Stage 0.
- **13 one-liners de clarificación** propuestos (ver informe completo en la sesión Goldfish).

### egm-design (design critic)
- **D1 [BLOQUEADOR]:** el gate `windows.len() >= 2` deja un hole para `windows = 0/1` (agente viejo, arranque, `/status` degradado) — exactamente el estado de producción donde el anclaje dice que el gate elimina el I/O fallido. Counter: extender el gate para que salte la lectura también cuando `spool_windows.len() >= 2` (el spool ya tiene historial renderizable).
- **D2 [MAYOR]:** el quick win confunde "reducción de I/O" con "fix de jank". En producción no hay mejora perceptible por diseño. Counter: re-enunciar el outcome como "medición + limpieza estructural; cero win perceptivo garantizado en producción".
- **D3 [MAYOR]:** los umbrales de spike no están justificados. `poll_fetch_ms > 1000` es mis-framed: el fetch tiene timeout de 2 s, así que mide "hang", no "lentitud". Counter: reemplazar el spike de `poll_fetch_ms > 1000` por un spike de `poll_age_ms` (la métrica que realmente importa para "dato viejo"), y justificar cada umbral a partir de un presupuesto declarado (fracción del frame de 250 ms).
- **D4 [MAYOR]:** el tag `visible=0/1` no elimina el confound, lo etiqueta. Con el repaint incondicional de 250 ms, los frames ocultos siguen corriendo la query SCM / spool / poll drain. Counter: en Stage 0, medir el sub-paso dominante de `refresh()` en el frame lento (máx. de: poll drain, SCM, spool) y emitirlo — convierte `frame_gap_ms` de "hubo un gap" en "hubo un gap por X".
- **D5 [MAYOR]:** `SC_GUI_STAGE0=1` como binario on/off es el control equivocado para una corrida de 1 día. No hay nada que enforce o registre la ventana de 24 h; el GUI puede no re-tener el env tras un restart; no hay cap de tamaño de archivo. Counter: control por duración (`SC_GUI_STAGE0_SECONDS`, default off, self-disable tras la ventana, logar "window closed").
- **D6 [MAYOR]:** "no hilos nuevos / cero arquitectura" es medio cierto: el gate agrega `spool_skipped` + un branch de decisión, que ES flujo de control nuevo. Re-etiquetar el gate como "agrega un branch de decisión + dos contadores".
- **D7 [NIT]:** el disparador de Plan B (`spool_reads > 1/min`) es auto-referencial — el gate impulsa el contador a ~0. Counter: definir el disparador sobre la staleness del historial renderizado, no sobre la tasa de lecturas.
- **D8 [NIT]:** `gui.log` en `%LOCALAPPDATA%` es un artefacto sin cap ni rotación y sin afirmación de que no lleva identificadores. Counter: tocar cap/rotación y afirmar explícitamente "las líneas de `gui_timing` no contienen device id, token ni host".
- **Veredicto:** el plan de dos partes se sostiene como "medir + reducir estructuralmente el I/O del spool", pero no es una solución auto-contenida a "la GUI se siente lenta". El gate tiene un caso 0/1 sin manejar que contradice su propia nota de expectativa.

### egm-implementation-readiness
- **B1 [BLOQUEADOR]:** la premisa de ACL (GUI no puede leer el spool) está afirmada, no verificada en el repo. Si el spool **sí** es legible por el usuario, la nota de expectativa cae. Pregunta: verificar en `install-agent.ps1`/runbook antes de la corrida.
  - **Resuelto:** sonda runtime de un disparo; suposición documentada. No se toca `install-agent.ps1`. Ver sección "spool_open".
- **B2 [BLOQUEADOR]:** el criterio de éxito ("spool_reads cae a casi cero con agente sano") es auto-contradictorio con Plan B (que contempla `spool_reads > 1/min`). Además, al arrancar, `windows` es 0 y el `GuiApp::new` fuerza una lectura del spool — las lecturas tempranas del boot siguen pasando. Re-enunciar el criterio como "deliverable de medición" (líneas presentes con rangos sanos), no como "spool_reads ≈ 0 garantizado".
  - **Resuelto:** el criterio se re-enuncia como "deliverable de medición" en la sección "Criterio de aceptación".
- **B3:** `poll_age_ms` — ¿qué referencia de timestamp? Ver preguntas abiertas #2.
  - **Resuelto:** opción (b), stamp en el poller. Ver sección "poll_age_ms".
- **B4:** `spool_reads`/`spool_skipped` — ¿unidad de emisión? Recomiendo: solo en la agregada de 5 min, no por evento.
  - **Resuelto:** solo en la agregada de 5 min. Ver sección "Contadores".
- **B5:** `gui.log` — ¿hand-rolled o nueva dep? Confirmado: hand-rolled (precedente `tray_balloon.rs:112-121`). `sc-gui/Cargo.toml` no trae `tracing`/`log`.
  - **Resuelto (implícito):** hand-rolled. El brief dice "Mecanismo de escritura: hand-rolled `std::fs`".
- **B6:** p50/p95 — método (nearest-rank en muestra ascendente).
  - **Resuelto:** nearest-rank. Ver sección "P50/P95".
- **B7:** ventana de 5 min — alineada a reloj de pared o rolling.
  - **Resuelto:** reloj de pared, alineada a época. Ver sección "Ventana de 5 min".
- **B8:** `frame_gap_ms` — ¿qué cuenta como "frame"? Cada llamada a `update()`, o solo frames donde algo cambió.
  - **Resuelto (implícito):** cada llamada a `update()`. El brief dice "intervalo entre llamadas a `update()`".
- **B9:** `spool_read_ms` — ¿llamada completa o solo I/O de open?
  - **Resuelto (implícito):** llamada completa. El brief dice "duración de `read_window_summaries`".
- **B10:** `poll_fetch_ms` — ¿solo en el hilo del poller (envolver el `fetch()`), y un `fetch` fallido (`None`) sigue siendo sample?
  - **Resuelto (implícito):** el brief dice "duración del `fetch` de reqwest en el hilo del poller". Un fetch fallido sigue siendo sample (el timeout de 2 s produce una muestra de ~2000 ms).
- **B11:** `scm_query_ms` — ¿solo cuando el gate `scm_due` dispara (no por frame)?
  - **Resuelto (implícito):** "solo cuando el gate `scm_due` dispara, no por frame".
- **B12:** gate — caso `snapshot = None` (poll fallido): el gate **no** dispara; se sigue leyendo el spool. El anclaje implica esto pero no lo declara.
  - **Resuelto (implícito):** el brief dice "Caso `snapshot = None` (poll fallido): el gate **no** dispara (se sigue leyendo el spool)".
- **Orden de implementación sugerido:** (1) resolver B1-B12 primero (decisiones, no código); (2) agregar el gate (quick win, siempre-activo) + contadores (solo bajo `SC_GUI_STAGE0`); (3) agregar Stage 0 measurement; (4) corrida de 1 día en producción; (5) decidir Plan B con los datos.
  - **Resuelto:** los 5 pasos se reflejan en la sección "Criterio de aceptación" y "Gate vs. contadores".

### egm-inventive-catalyst
- **Contradicción:** la UI debe mantenerse bajo el presupuesto de 250 ms, pero la relectura del spool (5 s) y la query SCM (1 s) son I/O bloqueante-ish en el mismo hilo.
- **IFR:** la GUI es responsive al latido de 250 ms **y** el hilo de UI hace **cero** I/O bloqueante — con sin hilos nuevos, sin arquitectura nueva, sin nuevas rutas de fallo.
- **Transform (nombrada):** "The source of truth moves so no re-read is needed; the gate becomes data-driven instead of hardcoded." Tres moves apilados:
  1. **Extraction/Preliminary Action on the SCM query:** mover `scm::query_service_state` al poller thread existente (`status_client.rs:132-141`). Elimina la query bloqueante de la UI — no gateada, no medida, simplemente movida. **Borderline-compliant** con "no arquitectura nueva" (el hilo existe, pero tocar el pipeline de polling excede el alcance del brief).
  2. **Inversion (event-driven):** el servicio es el writer; si el writer señala "row appended" (watch del mtime, o un contador que la UI incrementa cuando el poller observa `spool_bytes` crecer), la UI relee **en ese evento**, no por timer de 5 s.
  3. **Preliminary Action on I/O budget:** medir el costo (`spool_read_ms`) como la variable de decisión, no un umbral hardcoded.
- **Veredicto:** el plan de dos partes alcanza el IFR en la dimensión del spool, pero deja un gap conocido: la query SCM bloqueante (`app.rs:195`) se mide pero no se elimina estructuralmente, y el latido de 250 ms queda deferred. El IFR de "cero I/O bloqueante en la UI" no se alcanza por completo — solo en el spool, gated on data.

### egm-structural
- **12 gaps de estructura:** (1) sin campo `Status` en el header. (2) sin sección `Overview`. (3) Goals implícitos; Non-Goals nombrados pero no enforced. (4) sin sección `Alternatives Considered`. (5) sin sección `Open Questions`. (6) `Criterio de éxito` es en parte restatement, no acceptance criterion completo. (7) formato `gui_timing` no en code-block. (8) sin IFR ni contradicción nombrada (TRIZ). (9) sin sección `Risks & Mitigations`. (10) sin sección `Detailed Implementation`. (11) sin `PARADA`. (12) sin `Future Improvements`.
  - **Resuelto:** todos los 12 gaps se cubrieron con las secciones del brief (Status, Overview, Goals, Non-Goals, Alternatives Considered, Open Questions, Acceptance Criteria con Stage 0/Gate/Brief-level, formato grepeable en code-block, Contradicción técnica nombrada, Risks & Mitigations, Detailed Implementation — **pendiente**, PARADA, Future Improvements como "Fuera de este brief").
- **4 boundary leaks:** L1 — el tag `visible=0/1` bleeda en territorio de la política de repaint. L2 — la nota de expectativa introduce un hecho de ACL no verificado. L3 — Plan B escrito inline como si fuera parte del gate. L4 — los contadores mezclan dos fases (Stage 0 y gate).
  - **Resuelto:** L1 → la sección "Riesgos y Mitigaciones" dice "no modificar el comportamiento de repaint; ADR-0017 §3 policy es unchanged". L2 → sección "spool_open" + pregunta abierta #1. L3 → Plan B en "Alternatives Considered" como A3, separado del gate. L4 → sección "Gate vs. contadores".
- **13 ediciones de sección recomendadas** (ver informe completo).
  - **Resuelto:** todas cubiertas.

### egm-zoom-out
- **Right-problem check:** el síntoma user-visible es "la GUI se siente lenta". El brief ataca un componente (la relectura del spool), no el síntoma. El mecanismo real del jank (stall por timer, repaint oculto, facts worker) está en "Fuera de este brief". El brief es honesto sobre esto (línea 30, 58), pero sus criterios de éxito **no verifican que el síntoma user-visible se haya resuelto**. Un brief que "pasa" todos sus criterios puede dejar la GUI igual de lenta.
- **Altitude gap:** el trim está justificado como trim, pero es un error si el modelo mental del owner es "el spool es la causa". El brief es un ticket de diagnóstico (Stage 0) + limpieza en dev (gate). El riesgo es organizacional: alguien puede concluir "spool exculpado, listo" cuando el defecto user-visible quedó en la lista deferred sin dueño.
- **Stage 0 rate vs. single-event:** el brief asume un problema de tasa (mide cadencia, p50/p95/max cada 5 min). Pero el síntoma ("feels slow") y la hipótesis del mecanismo ("un stall por timer que coincide con un clic") apuntan a un problema de **un solo evento**: un stall grande ocasional, no muchos chicos. Un stall único aparece como un `max` one-off, no como un p50/p95 desplazado. Y el spike `frame_gap_ms > 500` solo se emite con `visible=1` — un stall en ventana oculta queda sub-muestreado. La ventana de 1 día es **larga para un problema de tasa, corta para un problema de un solo evento**: si el jank pasa ~1 vez al día, la captura puede contener cero eventos calificados.
- **Failure modes (cuando el brief está equivocada y el owner no lo nota hasta el release):**
  1. No-signal silent pass — `gui.log` se produce, spool cae a ~0, pero no hay spikes de `frame_gap_ms`/`scm_query_ms`. El brief se declara "hecho", el spool "exculpado", y el mecanismo real nunca se instrumenta a la cadencia correcta.
  2. Misattribution del stall en ventana oculta — el `visible=0` exclusion hace que los percentiles de `visible=1` parezcan limpios; la política de repaint oculta no recibe justificación medida y queda deferred.
  3. False sense of completion del quick win — el gate se shippea sin Stage 0; el owner dice "fixeamos la sobre-lectura del spool" pero el síntoma perceptivo no cambió.
  4. El granulado de 5 min hunde el spike — un stall de ~300 ms en un frame no mueve p50/p95; el umbral `frame_gap_ms > 500` puede estar sobre el magnitud real de la queja; nada dispara.
  5. No hay ticket que ancore el fix deferred — si Stage 0 confirma el stall, no hay follow-on nombrado para implementar repaint-oculto + facts-worker.
- **Recomendación:** (1) agregar un "no-signal" branch al criterio de éxito (segunda captura con correlación a reveal). (2) nombrar el ticket de seguimiento en "Fuera de este brief" — no solo dejarlo parkеado. (3) ampliar la captura a correlación de reveal (un `reveal` marker en el timestamp de `Visible(true)` de ADR-0017 §2).
  - **Resuelto:** las 3 recomendaciones se incorporaron (no-signal branch en "Criterio de aceptación", ticket de seguimiento en "Fuera de este brief", Pregunta abierta #8/#9 para la segunda captura).

## Pendientes del owner (2 preguntas abiertas)

1. **Segunda captura:** si Stage 0 no-signal, ¿el owner acepta una segunda corrida de 1 día con correlación a reveal, o se cierra el ticket con "no hay evidencia"? (Pregunta abierta #8)
   - **Resuelto:** sí, pero condicionada, capeada, y con la capa de correlación ya metida en la corrida 1 a costo cero (diario de jank). Regla de decisión prefijada: (a) correlación con spikes/agregadas → hay señal, no hay corrida 2; (b) síntoma reproducido + métricas limpias → una corrida 2 con `input_to_paint_ms` como única métrica, sin corrida 3; (c) síntoma no reproducido → inconclusa, reprogramar a un día con el patrón de uso que reproduce el síntoma. Tope duro: dos días de captura en total. Ver sección "Criterio de aceptación → Stage 0 DONE".
2. **Ticket de seguimiento:** si Stage 0 confirma el stall por timer, ¿quién abre el ticket de repaint-oculto + facts-worker (ADR-0017 §3)? ¿Se nombra aquí o queda a discreción del owner?
   - **Resuelto:** se pre-crea ahora como ticket contingente, status `blocked-pending-Stage-0`, owner = la pista `sc-gui` (el mismo owner de este brief y del mismo territorio de código: repaint en `app.rs` y facts en `actions.rs`). El informe de cierre de Stage 0 lo voltea a `open` con el extracto de log adjunto, o lo cierra como `blocked` si no hay confirmación. Su contenido queda fijado hoy: disparo cuantitativo (≥3 spikes de `frame_gap_ms > 500` con `visible=1` en un día, o p95 de `frame_gap` visible > 500 ms), dos work items (repaint-oculto por eventos de bandeja + facts-worker), no-goals explícitos (sin rediseño visual, sin per-tab caching). Ver sección "Ticket contingente pre-creado".

---

**Resumen del handoff:** El brief está consolidado con las 11 decisiones del owner más 5 enmiendas (N1-N5). Los 7 Goldfishes convergieron en 3 puntos (gate 0/1 bloqueador, quick win no es fix de jank en producción, no-signal branch obligatorio). Todas las preguntas abiertas quedan resueltas. El brief está listo para review final y handoff (RFC / egm-draft / concluir).
