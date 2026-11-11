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

# Elimina un directorio aunque su ACL sea hostil: las instalaciones previas del
# agente dejan ACLs sin herencia (binario RX, logs R para Administradores) que
# deniegan el borrado incluso a un admin elevado. takeown + grant F lo habilitan
# (en Windows en español /D Y es inválido; /D S es el respaldo).
function Remove-ProtectedDir {
 param([string]$Path)
 if (-not (Test-Path $Path)) { return $true }
 takeown /F $Path /R /D Y 2>&1 | Out-Null
 if ($LASTEXITCODE -ne 0) {
  takeown /F $Path /R /D S 2>&1 | Out-Null
 }
 icacls $Path /grant "*S-1-5-32-544:(OI)(CI)F" /T /C 2>&1 | Out-Null
 # Archivos con ACL hostil propia: /T no siempre los alcanza; F explícito por
 # archivo (sin flags de herencia, que solo aplican a directorios).
 Get-ChildItem $Path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
  icacls $_.FullName /grant "*S-1-5-32-544:F" 2>&1 | Out-Null
 }
 for ($i = 1; $i -le 3; $i++) {
  try {
   Remove-Item -Recurse -Force $Path -ErrorAction Stop
   if (-not (Test-Path $Path)) { return $true }
  } catch {
   Write-Host " ⚠ Intento $i de borrado de $Path falló: $($_.Exception.Message)" -ForegroundColor Yellow
   Start-Sleep -Seconds 2
  }
 }
 return (-not (Test-Path $Path))
}

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

# sc delete es asincrono: esperar a que el SCM cierre su handle (si no, el
# servicio queda en "marked for deletion" y bloquea reinstalaciones y el
# borrado del binario en uso). sc query = 1060 significa que ya no existe.
$waited = 0
while ($true) {
 sc.exe query $ServiceName *> $null
 if ($LASTEXITCODE -eq 1060) { break }
 if ($waited -ge 30) { break }
 Start-Sleep -Seconds 1
 $waited += 1
}
if ($waited -gt 0) {
 Write-Step "Handle del SCM liberado tras ${waited}s"
}

# Paso 3: Eliminar binario y directorio de instalación (con verificación)
Write-Step "Eliminando binario..."
$InstallDir = "C:\Program Files\SC-Sentinel"
if (Test-Path $InstallDir) {
 if (Remove-ProtectedDir $InstallDir) {
  Write-Step "Directorio de instalación eliminado"
 } else {
  Write-Host " ✗ No se pudo eliminar $InstallDir" -ForegroundColor Red
 }
} else {
 Write-Step "Directorio de instalación no encontrado" -Status "ℹ"
}

# Paso 4: Eliminar datos (opcional)
if ($PurgeData) {
 Write-Step "Eliminando datos (config, logs, spool)..."
 if (Remove-ProtectedDir $DataDir) {
  Write-Step "Datos eliminados: $DataDir"
 } else {
  Write-Host " ✗ No se pudo eliminar $DataDir" -ForegroundColor Red
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
