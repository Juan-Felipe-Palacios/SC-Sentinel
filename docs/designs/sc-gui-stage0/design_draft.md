# `sc-gui`: recorte de lectura del spool y medición antes de optimizar

*   **Author:** Juan (propietario)
*   **Status:** Draft
*   **Date:** 2026-11-17

--------------------------------------------------------------------------------

## Overview

La GUI de `sc-gui` (binario de bandeja, separado del servicio) se siente lenta. El anclaje original hipotetizaba que la causa era el I/O del spool: la GUI relee el spool SQLite cada 5 s mientras el servicio lo escribe cada 30 s. Sin embargo, dos hechos verificados en el código y en el modelo de seguridad del producto fuerzan un recorte del problema:

1. **El mecanismo plausible del jank no es el I/O del spool.** El `reqwest` del poller corre en un hilo separado (`status_client.rs:132-141`); cambiar de pestaña no hace I/O. El mecanismo probable es un **stall por timer que coincide con un clic** (latido de repaint de 250 ms, ADR-0017 §3). En producción, el spool es un **open fallido por ACL** cada 5 s — el I/O real es el camino de error, no una lectura de datos.
2. **La ilegibilidad del spool por la GUI es una propiedad de seguridad por diseño**, no un bug. El spool queda SYSTEM-escritura / admin-lectura; el canal sancionado de datos hacia la GUI es `/status` (loopback, sin secretos). No se relaja la ACL. La sonda `spool_open` de un disparo documenta esta propiedad como evidencia, no la repara.

Por eso el problema se recorta a dos cosas y nada más:

- **Stage 0 — Medir antes de tocar nada.** Sin instrumentación no hay evidencia. Se agregan cuatro métricas y se deja correr 1 día en producción con un protocolo capeado. Lo que salga de esos números decide qué se optimiza y qué no.
- **Quick win — Gate de relectura del spool.** El gate salta la relectura mientras `snapshot.windows.len() >= 2`. Es limpieza estructural y win real en máquinas dev (donde el spool sí es legible). **El quick win no es el fix del jank en producción**: en producción el spool ya era ilegible (open fallido por ACL), así que el gate no cambia la experiencia percibida del usuario. El win perceptivo depende de lo que Stage 0 muestre en `frame_gap_ms` y `scm_query_ms`.

Todo lo demás (facts worker, política de repaint oculto, rediseño visual, per-tab caching) queda fuera de este diseño y se toma después, con los números de Stage 0.

**Contradicción técnica nombrada:** la GUI debe leer el spool para obtener historial, pero el spool lo escribe SYSTEM y la GUI corre como usuario normal sin ACL — así que en producción la "lectura" es un open fallido cada 5 s, y la métrica mide el fallo, no la lectura. Stage 0 debe resolver: ¿el jank viene del I/O fallido, o del stall por timer?

## The Problem

La GUI de `sc-gui` se siente lenta. La hipótesis original era que la causa era el I/O del spool (6× sobre-lectura: servicio escribe cada 30 s, GUI relee cada 5 s). Los 7 Goldfishes convergieron en tres puntos que recortan la hipótesis:

1. **Todo está sin medir.** La lentitud es subjetiva y la GUI no tiene instrumentación de tiempos. Se exige un Stage 0 de medición (duración de `read_window_summaries`, `scm::query_service_state`, cadencia de frames, `poll_fetch`/`poll_age`) durante 1 día en el host de producción antes de tocar nada. Es el estándar de evidencia del repo: medido, no supuesto.

2. **La victoria más grande y barata no estaba en la hipótesis: no leer el spool.** El servicio escribe el spool cada 30 s pero la GUI lo relee cada 5 s (6× de sobre-lectura), y el resultado casi siempre se descarta: `/status` ya publica 60 ventanas y el gráfico/tabla prefieren esas ventanas (`app.rs:100-112, 133-149`). Basta un gate: saltear la relectura mientras `snapshot.windows.len() >= 2`. Cero hilos nuevos, cero arquitectura nueva.

