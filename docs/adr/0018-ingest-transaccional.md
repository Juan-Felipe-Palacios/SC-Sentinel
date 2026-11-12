# ADR-0018 — Ingest transaccional e idempotente (fin de la alternancia Retriable → duplicate)

- **Estado**: aceptado
- **Fecha**: 2026-11-12
- **Contexto de código**: `web/app/api/ingest/route.ts`, `web/lib/ingest/persist.ts`,
  `scripts/apply-migrations.mjs`

## Contexto

El agente enviaba cada ventana una vez y el backend respondía **500**; el agente
lo clasificaba como `Retriable`, rebobinaba y reintentaba, y el segundo POST
devolvía **200 `duplicate`**. Resultado: dos POST por ventana en el log del
agente y ninguna ventana con datos secundarios completos.

Medición (90 min, producción):

| Señal | Valor |
| --- | --- |
| `ingest_batches` `processed` / `duplicate` | 210 / 4 |
| `flow_windows` con la ventana guardada | 179 |
| Ventanas sin filas en `host_stats` | 179 (100 %) |
| Filas en `agent_health` | **0** |
| `alerts` | 0 |
| Log Vercel | `{"event":"ingest_db_failed","error":"Error"}` una vez por ventana |

Dos causas, ambas necesarias:

1. **Deriva de esquema**: producción estaba en la migración `0007`; faltaban
   `0008`–`0015` (export logs, columnas de evals, trust pages, métricas del
   colector en `agent_health`, ciclo de vida de alertas, operadores, SLA). El
   `INSERT` de `agent_health` con `collector_*` fallaba con `42703` en **cada**
   ventana. El `catch` solo registraba `error: "Error"`, así que el diagnóstico
   era invisible.
2. **Persistencia no atómica**: el route hacía seis escrituras sueltas. Al
   fallar la quinta (o la última), el batch y la ventana ya estaban guardados;
   el reintento encontraba `existingBatch` y respondía `duplicate` **sin
   escribir los secundarios**. Ese era el hueco permanente.

## Decisión

1. Las escrituras de una ventana (batch, ventana, `host_stats`, `alerts`,
   `agent_health`, `devices`) viajan en **una sola transacción no interactiva**
   (`sql.transaction` del driver HTTP de Neon): o se guardan todas o ninguna.
2. Los ids son **deterministas** (`sha256(contenido)`), de modo que reenviar la
   misma ventana es un `ON CONFLICT DO NOTHING` y, si por cualquier motivo
   faltara un secundario, el reintento lo repara en lugar de dejar el hueco.
3. La respuesta distingue `processed` de `duplicate` con el `RETURNING` del
   `INSERT` del batch, no con un `SELECT` previo (evita la carrera entre dos
   reintentos simultáneos).
4. Se aplican las migraciones pendientes con `scripts/apply-migrations.mjs`
   (ledger `sc_schema_migrations`) y se documenta el procedimiento.
5. `logServerError` acepta `includeMessage` para que los fallos de driver
   muestren el SQLSTATE en lugar de `"Error"`.

## Trade-offs

- **Transacción no interactiva vs. sesión**: el driver HTTP no mantiene sesión,
  así que no se puede leer un resultado intermedio para decidir la siguiente
  sentencia. Se resuelve haciendo todas las sentencias idempotentes: el lote no
  necesita ramificar.
- **Ids deterministas vs. UUIDv4**: se pierde el "id opaco", se gana idempotencia
  y reparación. 96 bits de digest hacen la colisión irrelevante a esta escala.
- **Sin backfill de las 179 ventanas históricas**: sus snapshots tienen
  `top_hosts: []` y contadores a cero (el colector no recibe tráfico), así que
  no hay hosts que reconstruir. Cuando el colector empiece a reportar, cada
  ventana nueva llega completa.

## Consecuencias

- Una ventana ya no puede quedar a medias: desaparece el `500` seguido de
  `duplicate`.
- Un fallo de esquema futuro se ve en el log con su código, no como `"Error"`.
- Aplicar migraciones deja de ser manual y silencioso: `node
  scripts/apply-migrations.mjs --dry-run` dice qué falta.
