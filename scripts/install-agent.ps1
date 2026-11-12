#Requires -RunAsAdministrator
<#
.SYNOPSIS
 Instalador del agente SC-Sentinel como servicio Windows nativo.
.DESCRIPTION
 Instala sc-agent.exe como servicio de Windows con:
 - Binario en C:\Program Files\SC-Sentinel\
 - Configuración en C:\ProgramData\SC-Sentinel\config.toml
 - Token seguro en Registry (Environment del servicio)
 - Permisos restrictivos (SYSTEM + Administradores, sin herencia)
 - Recovery automático (5s/10s/30s, reset diario)
 - Log en C:\ProgramData\SC-Sentinel\logs\agent.log
.PARAMETER DeviceId
 Identificador único del dispositivo (ej: dev_abc123)
.PARAMETER IngestToken
 Token de ingestión del dispositivo
.PARAMETER ConfigPath
 Ruta al archivo config.toml de origen (opcional, usa defaults si no se especifica)
.PARAMETER PurgeData
 Si se especifica, elimina datos existentes antes de instalar
.EXAMPLE
 .\install-agent.ps1 -DeviceId "dev_abc123" -IngestToken "sc_dev_xyz789"
#>

[CmdletBinding()]
param(
 [Parameter(Mandatory=$true, HelpMessage="Device ID del agente")]
 [string]$DeviceId,
 
 [Parameter(Mandatory=$true, HelpMessage="Token de ingestión")]
 [string]$IngestToken,
 
 [Parameter(Mandatory=$false, HelpMessage="Ruta al config.toml de origen")]
 [string]$ConfigPath,
 
 [Parameter(Mandatory=$false, HelpMessage="Ruta al binario de origen (sc-sentinel-agent.exe)")]
 [string]$BinaryPath,

 [Parameter(Mandatory=$false, HelpMessage="Puertos UDP del colector (default 2055,4739)")]
 [int[]]$CollectorPorts = @(2055, 4739),

 [Parameter(Mandatory=$false, HelpMessage="Eliminar datos existentes")]
 [switch]$PurgeData
)

# Configuración
$ServiceName = "SC-Sentinel-Agent"
$DisplayName = "SC Sentinel Network Agent"
$Description = "Agente de monitoreo de red SC-Sentinel - Captura y envía flujos de red al servidor central"
$InstallDir = "C:\Program Files\SC-Sentinel"
$DataDir = "C:\ProgramData\SC-Sentinel"
$ConfigDir = "$DataDir\config"
$LogDir = "$DataDir\logs"
$SpoolDir = "$DataDir\spool"

# Otorga permisos de escritura total a Administradores en un directorio
# preexistente. Las instalaciones previas dejan ACLs sin herencia (binario RX,
# logs R) que deniegan hasta un Copy-Item/Remove-Item a un admin elevado.
function Grant-DirWrite {
 param([string]$Path)
 if (-not (Test-Path $Path)) { return }
 icacls $Path /grant "*S-1-5-32-544:(OI)(CI)F" /T /C 2>&1 | Out-Null
}

# SIDs universales (independientes del idioma de Windows)
$SystemSid = "S-1-5-18"
$AdminsSid = "S-1-5-32-544"

# Una instalacion previa deja los ficheros con ACLs explicitos (sin herencia),
# por ejemplo el binario con SYSTEM:(F) + Administradores:(RX). Con esa ACL un
# administrador NO puede sobrescribir el fichero: Copy-Item falla con "Acceso
# denegado" y el servicio se queda sirviendo la version antigua.
# Esta rutina devuelve el control del fichero y comprueba que de verdad se
# puede escribir en el.
# Se usan SIDs con prefijo * y /setowner en lugar de takeown: takeown /D cambia
# entre idiomas ("Y" en ingles, "S" en espanol) y rompe el script en un Windows
# no ingles.
function Ensure-FileWritable {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $true }
  icacls $Path /setowner "*${AdminsSid}" 2>&1 | Out-Null
  icacls $Path /inheritance:e /grant "*${SystemSid}:(F)" /grant "*${AdminsSid}:(F)" 2>&1 | Out-Null
  try {
    $fs = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::ReadWrite
    )
    $fs.Close()
    return $true
  } catch {
    return $false
  }
}

