# Runbook — Troubleshoot de sincronización (sc-sync)

Aplica al flujo agente → `/api/ingest` y al spool SQLite. Referencia: máquina de estados `diagrams/mermaid/sync-state-machine.mmd` y tabla de respuestas del contrato `ingest-api.v1.md`.

## Matriz de síntomas

| Síntoma | Causa probable | Acción |
|---|---|---|
| Reintentos con 401/403; flag `needs_enrollment` en Dashboard → Settings | Token inválido/expirado/revocado | Rotar token desde dashboard (runbook `rotate-device-token.md`), actualizar `SC_INGEST_TOKEN` o config, reiniciar servicio. **El spool NO se toca** |
| Reintentos 429 con `Retry-After` | Rate limit: >60 req/min por device (burst 30) | Esperado durante drenaje post-reconexión (ADR-0011); el backoff lo maneja solo. Si es persistente en estado estable, revisar `window_seconds` y frecuencia |
| Reintentos 408/5xx con backoff 1–60 s | Red inestable / Vercel incidente / Neon cold start (~1 s) | Tolerable por diseño (spec §8.1). Si hay >30 min sin éxito, revisar status de Vercel y conectividad local |
| `throttle 413` registro y batch pasa a dead_letter | Snapshot excedió límites | Revisar cardinalidad: `top_hosts`≤50, `top_ports`≤50, `top_countries`≤30, `alerts`≤50; payload ≤128 KB comprimido / ≤512 KB sin comprimir. Si excede la ventana (p. ej. scan de subred completa), es dead_letter esperado; abrir issue para decisión de diseño |
| 400 `validation_failed` | Contrato desenfocado (schema drift) | El agente no debería producir esto con la misma versión del contrato: actualizar el agente o verificar la versión del servidor; el batch va a **dead_letter local** |
| `spool_bytes` crece sin drenar | Sin internet o endpoint caído | Verificar salida HTTPS a `sc-sentinel.vercel.app`; al reconectar drena a ~60 req/min; si supera 300 MB, dashboard emite alerta operativa automática |
| Spool >500 MB o >7 días | FIFO descarta datos | Por diseño: ventana registrada `data_loss_bytes`/`data_loss_windows` en logs — es el único escenario de pérdida de datos aceptado (nunca silencioso) |
| Heartbeat: online pero `last_capture_at` congelado | Captura muerta (no sync) | Ver `troubleshoot-pcap.md` |
| Nada visible pero log OK | Dashboard sin datos | Verificar que SWR consulte; revisar `/api/query` (cookies admin); cron cleanup no borró más de lo esperado |

## Secuencia de diagnóstico

1. Dashboard → Settings → Estado de sync (último éxito, backoff actual).
2. Logs del agente: última línea de resultado de POST (código HTTP presentado sin body crudo).
3. Si 401/403: runbook de rotación.
4. Si 5xx/429: esperar backoff; revisar Vercel/Neon si supera minutos.
5. Si 400/413: dead_letter local existe en disco → revisar con `sqlite3 spool.sqlite` y abrir issue (sin datos crudos).

## Reglas

- **Nunca borrar el spool para "arreglar" el sync**: contiene datos de ventanas que el dashboard perdería. Solo se borra si el propietario lo decide conscientemente (loss explícito).
- No loggear token, Authorization, ni payload completo en tickets/logs (spec §9.3).
