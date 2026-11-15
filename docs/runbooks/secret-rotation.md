# Rotación de secretos

Complementa `docs/runbooks/rotate-device-token.md` (detalle del token) y
`docs/how-to/rotate-secrets.md` (ADMIN/CRON). Este runbook fija el orden y las
interrupciones cuando se rotan varios secretos en una misma ventana.

Procedimiento para rotar el token de un dispositivo, la contraseña de Neon y limpiar
exposiciones locales. No ejecutar durante una ventana de mantenimiento no anunciada.
Nunca pegar valores de secretos en tickets, chat, logs ni commits.

## Principios

- El token del agente se guarda solo como hash SHA-256 en la base; el texto en claro
  se muestra una vez al crearlo o rotarlo.
- La rotación es inmediata: el token anterior deja de autenticar en el mismo
  `UPDATE` que escribe el hash nuevo.
- El agente conserva las ventanas en el spool cuando recibe 401/403, así que una
  rotación no pierde datos; solo retrasa el sync.
- Para Neon, la contraseña anterior deja de funcionar al confirmar el cambio. La
  aplicación sigue sirviendo con las conexiones ya abiertas hasta que se reciclan;
  el redeploy fuerza conexiones nuevas.

## 0. Preflight (sin interrupción)

1. Confirmar servicio `Running` y sync reciente:
   ```powershell
   sc.exe query SC-Sentinel-Agent
   Invoke-RestMethod http://127.0.0.1:8387/status
   ```
2. Anotar `device_id`, `agent_version`, `last_sync_at` y el tamaño del spool.
3. Confirmar acceso al dashboard como admin y a la consola de Neon/Vercel.
4. No rotar dos secretos a la vez: si algo falla, no se sabrá cuál fue.

## 1. Token del dispositivo (interrupción 1–3 min)

Orden recomendado: dejar la GUI abierta en **Enrolar** antes de rotar, para pegar el
token nuevo en cuanto se genere.

1. Abrir `sc-gui` → pestaña **Enrolar**.
2. En el dashboard web: **Configuración → Dispositivos**, localizar el device y
   pulsar **Rotar**. El token anterior queda invalidado en ese instante.
3. Copiar el token nuevo (`sc_dev_…`); se muestra una sola vez.
4. En la GUI, pegar el **mismo device_id** y el token nuevo; pulsar
   **Aplicar (pide UAC)**.
5. Aceptar el UAC. La GUI ejecuta `scripts/re-enroll-device.ps1`, escribe el
   `Environment` del servicio, lo reinicia y espera `Running` + sync confirmado.
6. Verificar:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:8387/status
   Select-String -Path 'C:\ProgramData\SC-Sentinel\logs\agent.log' `
     -Pattern 'sync_confirmed|401|403' | Select-Object -Last 10
   ```
   Criterio: `last_sync_at` posterior al UAC, sin 401/403 nuevos, `packets_seen`
   creciendo.

Notas:
- La GUI **Enrolar** no genera tokens: solo aplica un `device_id` + token que ya
  existen. Para rotar se usa el botón **Rotar** del dashboard.
- Si se genera un device nuevo en lugar de rotar, el anterior sigue activo y sus
  datos quedan separados. Para reemplazarlo, eliminar el device viejo después de
  confirmar el sync del nuevo.
- Mientras el agente tiene el token viejo, el backend responde 401/403 y el spool
  retiene las ventanas. No borrar el spool ni reinstalar el servicio.

## 2. Contraseña de Neon + Vercel (interrupción 2–5 min)

Ventana: hacerlo con poco tráfico. La base no se detiene, pero la app puede devolver
errores hasta que Vercel tenga la URL nueva y el redeploy termine.

1. En Neon, rotar la contraseña del rol de `DATABASE_URL` (o crear un rol nuevo con
   los mismos privilegios y usarlo como transición).
2. Copiar la cadena **pooled** nueva (`...-pooler...`).
3. En Vercel → Project → Settings → Environment Variables, actualizar
   `DATABASE_URL` en **Production** (y **Preview** si corresponde). No tocar
   `DATABASE_URL_UNPOOLED` si no se usa.
4. Redeplegar desde el commit actual (Vercel no aplica el valor nuevo a un
   deployment ya construido):
   ```bash
   vercel --prod
   ```
   o **Redeploy** en el dashboard.
5. Verificar:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://sc-sentinel.vercel.app/
   curl -sS -o /dev/null -w '%{http_code}\n' https://sc-sentinel.vercel.app/dashboard
   ```
   El dashboard sin cookie puede redirigir (302/307); lo importante es que no haya
   500 por base. Revisar logs de Vercel por errores de conexión.
6. Confirmar que el agente sigue sincronizando después del redeploy.

Si se usó un rol de transición: verificar la app, luego deshabilitar el rol viejo y
volver a desplegar solo si hace falta.

## 3. Limpieza de exposiciones locales (sin interrupción)

1. El historial de PowerShell (`ConsoleHost_history.txt`) contiene una cadena de
   Neon con credenciales y asignaciones de `SC_INGEST_TOKEN`. Hacer copia de respaldo
   fuera del perfil, luego eliminar esas líneas o borrar el archivo y reiniciar las
   consolas.
2. Borrar payloads temporales de enrolamiento:
   ```powershell
   Get-ChildItem $env:TEMP -Filter 'sc-sentinel-enroll-*.json' -ErrorAction SilentlyContinue |
     Remove-Item -Force
   ```
3. Revisar `.env*` locales: están ignorados por git, pero deben tener ACL restringida
   y no copiarse a tickets. Si un valor estuvo en historial, chat o un log, rotarlo.
4. Buscar restos sin imprimir valores:
   ```bash
   git grep -nE 'ADMIN_SECRET=|SC_SESSION_SECRET=|CRON_SECRET=|GROQ_API_KEY=|GEMINI_API_KEY=|OPENROUTER_API_KEY=|sc_dev_|npg_|postgres(ql)?://'
   ```
5. Si se expuso un token de GitHub, revocarlo en GitHub → Settings → Developer
   settings → Personal access tokens y crear uno nuevo.

## Tiempos

| Paso | Interrupción | Duración típica |
|---|---|---|
| Token del dispositivo (rotar + GUI + UAC + sync) | Sync detenido; spool retiene | 1–3 min |
| Neon + Vercel (rotar + env + redeploy + smoke) | App sin base hasta el redeploy | 5–10 min |
| Limpieza de historial y temporales | Ninguna | 5 min |
| Ventana total recomendada | — | 15–20 min |

## Rollback

- Token: rotar de nuevo y aplicar el token nuevo por la GUI. No se puede recuperar
  el token anterior; el hash viejo ya no existe.
- Neon: si el rol de transición se usó, volver `DATABASE_URL` al rol anterior y
  redeploy. Si se reseteó la contraseña, generar otra y repetir el paso 2.
- Servicio: si tras el UAC no vuelve `Running`, revisar `sc.exe query` y el log; no
  reinstalar hasta confirmar que el `Environment` tiene el device/token nuevos.
