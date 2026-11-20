# Métricas derivadas — corrida 1 de Stage 0 (sc-gui)

Derivado del log crudo de Stage 0. El log **no se versiona** (`*.log` está en
`.gitignore:38`); su copia congelada vive en esta carpeta como `gui.log`
(ignorada por git) y aquí queda su huella verificable.

**Medido:** 2026-11-20 17:30Z, Windows 10/11, Git Bash + Windows PowerShell 5.1
sin elevación.

| Dato | Valor |
|---|---|
| Archivo | `%LOCALAPPDATA%\SC-Sentinel\logs\gui.log` |
| Bytes | 36.122 |
| Líneas | 365 |
| sha256 | `72c3eec116212df11b4802c48af77b67b5ca781ebf8447a3ce03d833f5902d36` |
| `mtime` | 2026-11-18 21:20:00.098 −03:00 = **2026-11-19T00:20:00Z** |

## Cobertura

- Ventanas de 5 min presentes: **39**.
- Criterio de Stage 0: ≥ 288 ventanas en 24 h → **13,5 % de lo previsto**.
- Primer `window=` 2026-11-18T17:00:00Z; último 2026-11-19T00:15:00Z.

| Bloque | Ventanas | Rango (UTC) | Proceso |
|---|---|---|---|
| 1 | 3 | 17:00 → 17:10 | PID 32328 (relanzamiento 14:04 −03:00) |
| hueco | 49 ausentes | 17:15 → 21:15 | sin escrituras (250 min) |
| 2 | 36 | 21:20 → 00:15 | PID 24292 (arranque 21:24:41Z) |

El bloque 2 es **contiguo**: 36 × 5 min = 180 min exactos medidos, y luego corte
discreto. No hubo degradación gradual: hay 36 ventanas completas y después
ninguna.

## Líneas por tipo y por métrica

| `kind` | Líneas |
|---|---|
| `agg` | 195 |
| `spike` | 92 |
| `counter` | 78 |

| `metric` | Líneas |
|---|---|
| `scm_query_ms` | 92 |
| `frame_gap_ms` | 77 |
| `poll_age_ms` | 40 |
| `spool_read_ms` | 39 |
| `poll_fetch_ms` | 39 |
| `spool_reads` | 39 |
| `spool_skipped` | 39 |

Las 39 líneas de cada métrica agregada corresponden a las 39 ventanas: el
agregador emitió las cinco métricas en cada ventana cerrada.

## Snapshot forense del proceso colgado (PID 24292)

Capturado **antes** de terminarlo, el 2026-11-20 17:27Z–17:30Z.

| Campo | Valor |
|---|---|
| Inicio | 2026-11-18T18:24:41.867−03:00 (21:24:41Z) |
| Wall hasta la captura | 158.726,1 s (≈ 44 h 06 min) |
| CPU total | 136.017,9 s → 136.142,2 s (delta 124,3 s en 2 min 5 s) |
| CPU / wall | **85,7 %** de un núcleo sostenido |
| Delta medido | **50,89 s de CPU en 60 s = 84,8 % de un núcleo** |
| Hilos | 16 (1 `Running`, 15 `Wait`) |
| Memoria privada | 949,2 MB → 950,0 MB (**+0,34 MB/min**) |
| Working set | 8,7 MB |
| Handles | 489 |
| `Responding` | `True` |
| Ventana | `MainWindowHandle` 1311176, título **vacío**, `IsWindowVisible=True`, `IsIconic=False`, `RECT=0,0,16,16`, `showcmd=1` |

### Hilos por CPU acumulada

| TID | CPU (s) | Estado | Wait | Arranque |
|---|---|---|---|---|
| **19836** | **135.567,28** | **Running** | — | 18/11 18:24:41 |
| 10984 | 128,53 | Wait | UserRequest | 18/11 18:24:50 |
| 10604 | 45,17 | Wait | UserRequest | 18/11 18:24:45 |
| 17172 | 2,66 | Wait | EventPairLow | 18/11 18:24:45 |
| 32028 | 0,78 | Wait | UserRequest | 18/11 18:24:51 |

En el segundo muestreo, el delta de 60 s se repartió: TID 19836 → **50,66 s**;
el resto ≤ 0,09 s. **Un solo hilo concentra el 99,7 % del CPU acumulado y el
99,5 % del consumo vivo.**

## Firma de los dos eventos de stall

| Evento | Inicio (UTC) | Duración | Evidencia |
|---|---|---|---|
| E1 · pre-flight | 2026-11-18 | 381 s | `docs/evidence/sc-gui-stage0-preflight/gui.log` (documentado en el design draft) |
| E2 · corrida 1 | 2026-11-18T00:20Z aprox. (última escritura) | ≥ 41 h hasta el kill | este documento |

Detalle de E2: la última línea se escribió a las 2026-11-19T00:20:00Z (cierre de
la ventana `00:15Z`) y el proceso siguió vivo, con `update()` sin emitir, hasta
que se terminó el 2026-11-20T17:30Z. Entre esas dos marcas: **41 h 10 min** sin
una sola línea y ~85 % de un núcleo.

## Reconciliación del `mtime` (la aparente inconsistencia)

El `mtime` local es 2026-11-18 21:20:00.098. Con offset −03:00 equivale a
**2026-11-19T00:20:00.098Z**, que es exactamente el cierre de la ventana
`2026-11-19T00:15:00Z`. No hay inconsistencia entre el span del log y su fecha
de modificación: la diferencia era el huso horario. El span de 7 h 15 min
(17:00Z→00:15Z) aloja 39 ventanas porque 49 ventanas intermedias **nunca se
escribieron**.

## Limitaciones de este derivado

1. Las líneas del log **no llevan timestamp propio**: la única marca temporal es
   `window=` (frontera de 5 min). Por eso no se puede reconstruir la salida por
   minuto ni el instante exacto del corte dentro de la última ventana.
2. La copia de `gui.log` en esta carpeta no se versiona: el hash de arriba es la
   referencia verificable. Cualquier alteración del crudo cambia el hash.
3. Se capturó un minidump local (`%TEMP%\sc-gui-stall-24292.dmp`, 0,1 MB, solo
   información de hilos) **fuera del repo y sin adjuntarlo a ningún ticket
   público**: un volcado de memoria puede contener secretos del proceso. El TID
   del spin está identificado; el volcado queda a disposición del propietario
   para analizarlo con WinDbg.
4. El proceso se terminó con `Stop-Process -Force`: no hay `salida limpia` que
   medir, y esa es precisamente la condición del stall.