function Write-Step {
 param([string]$Message, [string]$Status = "✓")
 Write-Host "$Status $Message" -ForegroundColor $(if ($Status -eq "✗") { "Red" } else { "Green" })
}

function Write-Error-Exit {
 param([string]$Message)
 Write-Host "✗ $Message" -ForegroundColor Red
 exit 1
}

# Verificar que se ejecuta como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
 [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
 Write-Error-Exit "Este script debe ejecutarse como Administrador. Clic derecho → Ejecutar como administrador."
}

Write-Host "`n=== Instalador de SC-Sentinel Agent ===" -ForegroundColor Cyan
Write-Host "Servicio: $ServiceName" -ForegroundColor Gray
Write-Host "Device ID: $DeviceId" -ForegroundColor Gray
Write-Host ""

# Paso 1: Verificar servicio previo y binario
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
 Write-Step "Servicio previo detectado: eliminándolo para reinstalar limpio..."
 Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
 sc.exe delete $ServiceName | Out-Null
 Start-Sleep -Seconds 2
}
# Restos de instalaciones previas con ACLs hostiles (RX/R sin herencia):
# otorgar escritura antes de tocar cualquier archivo.
foreach ($d in @($InstallDir, $DataDir)) { Grant-DirWrite $d }
Write-Step "Verificando binario..."
$BinSource = if ($BinaryPath) { $BinaryPath } else { Join-Path $PSScriptRoot "..\agent\target\release\sc-sentinel-agent.exe" }
if (-not (Test-Path $BinSource)) {
 Write-Error-Exit "Binario no encontrado: $BinSource`nEjecuta: cargo build --release -p sc-agent"
}

# Paso 2: Purge si se solicita
if ($PurgeData -and (Test-Path $DataDir)) {
 Write-Step "Eliminando datos existentes..."
 try {
  Remove-Item -Recurse -Force $DataDir -ErrorAction Stop
 } catch {
  Write-Host " ⚠ No se pudieron purgar los datos previos: $($_.Exception.Message)" -ForegroundColor Yellow
 }
}

# Paso 3: Crear directorios
Write-Step "Creando directorios..."
foreach ($dir in @($InstallDir, $ConfigDir, $LogDir, $SpoolDir)) {
 if (-not (Test-Path $dir)) {
 New-Item -ItemType Directory -Path $dir -Force | Out-Null
 }
}

# Paso 4: Copiar binario
Write-Step "Copiando binario a $InstallDir..."
$BinPath = "$InstallDir\sc-sentinel-agent.exe"
# Reutilizacion: el binario de la instalacion anterior puede tener ACLs
# explicitos que impiden sobrescribirlo. Recuperar el control y borrarlo antes
# de copiar garantiza que el servicio arranca con la version nueva.
if (Test-Path $BinPath) {
  if (-not (Ensure-FileWritable $BinPath)) {
    Write-Error-Exit "No se puede reemplazar el binario instalado ($BinPath).`nDesinstalalo antes: scripts\uninstall-agent.ps1"
  }
  Remove-Item $BinPath -Force -ErrorAction SilentlyContinue
}
Copy-Item $BinSource $BinPath -Force
if (-not (Test-Path $BinPath)) {
  Write-Error-Exit "No se pudo copiar el binario a $BinPath"
}
# Verificar que lo copiado es identico al origen: si la copia falla en
# silencio el servicio se quedaria con la version antigua.
$srcHash = (Get-FileHash $BinSource -Algorithm SHA256).Hash
$dstHash = (Get-FileHash $BinPath -Algorithm SHA256).Hash
if ($srcHash -ne $dstHash) {
  Write-Error-Exit "El binario copiado no coincide con el de origen`n  origen: $srcHash`n  copiado: $dstHash"
}
Write-Step "Binario verificado (SHA256 $srcHash)"
# Residuo de instalaciones antiguas que usaban otro nombre de binario
Remove-Item "$InstallDir\sc-agent.exe" -Force -ErrorAction SilentlyContinue

