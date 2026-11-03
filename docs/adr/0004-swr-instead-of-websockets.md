# ADR-0004 — SWR polling 5 s en lugar de WebSockets

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §7, §18.2

## Contexto

El dashboard necesita datos "realtime": carga de overview, hosts, alertas y AI panel. Vercel serverless no soporta WebSockets persistentes ni SSE de larga vida sin rabbit-holes architectónicos.

## Decisión

**SWR con `refreshInterval: 5000`** contra `/api/query` (GET, cookie admin). No WebSockets, no SSE. La ventana de 30–60 s del snapshot hace que 5 s de polling sea más fino que la granularidad del dato.

## Alternativas consideradas

- **WebSockets** (+ servidor custom / Pusher): serverless Vercel no lo soporta nativamente; añade servicio pago y pico de complejidad. Descartado.
- **SSE**: stream de larga vida en una función serverless — consumo de recursos innecesario para refresco 5 s. Descartado.
- **Revalidar en navegar únicamente**: pierde la sensación de tablero vivo. Descartado.

## Consecuencias

- Simple, barato, robusto: cero infra nueva; SWR gestiona dedup/revalidate/focus.
- Un GET cada 5 s por cliente; con uso interno (ADR-0007) la carga es trivial.
- Si v1 crece a multi-dispositivo, reevaluar.