3. **La repintada condicional sin orden correcto mata la bandeja.** El menú/doble-clic de la bandeja dependen del latido de 250 ms (ADR-0017 §3). La política de repaint oculto queda fuera de este diseño y se toma después, con los números de Stage 0.

**Correcciones de la hipótesis original (fijas):**
- El I/O de reqwest va en el hilo del poller, no en el de la UI — desperdicio real pero no causa el jank.
- Cambiar de pestaña no hace I/O; el mecanismo plausible del jank es un stall por timer que coincide con un clic.
- Per-tab caching: rechazado. Rediseño visual: fuera de este diseño.

## Goals

- **G1.** Stage 0 produce, en producción durante 1 día con diario de jank, un log `gui.log` con las líneas de `gui_timing` (spikes por umbral + agregadas de reloj de pared cada 5 min) que permita un go/no-go por cada optimización candidata. El protocolo incluye: corrida 1 con diario (offset UTC en la primera línea, per N3), corrida 2 autorizada solo bajo la regla de decisión (síntoma reproducido + métricas limpias → `input_to_paint_ms` con definición de inputs per N4), tope duro de dos días, y cierre "sin repro bajo medición, reabrible con pasos" si el síntoma no aparece en la ventana.
- **G2.** El gate reduce las relecturas del spool a casi cero en un agente sano (≥ 2 ventanas en `/status`), medido con los contadores temporales `spool_reads`/`spool_skipped`.

## Non-Goals

- Facts worker (mover el I/O de la UI a un hilo).
- Política de repaint oculto por eventos de bandeja (ADR-0017 §3, latido de 250 ms).
- Rediseño visual de la GUI.
- Per-tab caching (rechazado por 4 de 7 Goldfishes).
- Ningún ítem dentro de este diseño modifica, extiende o re-decide estos. Un resultado de Stage 0 que apunte a uno de ellos es un hand-off, no un cambio de alcance.

**Dependencia gestionada:** el ticket contingente `blocked-pending-Stage-0` (owner = pista `sc-gui`, disparo cuantitativo: ≥3 spikes de `frame_gap_ms > 500` con `visible=1` en un día o p95 de `frame_gap` visible > 500 ms) es una dependencia externa gestionada por Stage 0, no una pregunta abierta de este diseño. El informe de cierre de Stage 0 lo voltea a `open` con el extracto de log adjunto, o lo cierra como `blocked`.

## Open Questions

Las tres preguntas que Stage 0 decide (todas resueltas en el brief, se listan aquí como contrato para el draft):

1. **Qué mecanismo se optimiza tras la medición:** Stage 0 decide si el jank viene del I/O fallido (`spool_read_ms` sub-milisegundo → spool exculpado) o del stall por timer (`frame_gap_ms > 500` coincidiendo con un clic, o `scm_query_ms > 25` en la query de 1 s). Si Stage 0 exculpa al spool, el siguiente paso es el ticket contingente de repaint-oculto + facts-worker, no un rediseño del gate.
2. **Si el plan B de 30 s se activa bajo su regla:** el plan B (`last_spool_read.elapsed() >= 30 s` como cota de staleness) se activa solo si Stage 0 muestra `spool_reads > 1/min` sostenido con el gate activo. La regla de decisión está prefijada; no se reabre tras la medición.
3. **Si se autoriza la corrida 2:** la corrida 2 (con `input_to_paint_ms` como única métrica adicional) se autoriza solo si hay entradas en el diario de jank (síntoma reproducido) y las métricas salen limpias. Tope duro: dos días de captura en total.

**Dependencia gestionada (no es pregunta abierta):** el ticket contingente `blocked-pending-Stage-0` (owner = pista `sc-gui`, disparo cuantitativo: ≥3 spikes de `frame_gap_ms > 500` con `visible=1` en un día o p95 de `frame_gap` visible > 500 ms) figura en Non-Goals como dependencia externa gestionada, no como pregunta abierta. El informe de cierre de Stage 0 lo voltea a `open` con el extracto de log adjunto, o lo cierra como `blocked`.

