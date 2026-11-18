# sc-gui: recorte de lectura del spool y medición antes de optimizar

* **Author:** Juan (propietario) — anclaje preparado por el agente EGM
* **Date:** 2026-11-17

## Hypothesis (recortada, opción b)

La GUI de `sc-gui` se siente lenta. El problema se recorta a dos cosas y nada más:

1. **Stage 0 — Medir antes de tocar nada.** Sin instrumentación no hay evidencia. Se agrega log de duración de cuatro métricas y se deja correr 1 día en el host de producción. Lo que salga de esos números decide qué se optimiza y qué no.
   - `spool_read_ms` (duración de `read_window_summaries`)
   - `scm_query_ms` (duración de `scm::query_service_state`)
   - `frame_gap_ms` (cadencia de frames efectivamente pintados, con tag `visible=0/1`)
   - `poll_fetch_ms` (duración del `fetch` de reqwest en el hilo del poller) + `poll_age_ms` (edad del snapshot al momento de pintar)
   - `try_latest()` del poller **no** se mide (try_recv de mpsc es ruido).
   - Motivo de `poll_fetch_ms`/`poll_age_ms`: distinguen "dato viejo" de "UI trabada", dos síntomas distintos; si Stage 0 no los separa, el día de logs no decide nada.
   - **Formato de emisión (dos modos y nada más):**
     - (a) Línea de **spike** cuando una métrica cruza umbral: `spool_read_ms > 50`, `scm_query_ms > 25`, `frame_gap_ms > 500` (solo con ventana visible), `poll_fetch_ms > 1000`.
     - (b) Línea **agregada** cada 5 minutos: `n/min/p50/p95/max` por métrica. ≈ 288 agregadas/día + spikes: revisable a mano y grepeable.
   - **Destino:** archivo propio `%LOCALAPPDATA%\SC-Sentinel\logs\gui.log`, evento `gui_timing`, formato `key=value` estable. NO a `agent.log` por dos razones duras: (1) la GUI corre como usuario y `C:\ProgramData\SC-Sentinel\logs` tiene ACL SYSTEM Modify + Administrators ReadAndExecute — el proceso de la GUI no puede escribir ahí; (2) el timing de la GUI no es telemetría del agente.
   - **Activación:** `SC_GUI_STAGE0=1` (instrumentación temporal; no queda encendida por defecto).
   - **Contador extra:** `spool_reads` vs `spool_skipped` (lecturas evitadas por el gate) para que Stage 0 cuantifique el propio quick win.
   - `frame_gap_ms` lleva `visible=0/1` obligatorio: la cadencia con la ventana oculta (latido de ADR-0017 §3) es otro régimen y mezclarla contamina los percentiles.

2. **Quick win — Gate de relectura del spool.** El servicio escribe el spool cada 30 s; la GUI lo relee cada 5 s (6× sobre-lectura), y el resultado casi siempre se descarta porque `/status` ya publica 60 ventanas y el gráfico/tabla las prefieren.
   - **Opción fija (a):** no releer el spool mientras `self.snapshot.windows.len() >= 2`.
   - Razones: codifica que `/status` es fuente preferida y el spool es fallback; en producción con agente sano las lecturas caen a casi cero (ganancia mayor que acotar a 30 s); no agrega estado nuevo ni constante mágica.
   - Se descarta `spool_bytes > 0` (los bytes no dicen frescura de historial; semántica distinta).
   - **Plan B documentado (cota de staleness):** si Stage 0 muestra `spool_reads > 1/min` sostenido con el gate activo, se suma `last_spool_read.elapsed() >= 30 s` encima de (a). No es puerta abierta, es regla de decisión con disparador.
   - **Nota de expectativa (fijar ahora):** en producción la GUI hoy **no puede** leer el spool del servicio (archivo escrito por SYSTEM, proceso de usuario sin ACL). La "sobre-lectura" actual es un open fallido cada 5 s. El gate también elimina ese I/O periódico fallido y su camino de error; `spool_read_ms` en producción probablemente salga sub-milisegundo. Si sale así, el spool queda exculpado como causa del jank en producción y la evidencia apuntará al stall por timer (`frame_gap_ms`/`scm_query_ms`). El quick win es **limpieza estructural y win real en máquinas dev** (donde el spool sí es legible), **no** el fix del jank en producción.

## Correcciones de la hipótesis original (fijas)

- El I/O de reqwest va en el hilo del poller, no en el de la UI — desperdicio real pero **no** causa el jank.
- Cambiar de pestaña no hace I/O; el mecanismo plausible del jank es un stall por timer que coincide con un clic.
- Per-tab caching: **rechazado**. Rediseño visual: **fuera de este concepto**.

## Fuera de este brief (se toman después, con los números de Stage 0)

- Facts worker.
- Política de repaint oculto por eventos de bandeja (latido de 250 ms, ADR-0017 §3).
- Rediseño visual y per-tab caching.

## Referencias (archivos y líneas)

- `agent/crates/sc-gui/src/app.rs:232-240` (relectura cada 5 s), `:100-112` y `:133-149` (preferencia de `snapshot.windows`), `:1320` (`request_repaint_after(250 ms)`), `:195` (SCM query).
- `agent/crates/sc-gui/src/status_client.rs:23` (`POLL_INTERVAL = 1 s`), `:132-141` (`Poller::spawn` en hilo), `:111-124` (`fetch` con reqwest por intento).
- `agent/crates/sc-gui/src/spool_history.rs:43` (`read_window_summaries`), `:32-37` (`default_spool_path`), `:18-19` (`MAX_POINTS = 60`, ventanas de 30 s).
- `agent/crates/sc-gui/src/tray.rs` (menú/doble-clic por sondeo en cada frame).
- `agent/crates/sc-aggregate/src/window.rs:188-252` (ticker cierra ventana por tiempo cada 30 s, "publica aunque no haya tráfico").
- `docs/adr/0017-sc-gui-eframe-tray.md` §3 (bandeja: sondeo por frame, `request_repaint_after(250 ms)`; doble clic 500 ms).
- `agent/crates/sc-agent/src/main.rs:596-655` (spooler escribe 1 fila por `AggregatedWindow` de `snap_rx`).

## Criterio de éxito (medido, no supuesto)

- Stage 0 produce, en producción durante 1 día, las líneas de `gui_timing` (spikes + agregadas 5 min) en `gui.log` con `SC_GUI_STAGE0=1`.
- `spool_skipped` crece cuando el gate está activo y `spool_reads` cae a casi cero con agente sano.
- El brief NO afirma un win perceptivo el día uno; el win perceptivo depende de lo que `frame_gap_ms`/`scm_query_ms` muestren.
