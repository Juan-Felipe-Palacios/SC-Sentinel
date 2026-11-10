#Requires -RunAsAdministrator
<#
.SYNOPSIS
 Desinstalador del agente SC-Sentinel.
.DESCRIPTION
 Detiene y elimina el servicio SC-Sentinel-Agent.
 Opcionalmente elimina todos los datos (config, logs, spool).
.PARAMETER PurgeData
 Si se especifica, elimina C:\ProgramData\SC-Sentinel completo
.EXAMPLE
 .\uninstall-agent.ps1
 .\uninstall-agent.ps1 -PurgeData
#>

[CmdletBinding()]
param(
 [Parameter(Mandatory=$false, HelpMessage="Eliminar todos los datos")]
 [switch]$PurgeData
)

$ServiceName = "SC-Sentinel-Agent"
$DataDir = "C:\ProgramData\SC-Sentinel"

function Write-Step {
 param([string]$Message, [string]$Status = "✓")
 Write-Host "$Status $Message" -ForegroundColor $(if ($Status -eq "✗") { "Red" } else { "Green" })
}

# Verificar que se ejecuta como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
 [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
 Write-Host "✗ Este script debe ejecutarse como Administrador." -ForegroundColor Red
 exit 1
}

Write-Host "`n=== Desinstalador de SC-Sentinel Agent ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Detener servicio
Write-Step "Deteniendo servicio..."
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
 if ($service.Status -eq 'Running') {
 Stop-Service -Name $ServiceName -Force -ErrorAction Stop
 Write-Step "Servicio detenido"
 } else {
 Write-Step "Servicio ya estaba detenido ($($service.Status))" -Status "ℹ"
 }
} else {
 Write-Step "Servicio no encontrado" -Status "ℹ"
}

# Paso 2: Eliminar servicio
Write-Step "Eliminando servicio..."
sc.exe delete $ServiceName | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Host " ⚠ No se pudo eliminar el servicio (¿ya fue eliminado?)" -ForegroundColor Yellow
} else {
 Write-Step "Servicio eliminado del SCM"
}

# Paso 3: Eliminar binario y directorio de instalación
Write-Step "Eliminando binario..."
$InstallDir = "C:\Program Files\SC-Sentinel"
if (Test-Path $InstallDir) {
 Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
 Write-Step "Directorio de instalación eliminado"
} else {
 Write-Step "Directorio de instalación no encontrado" -Status "ℹ"
}

# Paso 4: Eliminar datos (opcional)
if ($PurgeData) {
 Write-Step "Eliminando datos (config, logs, spool)..."
 if (Test-Path $DataDir) {
 Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
 Write-Step "Datos eliminados: $DataDir"
 } else {
 Write-Step "Directorio de datos no encontrado" -Status "ℹ"
 }
} else {
 Write-Step "Datos conservados en $DataDir (usa -PurgeData para eliminar)" -Status "ℹ"
}

# Resumen
Write-Host "`n=== Desinstalación completada ===" -ForegroundColor Green
if (-not $PurgeData) {
 Write-Host "Los datos permanecen en: $DataDir" -ForegroundColor Yellow
 Write-Host "Para eliminarlos completamente:" -ForegroundColor Gray
 Write-Host " .\uninstall-agent.ps1 -PurgeData" -ForegroundColor Gray
}
Write-Host ""
