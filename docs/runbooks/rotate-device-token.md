# Runbook - Eliminación y re-enrolamiento de device

Procedimiento manual (ADR-0010, actualizado 2026-11-06): los tokens de device son **permanentes**;
no expiran ni se rotan. Para revocar una credencial se elimina el device (borrado permanente de
sus datos) y se enrola uno nuevo.

## Tiempo estimado: 5 minutos · Interrupción del servicio: sí (el device anterior deja de ingerir)

## Pasos

1. **Dashboard → Configuración → Dispositivos enrolados → "Eliminar"** sobre el device.
   - Confirmar el diálogo: se borran permanentemente sus ventanas, alertas, insights y health.
   - El `token_hash` desaparece con la fila: el token anterior deja de ser válido al instante.
2. **Actualizar el agente**:
   - Enrolar un dispositivo nuevo arriba, copiar el token (plaintext visible una sola vez) y el `device_id`.
   - Reemplazar `SC_INGEST_TOKEN` y `SC_SENTINEL_DEVICE_ID` en el entorno del agente.
   ```powershell
   # Windows (servicio)
   Restart-Service "SC-Sentinel-Agent"
   ```
   ```bash
   # Linux
   systemctl restart sc-sentinel-agent
   ```
3. **Verificar**:
   - Sin 401/403 en los logs del agente.
   - Dashboard → Settings: el device nuevo pasa de `enrolled_pending` a `active` con el primer ingest.
   - `/dashboard/overview`: vuelven a entrar ventanas.

## Drenaje del spool pendiente

Durante el período sin credencial válida el spool conserva los batches (spec §8). Tras re-enrolar y
reiniciar, el agente drena el spool a ~60 req/min (ADR-0011). No borrar el spool.

## Emergencia: token expuesto (leaks)

- **Eliminar el device inmediatamente** (procedimiento anterior). No existe rotación.
- Si el token expuesto se usó para inyectar payloads, ejecutar `incident-response.md` (escenario
  "compromiso de token").
- Ningún token se loguea en ningún lado: verificar logs del servidor si se sospecha exfiltración
  vía error logs (regla §9.3).

## Recordatorios

- La eliminación es **permanente e irreversible**: incluye el histórico del device.
- El plaintext NO se puede "recuperar": solo eliminar y re-enrolar.
- La sesión admin (cookie) no se ve afectada por eliminar un device.
