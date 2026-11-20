2026-11-18 · offset de origen −03:00 · todas las marcas de abajo están en **UTC**

Corrida 1 — Stage 0 sc-gui (WP3)

- **16:08:09.336Z** — Lanzamiento: PID 22940, build release en `bfd4576`,
  `SC_GUI_STAGE0=1` (`setx` de usuario + entorno del proceso). Watcher encendido
  antes del lanzamiento.
- **16:23:41Z** — Última línea escrita por el PID 22940 (la ventana `16:15Z` fue
  la última). A partir de aquí el proceso deja de emitir y queda wedged.
- **17:04Z** — Clic en «Salir» (local 14:04). La ventana no cierra y el proceso
  sigue vivo, sin emitir: se terminan 4 procesos `sc-gui`
  (22940, 7504, 26124, 31900). Gap de datos desde 16:24Z.
- **17:03:25Z** — Commit del fix de «Salir» (`dfccf81`); build release a las
  **17:04:02Z**.
- **17:04Z** — Relanzamiento de la corrida con el fix. Nuevo PID 32328,
  `SC_GUI_STAGE0=1`. El log congelado del PID 22940 se conserva en
  `docs/evidence/sc-gui-stage0-salir-bug/gui.log`.
- **17:00–17:10Z** — El PID 32328 solo alcanza a cerrar **3 ventanas**
  (17:00, 17:05, 17:10). El diario original no registra su final.
- **17:15Z–21:15Z** — **250 min de hueco**: 49 ventanas sin escribir. El diario
  original no registra el motivo ni el momento en que termina el PID 32328.
- **21:24:41Z** — Arranque del PID 24292, reconstruido desde el snapshot
  forense (no hay entrada propia en el diario original). `SC_GUI_STAGE0=1`
  heredado del entorno de usuario.
- **21:20Z–00:15Z (19/11)** — **36 ventanas contiguas**, 180 min exactos de
  medición continua. Es el único tramo sano de la corrida.
- **2026-11-19T00:20:00Z** — Última línea escrita (cierre de la ventana
  `00:15Z`). Con el proceso vivo, `update()` deja de emitir y no vuelve a
  escribir en 41 h.
- **2026-11-20T17:30Z** — Snapshot forense y terminación del PID 24292: 16 hilos,
  1 en `Running` (TID 19836) con 135.567 s de CPU, ~85 % de un núcleo sostenido,
  949 MB privados y ventana con rect 16×16.

## Cierre de la corrida

- Cobertura: **39 ventanas de 288** previstas (13,5 % de las 24 h). Detalle y
  hashes en `metricas-corrida-1.md`.
- La corrida **no cumple** el criterio de Stage 0. Se cierra como *criterio no
  alcanzado por limitación del instrumento*, decisión del propietario del
  2026-11-20.
- El stall deja de ser una hipótesis de repaint: el corte es discreto, con CPU
  alta y sin salida. Pasa al ticket `ticket-contingente.md` con prioridad P0 de
  Etapa 2.
- Instrumentación `SC_GUI_STAGE0` retirada del código el 2026-11-20; la variable
  de usuario se borró del entorno (`reg delete HKCU\Environment`). El gate WP1
  (salto de relectura del spool) queda en el código.

## Nota de reconciliación

El `mtime` del log es 2026-11-18 21:20:00.098 local. Con offset −03:00 son las
**2026-11-19T00:20:00.098Z**, exactamente el cierre de la ventana `00:15Z`. La
aparente inconsistencia entre «span hasta 00:15Z» y «mtime 21:20» era el huso
horario, no un error de medición.
