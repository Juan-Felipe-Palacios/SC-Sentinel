# Runbook — Rotación de device-token

Procedimiento manual (ADR-0010): la rotación se administra desde el Dashboard Settings; sin endpoints pre-autenticados.

## Tiempo estimado: 5 minutos · Interrupción del servicio: breve (hasta reiniciar el agente)

## Pasos

1. **Dashboard → Settings → Device token → "Rotar token"**.
   - Revoca el token anterior (`devices.token_rotated_at`).
   - Genera uno nuevo; **plaintext visible una sola vez** — copiarlo ANTES de cerrar el panel.
2. **Actualizar el agente**:
   - Windows/Linux servicio: editar el EnvironmentFile (o config.toml si es entorno no-producción) con el token nuevo e inmediatamente limpiar el portapapeles.
   ```powershell
   # Windows (servicio) — si el token va vía env del servicio:
   # re-escribir el valor de SC_INGEST_TOKEN y re-crear la config de arranque del servicio
   Set-Service "SC-Sentinel-Agent"   # no hace falta; restart:
   Restart-Service "SC-Sentinel-Agent"
   ```
   ```bash
   # Linux:
   systemctl restart sc-sentinel-agent
   ```
3. **Verificar**:
   - Ya no hay 401/403 en logs del agente (si los había, se cortan).
   - Dashboard → Settings: `needs_enrollment = false`; "último sync exitoso" con timestamp nuevo.
   - `/dashboard/overview`: segu de datos entrando con las últimas ventanas.

## Drenaje del spool pendiente

Durante el período con token inválido, el spool conserva los batches sin reintentarlos indefinidamente (spec §8). Tras rotar y reiniciar, el agente entra en modo Sending y drena el spool a ~60 req/min (ADR-0011). No borrar el spool.

## Emergencia: token expuesto (leaks)

- Hacer la rotación **inmediatamente** (procedimiento anterior).
- Si el token expuesto se usó ya para inyectar payloads, ejecutar el runbook `incident-response.md` (escenario "compromiso de token").
- Ningún token se loguea en ningún lado: verificar logs del servidor si se sospecha exfiltración vía error logs (regla §9.3).

## Recordatorios

- La rotación **revoca el anterior al momento** (los batches con el token viejo reciben 401 → `needs_enrollment`).
- El plaintext NO se puede "recuperar": solo re-crear.
- Buckets del dashboard mantienen la sesión admin con cookie; la rotación del device no invalida la sesión.
