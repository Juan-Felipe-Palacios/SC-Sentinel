# Installador del agente SCNet como servicio de Windows (M5).
#
# Requiere permisos de administrador. Detalles y troubleshooting:
# docs/runbooks/install-agent-windows.md
#
# Sintaxis:
#   .\scripts\install-agent.ps1 -IngestToken <token> [-Endpoint <url>] [-DeviceId <id>]
#
# Qué hace:
#   1. Copia el binario a C:\Program Files\SC-Sentinel (desde target\release o
#      -BinaryPath para una ruta ya compilada/descargada).
#   2. Crea C:\ProgramData\SC-Sentinel (config, spool, logs) y un config.toml
#      con las claves reales de sc-config (ingest/privacy/spool/log/collector).
#   3. Restringe permisos (icacls): solo SYSTEM y Administradores.
#   4. Guarda el token como entorno del SERVICIO (HKLM\...\Environment), nunca
#      en disco plano.
#   5. sc.exe create con quoting correcto del binPath + start=auto + recovery
#      (failure actions restart 5/10/30 s, reset 86400).

param(
    [Parameter(Mandatory = $true)]
    [string]$IngestToken,

    [string]$Endpoint = "https://sc-sentinel.vercel.app/api/ingest",

    # Identificador del device en el dashboard (default: hostname).
    [string]$DeviceId = "",

    # Binario a instalar; por defecto el release del repo.
    [string]$BinaryPath = "",

    [string]$InstallDir = "C:\Program Files\SC-Sentinel",
    [string]$DataDir = "C:\ProgramData\SC-Sentinel",
    [string]$ServiceName = "SC-Sentinel-Agent"
)

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

if ($BinaryPath -eq "") {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $BinaryPath = Join-Path $repoRoot "agent\target\release\sc-sentinel-agent.exe"
}
if (-not (Test-Path $BinaryPath)) {
    throw "Binario no encontrado: $BinaryPath (compila con cargo build --release -p sc-agent)"
}
if ($DeviceId -eq "") {
    $DeviceId = "dev_$([System.Net.Dns]::GetHostName().ToLower())"
}

# --- 1-2. Directorios y binario ---
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($sub in @("config", "spool", "logs")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $DataDir $sub) | Out-Null
}
Copy-Item $BinaryPath (Join-Path $InstallDir "sc-sentinel-agent.exe") -Force

# --- 3. Config (claves reales de sc-config; token NUNCA en el archivo) ---
$configPath = Join-Path $DataDir "config.toml"
@"
[ingest]
url = "$Endpoint"
token_env = "SC_INGEST_TOKEN"
compression = "gzip"

[privacy]
anonymize_hosts = false
hmac_key_env = "SC_HMAC_KEY"
hmac_key_file = "C:/ProgramData/SC-Sentinel/config/.host-key"

[spool]
path = "C:/ProgramData/SC-Sentinel/spool/sc-spool.sqlite"
max_bytes = 524288000
max_age_days = 7

[log]
level = "info"
file = "C:/ProgramData/SC-Sentinel/logs/agent.log"

[collector]
enabled = true
bind_addr = "0.0.0.0"
listeners = [
    { port = 2055, protocol = "auto" },
    { port = 4739, protocol = "auto" },
]
template_cache_capacity = 10000
template_cache_ttl_secs = 3600
"@ | Set-Content -Path $configPath -Encoding UTF8

# ACL restrictiva: sin herencia, solo SYSTEM y Administradores.
$extent = icacls $configPath /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F" 2>&1
if ($LASTEXITCODE -ne 0) { throw "icacls config.toml falló: $extent" }
foreach ($dir in @($DataDir, (Join-Path $DataDir "config"), (Join-Path $DataDir "spool"), (Join-Path $DataDir "logs"))) {
    icacls $dir /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" | Out-Null
}

# --- 4. Token/DeviceId como entorno del SERVICIO (no plano en disco) ---
$envKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Environment"
if (-not (Test-Path $envKey)) { New-Item -Path $envKey -Force | Out-Null }
New-ItemProperty -Path $envKey -Name "SC_INGEST_TOKEN" -Value $IngestToken -PropertyType String -Force | Out-Null
New-ItemProperty -Path $envKey -Name "SC_SENTINEL_DEVICE_ID" -Value $DeviceId -PropertyType String -Force | Out-Null

# --- 5. Servicio (el binario ya implementa el ctrl del SCM) ---
# binPath= con espacio tras '=' (requisito de sc.exe) y comillas por cada ruta con espacios.
$binPathValue = "`"$InstallDir\sc-sentinel-agent.exe`" --config `"$configPath`""
sc.exe create $ServiceName binPath= $binPathValue start= auto DisplayName= "SC Sentinel Agent"
if ($LASTEXITCODE -ne 0) { throw "sc.exe create falló ($LASTEXITCODE)" }

# Recovery: restart 5 s, 10 s, 30 s; contador a cero cada 24 h (reboot del server).
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000
if ($LASTEXITCODE -ne 0) { throw "sc.exe failure falló ($LASTEXITCODE)" }

# El binario corre 2 procesos de publicación concurrentes: exige un solo daemon.
sc.exe failureflag $ServiceName 0 | Out-Null

sc.exe start $ServiceName
if ($LASTEXITCODE -ne 0) { throw "sc.exe start falló ($LASTEXITCODE)" }
Start-Sleep -Seconds 2
sc.exe query $ServiceName

Write-Host ""
Write-Host "Instalado y arrancado:"
Write-Host "  Binario : $InstallDir\sc-sentinel-agent.exe"
Write-Host "  Config  : $configPath"
Write-Host "  Spool   : $DataDir\spool\sc-spool.sqlite"
Write-Host "  Log     : $DataDir\logs\agent.log"
Write-Host "  Device  : $DeviceId"
Write-Host "Runbook   : docs/runbooks/install-agent-windows.md"
