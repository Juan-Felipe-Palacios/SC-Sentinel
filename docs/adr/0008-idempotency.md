# ADR-0008 — Idempotencia de ingesta: UNIQUE(device_id, window_id) + 200 duplicate

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §5.1, §6, §8.1

## Contexto

El spool del agente reenvía batches tras caídas. Sin idempotencia, un reintento duplicado infla métricas o rompe el pipeline con error de única clave.

## Decisión

- Clave de idempotencia: **`UNIQUE(device_id, window_id)`** a nivel tabla (`flow_windows` + `ingest_batches`).
- Insert con **`ON CONFLICT DO NOTHING`**: un reenvío del mismo window devuelve **`200 {status:"duplicate"}`** — nunca error ni doble métrica.
- Ambos códigos 200 (`processed`/`duplicate`) **eliminan el batch del spool** en el agente.
- Auditoría: `ingest_batches.payload_hash` permite verificar si el reenvío era idéntico.
- `ingest_batches` **sin FK por diseño**: ledger independiente y auditable, sobrevive al borrado de ventanas por retención.

## Alternativas consideradas

- **Idempotency-Key header HTTP**: duplica el mecanismo; la clave natural ya está en el payload y no todos los errores de red preservan headers de forma confiable. Descartado.
- **409 en duplicado**: rompería el drenaje del spool (el agente lo trataría como error y reintentaría en loop). Descartado.
- **UPSERT (ON CONFLICT UPDATE)**: permitiría reemplazar un snapshot ya procesado; innecesario y peligros (riesgo de replay para reescritura). Descartado.

## Consecuencias

- Los reintentos idempotentes son baratos y seguros; el estado del agente tras 200 duplicate es "confirmado".
- Un atacante con token puede forzar duplicados, pero solo obtiene 200/duplicate y no origina doble métrica (mitigado además por rate limit ADR-0011).
