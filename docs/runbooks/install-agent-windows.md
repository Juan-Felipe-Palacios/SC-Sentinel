# Runbook — Instalación del agente en Windows (servicio SCM)

**Requisitos:** Windows 10/11 o Server 2016+ · permisos de administrador · 1 vez: enrollment desde el dashboard.
Npcap **solo** si además se va a usar captura en vivo; el servicio arranca en modo colector y no lo necesita.

**Qué instala:** binario + config + servicio con recovery + log por archivo + token en el entorno del servicio (nunca plano en disco). El binario implementa el control del SCM (`windows-service`): Stop drena ventana (30 s máx), sync y spool antes de marcar `Stopped` con el código real.

## 0. ENROLLMENT (antes de todo)

1. Ingresar a `https://sc-sentinel.vercel.app/dashboard/settings` (cookie admin).
2. Pulsar **«Enrolar nuevo dispositivo»**. La pantalla devuelve dos valores:
   - `device_id` con formato `dev_…` (copiar tal cual).
   - `token` con formato `sc_dev_…` (**se muestra UNA sola vez**, ADR-0010).
3. Guardarlos en un lugar seguro para el paso de instalación. Si se pierde el token, hay que eliminar el device y enrolar otro (`docs/runbooks/rotate-device-token.md`).

> El `device_id` y el token deben **corresponder**: si el `device.id` del payload no es el dueño del token, `/api/ingest` responde `403`.

## 1. Instalación

Hay dos vías equivalentes. La **1.1** es la recomendada para un equipo sin acceso al repo y para usuarios sin conocimientos de informática.

### 1.1 Instalador de un clic (ZIP de la release)

