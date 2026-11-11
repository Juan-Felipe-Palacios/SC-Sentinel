# How-to — actualizar el agente

## Windows (servicio)

1. Descargar el binario firmado de la release.
2. `sc.exe stop "SC-Sentinel-Agent"`.
3. Reemplazar el binario en `C:\Program Files\SC-Sentinel\`.
4. Actualizar `SC_INGEST_TOKEN` si la versión lo requiere (raro).
5. `sc.exe start "SC-Sentinel-Agent"`.
6. Verificar `last_seen_at` en `/dashboard/settings` y ausencia de 401/403.

## Linux (systemd)

1. `sudo systemctl stop sc-sentinel-agent`.
2. Reemplazar binario y reiniciar: `sudo systemctl start sc-sentinel-agent`.
3. `journalctl -u sc-sentinel-agent -f`.

## Drenaje del spool

Durante la actualización el spool conserva batches (spec §8). Tras reiniciar, drena a ~60 req/min (ADR-0011). No borrar el spool.

## Rollback

Reinstalar el binario anterior desde GitHub Releases. Las migraciones de Neon son aditivas y no se revierten.