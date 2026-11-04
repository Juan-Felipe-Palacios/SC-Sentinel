# Runbook — Limpieza y capacidad de la base (Neon)

Objetivo: mantener la DB Neon free dentro de 0,5 GB (sizing proyectado ~250 MB, spec §12.2). Cron automático + acciones manuales.

## Automático (por diseño)

- `/api/cron/cleanup` corre **diario 03:00 UTC** vía Vercel Cron (o cron externo con `x-cron-secret`, spec §5.4).
- Retención aplicada (§12.1): `flow_windows` 7 d · `host_stats` (derivada) 7 d · `alerts` 30 d · `ai_insights` 15 d · `agent_health` 7 d · `ingest_batches` 2 d · rollups diarios 90 d (si existen).
- Log de espacio liberado por tabla en cada ejecución: cuánto borró y de qué tabla.

## Monitoreo manual (checklist semanal)

```sql
-- Tamaño actual total de datos (aprox)
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Peso por tabla
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

Checklist semanal:
- [ ] Total < 400 MB (si ≥ 400 MB → alerta de capacidad; acción inmediata).
- [ ] `flow_windows` ≈ 2.880/día × 7 (±10%).
- [ ] `alerts` + `ai_insights` no dominan el total.
- [ ] El log del cron de cleanup mostró ejecución reciente (si no: ver "Si el cron no corre").

## Si el cron no corre

1. Verificar el schedule de Vercel Cron (retención diaria 03:00 UTC; los intervals de 5 min son solo del cron de IA).
2. Plan B (spec §5.4): cron externo (cron-job.org) contra `POST /api/cron/cleanup` con header `x-cron-secret: <CRON_SECRET>` (env de servidor; nunca en cliente).
3. Ejecutar cleanup una vez manualmente (curl) con el secret y confirmar el log.

## Vacío preventivo (reducir retención)

Si la DB supera 400 MB previo al cleanup diario:

```sql
DELETE FROM flow_windows      WHERE window_start < NOW() - INTERVAL '3 days';
DELETE FROM agent_health      WHERE created_at   < NOW() - INTERVAL '3 days';
DELETE FROM ai_insights       WHERE created_at   < NOW() - INTERVAL '15 days';
DELETE FROM ingest_batches    WHERE received_at  < NOW() - INTERVAL '1 day';
-- solo si este cleanup fue confirmado por el propietario (el resto usa las pautas estándar del cron)
```

Después: `VACUUM ANALYZE;` (Neon lo ejecuta automático; si no, ejecutar).

## Reglas

- **Nunca** ejecutar `TRUNCATE` sobre `devices` ni `settings` (perdería el enrollment). Un reset del sistema = `DROP DATABASE` + migraciones desde el repo — solo si el propietario lo decide.
- El cleanup borra datos por retención: **es esperable y no es una pérdida anómala** — la pérdida anómala se refiere al spool FIFO del agente (§8).
- Preparar branches de Neon para probar `DELETE` masivos antes de aplicar en main (branching, ADR-0003).