1. Descargar el paquete de la release: `https://github.com/Juan-Felipe-Palacios/SC-Sentinel/releases/download/v0.1.4/sc-sentinel-agent-v0.1.4-windows-x64.zip` (la última versión siempre está en <https://github.com/Juan-Felipe-Palacios/SC-Sentinel/releases/latest>).
2. Verificar el hash del artefacto contra `SHA256SUMS.txt` (mismo directorio en la release):

   ```powershell
   Get-FileHash .\sc-sentinel-agent-v0.1.4-windows-x64.zip -Algorithm SHA256
   ```

3. Descomprimir **todo** el ZIP en una carpeta (no solo el `.exe`).
4. Doble clic en **`instalar-sc-sentinel.bat`**. Windows pedirá permisos de administrador: pulsar «Sí».
5. Pegar el `device_id` (`dev_…`) y el token (`sc_dev_…`) cuando los pida. El instalador valida que no falte ninguno y **no escribe el token en disco ni en el log**.
6. Al terminar, el servicio «SC Sentinel Network Agent» queda **En ejecución** y el instalador ofrece abrir la lista de servicios.

Modo desatendido (equipos con automatización, p. ej. GPO o Intune):

```powershell
instalar-sc-sentinel.bat dev_2f1c… sc_dev_9a04…            # puertos por defecto: 2055 y 4739
instalar-sc-sentinel.bat dev_2f1c… sc_dev_9a04… 2056,4739     # puertos alternativos
```

Contenido del ZIP:

| Fichero | Para qué sirve |
|---|---|
| `sc-sentinel-agent.exe` | El agente. |
| `geolite2/GeoLite2-Country.mmdb` | Base de geolocalización de países (MaxMind GeoLite2). Sin ella el agente arranca igual, pero los países de los snapshots salen vacíos. |
| `instalar-sc-sentinel.bat` | Instalador de un clic (pide el token y device id, se auto-eleva). |
| `desinstalar-sc-sentinel.bat` | Desinstalador de un clic (pregunta si se borran los datos). |
| `install-agent.ps1` / `uninstall-agent.ps1` | Los instaladores en PowerShell que usa el `.bat`. |
| `LEEME-INSTALACION.txt` | Guía en lenguaje llano para usuarios sin conocimientos de informática. |
| `SHA256SUMS.txt` | Hash de todos los ficheros del paquete para verificar la integridad. |

### 1.2 Instalador en PowerShell (desde el repo)

Desde un PowerShell **como administrador**, en la raíz del repo:

```powershell
# El agente publicado se compila con la captura live: sin esto el binario no
# puede capturar (ver docs/runbooks/npcap-install.md para el SDK de Npcap).
$env:LIBPCAP_VER = "1.0.0"
$env:LIBPCAP_LIBDIR = "C:\npcap-sdk-1.13\Lib\x64"
cargo build --release -p sc-agent --features sc-capture/live   # → agent\target\release\sc-sentinel-agent.exe

.\scripts\install-agent.ps1 -DeviceId "dev_2f1c…" -IngestToken "sc_dev_9a04…"
```

Parámetros: `-DeviceId` y `-IngestToken` (obligatorios), `-ConfigPath`, `-BinaryPath`, `-CollectorPorts` (por defecto `2055, 4739`), `-GeoIpDbPath` (base GeoLite2; si se omite se autodetecta en el paquete o en `agent/resources/geolite2/`), `-PurgeData`.

El instalador (`scripts/install-agent.ps1`):

1. Detiene y borra el servicio previo si existe, y espera a que el SCM libere el nombre.
2. Copia el binario a `C:\Program Files\SC-Sentinel\` **verificando el hash SHA256** (si el destino existe, fija antes los permisos: un binario instalado con ACL sin herencia bloqueaba la copia en silencio).
3. Copia la base GeoLite2 a `C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb` **verificando el hash SHA256**; si no la encuentra, avisa y el agente sigue funcionando sin geolocalización.
4. Crea `C:\ProgramData\SC-Sentinel\{config,spool,logs}` y escribe `config.toml` con las claves reales de `sc-config` (`[ingest] url/token_env/compression`, `[privacy] hmac_key_file`, `[spool] path/max_bytes/max_age_days`, `[log] level/file`, `[collector] enabled/bind_addr/listeners`).
5. Restringe permisos: `icacls` sin herencia, solo SYSTEM + Administradores en config/spool/logs, y solo lectura (SYSTEM + Administradores) sobre la base GeoLite2.
6. Guarda `SC_INGEST_TOKEN`, `SC_SENTINEL_DEVICE_ID` y `SC_GEOIP_DB` en `HKLM\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment` (entorno del servicio, no un archivo plano).
7. `sc.exe create ... binPath= "\"C:\...\sc-sentinel-agent.exe\" --config \"C:\...\config.toml\" --no-capture" start= auto` + **failure actions** `restart 5 s / 10 s / 30 s` con `reset= 86400` (recovery ante caída y ante reboot/reinicio del servidor).

> **Por qué `--no-capture`:** el servicio arranca en modo **collector-only**. La fuente de datos del daemon es el colector UDP (fuente exclusiva por segmento, ver `docs/testing/pcap-vs-flow.md` §7). Sin ese flag el agente exigiría una interfaz de captura y abortaría con código 2.

Desinstalación simétrica: `.\scripts\uninstall-agent.ps1` (usa `-PurgeData` para borrar además spool y `.host-key`).

## 2. Instalación manual (sin instalador)

```powershell
Invoke-WebRequest -Uri "https://github.com/Juan-Felipe-Palacios/SC-Sentinel/releases/download/v0.1.4/sc-sentinel-agent-v0.1.4-windows-x64.zip" -OutFile agent.zip
Expand-Archive agent.zip -DestinationPath ".\sc-sentinel" -Force

New-Item -ItemType Directory -Path "C:\ProgramData\SC-Sentinel\{config,spool,logs}" -Force
# El config.toml lo genera install-agent.ps1 (incluido en el ZIP). Si se copia a mano,
# el esquema real esta en docs/runbooks/install-agent-linux.md (seccion "Configuracion").
# El sample usa rutas RELATIVAS que se resuelven contra el directorio del
# propio config.toml: "./.host-key" -> C:\ProgramData\SC-Sentinel\config\.host-key
# y "../spool/sc-spool.sqlite" -> C:\ProgramData\SC-Sentinel\spool\sc-spool.sqlite.
# No hay que editar rutas a mano.
Copy-Item ".\agent\config\sc-agent.toml.sample" "C:\ProgramData\SC-Sentinel\config\config.toml"
icacls "C:\ProgramData\SC-Sentinel\config\config.toml" /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"

# Binario y base GeoLite2 (opcional: sin ella los países salen vacíos).
Copy-Item ".\sc-sentinel\sc-sentinel-agent.exe" "C:\Program Files\SC-Sentinel\" -Force
New-Item -ItemType Directory -Path "C:\Program Files\SC-Sentinel\geolite2" -Force
Copy-Item ".\sc-sentinel\geolite2\GeoLite2-Country.mmdb" "C:\Program Files\SC-Sentinel\geolite2\" -Force

sc.exe create "SC-Sentinel-Agent" binPath= "\"C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe\" --config \"C:\ProgramData\SC-Sentinel\config\config.toml\" --no-capture" start= auto
sc.exe failure "SC-Sentinel-Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc.exe start "SC-Sentinel-Agent"
```

Y el token (PowerShell como admin):

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment" -Name "SC_INGEST_TOKEN" -Value "sc_dev_…" -PropertyType String -Force
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment" -Name "SC_SENTINEL_DEVICE_ID" -Value "dev_…" -PropertyType String -Force
# Ruta absoluta de la base GeoLite2 (opcional: el agente tambien la busca en
# <dir del binario>\geolite2\ y en <dir del binario>\resources\geolite2\).
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment" -Name "SC_GEOIP_DB" -Value "C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb" -PropertyType String -Force
```

## 3. Verificación post-instalación

Lo más rápido es el script de verificación, que hace las comprobaciones de este
apartado y devuelve 0 si todo está correcto:

```powershell
.\scripts\verify-agent.ps1            # verifica el paquete (dist\*.zip o -ZipPath)
.\scripts\verify-agent.ps1 -Service   # ademas verifica la instalacion del servicio
```

> El nivel `-Service` necesita **permisos de administrador** para leer
> `config\`, `spool\` y `logs\` (el instalador los restringe a SYSTEM y
> Administradores). Sin elevación el script lo avisa, pero no falla.

Equivalente a mano:

```powershell
sc.exe query "SC-Sentinel-Agent"                 # RUNNING (No se requiere reinicio)
sc.exe qfailure "SC-Sentinel-Agent"              # FAILURE_ACTIONS: RESTART 5000/10000/30000, RESET 86400
Get-Content "C:\ProgramData\SC-Sentinel\logs\agent.log" -Tail 50
```

Checklist:
- [ ] `sc.exe query` RUNNING y `sc.exe qfailure` muestra las 3 acciones de recovery.
- [ ] Log por archivo activo: la config del servicio no define stdout; las líneas aparecen en `agent.log` con `collector_started` o captura activa (sin datos sensibles: el log lleva evento/claves contractuales, no tokens ni payloads; §9.3).
- [ ] `C:\ProgramData\SC-Sentinel\config\.host-key` existe (clave HMAC persistida del host) y el spool `spool\sc-spool.sqlite` está inicializado.
- [ ] El log muestra `GeoIP: base GeoLite2 cargada path=…` (si no aparece, la geolocalización de países está vacía: ver §7).
- [ ] El proceso del agente **escucha en UDP** los puertos del colector (`2055` y `4739` por defecto). El script lo comprueba mirando los sockets del proceso; a mano:
      ```powershell
      Get-NetUDPEndpoint -OwningProcess (Get-Process sc-sentinel-agent).Id | Select-Object LocalAddress,LocalPort
      ```
- [ ] El `Environment` del servicio contiene un par **real** `SC_INGEST_TOKEN=sc_dev_…` + `SC_SENTINEL_DEVICE_ID=dev_…`:
      ```powershell
      (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent').Environment
      ```
      Con un token de prueba (`local-eval-token`) el backend responde **401/403** y nunca hay drain: es un problema de credenciales, no del agente.
- [ ] Dashboard → Settings muestra el device con "último sync exitoso" reciente.
- [ ] Dashboard → Overview tiene datos de ventanas.
- [ ] `sc.exe failure` tras un `/ping` de red caída: el SCM reinicia el daemon (se ve en el log un arranque nuevo con el mismo spool).

## 4. Recovery comprobado

| Disparador | Mecanismo | Qué verificar |
|---|---|---|
| Daemon crashea (panic, exit != 0) | `failure actions restart 5/10/30 s, reset 86400` | log nuevo arranque + `spool_pending` "quedan batches para el próximo arranque" + sync de lo pendiente |
| Reinicio del servidor | `start= auto` | el daemon vuelve arriba con el spool persistente y el seq no retrocede (§9.2: la secuencia vive en el spool) |
| Stop del SCM (upgrade/redeploy) | handler del binario: Stop → drain 15 s máx → Stopped | `sc.exe stop` tarda ≤ 30 s y deja el spool flushed (`event = spool_flushed`) |

Nota: para probar el recovery por caída sin bajar el backend, matar el proceso (`taskkill /PID <pid> /F`) y verificar con `sc.exe qfailure` que el SCM lo relanza (el log del nuevo arranque tiene `online` y el mismo downtime < 30 s).

## 5. Upgrade de versión

```powershell
sc.exe stop "SC-Sentinel-Agent"
Copy-Item ".\agent\target\release\sc-sentinel-agent.exe" "C:\Program Files\SC-Sentinel\" -Force
sc.exe start "SC-Sentinel-Agent"
```

El spool en `C:\ProgramData\SC-Sentinel\spool\sc-spool.sqlite` persiste entre upgrades (no eliminarlo: contiene ventanas pendientes de sync y la secuencia global ≥9.2).

## 6. Desinstalación limpia

Desde el ZIP (un clic):

```text
desinstalar-sc-sentinel.bat          # pregunta: ¿borrar también los datos?
desinstalar-sc-sentinel.bat S        # desatendido: S = borrar datos, N = conservarlos
```

Desde el repo:

```powershell
.\scripts\uninstall-agent.ps1            # conserva spool/logs/.host-key
.\scripts\uninstall-agent.ps1 -PurgeData # borra también los datos
```

El manual equivale a: `sc.exe stop` + `sc.exe delete` + borrar key `HKLM\...\Services\SC-Sentinel-Agent` (incluye `Environment` con el token) + `Remove-Item` de los dos directorios. Residuos a chequear: nada en `C:\Program Files`, nada en `C:\ProgramData`, `sc.exe query` devuelve `1060`.

## 7. Troubleshooting

| Síntoma | Causa | Acción |
|---|---|---|
| `sc.exe start` → error 2 / 1063 en el log | binPath mal citado (comillas duplicadas si la ruta tiene espacios) | copiar la línea EXACTA de §2 (el patrón `binPath= "\"...\" --config \"...\" --no-capture"` es obligatorio) |
| El servicio arranca y muere con exit 2 sin escribir log | el `binPath` no incluye `--no-capture` ni el agente no encuentra su config | el servicio usa `--config` explícito o, por defecto, `C:\ProgramData\SC-Sentinel\config\config.toml`; sin fuente de captura arranca en modo collector-only |
| Log vacío | binario anterior sin soporte SCM o `log.file` sin permisos | `icacls` logs para SYSTEM + Administrators (control total) y actualizar binario |
| `sync` siempre fallando: `401` | token no llegó al Environment del servicio | re-crear con el paso de token (0/§1) y `sc.exe stop/start` |
| `sync` siempre fallando: `403` | el `device_id` no es el dueño del token | reenrolar el dispositivo y reinstalar con el par `device_id` + token correcto (§0) |
| El colector no recibe exportadores | firewall UDP 2055/4739 | regla inbound + revisar `[collector] enabled = true` en config |
| En log: `source_overlap` | captura pcap vivo + colector a la vez en el mismo segmento | cf. docs/testing/pcap-vs-flow.md §7: elegir UNA fuente por segmento (`--no-capture` o `--no-collector`) |
| El instalador dice «no se encuentra `sc-sentinel-agent.exe`» | se descomprimió solo una parte del ZIP | descomprimir el ZIP completo en una carpeta y volver a ejecutar |
| Los países de los snapshots salen vacíos | falta la base GeoLite2 | copiar `geolite2\GeoLite2-Country.mmdb` a `C:\Program Files\SC-Sentinel\geolite2\` o fijar `SC_GEOIP_DB`; el log debe mostrar `GeoIP: base GeoLite2 cargada path=…` |
| `sc-sentinel-agent --list-interfaces` responde «captura live no compilada» | binario compilado sin `--features sc-capture/live` | recompilar con la feature (§1.2) y con el SDK de Npcap (`docs/runbooks/npcap-install.md`) |
| `sc-sentinel-agent --list-interfaces` no lista dispositivos | falta el runtime de Npcap | instalarlo desde https://npcap.com/#download (§Requisitos y `docs/runbooks/npcap-install.md`) |
| El instalador se queda colgado esperando teclado | se lanzó sin datos y el prompt `set /p` espera una pegada | usar el modo desatendido: `instalar-sc-sentinel.bat <device_id> <token>` |
| Log del instalador | traza sin secretos | `%TEMP%\sc-sentinel-instalador.log` (instalación) y `%TEMP%\sc-sentinel-instalador-ps.log` (salida de `install-agent.ps1`) |

### 7.1 Captura live y colector en el mismo host

El servicio puede correr con captura pcap **y** con colector NetFlow/IPFIX a la
vez (`--interface` + `[collector] enabled = true`). Es una configuración válida
para validar el pipeline, pero **no** para medir: el mismo flujo que entra por
pcap y llega exportado desde un router se cuenta dos veces. El agente lo detecta
y lo deja en el log como `source_overlap`.

Regla: **una sola fuente por segmento**.

- Solo captura: `--interface \Device\NPF_{...}` y `[collector] enabled = false`.
- Solo exportadores: `--no-capture` y los puertos del colector abiertos.
- Si necesitas las dos cosas, sepáralas en hosts distintos (o al menos en
devices distintos), nunca en el mismo device.

Los números de `packets_seen` y de `host_stats` de un device con
`source_overlap` no sirven como evidencia de tráfico real: son una cota superior.
