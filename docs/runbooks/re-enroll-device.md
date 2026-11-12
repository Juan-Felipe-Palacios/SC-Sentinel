# Runbook — Re-enrolar el device del service Windows

Procedimiento para devolver el agente a un estado de publicación válido cuando
`agent.log` repite cada ~60 s:

```text
ERROR sc_sentinel_agent: sync: 401/403, re-enrolar el device window_id=...
WARN  sc_sentinel_agent: sync: el device necesita enrolarse; batches retenidos en el spool
```

## Qué significa

`/api/ingest` autentica el Bearer contra `devices.token_hash` (SHA-256) y exige
que `device.id` del sobre sea el dueño del token. Un 401/403 significa una de
tres cosas, y las tres se arreglan igual (escribir credenciales vigentes en el
`Environment` del service):

1. el token del `Environment` no es un token de device (`sc_dev_...`), por
   ejemplo el marcador de las pruebas de evaluación `local-eval-token`;
2. el token es real pero fue **rotado** o el device se **eliminó** desde el
   dashboard;
3. el `device_id` no es el dueño del token.

Con credenciales inválidas el agente **no borra nada**: los batches quedan
`pending` en `C:\ProgramData\SC-Sentinel\spool\sc-spool.sqlite` y se drenan solos
cuando vuelve a haber credencial válida (ADR-0010/ADR-0011). No hay que borrar
el spool.

El plaintext del token no se recupera del backend (solo se guarda su hash). Si
se perdió, hay que **rotar** el token del device o **enrolar** uno nuevo desde
Dashboard → Configuración → Dispositivos enrolados, y copiar el valor que se
muestra una única vez.

## Requisito previo (humano, 1 minuto, en el dashboard)

- Un device **existente y vigente**: o el actual con un token rotado
  (`POST /api/devices/:id/rotate`), o uno nuevo enrolado.
- Anotar `device_id` (`dev_...`) y el token completo (`sc_dev_...`).

## Vía rápida — script reutilizable

```powershell
# PowerShell como Administrador, desde la raíz del repo
.\scripts\re-enroll-device.ps1 -DeviceId 'dev_m5svc' -IngestToken 'sc_dev_...'
```

Hace, en este orden: valida los parámetros, comprueba que la consola es elevada,
detiene el service y espera a `Stopped`, reescribe el `Environment` conservando
las demás variables, arranca el service y vigila `agent.log` hasta ver una
ventana aceptada por el backend.

- **exit 0** solo si llega al menos un `sync_confirmed` (evento que únicamente
  produce un 2xx) y no hay 401/403 en la ventana.
- **exit 1** si el service no arranca, el backend sigue rechazando, o no hubo
  tráfico nuevo que confirmar.
- **exit 2** si los parámetros son inválidos o la consola no es elevada.

Opciones: `-ServiceName` (por defecto `SC-Sentinel-Agent`), `-TimeoutSeconds`
(por defecto 100 = dos ciclos de agregación + margen), `-SkipVerification`
(solo diagnóstico; termina en 1 porque no acredita publicación).

El token nunca se imprime: el script muestra solo su longitud, y no escribe el
valor en `config.toml` ni en ningún log.

## Vía manual (equivalente, paso a paso)

Todo en una consola de PowerShell **ejecutada como administrador**.

### a) Detener el service

```powershell
sc.exe stop SC-Sentinel-Agent
# Esperar a Stopped: el agente drena el pipeline (≤30 s) antes de salir.
while ((Get-Service SC-Sentinel-Agent).Status -ne 'Stopped') { Start-Sleep 2 }
(Get-Service SC-Sentinel-Agent).Status
```

### b) Escribir el token y el device_id en el Environment del service

El `Environment` es una propiedad `REG_MULTI_SZ` de la clave del service, no una
subclave. Hay que **conservar** las variables que ya estaban (`SC_GEOIP_DB`,
etc.) y reemplazar solo las de credenciales:

```powershell
$key = 'HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent'
$envVars = @((Get-ItemProperty -Path $key -Name Environment).Environment |
    Where-Object { $_ -and $_ -notmatch '^(SC_INGEST_TOKEN|SC_SENTINEL_DEVICE_ID)=' })

$envVars += 'SC_INGEST_TOKEN=sc_dev_...'        # token completo, sin comillas
$envVars += 'SC_SENTINEL_DEVICE_ID=dev_m5svc'   # debe ser el dueño del token

New-ItemProperty -Path $key -Name Environment -Value $envVars -PropertyType MultiString -Force
```

