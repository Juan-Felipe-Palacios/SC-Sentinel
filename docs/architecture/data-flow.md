# Flujo de datos — pipeline de ingest (DFD nivel 1)

**Diagrama:** `docs/diagrams/mermaid/ingest-data-flow.mmd` (Mermaid `graph LR`).

## Etapas

1. **Entrada.** Routers/switches emiten sFlow v5, NetFlow v5/v9 o IPFIX (UDP). El agente nunca captura paquetes crudos hacia la nube: solo agregados por ventana.
2. **Colector** (`sc-collector`): bind UDP configurable, parse de datagramas, cache de templates IPFIX, normalización a `FlowUpdate` (M4). Limitaciones documentadas en `docs/testing/pcap-vs-flow.md`.
3. **Agregación** (`sc-aggregate`): acumula por ventana de 30–60 s, produce `WindowSnapshot` (top hosts/puertos/países, health).
4. **Detección** (`sc-detect`): reglas deterministas (blacklist, port scan in/out, DNS tunneling, volume anomaly, salud de captura). Emite `Alert` y `risk_score` por host. La IA **no** genera alertas (ADR-0005).
5. **Sync** (`sc-sync`): spool SQLite FIFO, compresión gzip/zstd, backoff 1–60 s, estados Idle/Sending/Backoff/NeedsEnrollment/DeadLetter/SpoolFull.
6. **Ingesta** (`/api/ingest`): auth SHA-256 del token, descompresión explícita, validación zod (límites 128/512 KB), `INSERT … ON CONFLICT DO NOTHING`, ledger `ingest_batches`.
7. **Persistencia** (Neon): `flow_windows`, `alerts`, `agent_health`, `ai_insights`.
8. **Heurística cloud** (ADR-0005, `web/lib/risk/heuristic.ts`): solo si el agente envía `risk_score: null` y `alerts: []`; rellena un piso de banda baja y agrega `cloud_heuristic` (dedup 1 h) si llega a banda media/alta. El valor del agente siempre tiene prioridad.
9. **Salida:** `/api/query` → dashboard (overview, hosts, conexiones, alertas). IA por lotes (`/api/ai/cron`) interpreta hechos ya persistidos.

## Latencias esperadas

| Etapa | Latencia |
|---|---|
| ingest (POST → 200) | < 100 ms |
| snapshot completo | 30–60 s |
| drenaje del spool | ~60 req/min (ADR-0011) |
| análisis IA | ≤ 30 s por lote |

## Puntos de atención

- ⚠️ Los hosts con `risk_score: null` dependen de la heurística cloud hasta que `sc-detect` cubra el caso (ADR-0005).
- La retención de `flow_windows`/`alerts` es de 30 días (cron cleanup); `alert_audit_log` 90 días.
- Los datos nunca incluyen paquetes crudos ni IPs sin anonimización cuando `anonymize_hosts=true`.