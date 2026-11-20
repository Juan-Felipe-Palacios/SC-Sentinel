# Ticket contingente — stall/spin de la GUI (ampliado)

**Estado:** abierto · **Prioridad:** P0 de Etapa 2 (antes que cualquier feature)
· **Origen:** Stage 0 de `sc-gui` · **Fecha:** 2026-11-20

## Qué cambió respecto del ticket original

El ticket nacía como «política de repaint con la ventana oculta». Los datos de la
corrida 1 lo desmienten:

- Con la ventana oculta u ocluida, una pausa de repaint daría **CPU ≈ 0**. Lo
  medido es **~85 % de un núcleo sostenido** durante 41 h sin una sola línea.
- El repro explícito con `SW_MINIMIZE` fue **negativo**: minimizar no reproduce
  el cuadro.

Por tanto el objeto del ticket no es la política de repaint sino el **mecanismo
de stall/spin**: un hilo entra en bucle y el bucle de UI deja de llamar a
`update()`.

## Evidencia

| Hecho | Medición |
|---|---|
| Evento E1 (pre-flight) | 381 s sin emisión |
| Evento E2 (corrida 1) | Corte discreto tras **180 min exactos** de medición contigua |
| Duración del E2 | **41 h 10 min** sin escribir, proceso vivo |
| CPU | 136.142 s acumulados; **50,89 s en 60 s** durante el muestreo (84,8 % de un núcleo) |
| Concentración | **TID 19836**: 135.567 s de 136.142 s (99,7 %); 50,66 s de 50,89 s en el delta |
| Estado del hilo | `Running`, arrancado junto con el proceso (18:24:41 local) |
| Memoria | 949,2 → 950,0 MB privados (**+0,34 MB/min**); working set 8,7 MB |
| Ventana | `IsWindowVisible=True`, `IsIconic=False`, rect **0,0,16,16**, título vacío, `showcmd=1` |
| Hilos | 16 (1 `Running`, 15 `Wait`) |
| Artefactos | `metricas-corrida-1.md`, `diario-corrida-1.md`, minidump local `sc-gui-stall-24292.dmp` (0,1 MB, no versionado) |

## Lectura forense del snapshot (lo que el ticket debe llevar)

1. **El spin es del hilo principal.** `TID 19836` arrancó con el proceso, está
   `Running` y acumula el 99,7 % del CPU; el resto de los hilos suma ≤ 0,09 s. No
   es el `Poller`, ni el escritor, ni el hilo de la bandeja: es el **bucle de UI**.
   Un deadlock mostraría `Wait`; esto es busy-loop.
2. **La ventana de 16×16 con título vacío no es la ventana real de la GUI.** La
   ventana real tenía título y tamaño normales. Caben dos lecturas: el
   `MainWindowHandle` apunta a un stub/helper tras destruirse la ventana real, o
   la ventana real colapsó a un stub. Cualquiera de las dos mete el **ciclo de
   vida de ventana** (`Close` / hide-to-tray / restore) en el eje de la hipótesis
   principal: busy-loop de winit/eframe tras un `destroy`/`hide` mal terminado,
   con la rama `Quit`/`exit` **nunca alcanzada**. El disparador del stall de
   24292 sigue sin correlacionar: hay que cruzar el diario con el congelamiento
   de 21:20Z para saber si en ese momento hubo clic de «Salir» o de [×].
3. **La fuga es coextensiva con el stall.** ~950 MB privados contra ~102 MB de
   baseline F3, y +0,34 MB/min medido ≈ la tasa que explica los ~850 MB
   acumulados en 44 h. El spin asigna memoria desde su comienzo; **no** es una
   fuga previa independiente.

## Hipótesis a descartar, en orden

1. **Ciclo de vida de ventana (eje principal)**: `Close`/hide-to-tray/restore deja
   el bucle en un estado sin `update()` y con repaint/bomba de mensajes girando.
   Encaja con el rect 16×16, el título vacío y `IsWindowVisible=True`.
2. **Bucle de mensajes de la bandeja**: re-creación del `HICON` en cada evento
   (`set_icon`) o `Shell_NotifyIcon` fallando en bucle. También vive en el hilo
   que arranca con el proceso, así que no está descartado.
3. **Bucle de sondeo del `Poller`**: reintento sin espera ante un error
   persistente de `/status`. Encaja con CPU al 100 % de un hilo, pero el `Poller`
   es un hilo propio, no el de UI: pierde fuerza frente a la inferencia 1.
4. **Acumulación en el historial**: descartada como causa del spin (inferencia 3);
   queda como efecto, no como disparador.

## Primera sonda del P0 (diseño, no implementación)

Watchdog de latido, en este orden:

1. Marca de latido escrita desde `update()` (contador o `Instant` en `Arc<AtomicU64>`).
2. Hilo vigilante: si no hay latido en N segundos y el proceso sigue vivo,
   captura **CPU por hilo** (`TotalProcessorTime` + `ThreadState`),
   `GetClassName`/`GetWindowText` del `MainWindowHandle`, rect y `IsWindowVisible`.
3. Minidump a ruta **privada** (`%LOCALAPPDATA%\Temp`), nunca versionado ni
   adjuntado a un issue público.
4. Una línea de log inmediatamente antes de `exit(0)` para saber si la rama
   `Quit` se alcanza.

Con eso el próximo stall se atribuye solo, sin intervención manual. El dump de
0,1 MB se analiza con símbolos en el P0; no se publica.

## Cómo cerrarlo

- [ ] Reproducir en local con ventana oculta y con ventana visible, midiendo CPU
      por hilo cada 60 s (mismo método de este ticket).
- [ ] Cruzar el diario con el congelamiento de 21:20Z: ¿clic de «Salir» o de [×]
      justo antes? Es la correlación que falta para separar hipótesis 1 y 2.
- [ ] Identificar el hilo del spin con símbolos (el minidump permite `!threads` /
      `kb` en WinDbg); si no hay símbolos, usar el watchdog de la sección anterior.
- [ ] Un test que falle antes del arreglo: p. ej. `Poller` con endpoint caído no
      debe superar N iteraciones por segundo ni consumir CPU sin espera.
- [ ] Verificar el arreglo con una corrida de 24 h que **sí** produzca las 288
      ventanas (esa corrida cierra el criterio que Stage 0 dejó abierto).

## Fuera de alcance

- La variable `SC_GUI_STAGE0` ya no existe: la medición necesaria para este
  ticket debe instrumentarse de nuevo, de forma acotada y con ventana de
  duración explícita (control por duración, no binario).
