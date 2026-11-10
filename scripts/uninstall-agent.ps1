# Desinstala el servicio del agente SCNet (M5).
#
#   .\scripts\uninstall-agent.ps1 [-PurgeData]
#
# Sin -PurgeData conserva spool/logs/.host-key (una reinstalación no pierde
# datos). Con -PurgeData borra C:\ProgramData\SC-Sentinel completo.

param(
    [switch]$PurgeData,
    [string]$InstallDir = "C:\Program Files\SC-Sentinel",
    [string]$DataDir = "C:\ProgramData\SC-Sentinel",
    [string]$ServiceName = "SC-Sentinel-Agent"
)

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# Stop tolerante: el binario drena ventana+sync+spool antes de marcar Stopped
# (puede tardar ~15 s); se espera hasta 30 s antes del delete.
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    sc.exe stop $ServiceName | Out-Null
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc -or $svc.Status -eq "Stopped") { break }
        Start-Sleep -Seconds 1
    }
}
sc.exe delete $ServiceName | Out-Null

# El Environment con el token vive bajo la key del servicio: se limpia junto al resto.
Remove-Item -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" -Recurse -Force -ErrorAction SilentlyContinue

Remove-Item -Force (Join-Path $InstallDir "sc-sentinel-agent.exe") -ErrorAction SilentlyContinue
if ((Get-ChildItem $InstallDir -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
    Remove-Item $InstallDir -Force -ErrorAction SilentlyContinue
}

if ($PurgeData) {
    Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    Write-Host "Datos borrados ($DataDir): spool vacío, .host-key invalidada."
} else {
    Write-Host "Datos conservados en $DataDir (usa -PurgeData para borrarlos)."
}
Write-Host "Servicio $ServiceName desinstalado."