Equivalente con `reg add` (ojo: `reg add` **reemplaza** la lista completa, así
que hay que repetir todas las variables que deban quedar):

```bat
reg add "HKLM\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent" /v Environment /t REG_MULTI_SZ ^
  /d "SC_INGEST_TOKEN=sc_dev_..."\0"SC_SENTINEL_DEVICE_ID=dev_m5svc"\0"SC_GEOIP_DB=C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb" /f
```

Comprobar sin exponer el token:

```powershell
(Get-ItemProperty -Path $key -Name Environment).Environment |
    ForEach-Object { if ($_ -match '^(SC_INGEST_TOKEN)=(.*)$') { "SC_INGEST_TOKEN=<{0} caracteres>" -f $Matches[2].Length } else { $_ } }
```

### c) Arrancar el service

```powershell
sc.exe start SC-Sentinel-Agent
Start-Sleep 3
(Get-Service SC-Sentinel-Agent).Status   # Running
```

### d) Verificar en `agent.log`

```powershell
Get-Content 'C:\ProgramData\SC-Sentinel\logs\agent.log' -Tail 40 -Wait
```

Criterio de cierre:

- aparece `sync: ventana aceptada por el backend` (`event=sync_confirmed`) con un
  `window_id` nuevo — solo un 2xx borra la fila del spool;
- no reaparecen `401/403` ni `el device necesita enrolarse` en **dos ciclos**
  (~70 s);
- el spool deja de crecer: `Get-Item 'C:\ProgramData\SC-Sentinel\spool\sc-spool.sqlite'`
  se estabiliza y el dashboard muestra ventanas nuevas.

Los batches que quedaron retenidos con el `device_id` anterior se reasignan al
device enrolado al enviarlos y dejan su rastro `sync: ventana reasignada al
device enrolado` (`event=sync_rebased_device`). Sin esa reasignación el backend
responde 403 (`device.id` no es el dueño del token) y, como la cola es FIFO, el
batch viejo bloqueaba el drenaje completo para siempre.

## Diagnóstico

| Síntoma | Causa | Acción |
| --- | --- | --- |
| Sigue el 401/403 tras reiniciar | token rotado, device eliminado o `device_id` ajeno | rotar/enrolar de nuevo desde el dashboard |
| `Running` pero sin `sync_confirmed` | el colector no recibió tráfico nuevo | enviar tráfico a UDP 2056/4739 o esperar |
| El service no llega a `Stopped` | un `Stop` previo quedó colgado | `sc.exe queryex` y, si hace falta, `taskkill /PID <pid>` |
| `Environment` con dos entradas de token | se usó `New-ItemProperty` sobre una lista que ya las tenía | repetir el paso (b) con el filtro |
| Log ilegible sin elevación | ACL del instalador (SYSTEM + Administradores) | repetir en consola elevada |

## Notas de operación

- Entre la rotación del token y el completado del script **son esperables
  `401`/`403`**. El agente retiene los batches en el spool y los drena solo
  cuando el servicio arranca con las credenciales nuevas: no hay que limpiar
  `spool/` a mano ni repetir el re-enrolamiento por ver esos códigos.
- Si tras completar el script los batches siguen retenidos, lo primero es
  mirar el log del backend (`ingest_db_failed`): un `42703` significa esquema
  desactualizado, no un problema de credenciales. Ver
  `docs/runbooks/apply-db-migrations.md`.

## Recordatorios

- El token **nunca** va en `config.toml` (`token_env = "SC_INGEST_TOKEN"`) ni en
  git: solo en el `Environment` del service.
- El `device_id` no se guarda en `config.toml`: se pasa por
  `SC_SENTINEL_DEVICE_ID`.
- Re-enrolar **no** renueva `host_key`: si se regeneró `.host-key`, los
  `host_key` del dashboard dejan de coincidir con el histórico (ver
  `docs/reference/agent-config.md`).
- Prohibido tocar `agent/spool/maintenance.ps1` en este procedimiento.