--------------------------------------------------------------------------------

## Technical Plan (Architecture)

### Diagrama de flujo de datos

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Hilo UI (frame loop, 250 ms heartbeat ADR-0017 §3)                    │
│                                                                         │
│  GuiApp::update()                                                       │
│    ├── refresh()                                                        │
│    │     ├── poller.try_latest() ──→ snapshot (Option<StatusSnapshot>)  │
│    │     │     └── fetched_at: Instant (stamp del poller)              │
│    │     ├── scm_due? ──→ scm::query_service_state() (gated 1 s)       │
│    │     │     └── scm_query_ms (solo si ejecuta)                      │
│    │     ├── spool_due? (5 s)                                          │
│    │     │     └── gated = snapshot.windows.len() >= 2                 │
│    │     │           ├── gated=true  → spool_skipped++ (sin open)     │
│    │     │           └── gated=false → spool_open probe (1 vez/tipo)   │
│    │     │                       → read_window_summaries()            │
│    │     │                       → spool_read_ms                      │
│    │     │                       → spool_reads++                      │
│    │     ├── history.push(snapshot.packets_seen)                       │
│    │     ├── sync_age, level = health_level(...)                       │
│    │     └── frame_gap_ms = now - last_update_instant                  │
│    │           └── visible tag (ctx.viewport().visible())              │
│    ├── tray.poll_menu() / poll_double_click()                          │
│    ├── sync_tray(overlay)                                              │
│    └── render UI (header, tabs, body)                                  │
│                                                                         │
│  ctx.request_repaint_after(250 ms)                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Hilo poller (status_client.rs:132-141, thread::spawn)                  │
│                                                                         │
│  loop {                                                                 │
│    t0 = Instant::now()                                                  │
│    result = fetch(&url)  // reqwest blocking, timeout 2 s              │
│    poll_fetch_ms = t0.elapsed()                                         │
│    if result.is_some() {                                                │
│       snapshot = result with fetched_at = Instant::now()                │
│    }                                                                    │
│    tx.send(snapshot)                                                    │
│    sleep(POLL_INTERVAL = 1 s)                                           │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Hilo escritor (N1, solo si SC_GUI_STAGE0=1)                            │
│                                                                         │
│  rx: mpsc<LogLine>                                                      │
│  loop {                                                                 │
│    line = rx.recv()                                                     │
│    write to gui.log (append, truncate at 10 MB)                         │
│    on error: drop line, continue (best-effort, never panic)             │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### WP1 — Gate permanente

**Condición exacta:** no releer el spool mientras `self.snapshot.windows.len() >= 2`.

**Implementación en `refresh()` (`app.rs:232-240`):**

```rust
// ANTES (líneas 232-240)
let spool_due = self.last_spool_read
    .map(|at| at.elapsed() >= Duration::from_secs(5))
    .unwrap_or(true);
if spool_due {
    self.spool_windows = read_window_summaries(&default_spool_path(), MAX_POINTS);
    self.last_spool_read = Some(Instant::now());
}

// DESPUÉS
let spool_due = self.last_spool_read
    .map(|at| at.elapsed() >= Duration::from_secs(5))
    .unwrap_or(true);
let gated = self.snapshot.as_ref()
    .map(|s| s.windows.len() >= 2)
    .unwrap_or(false); // snapshot = None → no gate → se sigue leyendo
if spool_due && !gated {
    self.spool_windows = read_window_summaries(&default_spool_path(), MAX_POINTS);
    self.last_spool_read = Some(Instant::now());
}
```

**Tests (sin variable de entorno):**
- `spool_read_skipped_when_windows_ge_2`: snapshot con 2+ ventanas → no se llama a `read_window_summaries`.
- `spool_read_when_windows_lt_2`: snapshot con 0 o 1 ventanas → se lee el spool.
- `spool_read_when_snapshot_none`: snapshot = None → se lee el spool (fallback con agente caído).

**Aceptación:** gates verdes (`cargo test --workspace` en verde) y conteo de lecturas de spool caído a ~0 con agente sano en dev.

### WP2 — Instrumentación bajo `SC_GUI_STAGE0=1`

**Métricas (cuatro):**

| Métrica | Punto de medición | Umbral spike |
|---|---|---|
| `spool_read_ms` | Duración de `read_window_summaries()` (llamada completa) | > 50 ms |
| `scm_query_ms` | Duración de `scm::query_service_state()` (solo si `scm_due`) | > 25 ms |
| `frame_gap_ms` | `Instant::now() - last_update_instant` en `update()` | > 500 ms (solo `visible=1`) |
| `poll_fetch_ms` + `poll_age_ms` | Duración de `fetch()` en hilo poller + `now - fetched_at` al pintar | `poll_age_ms > 3000 ms` (enmienda 2026-11-18; ver nota de enmienda) |

**Enmiendas (2026-11-18, tras el pre-flight):**
1. **Umbral de spike de `poll_age_ms`: 1000 → 3000 ms.** Justificación: en reposo el pre-flight midió `poll_age_ms` max 1002 ms con cadencia de poll ≈1,03 s (n=290/300 s), o sea que 1000 ms estaba en el piso de ruido y habría llenado la corrida 1 de spikes estructurales.
2. **Backfill de ventanas omitidas** (ver *Modos de emisión*): el pre-flight midió una pausa de repaint de 381 s con el poller vivo (ventana `2026-11-18T13:35:00Z` omitida). Sin backfill, un gap de ventanas sería indistinguible de "logger muerto" y rompería la invariante de 288 ventanas/día en la correlación con el diario.

**Stamp en poller (`status_client.rs`):**
- El poller graba `fetched_at: Instant` cuando un `fetch` termina con éxito.
- El stamp viaja con el snapshot por el canal mpsc.
- La UI calcula `poll_age_ms = now - fetched_at` al pintar.
- `Instant` (monotónico), no `SystemTime`.

**Hilo escritor (N1):**
- Canal mpsc `Sender<LogLine>` → hilo escritor best-effort.
- Un fallo de escritura nunca paniquea ni bloquea el repintado.
- Las escrituras de `gui.log` (spikes y agregadas) van fuera del hilo de UI.

**Sonda `spool_open` (un disparo):**
- Primer intento de open del spool: loguear una sola vez por tipo de error con código de OS (`spool_open=denied os_error=5`).
- Deduplicado, no cada 5 s. No se toca `install-agent.ps1`.

**Modos de emisión:**
- **(a) Spike:** línea cuando una métrica cruza umbral.
- **(b) Agregada cada 5 min:** `n/min/p50/p95/max` por métrica. Fronteras fijas cada 300 s alineadas a epoch (`window_start = now - (now % 300s)`). Emisión al cierre. Etiquetada `window=<ISO-8601 UTC>`. No rolling.
- **(c) Backfill de ventanas omitidas:** si `update()` no corre durante una pausa (p. ej. oclusión de la ventana), al reanudar `tick()` emite la agregada completa (`n=0` en las 5 métricas + contadores `value=0`) por cada frontera intermedia cruzada; la ventana aún abierta no se emite. Conserva la invariante de 288 ventanas/día y permite distinguir "sin muestras" de "logger muerto".

**Nearest-rank (fórmula):** `idx = max(1, ceil(p * n / 100))` sobre el arreglo ordenado ascendente, indexado en 1. Si `n == 0`, la línea se emite con `n=0` y se omiten los percentiles.

**Split por visibilidad:** si dentro de una ventana hubo ambos regímenes (`visible=0` y `visible=1`), se emiten dos líneas con sus propios `n`.

**Contadores `spool_reads`/`spool_skipped`:** solo en la agregada de 5 min, no por evento.

**Tope de `gui.log` (N2):** rotación única o truncate a 10 MB. Red de seguridad, no expectativa.

**Sub-pasos de `refresh()` (D4):** en el frame lento, también se mide el sub-paso dominante (máx. de: drain del poller, query SCM, lectura del spool) y se emite como parte de `frame_gap_ms`.

**Aceptación:** con flag apagado, cero logs y cero overhead medible; con flag encendido, ~288 agregadas/día más spikes; tests unitarios de nearest-rank y alineación de ventanas.

### WP3 — Protocolo de corrida 1

**Plantilla de diario:**
- Primera línea: fecha + offset UTC del host ese día (per N3).
- Entradas: HH:MM (hora local) + acción (clic, cambio de pestaña, restore desde bandeja) + trabazón percibida.

**Procedimiento de arranque:**
1. Build release de `sc-gui`.
2. `SC_GUI_STAGE0=1` en el entorno del proceso.
3. Uso normal durante 1 día completo.
4. Al cierre: convertir el diario a UTC usando el offset de la primera línea.

**Análisis de cierre (reglas de decisión):**
- (a) Si las entradas del diario correlacionan con spikes o agregadas → hay señal, no hay corrida 2, se pasa al ticket de fix.
- (b) Si hay entradas del diario (síntoma reproducido) y las métricas salen limpias → el punto ciego es input-to-paint y se autoriza exactamente una corrida 2 con `input_to_paint_ms` (definición de inputs per N4: cuenta pointer-press, key-press y restore desde bandeja; excluye hover, move y scroll), sin corrida 3.
- (c) Si no hay entradas del diario porque el síntoma no se reprodujo → inconclusa, reprogramar a un día con el patrón de uso que reproduce el síntoma. Cerrable como "sin repro bajo medición, reabrible con pasos".

**Tope duro:** dos días de captura en total. Después de la corrida 2 se decide con lo que haya.

**Archivo de evidencia (N5):** al cierre, `gui.log` + diario + informe van a `docs/evidence/sc-gui-stage0-<fecha>/`.

**Nota de los 4 Goldfishes vacíos (N5):** 4 de 7 Goldfishes no produjeron hallazgos adicionales (egm-codebase-details verificó referencias, egm-comprehension identificó gaps de conocimiento, egm-inventive-catalyst propuso el transform, egm-zoom-out evaluó altitud). Los 3 que produjeron hallazgos sustantivos (egm-design con 8 objeciones, egm-implementation-readiness con 12 blockers/ambiguities, egm-structural con 12 gaps + 4 leaks) moldearon el brief.

**Ticket contingente:** el informe de cierre de WP3 voltea el ticket `blocked-pending-Stage-0` a `open` con el extracto de log adjunto, o lo cierra como `blocked`, según el disparo cuantitativo (≥3 spikes visibles >500 ms o p95 visible >500 ms).

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `agent/crates/sc-gui/src/app.rs` (Modify)

*   **Type / Scope:** GUI main window, `GuiApp` struct and `refresh()` method.
*   **Proposed Changes:**
    *   WP1: Add `gated` boolean to `refresh()` (lines 232-240) ANDed to `spool_due`.
    *   WP2: Add `frame_gap_ms` measurement in `update()` (line 1258) with `visible` tag.
    *   WP2: Add `spool_read_ms` timing around `read_window_summaries` call.
    *   WP2: Add `scm_query_ms` timing around `scm::query_service_state` call (line 195).
    *   WP2: Add `spool_open` probe (one-shot, deduplicated by error type).
    *   WP2: Add `spool_reads`/`spool_skipped` counters (only under `SC_GUI_STAGE0`).
    *   WP2: Add `last_update_instant: Option<Instant>` field to `GuiApp`.
    *   WP2: Add `log_tx: Option<mpsc::Sender<LogLine>>` field (N1, only if `SC_GUI_STAGE0=1`).
    *   N1: Spawn writer thread in `GuiApp::new()` if `SC_GUI_STAGE0=1`.

#### 2. `agent/crates/sc-gui/src/status_client.rs` (Modify)

*   **Type / Scope:** Poller client, `StatusSnapshot` and `Poller` structs.
*   **Proposed Changes:**
    *   WP2: Add `fetched_at: Instant` field to `StatusSnapshot` (or a wrapper type) for `poll_age_ms`.
    *   WP2: In `Poller::spawn`, record `fetched_at` when `fetch()` succeeds.
    *   WP2: Add `poll_fetch_ms` timing around `fetch()` call in poller thread.
    *   WP2: Ensure `fetch` failures still produce a sample (timeout → ~2000 ms).

#### 3. `agent/crates/sc-gui/src/spool_history.rs` (Modify — minimal)

*   **Type / Scope:** Spool reader.
*   **Proposed Changes:**
    *   WP2: No structural changes. `read_window_summaries` already returns `Vec::new()` on failure; the caller times the call.

#### 4. `agent/crates/sc-gui/src/main.rs` (Modify)

*   **Type / Scope:** Entry point, window setup.
*   **Proposed Changes:**
    *   WP2: Check `SC_GUI_STAGE0` env var at startup; log a startup line stating whether instrumentation is on (N2 safety).
    *   WP2: Create `gui.log` path (`%LOCALAPPDATA%\SC-Sentinel\logs\gui.log`).
    *   WP2: Pass `log_tx` to `GuiApp::new()`.

#### 5. `agent/crates/sc-gui/src/log_writer.rs` (Create)

*   **Type / Scope:** New module for the mpsc-based log writer (N1).
*   **Proposed Changes:**
    *   `LogLine` struct (key=value string).
    *   `spawn_writer(path: PathBuf) -> (Sender<LogLine>, JoinHandle<()>)`.
    *   Best-effort write: on error, drop line and continue.
    *   Truncate/rotate at 10 MB (N2).
    *   Nearest-rank calculation helper (testable).
    *   Wall-clock window alignment helper (testable).

#### 6. `agent/crates/sc-gui/Cargo.toml` (Modify — minimal)

*   **Type / Scope:** Build configuration.
*   **Proposed Changes:**
    *   No new dependencies. Hand-rolled `std::fs` (precedente: `tray_balloon.rs`).

#### 7. Tests (Create/Modify)

*   **Type / Scope:** Unit tests.
*   **Proposed Changes:**
    *   WP1: `spool_read_skipped_when_windows_ge_2`, `spool_read_when_windows_lt_2`, `spool_read_when_snapshot_none`.
    *   WP2: `nearest_rank_p50_p95` (verify formula with known samples), `wall_clock_window_alignment` (verify 300 s boundaries), `n_zero_emits_line_without_percentiles`.
    *   WP2: `spool_open_probe_fires_once` (deduplication by error type).

### Verification Plan

*   **Compilation/Build:** `cargo build -p sc-gui` (MSRV 1.76).
*   **Unit Tests:** `cargo test -p sc-gui` — all WP1 and WP2 tests pass.
*   **Static Analysis & Linting:** `cargo clippy -p sc-gui -- -D warnings`, `cargo fmt --check`.
*   **WP1 Aceptación:** gates verdes y conteo de lecturas de spool caído a ~0 con agente sano en dev.
*   **WP2 Aceptación:** con flag apagado, cero logs y cero overhead medible; con flag encendido, ~288 agregadas/día más spikes; tests unitarios de nearest-rank y alineación de ventanas.
*   **WP3 Aceptación:** plantilla de diario, procedimiento de arranque, análisis de cierre con reglas de decisión, archivo en `docs/evidence/`, nota de los 4 Goldfishes vacíos.

--------------------------------------------------------------------------------

## Alternatives Considered

### Alternative A: Gate threshold `>= 2` ventanas — **elegida**
*   **Pros:** codifica que `/status` es fuente preferida y el spool es fallback; en producción con agente sano las lecturas caen a casi cero; no agrega estado nuevo ni constante mágica.
*   **Cons:** no cubre el caso `windows = 0/1` (agente viejo, arranque, `/status` degradado).
*   **Reason for Rejection (de las otras):** A2 (spool_bytes) rechazada por semántica distinta; A3 (30 s fijo) deferred como Plan B bajo regla de decisión; A4 (per-tab caching) rechazada por 4 de 7 Goldfishes; A5 (mover SCM al poller) deferred por exceder alcance.

### Alternative B: Síncrono en hilo de UI para `gui.log` — **rechazada (N1)**
*   **Pros:** más simple, sin canal ni hilo adicional.
*   **Cons:** un spike logueado sincrónicamente podría fabricar su propio `frame_gap` y la medición se mordería la cola.
*   **Reason for Rejection:** la instrumentación no debe perturbar lo medido.

### Alternative C: Control por duración (`SC_GUI_STAGE0_SECONDS`) en vez de binario — **deferred (D5)**
*   **Pros:** enforce y registra la ventana de 24 h; sobrevive restarts; acota el tamaño de archivo.
*   **Cons:** más complejo que un env var binario.
*   **Reason for Rejection:** el brief fija `SC_GUI_STAGE0=1` como activación; el control por duración es una mejora futura si Stage 0 lo requiere.

--------------------------------------------------------------------------------

## Non-Functional Requirements

- **Security & Privacy:** `gui.log` contiene solo duraciones y tag `visible=0/1`. No contiene device id, token ni host. El spool es ilegible por la GUI por diseño (ACL SYSTEM/admin); la sonda `spool_open` documenta la propiedad. `/status` es el único canal de datos hacia la GUI (loopback, sin secretos).
- **Performance & Latency:** con flag apagado, cero overhead medible (sin canal, sin hilo escritor, sin timers adicionales). Con flag encendido, el hilo escritor es best-effort y no bloquea el repintado. El gate reduce las lecturas de spool a ~0 con agente sano.
- **Rollout & Rollback:** el gate es siempre-activo (no requiere flag). La instrumentación es temporal (bajo `SC_GUI_STAGE0=1`), leída una sola vez al arranque (cambio requiere restart), y se elimina como commit posterior al cierre de Stage 0. Plan B (30 s) documentado pero no implementado. El ticket contingente se voltea según el informe de cierre.

--------------------------------------------------------------------------------

## Future Improvements

- Control por duración (`SC_GUI_STAGE0_SECONDS`) en vez de binario on/off (D5).
- Mover `scm::query_service_state` al hilo del poller (transform inventiva, A5) — entra en alcance si el owner la bendice.
- Política de repaint oculto por eventos de bandeja (ADR-0017 §3) — entra en alcance si Stage 0 confirma stall.
- Facts worker que saca `scm_query` y los facts del hilo de UI.
- Rotación de `gui.log` más allá del tope de 10 MB (N2).

--------------------------------------------------------------------------------

### Additional Resources

- `agent/crates/sc-gui/src/app.rs` — `refresh()`, `chart_series()`, `summary_rows()`, `update()`
- `agent/crates/sc-gui/src/status_client.rs` — `Poller`, `fetch()`, `POLL_INTERVAL`, `REQUEST_TIMEOUT`
- `agent/crates/sc-gui/src/spool_history.rs` — `read_window_summaries()`, `default_spool_path()`, `MAX_POINTS`
- `agent/crates/sc-gui/src/tray.rs` — `poll_menu()`, `poll_double_click()`
- `docs/adr/0017-sc-gui-eframe-tray.md` — bandeja, latido 250 ms, doble clic 500 ms
- `agent/crates/sc-aggregate/src/window.rs:188-252` — ticker cierra ventana por tiempo cada 30 s
- `agent/crates/sc-agent/src/main.rs:596-655` — spooler escribe 1 fila por `AggregatedWindow`
- `concepts_brief.md` — brief completo (11 decisiones + 5 enmiendas + 7 Goldfishes)
- `docs/designs/sc-gui-spool-read-brief-anchor.md` — anclaje original

--------------------------------------------------------------------------------

*Drafted with EGM*