# Tutorial — agente en 15 minutos

## Requisitos

- Windows 10/11 o Linux.
- Permisos de administrador (servicio).
- Acceso al dashboard (URL + contraseña admin).

## Pasos

1. Descargar el instalador de la última release.
2. Instalar (crea el servicio `SC-Sentinel-Agent`).
3. En el dashboard: Configuración → Dispositivos enrolados → "Enrolar dispositivo". Copiar `device_id` y token (se muestra una sola vez).
4. Configurar el token en el entorno del servicio (`SC_INGEST_TOKEN`).
5. Iniciar el servicio.
6. Esperar 1–2 minutos y verificar en `/dashboard/overview` que entran ventanas.

## Verificación

- Sin 401/403 en los logs del agente.
- `last_seen_at` del device se actualiza.
- `flow_windows` crece en Neon.

## Siguiente

- `docs/how-to/add-detection-rule.md` para personalizar detección.
- `docs/runbooks/troubleshoot-sync.md` si no llegan datos.