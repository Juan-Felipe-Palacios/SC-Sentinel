# Rotación de secretos

Complementa `docs/runbooks/rotate-device-token.md` (detalle del token) y
`docs/how-to/rotate-secrets.md` (ADMIN/CRON). Este runbook fija el orden y las
interrupciones cuando se rotan varios secretos en una misma ventana.

No ejecutar durante una ventana de mantenimiento no anunciada. Nunca pegar valores
de secretos en tickets, chat, logs ni commits.

## Principios

- El token del agente se guarda solo como hash SHA-256 en la base; el texto en claro
  se muestra una vez al crearlo o rotarlo.
- La rotación del token es inmediata: el token anterior deja de autenticar en el
  mismo `UPDATE` que escribe el hash nuevo.
- Un **401/403 no descarta datos**: el agente conserva la fila en el spool y
  reintenta cada 60 s (`ENROLLMENT_RETRY`); no la mueve a dead-letter. Solo un 2xx
  borra la fila. Test: `agent/crates/sc-sync/tests/sync_resilience.rs:138`
  (`un_401_exige_enrolamiento_y_no_borra`).
- Vercel fija las variables de entorno por deployment. Cambiar una variable **no**
  actualiza deployments anteriores; un rollback reutiliza los valores viejos.
- Para Neon, la contraseña anterior deja de funcionar al confirmar el cambio. La
  aplicación puede seguir con conexiones ya abiertas hasta que se reciclen; el
  redeploy fuerza conexiones nuevas.

## 0. Preflight (sin interrupción)

1. Confirmar servicio `Running` y sync reciente:
   ```powershell
   sc.exe query SC-Sentinel-Agent
   Invoke-RestMethod http://127.0.0.1:8387/status
   ```
2. Anotar `device_id`, `agent_version`, `last_sync_at`, tamaño del spool y el
   deployment de Vercel actual (ID/URL).
3. Confirmar acceso al dashboard como admin, a Neon y a Vercel.
4. Confirmar acceso a GitHub Actions (`gh auth status`) para actualizar
   `CRON_SECRET`.
5. No rotar un secreto sin tener el nuevo valor generado y guardado en el gestor
   de contraseñas. No imprimirlo.

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
  retiene las ventanas; el agente reintenta cada 60 s. No borrar el spool ni
  reinstalar el servicio.

## 2. Orden de la ventana: app + cron + Neon

Objetivo: **un solo redeploy** de Vercel para aplicar todos los cambios de entorno.

| Orden | Acción | Efecto |
|---|---|---|
| 1 | Generar nuevos `ADMIN_SECRET`, `SC_SESSION_SECRET`, `CRON_SECRET` y la credencial nueva de Neon | Sin efecto todavía |
| 2 | Actualizar las cuatro variables en Vercel (Production; Preview si corresponde) | Solo aplican al próximo deployment |
| 3 | Actualizar `CRON_SECRET` en GitHub Actions | El cron de IA deja de fallar antes del deploy |
| 4 | Rotar la credencial de Neon | La vieja deja de servir |
| 5 | Un solo `vercel --prod` | Aplica todo; única interrupción de la app |
| 6 | Verificar login, DB y ambos crons | Criterio de cierre |
| 7 | Revocar la credencial vieja de Neon | Cierra la ventana |

Si se usa un **rol nuevo de Neon** (recomendado), el paso 4 no invalida el rol viejo
hasta el paso 7; el rollback de Vercel sigue siendo viable durante la verificación.

## 3. Detalle de la rotación

### 3.1 `ADMIN_SECRET`

- Es la contraseña del login admin y el bearer `x-sc-admin-secret` para tooling.
- Generar un valor nuevo y cargarlo en Vercel **Production** (y Preview si se usa).
- Actualizar cualquier script local que use `x-sc-admin-secret`; no dejarlo en
  historial ni en `.env` versionado.
- Efecto: el login viejo deja de servir cuando el nuevo deployment arranca. No
  afecta al agente.

### 3.2 `SC_SESSION_SECRET`

- Firma la cookie `sc_session`.
- Al cambiarlo, **todas las sesiones admin existentes quedan inválidas**; hay que
  volver a loguearse con el `ADMIN_SECRET` nuevo.
- No afecta al agente ni al ingest.

### 3.3 `CRON_SECRET`

- Se usa en el header `x-cron-secret` de `/api/ai/cron` y `/api/cron/cleanup`.
- Cargar el valor nuevo en Vercel y en GitHub Actions:
  ```bash
  gh secret set CRON_SECRET --repo <owner>/<repo>
  ```
  Pegar el valor por stdin cuando lo pida; no pasarlo como argumento.
- Verificar los dos caminos:
  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
    -H "x-cron-secret: <nuevo>" https://sc-sentinel.vercel.app/api/ai/cron
  ```
  El cleanup diario se valida en los logs de Vercel o con una llamada manual; no
  ejecutarlo fuera de ventana.
- Si GitHub Actions conserva el valor viejo, el cron de IA fallará cada 15 min hasta
  que se actualice el secret.

### 3.4 Neon / `DATABASE_URL`

**Preferido: rol nuevo (sin downtime y rollback viable).**

1. Crear un rol nuevo en Neon con los mismos privilegios que el runtime (sin DDL).
2. Copiar su cadena **pooled** (`...-pooler...`) y actualizar `DATABASE_URL` en
   Vercel.
3. Desplegar y verificar la app.
4. Recién entonces revocar/deshabilitar el rol viejo.
5. Si el deploy falla, el deployment anterior sigue usando el rol viejo y el
   rollback funciona.

**Alternativa: resetear la contraseña del mismo rol.**

- Solo si no se puede crear un rol nuevo.
- El build y el deploy ocurren dentro de la interrupción; si el build necesita la
  base, puede fallar y hay que reintentar.
- Actualizar `DATABASE_URL` en Vercel, resetear la contraseña en Neon y desplegar
  inmediatamente. Interrupción esperada: 5–10 min.
- El deployment anterior queda con la contraseña vieja: **no sirve para rollback**
  después del reset.

### 3.5 Un solo redeploy

```bash
# desde la raíz del repo (Root Directory de Vercel = web)
vercel --prod
```

No redeplegar una vez por secreto: un solo deployment aplica las cuatro variables.

### 3.6 Verificación

```bash
BASE=https://sc-sentinel.vercel.app

