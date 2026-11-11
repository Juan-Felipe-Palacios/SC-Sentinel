# Runbook — Instalación del agente en Windows (servicio SCM)

**Requisitos:** Windows 10/11 o Server 2016+ · Npcap instalado (**no se redistribuye**) · permisos de administrador · 1 vez: enrollment desde el dashboard.

**Qué instala:** binario + config + servicio con recovery + log por archivo + token en el entorno del servicio (nunca plano en disco). El binario implementa el control del SCM (`windows-service`): Stop drena ventana (30 s máx), sync y spool antes de marcar `Stopped` con el código real.

## 0. ENROLLMENT (antes de todo)

1. Ingresar a `https://sc-sentinel.vercel.app/dashboard/settings` (cookie admin).
2. Crear/copiar el device token. **El plaintext se muestra UNA sola vez** (ADR-0010).
3. Guardarlo en algo seguro para el paso de instalación.

## 1. Instalación con el instalador (recomendado)

Desde un PowerShell **como administrador**, en la raíz del repo:

```powershell
cargo build --release -p sc-agent            # → agent\target\release\sc-sentinel-agent.exe
.\scripts\install-agent.ps1 -IngestToken "SCN_..." -DeviceId dev_srv-produccion
```

El instalador (`scripts/install-agent.ps1`):

1. Copia el binario a `C:\Program Files\SC-Sentinel\`.
2. Crea `C:\ProgramData\SC-Sentinel\{config,spool,logs}` y escribe `config.toml` con las claves reales de `sc-config` (`[ingest] url/token_env/compression`, `[privacy] hmac_key_file`, `[spool] path/max_bytes/max_age_days`, `[log] level/file`, `[collector] enabled/bind_addr/listeners`).
3. Restringe permisos: `icacls` sin herencia, solo SYSTEM + Administradores en config/spool/logs.
4. Guarda `SC_INGEST_TOKEN` y `SC_SENTINEL_DEVICE_ID` en `HKLM\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment` ( entorno del servicio, no un archivo plano).
5. `sc.exe create ... binPath= "\"C:\...\sc-sentinel-agent.exe\" --config \"C:\...\config.toml\" --no-capture" start= auto` + **failure actions** `restart 5 s / 10 s / 30 s` con `reset= 86400` (recovery ante caída y ante reboot/reinicio del servidor).

> **Por qué `--no-capture`:** el servicio arranca en modo **collector-only**. La fuente de datos del daemon es el colector UDP (fuente exclusiva por segmento, ver `docs/testing/pcap-vs-flow.md` §7). Sin ese flag el agente exigiría una interfaz de captura y abortaría con código 2.

Desinstalación simétrica: `.\scripts\uninstall-agent.ps1` (usa `-PurgeData` para borrar además spool y `.host-key`).

## 2. Instalación manual (sin instalador)

```powershell
Invoke-WebRequest -Uri "https://github.com/<org>/SC-Sentinel/releases/download/v0.1.0/sc-sentinel-agent-windows-x64.zip" -OutFile agent.zip
Expand-Archive agent.zip -DestinationPath "C:\Program Files\SC-Sentinel"

New-Item -ItemType Directory -Path "C:\ProgramData\SC-Sentinel\{config,spool,logs}" -Force
Copy-Item "agent\config\sc-agent.toml.sample" "C:\ProgramData\SC-Sentinel\config.toml"
# editar rutas absolutas en config.toml (spool/log/hmac_key_file) y icacls:
icacls "C:\ProgramData\SC-Sentinel\config.toml" /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"

sc.exe create "SC-Sentinel-Agent" binPath= "\"C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe\" --config \"C:\ProgramData\SC-Sentinel\config.toml\" --no-capture" start= auto
sc.exe failure "SC-Sentinel-Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc.exe start "SC-Sentinel-Agent"
```

Y el token (PowerShell como admin):

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent\Environment" -Name "SC_INGEST_TOKEN" -Value "SCN_..." -PropertyType String -Force
```

## 3. Verificación post-instalación

```powershell
sc.exe query "SC-Sentinel-Agent"                 # RUNNING (No se requiere reinicio)
sc.exe qfailure "SC-Sentinel-Agent"              # FAILURE_ACTIONS: RESTART 5000/10000/30000, RESET 86400
Get-Content "C:\ProgramData\SC-Sentinel\logs\agent.log" -Tail 50 -Wait
```

Checklist:
- [ ] `sc.exe query` RUNNING y `sc.exe qfailure` muestra las 3 acciones de recovery.
- [ ] Log por archivo activo: la config del servicio no define stdout; las líneas aparecen en `agent.log` con `collector_started` o captura activa (sin datos sensibles: el log lleva evento/claves contractuales, no tokens ni payloads; §9.3).
- [ ] `C:\ProgramData\SC-Sentinel\config\.host-key` existe (clave HMAC persistida del host) y el spool `spool\sc-spool.sqlite` está inicializado.
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

```powershell
.\scripts\uninstall-agent.ps1            # conserva spool/logs/.host-key
.\scripts\uninstall-agent.ps1 -PurgeData # borra también los datos
```

El manual equivale a: `sc.exe stop` + `sc.exe delete` + borrar key `HKLM\...\Services\SC-Sentinel-Agent` (incluye `Environment` con el token) + `Remove-Item` de los dos directorios. Residuos a chequear: nada en `C:\Program Files`, nada en `C:\ProgramData`, `sc.exe query` devuelve `1060`.

## 7. Troubleshooting

| Síntoma | Causa | Acción |
|---|---|---|
| `sc.exe start` → error 2 / 1063 en el log | binPath mal citado (comillas duplicadas si la ruta tiene espacios) | copiar la línea EXACTA de §1 (el patrón `binPath= "\"...\" --config \"...\" --no-capture"` es obligatorio) |
| El servicio arranca y muere con exit 2 sin escribir log | el `binPath` no incluye `--no-capture` ni el agente no encuentra su config | el servicio usa `--config` explícito o, por defecto, `C:\ProgramData\SC-Sentinel\config\config.toml`; sin fuente de captura arranca en modo collector-only |
| Log vacío | binario anterior sin soporte SCM o `log.file` sin permisos | `icacls` logs para SYSTEM + Administrators (control total) y actualizar binario |
| `sync` siempre fallando: `401` | token no llegó al Environment del servicio | re-crear con el paso de token (0/§1) y `sc.exe stop/start` |
| El colector no recibe exportadores | firewall UDP 2055/4739 | regla inbound + revisar `[collector] enabled = true` en config |
| En log: `source_overlap` | captura pcap vivo + colector a la vez en el mismo segmento | cf. docs/testing/pcap-vs-flow.md §7: elegir UNA fuente por segmento (`--no-capture` o `--no-collector`) |
