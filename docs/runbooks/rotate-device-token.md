# Runbook — Rotación y re-enrolamiento de token de device

Procedimiento manual (ADR-0010, actualizado 2026-11-11 con M7): el token de device se puede
**rotar desde el dashboard** sin borrar el dispositivo ni su histórico. El token anterior deja de
autenticar de inmediato.

## Tiempo estimado: 3 minutos · Interrupción del servicio: sí (hasta actualizar el agente)

## Rotación normal

1. **Dashboard → Configuración → Dispositivos enrolados → "Rotar token"** sobre el device.
   - Confirmar el diálogo. La API `POST /api/devices/:id/rotate` exige sesión admin.
   - El token nuevo se muestra **una sola vez**; el anterior queda inválido al instante.
2. **Actualizar el agente** con el token nuevo:
   ```powershell
   # Windows (servicio): el token vive en el Environment del servicio
   sc.exe stop "SC-Sentinel-Agent"
   # Actualizar SC_INGEST_TOKEN en HKLM\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment
   sc.exe start "SC-Sentinel-Agent"
   ```
   ```bash
   # Linux (systemd)
   sudo systemctl edit sc-sentinel-agent   # o editar /etc/sc-sentinel/agent.env
   sudo systemctl restart sc-sentinel-agent
   ```
3. **Verificar**:
   - Sin 401/403 en los logs del agente.
   - `/dashboard/settings`: el device sigue `active` y su `last_seen_at` se actualiza.
   - `/dashboard/overview`: vuelven a entrar ventanas.

## Drenaje del spool pendiente

Durante la ventana sin credencial válida el spool conserva los batches (spec §8). Tras actualizar el
token y reiniciar, el agente drena el spool a ~60 req/min (ADR-0011). No borrar el spool.

## Emergencia: token expuesto

- **Rotar el token inmediatamente** desde Settings. No hace falta eliminar el device.
- Si el token expuesto se usó para inyectar payloads, ejecutar `incident-response.md` (escenario
  "compromiso de token").
- El token anterior deja de funcionar en el próximo request de ingesta; el nuevo solo se muestra
  una vez.

## Re-enrolamiento (solo si se perdió el device o se quiere borrar su histórico)

1. **Configuración → Dispositivos enrolados → "Eliminar"**. Se borran permanentemente ventanas,
   alertas, insights y health del device.
2. Enrolar un dispositivo nuevo, copiar token y `device_id`, y actualizar el entorno del agente.
3. Verificar que el device nuevo pasa de `enrolled_pending` a `active` con el primer ingest.

## Recordatorios

- La rotación **no** borra datos ni cambia el `device_id`.
- El plaintext NO se puede recuperar: si se pierde, hay que rotar otra vez.
- La sesión admin (cookie) no se ve afectada por rotar un token.
- El token se guarda solo como SHA-256; nunca se loguea.
