# RFC-0003 — Rate limiting distribuido en Postgres

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §9
**ADRs relacionados:** —

## 1. Resumen

Sustituir el rate limiter en memoria del ingest por un limitador distribuido en Neon (Postgres) para que los límites se apliquen de forma consistente entre instancias de Vercel.

## 2. Motivación

`docs/reference/data-model.md` menciona `rate_limits` (futuro, M4) como limitador distribuido en Postgres. El actual `web/lib/rate-limit/ingest.ts` es in-memory y no escala entre instancias serverless.

## 3. Propuesta

- Tabla `rate_limits(key text, window_start timestamptz, count int, primary key(key, window_start))`.
- Función `check_rate_limit(key, per_minute, burst)` con upsert + ventana deslizante.
- Llamar desde `/api/ingest` y `/api/auth/login` (ya tiene rate limit por IP).
- TTL/cleanup vía cron existente (`/api/cron/cleanup`).

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| In-memory (actual) | Simple, rápido | No distribuido; resets por instancia |
| Redis/Upstash | Muy rápido | Dependencia externa nueva, coste |
| Postgres (recomendado) | Ya disponible (Neon), transaccional | Latencia mayor (~5-10 ms) |

## 5. Impacto

- **Compatibilidad:** non-breaking; fallback a in-memory si la tabla no existe.
- **Rendimiento:** +1 query por request de ingest; aceptable.
- **Operación:** migración aditiva; limpieza periódica.
- **Testing:** tests de concurrencia.

## 6. Plan de implementación

1. Migración `0016_rate-limits.sql`.
2. Implementar `checkRateLimitDistributed` en `web/lib/rate-limit/`.
3. Sustituir llamadas en ingest y login.
4. Actualizar `data-model.md`.

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Contención en la tabla | Media | Medio | Particionado por key; índices |
| Latencia adicional | Baja | Bajo | Cache corto (1 s) por key |

## 8. Preguntas abiertas

- ¿Ventana fija o deslizante?
- ¿Burst por device o por IP?

## 9. Referencias

- `docs/reference/data-model.md`
- `web/lib/rate-limit/ingest.ts`