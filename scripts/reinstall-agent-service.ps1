# Reinstala el binario del agente en el servicio SC-Sentinel-Agent.
# Requiere consola elevada (Administrador). El binario instalado se respalda con
# marca de tiempo antes de sobrescribirlo, así un rollback es un Copy-Item.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reinstall-agent-service.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reinstall-agent-service.ps1 -Source ruta\al\exe

param(
    [string]$Source = "D:\ProyectosWeb\SC-Sentinel\agent\target\release\sc-sentinel-agent.exe",
    [string]$Target = "C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe",
    [string]$Service = "SC-Sentinel-Agent"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Source)) { throw "No existe el binario de origen: $Source" }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ejecuta este script en una consola elevada (Administrador)."
}

$sourceHash = (Get-FileHash $Source -Algorithm SHA256).Hash
Write-Host "origen : $Source"
Write-Host "sha256 : $sourceHash"

sc.exe stop $Service | Out-Null
try {
    # Get-Service es independiente del idioma de `sc.exe` (aquí sale "ESTADO").
    (Get-Service -Name $Service).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
} catch {
    throw "El servicio no llegó a Stopped en 20 s: $($_.Exception.Message)"
}

$backup = "$Target.bak-" + (Get-Date -Format "yyyyMMddHHmmss")
if (Test-Path $Target) { Copy-Item $Target $backup; Write-Host "backup : $backup" }

Copy-Item $Source $Target -Force
$installedHash = (Get-FileHash $Target -Algorithm SHA256).Hash
Write-Host "instalado sha256 : $installedHash"
if ($installedHash -ne $sourceHash) { throw "El hash instalado no coincide con el origen." }

sc.exe start $Service | Out-Null
try {
    (Get-Service -Name $Service).WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
} catch {
    throw "El servicio no volvió a Running en 20 s: $($_.Exception.Message)"
}
Start-Sleep -Seconds 2
Write-Host "estado           : $((Get-Service -Name $Service).Status)"