# Paso 5: Generar config.toml
Write-Step "Generando configuración..."
$ConfigFile = "$ConfigDir\config.toml"
# Solo claves que sc-config acepta (deny_unknown_fields); el device_id NO va
# en el archivo: se pasa por SC_SENTINEL_DEVICE_ID en el Environment.
$listenerLines = ($CollectorPorts | ForEach-Object { "    { port = $_, protocol = ""auto"" }" }) -join ",`n"
$configContent = @"
# SC-Sentinel Agent Configuration
# Generado automáticamente por install-agent.ps1
# Claves válidas para sc-config (deny_unknown_fields); el device_id se inyecta
# vía la variable de entorno SC_SENTINEL_DEVICE_ID en el Environment del servicio.

[ingest]
url = "https://sc-sentinel.vercel.app/api/ingest"
token_env = "SC_INGEST_TOKEN"
compression = "gzip"

[privacy]
anonymize_hosts = false
hmac_key_env = "SC_HMAC_KEY"
hmac_key_file = "$($ConfigDir.Replace('\', '/'))/.host-key"

[spool]
path = "$($SpoolDir.Replace('\', '/'))/sc-spool.sqlite"
max_bytes = 524288000
max_age_days = 7

[log]
level = "info"
file = "$($LogDir.Replace('\', '/'))/agent.log"

[collector]
enabled = true
bind_addr = "0.0.0.0"
listeners = [
$listenerLines,
]
template_cache_capacity = 10000
template_cache_ttl_secs = 3600
"@

# Sin BOM: el crate `toml` lo tolera, pero un config sin BOM es lo portable
# (PS 5.1 escribe UTF-8 con BOM en -Encoding UTF8).
Ensure-FileWritable $ConfigFile | Out-Null
[System.IO.File]::WriteAllText($ConfigFile, "$configContent`r`n", [System.Text.UTF8Encoding]::new($false))

# Paso 6: Aplicar permisos restrictivos usando SIDs con prefijo *
Write-Step "Aplicando permisos de seguridad..."

# Config.toml: solo SYSTEM y Administradores pueden leer/escribir
icacls $ConfigFile /inheritance:r /grant "*${SystemSid}:(R)" /grant "*${AdminsSid}:(R,W)" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls config.toml falló"
}

# Directorio de logs: SYSTEM escribe, Administradores también (F) para poder
# diagnosticar y rotar el agent.log (con solo lectura, abrirlo en modo
# escritura para diagnóstico falla con "Acceso denegado").
icacls $LogDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)(F)" /grant "*${AdminsSid}:(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls logs falló"
}

# Directorio de spool: SYSTEM escribe; Administradores leen (diagnóstico)
icacls $SpoolDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)(F)" /grant "*${AdminsSid}:(OI)(CI)(RX)" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls spool falló"
}

# Binario: Administradores pueden ejecutar, SYSTEM tiene control total
icacls $BinPath /inheritance:r /grant "*${SystemSid}:(F)" /grant "*${AdminsSid}:(RX)" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls binario falló"
}
# Paso 7: Guardar token y device_id en Registry (nunca en config.toml)
Write-Step "Registrando variables de entorno en Registry..."
$ServiceRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"

# Environment del servicio (REG_MULTI_SZ): token + device id, fuera del archivo de config
$envValue = @("SC_INGEST_TOKEN=$IngestToken", "SC_SENTINEL_DEVICE_ID=$DeviceId")

# Paso 8: Crear servicio
Write-Step "Creando servicio Windows..."
# El servicio arranca en modo collector-only (`--no-capture`): la fuente
# de datos del daemon es el colector UDP (fuente exclusiva, ver
# docs/testing/pcap-vs-flow.md). Sin este flag el agente exigiría una
# interfaz de captura y abortaría con código 2.
$binPathQuoted = "`"$BinPath`" --config `"$ConfigFile`" --no-capture"

