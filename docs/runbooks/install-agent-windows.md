# Runbook — Instalación del agente en Windows

**Requisitos:** Windows 10/11 o Server 2016+ · Npcap instalado (**no se redistribuye**) · permisos de administrador · 1 vez: enrollment desde el dashboard.

## 0. ENROLLMENT (antes de todo)

1. Ingresar a `https://sc-sentinel.vercel.app/dashboard/settings` (cookie admin).
2. Crear/copiar el device token. **El plaintext se muestra UNA sola vez** (ADR-0010).
3. Guardarlo en algo seguro para el paso 4.

## 1. Instalación

```powershell
# 1. Descargar binario (GitHub Releases)
Invoke-WebRequest -Uri "https://github.com/<org>/SC-Sentinel/releases/download/v0.1.0/sc-sentinel-agent-v0.1.0-windows-x64.zip" -OutFile agent.zip

# 2. Extraer
Expand-Archive agent.zip -DestinationPath "C:\Program Files\SC-Sentinel"

# 3. Crear config
New-Item -ItemType Directory -Path "C:\ProgramData\SC-Sentinel" -Force
Copy-Item "C:\Program Files\SC-Sentinel\config.example.toml" "C:\ProgramData\SC-Sentinel\config.toml"
```

Verificar/ajustar `C:\ProgramData\SC-Sentinel\config.toml`:

```toml
[agent]
endpoint = "https://sc-sentinel.vercel.app/api/ingest"
window_seconds = 30
compression = "gzip"        # v1: gzip por defecto (ADR-0009)

[capture]
interface = "auto"
```

## 2. Servicio Windows (quoting correcto)

```powershell
sc.exe create "SC-Sentinel-Agent" binPath= "\"C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe\" --config \"C:\ProgramData\SC-Sentinel\config.toml\"" start= auto
sc.exe start "SC-Sentinel-Agent"
```

## 3. Token en entorno del servicio

El token NO va en config.toml en producción; opcionalmente con variable de entorno del servicio: `SC_SENTINEL_TOKEN`. Si se setea por config, restringir permisos del archivo: `icacls "C:\ProgramData\SC-Sentinel\config.toml" /inheritance:r /grant Administrators:F /grant SYSTEM:F`.

## 4. Verificación post-instalación

```powershell
sc.exe query "SC-Sentinel-Agent"        # estado RUNNING
Get-Content "C:\ProgramData\SC-Sentinel\logs\agent.log" -Tail 50 -Wait
```

Checklist:
- [ ] Status RUNNING y sin reinicios (Event Viewer).
- [ ] Log muestra captura activa (`capture_status: ok`, packets_seen creciente).
- [ ] Dashboard → Settings muestra "último sync exitoso" reciente.
- [ ] Dashboard → Overview tiene datos.
- [ ] No hay errores de permisos pcap.

## 5. Desinstalación (limpia)

```powershell
sc.exe stop "SC-Sentinel-Agent"
sc.exe delete "SC-Sentinel-Agent"
Remove-Item -Recurse -Force "C:\Program Files\SC-Sentinel"
Remove-Item -Recurse -Force "C:\ProgramData\SC-Sentinel"
```

## 6. Upgrade de versión

```powershell
sc.exe stop "SC-Sentinel-Agent"
# reemplaza binario en Program Files (extraer zip)
sc.exe start "SC-Sentinel-Agent"
```

El spool en `C:\ProgramData\SC-Sentinel\spool.sqlite` persiste entre upgrades (no eliminarlo salvo que también se quiera borrar datos offline).
