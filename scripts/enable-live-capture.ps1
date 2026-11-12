# Habilita la captura live en el servicio SC-Sentinel-Agent.
#
# El agente decide la captura por CLI (no hay sección [capture] en config.toml):
# el instalador arrancó el servicio con `--no-capture` (modo collector-only).
# Este script reescribe ImagePath sin ese flag y con `--interface` explícita,
# reinicia el servicio y verifica /status.
#
# Requiere consola elevada.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\enable-live-capture.ps1
#   ... -Interface "\Device\NPF_{5ED97C9D-...}"   # por defecto, la del config guardado

param(
    [string]$Service = "SC-Sentinel-Agent",
    [string]$Exe = "C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe",
    [string]$Config = "C:\ProgramData\SC-Sentinel\config\config.toml",
    [string]$Interface = "\Device\NPF_{5ED97C9D-575C-401F-A3C9-1397C3BD738A}",
    [string]$StatusUrl = "http://127.0.0.1:8387/status"
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ejecuta este script en una consola elevada (Administrador)."
}

$key = "HKLM:\SYSTEM\CurrentControlSet\Services\$Service"
$current = (Get-ItemProperty -Path $key -Name ImagePath).ImagePath
Write-Host "ImagePath actual : $current"

# Conserva --config del valor actual si existe; si no, usa el de por defecto.
$configArg = $Config
if ($current -match '--config\s+"([^"]+)"') { $configArg = $Matches[1] }

$newPath = '"' + $Exe + '" --config "' + $configArg + '" --interface "' + $Interface + '"'
Write-Host "ImagePath nuevo  : $newPath"
Set-ItemProperty -Path $key -Name ImagePath -Value $newPath
# Reinicia para que el SCM relance con la línea nueva.
sc.exe stop $Service | Out-Null
try { (Get-Service -Name $Service).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20)) } catch { throw "no llegó a Stopped: $($_.Exception.Message)" }
sc.exe start $Service | Out-Null
try { (Get-Service -Name $Service).WaitForStatus('Running', [TimeSpan]::FromSeconds(20)) } catch { throw "no volvió a Running: $($_.Exception.Message)" }

Start-Sleep -Seconds 8
$first = Invoke-RestMethod -Uri $StatusUrl -TimeoutSec 5
Start-Sleep -Seconds 6
$second = Invoke-RestMethod -Uri $StatusUrl -TimeoutSec 5

Write-Host "capture_status    : $($first.capture_status)"
Write-Host "packets_seen      : $($first.packets_seen) -> $($second.packets_seen)"
Write-Host "collector_packets : $($second.collector_packets_received)"
Write-Host "service_state     : $($second.service_state)"
