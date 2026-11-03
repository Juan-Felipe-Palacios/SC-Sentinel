# ADR-0011 — Rate limit orientado al drenaje de spool: 60 req/min por device (burst 30)

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §5.1, §8.1

## Contexto

Tras reconectar, el agente debe drenar un spool de hasta 500 MB / 7 días (≈ 2.880 ventanas/día máx) con batches ~5 KB. Rate limits del orden de 10 req/min habilitarían horas de vaciado lento y anti-abuse inoperable al mismo tiempo.

## Decisión

- **Token bucket por device: 60 req/min, burst 30** — suficiente para drenar un spool en minutos, no horas.
- **Anti-abuse por IP**: requests sin token válido → límite de **20 req/min** y respuesta 401.
- Exceder el límite → **`429` con `Retry-After`**, el agente reintenta con backoff (mismo backoff que usa para 429/5xx).
- Implementación in-memory en la route (Vercel serverless) — con 1 device el estado por instancia es suficiente.

## Alternativas consideradas

- **10 req/min** (estimación inicial del spec v2.0): incompatible con el drenaje del spool; contradecía la política de hacer vaciado en "minutos". Descartada.
- **Upstash / Redis distribuido**: sobre-ingeniería para single-device; añadido en v1.x si hay multi-device (§21).

## Consecuencias

- Un spool vacío drena a lo sumo en ~2.880/día → con 60 req/min ≈ 48 min max por día completo acumulado promedio.
- Los 401 anti-abuse cuentan por IP y no deben afectar al token legítimo (rutas de ataque independientes).
