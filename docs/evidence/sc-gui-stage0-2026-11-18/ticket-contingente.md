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

## Hipótesis a descartar, en orden

1. **Bucle de sondeo del hilo de fondo**: `Poller` reintentando sin espera ante
   un error persistente de `/status`. Encaja con CPU al 100 % de un hilo y con
   cero líneas (el writer ya no recibe nada).
2. **Bucle de mensajes de la bandeja**: re-creación del `HICON` en cada evento
   (`set_icon`) o `Shell_NotifyIcon` fallando en bucle.
3. **Repintado degenerado por la ventana de 16×16**: el rect mínimo sugiere que
   el handle apunta a una ventana auxiliar; si egui pide repintar de forma
   continua, el hilo de UI gira sin avanzar.
4. **Acumulación en el historial**: 949 MB privados con 8,7 MB de working set
   indican memoria no residente; descartar fuga en `PacketHistory` o en las
   ventanas del spool.

## Cómo cerrarlo

- [ ] Reproducir en local con ventana oculta y con ventana visible, midiendo CPU
      por hilo cada 60 s (mismo método de este ticket).
- [ ] Identificar el hilo del spin con símbolos (el minidump permite `!threads` /
      `kb` en WinDbg); si no hay símbolos, instrumentar el `Poller` con un
      contador de iteraciones por segundo.
- [ ] Un test que falle antes del arreglo: p. ej. `Poller` con endpoint caído no
      debe superar N iteraciones por segundo ni consumir CPU sin espera.
- [ ] Verificar el arreglo con una corrida de 24 h que **sí** produzca las 288
      ventanas (esa corrida cierra el criterio que Stage 0 dejó abierto).

## Fuera de alcance

- La variable `SC_GUI_STAGE0` ya no existe: la medición necesaria para este
  ticket debe instrumentarse de nuevo, de forma acotada y con ventana de
  duración explícita (D5 del design draft: control por duración, no binario).