curl -sS -o /dev/null -w 'home   %{http_code}\n' "$BASE/"
curl -sS -o /dev/null -w 'dash   %{http_code} %{redirect_url}\n' "$BASE/dashboard"
curl -sS -o /dev/null -w 'query  %{http_code}\n' "$BASE/api/query?metric=overview&range=1h"
```

- `home` 200.
- `dash` 307/302 al login (sin cookie), no 500.
- `query` 401 sin cookie o 200 con cookie; nunca 500 por base.
- Login con el `ADMIN_SECRET` nuevo.
- Cron de IA con el `CRON_SECRET` nuevo: 200.
- Logs de Vercel sin errores de conexión a Neon.

## 4. Rollback de Vercel después de rotar Neon

Vercel no actualiza las variables de un deployment anterior: el rollback reutiliza
el build y los valores con los que se creó. Por eso:

| Momento | Rollback | Resultado |
|---|---|---|
| Antes de rotar Neon | Seguro | Vuelve código y secretos viejos; sirve para una regresión de código |
| Neon con rol nuevo, rol viejo aún activo | Viable | El deployment viejo sigue autenticando con el rol viejo |
| Neon con contraseña reseteada | **No usar** | El deployment viejo tiene la contraseña muerta: 500 por DB |
| Después de revocar el rol viejo | **No usar** | Igual que el anterior; el rol ya no existe |

Si el rollback se usa después de rotar `ADMIN_SECRET`, `SC_SESSION_SECRET` o
`CRON_SECRET`, el deployment viejo vuelve a aceptar los valores viejos. Tratarlos
como quemados y rotarlos otra vez.

Recuperación correcta tras un reset de Neon: **arreglar hacia adelante** (corregir
env/código y redeploy) o restaurar la contraseña anterior en Neon si es posible;
no confiar en el rollback.

## 5. Limpieza local y recomendación sobre `.env.production.local`

1. El historial de PowerShell (`ConsoleHost_history.txt`) contiene una cadena de
   Neon con credenciales y asignaciones de `SC_INGEST_TOKEN`. Hacer copia de respaldo
   fuera del perfil, eliminar esas líneas o borrar el archivo y reiniciar las
   consolas.
2. Borrar payloads temporales de enrolamiento:
   ```powershell
   Get-ChildItem $env:TEMP -Filter 'sc-sentinel-enroll-*.json' -ErrorAction SilentlyContinue |
     Remove-Item -Force
   ```
3. Revisar `.env*` locales: están ignorados por git, pero deben tener ACL restringida
   y no copiarse a tickets.
4. Buscar restos sin imprimir valores:
   ```bash
   git grep -nE 'ADMIN_SECRET=|SC_SESSION_SECRET=|CRON_SECRET=|GROQ_API_KEY=|GEMINI_API_KEY=|OPENROUTER_API_KEY=|sc_dev_|npg_|postgres(ql)?://'
   ```
5. Si se expuso un token de GitHub, revocarlo en GitHub → Settings → Developer
   settings → Personal access tokens y crear uno nuevo.

**¿Borrar `web/.env.production.local`?** Sí, después de la rotación. No es necesario
para el deploy (Vercel usa sus propias variables) y concentra secretos de producción
en el equipo local. Mover lo que haga falta al gestor de contraseñas y dejar un
`.env.local` solo con valores de desarrollo. Si se conserva, restringir ACL y no
copiarlo a otro equipo. Los valores viejos quedan muertos tras la rotación, así que
el coste de borrarlo es bajo.

## 6. Tiempos

| Paso | Interrupción | Duración típica |
|---|---|---|
| Token del dispositivo | Sync detenido; spool retiene y reintenta | 1–3 min |
| Preparar secretos + env de Vercel + GitHub Actions | Ninguna | 5–10 min |
| Neon con rol nuevo + redeploy | App sin cambios de DB; deploy 2–5 min | 5–8 min |
| Neon con reset del mismo rol | DB sin autenticar hasta el redeploy | 5–10 min |
| Limpieza local | Ninguna | 5–10 min |
| Ventana total | — | 20–30 min |

## 7. Rollback

- Token: rotar de nuevo y aplicar el token nuevo por la GUI. No se puede recuperar
  el token anterior; el hash viejo ya no existe.
- Neon: si se usó rol nuevo, volver `DATABASE_URL` al rol viejo y redeploy mientras
  siga activo. Si se reseteó la contraseña, generar otra y repetir el paso 3.4; el
  rollback de Vercel no ayuda.
- `ADMIN_SECRET` / `SC_SESSION_SECRET` / `CRON_SECRET`: si se vuelve a un deployment
  viejo, rotarlos de nuevo; el rollback restaura los valores viejos.
- Servicio: si tras el UAC no vuelve `Running`, revisar `sc.exe query` y el log; no
  reinstalar hasta confirmar que el `Environment` tiene el device/token nuevos.