# Esperar a que un servicio previo (incluido "marked for delete") desaparezca
# por completo del SCM; si no, la creacion falla con ERROR_SERVICE_MARKED_FOR_DELETE 1072.
# sc query es el indicador fiable: 1060 = ya no existe.
$waited = 0
while ($true) {
 sc.exe query $ServiceName *> $null
 if ($LASTEXITCODE -eq 1060) { break }
 if ($waited -ge 30) { break }
 Start-Sleep -Seconds 2
 $waited += 2
}
if ($waited -gt 0) {
 Write-Step "Servicio previo liberado del SCM tras ${waited}s"
}

# New-Service escribe el binPath via API de servicio; Windows PowerShell 5.1
# arruina las comillas internas del binPath al pasarselas a un exe nativo
# (sc.exe create), lo que aborta la creacion con ERROR_INVALID_PARAMETER.
$created = $false
$lastErr = ""
for ($attempt = 1; $attempt -le 3 -and -not $created; $attempt++) {
 try {
  New-Service -Name $ServiceName -BinaryPathName $binPathQuoted -DisplayName $DisplayName `
   -Description $Description -StartupType Automatic | Out-Null
  $created = $true
 } catch {
  $lastErr = $_.Exception.Message
  Write-Host " Intento $attempt - New-Service fallo: $lastErr" -ForegroundColor Yellow
  if ($attempt -lt 3) { Start-Sleep -Seconds 5 }
 }
}
if (-not $created) {
 # Ultimo recurso: sc create con la salida visible (no silenciada)
 Write-Host " Reintentando con sc create..." -ForegroundColor Yellow
 $scOut = sc.exe create $ServiceName binPath= $binPathQuoted start= auto DisplayName= "$DisplayName" 2>&1
 if ($LASTEXITCODE -eq 0) {
  $created = $true
 } else {
  Write-Host ($scOut -join [Environment]::NewLine) -ForegroundColor Red
 }
}
if (-not $created) {
 Write-Error-Exit "No se pudo crear el servicio '$ServiceName' (ultimo error: $lastErr). Usa uninstall primero si persiste."
}

# Paso 9: Configurar token en Environment del servicio
Write-Step "Configurando variables de entorno del servicio..."

# Agregar Environment al Registry manualmente (sc config no soporta Environment directamente)
New-ItemProperty -Path $ServiceRegPath -Name "Environment" -Value $envValue -PropertyType MultiString -Force | Out-Null

# Paso 10: Configurar recovery (failure actions)
Write-Step "Configurando recovery automático..."
# restart after 5s, 10s, 30s; reset counter after 86400s (1 day)
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Host " ⚠ Advertencia: no se pudieron configurar failure actions" -ForegroundColor Yellow
}

# Paso 11: Iniciar servicio
Write-Step "Iniciando servicio..."
Start-Service -Name $ServiceName -ErrorAction Stop

# Verificar que está corriendo
Start-Sleep -Seconds 2
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq 'Running') {
 Write-Step "Servicio iniciado correctamente"
} else {
 Write-Host " ⚠ Servicio creado pero no pudo iniciarse. Revisa el log:" -ForegroundColor Yellow
 Write-Host " $LogDir\agent.log" -ForegroundColor Gray
}

# Resumen final
Write-Host "`n=== Instalación completada ===" -ForegroundColor Green
Write-Host "Servicio: $ServiceName" -ForegroundColor Gray
Write-Host "Binario: $BinPath" -ForegroundColor Gray
Write-Host "Config: $ConfigFile" -ForegroundColor Gray
Write-Host "Log: $LogDir\agent.log" -ForegroundColor Gray
Write-Host "Spool: $SpoolDir" -ForegroundColor Gray
Write-Host ""
Write-Host "Comandos útiles:" -ForegroundColor Cyan
Write-Host " sc query $ServiceName # Ver estado" -ForegroundColor Gray
Write-Host " sc qfailure $ServiceName # Ver recovery" -ForegroundColor Gray
Write-Host " sc stop $ServiceName # Detener (drain ≤30s)" -ForegroundColor Gray
Write-Host " Get-Content $LogDir\agent.log -Tail 20 # Ver log" -ForegroundColor Gray
Write-Host ""
