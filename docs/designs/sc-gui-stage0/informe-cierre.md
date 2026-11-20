# Informe de cierre — Stage 0 de `sc-gui`

**Fecha:** 2026-11-20 · **Estado:** cerrado con criterio **no alcanzado**
(declarado, no maquillado) · **Evidencia:**
`docs/evidence/sc-gui-stage0-2026-11-18/`

## Veredicto

| Pregunta de Stage 0 | Resultado |
|---|---|
| ¿El gate WP1 (salto de relectura del spool) reduce I/O? | **Sí**, y el gate ya es permanente en el código |
| ¿La instrumentación mide 24 h continuas? | **No.** 39 ventanas de 288 (13,5 %) |
| ¿La GUI se mantiene viva 24 h? | **No.** Dos cortes con el proceso vivo |
| ¿El bug de «Salir» está resuelto? | **Sí**, commiteado en `dfccf81` y verificado el 2026-11-18 |

## Cobertura real

39 ventanas de 5 min, en dos bloques: 3 ventanas sueltas (PID 32328) y 36
contiguas (PID 24292). Entre ambos, 49 ventanas ausentes (250 min). Después del
último cierre de ventana, 41 h 10 min sin escribir.

El detalle por ventana, el hash del log crudo y los conteos por métrica están en
`docs/evidence/sc-gui-stage0-2026-11-18/metricas-corrida-1.md`.

## El giro de hipótesis (lo importante de Stage 0)

La hipótesis de trabajo era «la ventana oculta detiene el repintado». Los datos
la descartan por dos vías independientes:

1. Una pausa de repaint implica **CPU ≈ 0**. Se midió **~85 % de un núcleo
   sostenido** (50,89 s de CPU por cada 60 s de pared) con **cero** líneas.
2. El repro explícito con `SW_MINIMIZE` fue **negativo**.

El fenómeno real es un **spin**: un único hilo (`TID 19836`, `Running`, arrancado
con el proceso) consume el 99,7 % del CPU acumulado mientras el bucle de UI deja
de llamar a `update()`. La ventana quedó además con rect 16×16 y título vacío.
Todo esto pasa al ticket P0 de Etapa 2
(`docs/evidence/sc-gui-stage0-2026-11-18/ticket-contingente.md`).

## Qué queda en el producto

- **Gate WP1**: se queda. Es un fix de producto (evita releer el spool cuando
  `/status` ya publica las ventanas) y no depende de ningún flag.
- **Instrumentación WP2**: **retirada** el 2026-11-20 (`log_writer.rs` eliminado;
  `main.rs`, `app.rs` sin `SC_GUI_STAGE0`, sin `gui_timing`, sin `Aggregator`,
  sin sonda `spool_open`). La variable de usuario se borró del registro
  (`HKCU\Environment`), verificado como ausente.
- **Cierre de «Salir»**: `exit_process` mantiene `std::process::exit(0)`.

## WS2 re-escopado: qué se prueba del cierre de «Salir»

Los tests de drenaje, canal cerrado y tope de 10 MB que acompañaron al fix eran
tests **del escritor**, no del cierre: al retirarse `log_writer.rs` con WP2 se
retiraron con él **por diseño**, no por pérdida de cobertura. Lo que queda del
fix y cómo se cubre:

| Pieza | Cómo se verifica |
|---|---|
| `close_action` ( [×] oculta, no mata ) | Test unitario en `actions.rs` — se mantiene |
| Enrutado del menú: «Salir» es la única acción que pide salir | Test unitario `salir_es_la_unica_accion_que_enruta_a_la_salida_explicita` sobre `menu_effect()` (función pura, sin `process::exit`) |
| El proceso **muere** de verdad al pulsar «Salir» | **Prueba manual obligatoria sobre `--release`, pendiente** (checklist de sello, WS8) |

La tercera fila no es sustituible por un test: un test no puede observar la
muerte de su propio proceso. Es la única prueba de que la rama Quit se alcanza
en el binario optimizado, y queda como ítem obligatorio antes del sello.

## Verificación

| Comprobación | Comando | Resultado |
|---|---|---|
| Compilación estricta del crate | `cargo clippy -p sc-gui --all-targets -- -D warnings` | exit 0 |
| Tests del crate | `cargo test -p sc-gui` | 57 pasaron, 0 fallaron |
| Restos de instrumentación | `grep -rn "log_writer\|SC_GUI_STAGE0\|gui_timing" agent/crates/sc-gui/src/` | sin coincidencias |
| Variable de entorno | `[Environment]::GetEnvironmentVariable('SC_GUI_STAGE0','User')` | ausente; `reg query` ya no encuentra el valor |

## Lección de método

El instrumento tenía un hueco que la corrida destapó: emite `n=0` de relleno para
ventanas omitidas (backfill dentro de `tick`), pero **solo si `update()` sigue
corriendo**. Si el hilo de UI se cuelga, no hay backfill y el log simplemente se
detiene. Eso es exactamente lo que pasó: el silencio no es un dato ambiguo, es la
firma del cuelgue. Para la próxima medición, el criterio de validez no puede ser
«hay líneas» sino «hay líneas **y** el proceso responde a `/status`».

## No verificado

- Clic real en «Salir» sobre `--release`: **no ejecutado**. Sin esa prueba no se
  puede afirmar que el proceso muere en el binario publicado (ver WS2).
- No se reprodujo el spin de forma controlada; el minidump no se analizó con
  símbolos.
- El criterio de 24 h sigue abierto: lo cierra la corrida del ticket P0.
