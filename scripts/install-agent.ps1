#Requires -RunAsAdministrator
<#
.SYNOPSIS
 Instalador del agente SC-Sentinel como servicio Windows nativo.
.DESCRIPTION
 Instala sc-agent.exe como servicio de Windows con:
 - Binario en C:\Program Files\SC-Sentinel\
 - Configuración en C:\ProgramData\SC-Sentinel\config.toml
 - Base GeoLite2 en C:\Program Files\SC-Sentinel\geolite2\ (geolocalización)
 - Token seguro en Registry (Environment del servicio)
 - Permisos restrictivos (SYSTEM + Administradores, sin herencia)
 - Recovery automático (5s/10s/30s, reset diario)
 - Log en C:\ProgramData\SC-Sentinel\logs\agent.log
.PARAMETER DeviceId
 Identificador único del dispositivo (ej: dev_abc123)
.PARAMETER ConfigPath
 Ruta al archivo config.toml de origen (opcional, usa defaults si no se especifica)
.PARAMETER PurgeData
 Si se especifica, elimina datos existentes antes de instalar
.EXAMPLE
 $env:SCS_INSTALL_TOKEN = "sc_dev_xyz789"
 .\install-agent.ps1 -DeviceId "dev_abc123"
#>

[CmdletBinding()]
param(
 [Parameter(Mandatory=$false, HelpMessage="Device ID del agente")]
 [string]$DeviceId,
 
 [Parameter(Mandatory=$false, HelpMessage="Ruta al config.toml de origen")]
 [string]$ConfigPath,
 
 [Parameter(Mandatory=$false, HelpMessage="Ruta al binario de origen (sc-sentinel-agent.exe)")]
 [string]$BinaryPath,

 [Parameter(Mandatory=$false, HelpMessage="Ruta a la base GeoLite2-Country.mmdb (opcional, se autodetecta)")]
 [string]$GeoIpDbPath,

 [Parameter(Mandatory=$false, HelpMessage="Puertos UDP del colector (default 2055,4739)")]
 [int[]]$CollectorPorts = @(2055, 4739),

 [Parameter(Mandatory=$false, HelpMessage="Interfaz de captura local (descripcion NDIS del adaptador o nombre de dispositivo pcap). Si se indica, el servicio arranca con captura local en vez del modo collector-only --no-capture.")]
 [string]$CaptureInterface,

 [Parameter(Mandatory=$false, HelpMessage="Archivo con el token de ingestion (se borra al leerlo). Evita pasar el secreto por la linea de comandos.")]
 [string]$IngestTokenFile,

 [Parameter(Mandatory=$false, HelpMessage="Actualizar sobre un servicio ya instalado: conserva config.toml, el token del servicio y el spool; no recrea el servicio ni pide credenciales")]
 [switch]$UpdateMode,

 [Parameter(Mandatory=$false, HelpMessage="Carpeta donde se instalan los binarios (default: C:\Program Files\SC-Sentinel)")]
 [ValidateNotNullOrEmpty()]
 [string]$InstallDir = "C:\Program Files\SC-Sentinel",

 [Parameter(Mandatory=$false, HelpMessage="Eliminar datos existentes")]
 [switch]$PurgeData,

 [Parameter(Mandatory=$false, HelpMessage="Solo desarrollo: permite -UpdateMode desde una copia que no esta en <InstallDir>\\installer")]
 [switch]$AllowLocalScripts
)

# Configuración
$ServiceName = "SC-Sentinel-Agent"
$DisplayName = "SC Sentinel Network Agent"
$Description = "Agente de monitoreo de red SC-Sentinel - Captura y envía flujos de red al servidor central"
$DataDir = "C:\ProgramData\SC-Sentinel"
$ConfigDir = "$DataDir\config"
$LogDir = "$DataDir\logs"
$SpoolDir = "$DataDir\spool"
$GeoIpDir = "$InstallDir\geolite2"

# El instalador corre powershell.exe 5.1 heredando el PSModulePath de quien
# lanzo el setup (en CI, pwsh 7). Con las rutas de PowerShell 7 delante, 5.1 no
# carga sus propios modulos y Get-Acl/Get-FileHash fallan (runs 45258353232 y
# 45271863346). Se deja solo la ruta legacy de Windows PowerShell.
function Reset-ScsPsModulePath {
 $rutas = @((Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules'))
 if ($env:ProgramFiles) { $rutas += (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules') }
 if (${env:ProgramFiles(x86)}) { $rutas += (Join-Path ${env:ProgramFiles(x86)} 'WindowsPowerShell\Modules') }
 if ($env:USERPROFILE) { $rutas += (Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\Modules') }
 $rutas = @($rutas | Where-Object { Test-Path -LiteralPath $_ })
 $env:PSModulePath = ($rutas -join ';')
}
Reset-ScsPsModulePath

# Reglas de config.toml y respaldo verificado de datos: modulo compartido con
# las pruebas (scripts/lib/config-toml.psm1). Viaja dentro del paquete.
Import-Module (Join-Path $PSScriptRoot 'lib\config-toml.psm1') -Force

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

# Lectura/escritura del registro en la vista de 64 bits. El instalador .exe es
# un proceso de 32 bits y lanza powershell.exe redirigido a SysWOW64: escribir
# HKLM:\Software desde ahi caeria en WOW6432Node y el desinstalador (que lee la
# vista de 64) no encontraria la ruta de datos.
function Set-Registry64Value {
 param([string]$SubKey, [string]$Name, [string]$Value)
 $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
 try {
  $key = $base.CreateSubKey($SubKey)
  if (-not $key) { throw "no se pudo abrir HKLM\$SubKey" }
  try { $key.SetValue($Name, $Value, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Close() }
 } finally { $base.Close() }
}

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

# Traza persistente: el instalador corre en modo silencioso (/S) desde NSIS y
# su stdout no llega a nadie. Sin este archivo, un corte en la maquina del
# usuario (o en CI) no deja mas rastro que el codigo de salida.
function Write-InstallLog {
 param([string]$Level, [string]$Message)
 try {
  $logDir = Join-Path $env:ProgramData 'SC-Sentinel\logs'
  if (-not (Test-Path -LiteralPath $logDir)) {
   New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "[{0}] {1} {2}" -f (Get-Date).ToUniversalTime().ToString('o'), $Level, $Message
  Add-Content -LiteralPath (Join-Path $logDir 'install-agent.log') -Value $line -Encoding UTF8
 } catch {
  # La traza nunca puede ser la causa de un fallo de instalacion.
 }
}

# Hash SHA256 sin depender del cmdlet Get-FileHash: en el proceso que lanza
# NSIS (powershell.exe 5.1 heredando el entorno del instalador) el cmdlet
# devolvia vacio en el runner de CI, y un hash vacio no puede compararse con
# SHA256SUMS.txt ni con el origen (run 45256702515: "SHA256 " y falso
# desajuste de la GUI). Se abre con FileShare.ReadWrite para no chocar con el
# escaner de archivos ni con otro lector.
function Get-Sha256Hex {
 param([string]$Path)
 $sha = [System.Security.Cryptography.SHA256]::Create()
 try {
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
   $bytes = $sha.ComputeHash($fs)
   return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
  } finally {
   $fs.Dispose()
  }
 } catch {
  Write-InstallLog 'HASH' "no se pudo leer $Path : $($_.Exception.Message)"
  throw
 } finally {
  $sha.Dispose()
 }
}

function Write-Step {
 param([string]$Message, [string]$Status = "✓")
 Write-Host "$Status $Message" -ForegroundColor $(if ($Status -eq "✗") { "Red" } else { "Green" })
 Write-InstallLog 'STEP' "$Status $Message"
}

function Write-Error-Exit {
 param([string]$Message, [int]$Code = 1)
 Write-Host "✗ $Message" -ForegroundColor Red
 Write-InstallLog 'ERROR' "code=$Code $Message"
 exit $Code
}

# Hash esperado de un fichero del paquete segun su SHA256SUMS.txt ('' si no
# hay manifiesto o no lista ese fichero). El manifiesto usa rutas con '/' y dos
# espacios como separador (formato sha256sum).
function Get-PackageManifestHash {
 param([string]$PackageDir, [string]$RelativePath)
 $sums = Join-Path $PackageDir 'SHA256SUMS.txt'
 if (-not (Test-Path -LiteralPath $sums)) { return '' }
 $wanted = $RelativePath.Replace('/', '\')
 foreach ($line in (Get-Content -LiteralPath $sums)) {
  if ($line -match '^([0-9a-fA-F]{64})\s+(.+)$') {
   $relative = $Matches[2].Trim().Replace('/', '\')
   if ($relative -ieq $wanted) { return $Matches[1].ToLowerInvariant() }
  }
 }
 return ''
}

# GUI y lanzador: la GUI la ejecuta el usuario interactivo, no el servicio, asi
# que se copia sin ACL explicita para que herede el "Usuarios: lectura y
# ejecucion" de Program Files (con la ACL del binario del agente solo la podria
# abrir un administrador). Corte duro por SHA y FileVersion (B-002): si algo no
# cuadra se restaura el .bak y se aborta con codigo 4; nunca una GUI vieja en
# silencio. En la actualizacion el .bak se verifica y deja su .sha256.
function Install-GuiAndLauncher {
 param([string]$Dir, [string]$PackageDir)

 $guiSource = Join-Path $PackageDir 'sc-gui.exe'
 $guiLauncherSource = Join-Path $PackageDir 'abrir-gui.bat'
 if (Test-Path $guiSource) {
  $guiPath = "$Dir\sc-gui.exe"
  $guiBak = "$guiPath.bak"
  $guiSrcHash = Get-Sha256Hex -Path $guiSource
  # El paquete trae SHA256SUMS.txt (lo valida build-installer.ps1 al compilar):
  # la GUI copiada se compara tambien con el manifiesto, no solo con el origen.
  $guiManifestHash = Get-PackageManifestHash -PackageDir $PackageDir -RelativePath 'sc-gui.exe'
  if ($guiManifestHash -and $guiSrcHash -ne $guiManifestHash) {
   Write-Error-Exit "El sc-gui.exe del paquete no coincide con SHA256SUMS.txt (paquete $guiSrcHash, manifiesto $guiManifestHash)." -Code 4
  }
  if (Test-Path $guiPath) {
   if (-not (Ensure-FileWritable $guiPath)) {
    Write-Error-Exit "No se puede reemplazar la GUI instalada ($guiPath)." -Code 4
   }
   # Respaldo verificado antes de reemplazar: si el .bak no coincide con la GUI
   # instalada se aborta con 4 (la version anterior debe poder restaurarse).
   $guiPrevHash = Get-Sha256Hex -Path $guiPath
   Copy-Item $guiPath $guiBak -Force -ErrorAction SilentlyContinue
   $guiBakHash = if (Test-Path $guiBak) { Get-Sha256Hex -Path $guiBak } else { '' }
   if ($guiBakHash -ne $guiPrevHash) {
    Write-Error-Exit "No se pudo respaldar la GUI instalada ($guiPath): el .bak no coincide con el original." -Code 4
   }
   [System.IO.File]::WriteAllText("$guiBak.sha256", "$guiBakHash`r`n", [System.Text.UTF8Encoding]::new($false))
   Write-Step "GUI anterior respaldada en $guiBak (+ .sha256)"
   Remove-Item $guiPath -Force -ErrorAction SilentlyContinue
  }
  Copy-Item $guiSource $guiPath -Force
  $guiDstHash = if (Test-Path $guiPath) { Get-Sha256Hex -Path $guiPath } else { '' }
  $guiVersion = if (Test-Path $guiPath) { (Get-Item $guiPath).VersionInfo.FileVersion } else { '' }
  if ($guiDstHash -ne $guiSrcHash -or ($guiManifestHash -and $guiDstHash -ne $guiManifestHash) -or -not $guiVersion) {
   if (Test-Path $guiBak) { Copy-Item $guiBak $guiPath -Force -ErrorAction SilentlyContinue }
   Write-Error-Exit "La GUI copiada no coincide con la del paquete o no declara version; se restauro la anterior (rollback).`n  origen: $guiSrcHash`n  copiado: $guiDstHash`n  FileVersion: '$guiVersion'" -Code 4
  }
  $manifestNote = if ($guiManifestHash) { 'el manifiesto SHA256SUMS.txt' } else { 'el origen del paquete (sin SHA256SUMS.txt)' }
  Write-Step "GUI reemplazada y verificada contra $manifestNote (SHA256 $guiSrcHash - FileVersion $guiVersion)"
 } else {
  Write-Host " ℹ El paquete no trae sc-gui.exe: se instala solo el servicio." -ForegroundColor Yellow
 }
 if (Test-Path $guiLauncherSource) {
  Copy-Item $guiLauncherSource "$Dir\abrir-gui.bat" -Force
  Write-Step 'Lanzador de la GUI instalado (abrir-gui.bat)'
 }
}

# Bases GeoLite2 (pais y ASN). El agente las resuelve en runtime con SC_GEOIP_DB
# y SC_GEOIP_ASN_DB, o en <dir del binario>/geolite2/. Devuelve la ruta del mmdb
# ASN instalado (o $null) para el Environment del servicio.
function Install-GeoDatabases {
 param([string]$GeoDir, [string]$PackageDir, [string]$ExplicitDb)

 $countryName = "GeoLite2-Country.mmdb"
 $candidates = @(
  $ExplicitDb,
  (Join-Path $PackageDir "geolite2\$countryName"),
  (Join-Path $PackageDir "..\agent\resources\geolite2\$countryName"),
  (Join-Path $PackageDir "..\..\agent\resources\geolite2\$countryName")
 ) | Where-Object { $_ -and (Test-Path $_) }
 $installed = "$GeoDir\$countryName"
 if ($candidates.Count -gt 0) {
  $source = @($candidates)[0]
  Copy-Item $source $installed -Force
  $srcHash = Get-Sha256Hex -Path $source
  $dstHash = Get-Sha256Hex -Path $installed
  if ($srcHash -ne $dstHash) {
   Write-Error-Exit "La base GeoLite2 copiada no coincide con la de origen`n  origen: $srcHash`n  copiado: $dstHash"
  }
  Write-Step "Base GeoLite2 instalada (SHA256 $srcHash)"
 } else {
  Write-Host " ⚠ No se encontró ${countryName}: el agente funcionará sin geolocalización (países vacíos)." -ForegroundColor Yellow
  Write-Host "   Descárgala de https://dev.maxmind.com/geoip/geolite2-free-geolocation-data" -ForegroundColor Yellow
 }

 $asnName = "GeoLite2-ASN.mmdb"
 $asnCandidates = @(
  (Join-Path $PackageDir "geolite2\$asnName"),
  (Join-Path $PackageDir "..\agent\resources\geolite2\$asnName"),
  (Join-Path $PackageDir "..\..\agent\resources\geolite2\$asnName")
 ) | Where-Object { $_ -and (Test-Path $_) }
 $asnInstalled = $null
 if ($asnCandidates.Count -gt 0) {
  $asnSource = @($asnCandidates)[0]
  $asnInstalled = "$GeoDir\$asnName"
  Copy-Item $asnSource $asnInstalled -Force
  $asnSrcHash = Get-Sha256Hex -Path $asnSource
  $asnDstHash = Get-Sha256Hex -Path $asnInstalled
  if ($asnSrcHash -ne $asnDstHash) {
   Write-Error-Exit "La base GeoLite2 ASN copiada no coincide con la de origen`n  origen: $asnSrcHash`n  copiado: $asnDstHash"
  }
  Write-Step "Base GeoLite2 ASN instalada (SHA256 $asnSrcHash)"
 } else {
  Write-Host "  No se encontro GeoLite2-ASN.mmdb: el agente funcionara sin ASN." -ForegroundColor Yellow
 }
 return $asnInstalled
}

# Verificar que se ejecuta como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
 [Security.Principal.WindowsBuiltInRole]::Administrator
)
Write-InstallLog 'ENV' ("ps={0} admin={1} getFileHash={2} modulePath={3}" -f `
  $PSVersionTable.PSVersion, $isAdmin, [bool](Get-Command Get-FileHash -ErrorAction SilentlyContinue), $env:PSModulePath)
if (-not $isAdmin) {
 Write-Error-Exit "Este script debe ejecutarse como Administrador. Clic derecho → Ejecutar como administrador."
}

# El token llega por un archivo temporal con ACL restringida (instalador .exe:
# el secreto no viaja por argv) o por la variable de entorno SCS_INSTALL_TOKEN
# (instalacion desatendida). No existe un parametro de token: en argv seria
# visible en Win32_Process.CommandLine para cualquier usuario del equipo. El
# archivo se borra en cuanto se lee y el valor nunca se imprime.
if (-not $IngestToken -and $IngestTokenFile) {
 if (-not (Test-Path $IngestTokenFile)) {
  Write-Error-Exit "No existe el archivo de token indicado: $IngestTokenFile"
 }
 $IngestToken = ([System.IO.File]::ReadAllText($IngestTokenFile)).Trim()
 Remove-Item $IngestTokenFile -Force -ErrorAction SilentlyContinue
}
if (-not $IngestToken) { $IngestToken = $env:SCS_INSTALL_TOKEN }
# La actualizacion sobre un servicio existente conserva su Environment
# (SC_INGEST_TOKEN, SC_SENTINEL_DEVICE_ID): no pide ni reescribe credenciales.
if (-not $UpdateMode) {
 if (-not $IngestToken) {
  Write-Error-Exit "Falta el token de ingestion: usa -IngestTokenFile o la variable de entorno SCS_INSTALL_TOKEN."
 }
 if (-not $DeviceId) {
  Write-Error-Exit "Falta el Device ID del agente (dev_...)."
 }
}

# Normalizacion: un salto de linea al pegar el token o una barra final en la
# carpeta (instalador con /D=C:\ruta\) dejan rutas y credenciales invalidas.
$IngestToken = $IngestToken.Trim()
$DeviceId = $DeviceId.Trim()
$InstallDir = $InstallDir.Trim().TrimEnd('\')

# PRE-upgrade: la GUI es un proceso del usuario interactivo, no del SCM. Si
# esta abierta, su .exe esta bloqueado y el upgrade dejaria la version vieja
# en su sitio (B-002). Se corta con codigo 4 antes de tocar nada: no se mata
# el proceso a ciegas ni se continua en silencio.
$guiRunning = @(Get-Process -Name 'sc-gui' -ErrorAction SilentlyContinue)
if ($guiRunning.Count -gt 0) {
 $guiPids = ($guiRunning | ForEach-Object { $_.Id }) -join ', '
 Write-Host "✗ La interfaz SC-Sentinel esta abierta (PID $guiPids)." -ForegroundColor Red
 Write-Host "  Cerrala antes de actualizar: el instalador no reemplaza sc-gui.exe mientras se ejecuta." -ForegroundColor Red
 Write-Host "  No se modifico ningun archivo ni el servicio." -ForegroundColor Gray
 exit 4
}

Write-Host "`n=== Instalador de SC-Sentinel Agent ===" -ForegroundColor Cyan
Write-Host "Servicio: $ServiceName" -ForegroundColor Gray
$DeviceIdShort = if ($DeviceId.Length -gt 12) { $DeviceId.Substring(0, 12) + '...' } else { $DeviceId }
Write-Host "Device ID: $DeviceIdShort" -ForegroundColor Gray
Write-Host ""

# --------------------------------------------------------------------------
# Actualizacion sobre una instalacion existente (el instalador .exe pasa
# -UpdateMode cuando detecta el servicio). No pide credenciales, no recrea el
# servicio y no reescribe config.toml ni el Environment: el token del equipo
# sigue donde estaba. El reemplazo usa el mismo procedimiento ya probado de
# deploy-agent-service.ps1: .bak verificado con su .sha256 en
# ProgramData\SC-Sentinel\backup, parada con drenaje (spool_flushed pending=0),
# copia con SHA del origen y arranque con espera de sync_confirmed.
# --------------------------------------------------------------------------
# Carpeta donde vive el binario del servicio segun su ImagePath. Es la unica
# fuente fiable en modo actualizacion: /D y la clave InstallDir del registro
# pueden apuntar a una instalacion anterior (run 45286615679: el servicio corria
# desde C:\SCS-E2E-Scripts y el instalador copiaba en C:\SCS-E2E-App).
function Get-ServiceInstallDir {
 param([string]$Name)
 $key = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name"
 $image = (Get-ItemProperty -LiteralPath $key -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
 if (-not $image) { return '' }
 Import-Module (Join-Path $PSScriptRoot 'lib\agent-binpath.psm1') -Force
 $dir = Get-InstallDirFromImagePath -ImagePath $image
 if (-not $dir) { return '' }
 # La carpeta solo vale si de verdad contiene el binario que el servicio ejecuta.
 if (-not (Test-Path -LiteralPath (Join-Path $dir 'sc-sentinel-agent.exe') -PathType Leaf)) { return '' }
 return $dir
}

# Deja la entrada de "Agregar o quitar programas" apuntando a la carpeta real
# del servicio. Se escribe antes de actualizar: si la actualizacion falla, la
# ficha sigue describiendo la instalacion que de verdad existe.
function Set-InstallRegistryDir {
 param([string]$Dir)
 $uninstallSubKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\SC-Sentinel-Agent'
 Set-Registry64Value -SubKey 'Software\SC-Sentinel' -Name 'InstallDir' -Value $Dir
 Set-Registry64Value -SubKey $uninstallSubKey -Name 'InstallLocation' -Value $Dir
 Set-Registry64Value -SubKey $uninstallSubKey -Name 'DisplayIcon' -Value (Join-Path $Dir 'sc-gui.exe')
 Set-Registry64Value -SubKey $uninstallSubKey -Name 'UninstallString' -Value ('"{0}\uninstall.exe"' -f $Dir)
 Set-Registry64Value -SubKey $uninstallSubKey -Name 'QuietUninstallString' -Value ('"{0}\uninstall.exe" /S' -f $Dir)
}

# Un deploy fallido no puede dejar el equipo sin agente. Si hay .bak verificado
# (binario + .sha256 coincidentes) se restaura; si no, se arranca el binario que
# ya estaba. En ambos casos se espera a Running y se informa el estado real.
function Restore-AgentAfterFailedUpdate {
 param([string]$BinPath, [string]$BackupDir, [string]$Name)
 $bak = Join-Path $BackupDir 'sc-sentinel-agent.exe.bak'
 $bakShaFile = "$bak.sha256"
 $restored = $false
 $detail = ''
 try {
  if (-not (Test-Path -LiteralPath $bak)) {
   $detail = 'no hay .bak; se arranca el binario existente'
  } elseif (-not (Test-Path -LiteralPath $bakShaFile)) {
   $detail = 'el .bak no tiene .sha256; no se restaura sin poder verificarlo'
  } else {
   $expected = ((Get-Content -LiteralPath $bakShaFile -TotalCount 1) -split '\s+')[0].Trim()
   $actual = Get-Sha256Hex -Path $bak
   if (-not $expected -or $actual -ne $expected.ToLowerInvariant()) {
    $detail = 'el .bak no coincide con su .sha256; no se restaura'
   } elseif (-not (Ensure-FileWritable $BinPath)) {
    $detail = "no se puede escribir $BinPath"
   } else {
    Copy-Item -LiteralPath $bak -Destination $BinPath -Force
    $copied = Get-Sha256Hex -Path $BinPath
    if ($copied -ne $actual) {
     $detail = "la copia del respaldo no coincide ($copied != $actual)"
    } else {
     $restored = $true
     $detail = "binario anterior restaurado desde $bak (SHA256 $copied)"
    }
   }
  }
 } catch { $detail = $_.Exception.Message }

 $state = 'NO_EXISTE'
 try {
  $svc = Get-Service -Name $Name -ErrorAction Stop
  $state = "$($svc.Status)"
  if ($state -ne 'Running') {
   for ($attempt = 1; $attempt -le 3 -and $state -ne 'Running'; $attempt++) {
    try { Start-Service -Name $Name -ErrorAction Stop } catch {
     $detail = "$detail; Start-Service fallo: $($_.Exception.Message)"
    }
    for ($wait = 0; $wait -lt 15; $wait += 1) {
     Start-Sleep -Seconds 1
     $state = "$((Get-Service -Name $Name -ErrorAction SilentlyContinue).Status)"
     if ($state -eq 'Running') { break }
    }
    if ($state -ne 'Running') { Start-Sleep -Seconds 2 }
   }
  }
 } catch { $state = 'NO_EXISTE' }

 return [pscustomobject]@{ Restored = $restored; State = $state; Detail = $detail; BakPath = $bak }
}

if ($UpdateMode) {
 $ConfigFile = "$ConfigDir\config.toml"

 # El destino lo manda el servicio: reapuntar un servicio instalado no es una
 # opcion del instalador y copiar en otra carpeta dejaria la version vieja en
 # ejecucion (run 45286615679).
 $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
 if (-not $svc) {
  Write-Error-Exit "No hay servicio $ServiceName que actualizar. Ejecuta el instalador sin -UpdateMode para crearlo con el Device ID y el Token." -Code 5
 }
 $serviceInstallDir = Get-ServiceInstallDir -Name $ServiceName
 if (-not $serviceInstallDir) {
  Write-Error-Exit "No se pudo leer la carpeta del servicio $ServiceName desde su ImagePath. No se modifico nada; revisa el servicio con sc qc $ServiceName." -Code 5
 }
 if ($serviceInstallDir.TrimEnd('\') -ne $InstallDir.TrimEnd('\')) {
  Write-Step "Destino del servicio: $serviceInstallDir (se ignora la carpeta pedida: $InstallDir)" -Status "ℹ"
  Write-InstallLog 'SVC' "UpdateMode: carpeta resuelta del ImagePath = $serviceInstallDir (parametro / registro: $InstallDir)"
 }
 $InstallDir = $serviceInstallDir.TrimEnd('\')
 $BinPath = "$InstallDir\sc-sentinel-agent.exe"

 # Solo la copia INSTALADA del paquete ($INSTDIR\installer) puede ejecutar la
 # actualizacion: ni el directorio de trabajo ni %TEMP% pueden inyectar el
 # deploy-agent-service.ps1 que corre elevado. -AllowLocalScripts existe solo
 # para desarrollo y nunca lo pasa el instalador.
 $scriptDir = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
 $expectedDir = (Join-Path $InstallDir 'installer').TrimEnd('\')
 if ($scriptDir -ne $expectedDir -and -not $AllowLocalScripts) {
  Write-Error-Exit "La actualizacion solo puede ejecutarse desde la copia instalada del paquete ($expectedDir); se intento desde $scriptDir." -Code 5
 }
 # Huella de config.toml antes de tocar nada: se vuelve a comprobar al final.
 $configBefore = Get-ScsFileSha256 -Path $ConfigFile
 $syncPending = $false
 $BinSource = if ($BinaryPath) { $BinaryPath } else { Join-Path $PSScriptRoot "..\agent\target\release\sc-sentinel-agent.exe" }
 if (-not (Test-Path $BinSource)) {
  Write-Error-Exit "Binario no encontrado: $BinSource" -Code 5
 }
 $deployScript = Join-Path $PSScriptRoot 'deploy-agent-service.ps1'
 if (-not (Test-Path $deployScript)) {
  Write-Error-Exit "El paquete no trae deploy-agent-service.ps1: sin el no hay respaldo verificado, drenaje ni verificacion de arranque." -Code 5
 }

 # La ficha del producto sigue a la carpeta del servicio, aunque la
 # actualizacion falle despues: es la instalacion que existe de verdad.
 try {
  Set-InstallRegistryDir -Dir $InstallDir
  Write-Step "Registro: InstallDir y desinstalador apuntan a $InstallDir"
 } catch {
  Write-Error-Exit "No se pudo actualizar la clave del producto en el registro ($($_.Exception.Message)); no se toca el servicio." -Code 5
 }

 Write-Step "Actualizando el agente (respaldo verificado + drenaje del spool)"
 $deployArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$deployScript`" -Mode Deploy -Source `"$BinSource`" -Target `"$BinPath`" -Service `"$ServiceName`" -BackupDir `"$DataDir\backup`" -LogPath `"$LogDir\agent.log`" -SyncTimeoutSec 30"
 # La salida del despliegue se captura: en /S no llega a nadie y los cortes
 # del script (ACL del respaldo, drenaje) solo se explican en stdout.
 $deployOut = Join-Path $LogDir 'deploy-agent-service.out.log'
 $deployErr = Join-Path $LogDir 'deploy-agent-service.err.log'
 $deployProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $deployArgs -Wait -PassThru -NoNewWindow `
  -RedirectStandardOutput $deployOut -RedirectStandardError $deployErr
 if ($deployProc.ExitCode -ne 0) {
  foreach ($deployLog in @($deployOut, $deployErr)) {
   if (Test-Path -LiteralPath $deployLog) {
    Get-Content -LiteralPath $deployLog -Tail 40 | ForEach-Object { Write-InstallLog 'DEPLOY' $_ }
   }
  }
 }
 switch ($deployProc.ExitCode) {
  0 { Write-Step "Agente actualizado; servicio en ejecucion con sync confirmado" }
  19 {
   $syncPending = $true
   Write-Host " ⚠ El servicio arranco con el binario nuevo, pero el servidor de ingesta no confirmo ninguna ventana (sync_confirmed) en 30 s." -ForegroundColor Yellow
   Write-Host "   Causas habituales: sin conectividad o proxy/firewall que bloquea la salida, device sin enrolar (401/403), cuota agotada o backend caido. No es una prueba de que el equipo no tenga red." -ForegroundColor Yellow
   Write-Host "   El agente quedo instalado y en ejecucion; el spool reintenta el envio solo." -ForegroundColor Yellow
  }
  default {
   # Nunca se deja el servicio parado: se restaura el .bak verificado (o se
   # arranca el binario existente) antes de informar el fallo.
   $recovery = Restore-AgentAfterFailedUpdate -BinPath $BinPath -BackupDir (Join-Path $DataDir 'backup') -Name $ServiceName
   Write-InstallLog 'DEPLOY' "recuperacion: restored=$($recovery.Restored) estado=$($recovery.State) detalle=$($recovery.Detail)"
   if ($recovery.State -ne 'Running') {
    Write-Host " ✗ No se pudo dejar el servicio en ejecucion tras el fallo (estado=$($recovery.State))." -ForegroundColor Red
    Write-Host "   $($recovery.Detail)" -ForegroundColor Red
    Write-Host "   Arrancalo a mano: sc start $ServiceName" -ForegroundColor Yellow
   } elseif ($recovery.Restored) {
    Write-Host " ⚠ Se restauro el binario anterior y el servicio quedo en ejecucion." -ForegroundColor Yellow
    Write-Host "   $($recovery.Detail)" -ForegroundColor Yellow
   } else {
    Write-Host " ⚠ El servicio quedo en ejecucion con el binario existente." -ForegroundColor Yellow
    Write-Host "   $($recovery.Detail)" -ForegroundColor Yellow
   }
   Write-Error-Exit "La actualizacion del agente fallo (codigo $($deployProc.ExitCode) de deploy-agent-service.ps1); no se copio la GUI.`n  Servicio: $($recovery.State)`n  Recuperacion: $($recovery.Detail)`n  Detalle del despliegue: C:\ProgramData\SC-Sentinel\logs\deploy-agent-service.out.log" -Code 5
  }
 }

 Install-GuiAndLauncher -Dir $InstallDir -PackageDir $PSScriptRoot
 $null = Install-GeoDatabases -GeoDir $GeoIpDir -PackageDir $PSScriptRoot -ExplicitDb $GeoIpDbPath

 if (-not (Test-Path $ConfigFile)) {
  Write-Host " ⚠ No existe ${ConfigFile}: el agente arrancara con los valores por defecto." -ForegroundColor Yellow
 }
 if ($configBefore -ne (Get-ScsFileSha256 -Path $ConfigFile)) {
  Write-Error-Exit "config.toml cambio durante la actualizacion ($configBefore -> $(Get-ScsFileSha256 -Path $ConfigFile)). La actualizacion no debe tocar datos: revisa C:\ProgramData\SC-Sentinel\backup." -Code 5
 }
 if ($configBefore) {
  Write-Step "config.toml intacto: mismo SHA256 antes y despues ($($configBefore.Substring(0, 12))...)"
 } else {
  Write-Host " ⚠ No existe config.toml: el agente arranca con los valores por defecto (no se crea aqui)." -ForegroundColor Yellow
 }

 if ($syncPending) {
  Write-Host "`nADVERTENCIA: actualizacion aplicada, pero SIN sync confirmado. El instalador /S devuelve 19 (distinto de cero) para que GPO/Intune lo trate como advertencia." -ForegroundColor Yellow
  exit 19
 }
 Write-Host "`n=== Actualizacion completada ===" -ForegroundColor Green
 Write-Host "Servicio: $ServiceName ($($svc.Status))" -ForegroundColor Gray
 Write-Host "Binario: $BinPath" -ForegroundColor Gray
 Write-Host "Datos conservados: $DataDir (config.toml, .host-key, token del servicio, spool, logs y backup)" -ForegroundColor Gray
 Write-Host "Respaldo verificado: $DataDir\backup\sc-sentinel-agent.exe.bak (+ .sha256)" -ForegroundColor Gray
 Write-Host ""
 exit 0
}

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
foreach ($dir in @($InstallDir, $ConfigDir, $LogDir, $SpoolDir, $GeoIpDir)) {
 if (-not (Test-Path $dir)) {
 New-Item -ItemType Directory -Path $dir -Force | Out-Null
 }
}

# Paso 3b: ACL de los directorios contenedores, con SIDs universales y sin
# herencia. En la instalacion, Usuarios queda solo con lectura/ejecucion
# porque ahi vive la GUI que abre el usuario interactivo (no puede escribir).
# En los datos no hay acceso de Usuarios: config, spool y logs reciben ademas
# su propia ACL mas abajo.
icacls $InstallDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)F" /grant "*${AdminsSid}:(OI)(CI)F" /grant "*S-1-5-32-545:(OI)(CI)RX" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls del directorio de instalacion fallo ($InstallDir)"
}
icacls $DataDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)F" /grant "*${AdminsSid}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) {
 Write-Error-Exit "icacls del directorio de datos fallo ($DataDir)"
}
# Ruta de datos en el registro (vista 64): el desinstalador borra lo que dice
# aqui y no una ruta fija, para no tocar una carpeta ajena si cambia de sitio.
Set-Registry64Value -SubKey 'Software\SC-Sentinel' -Name 'DataDir' -Value $DataDir

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
  # Copia de seguridad para el rollback: si lo copiado no coincide con el
  # origen se restaura esta y el upgrade se corta (nunca binario viejo en
  # silencio).
  Copy-Item $BinPath "$BinPath.bak" -Force -ErrorAction SilentlyContinue
  Remove-Item $BinPath -Force -ErrorAction SilentlyContinue
}
Copy-Item $BinSource $BinPath -Force
if (-not (Test-Path $BinPath)) {
  Write-Error-Exit "No se pudo copiar el binario a $BinPath"
}
# Verificar que lo copiado es identico al origen: si la copia falla en
# silencio el servicio se quedaria con la version antigua.
$srcHash = Get-Sha256Hex -Path $BinSource
$dstHash = if (Test-Path $BinPath) { Get-Sha256Hex -Path $BinPath } else { '' }
if ($srcHash -ne $dstHash) {
  if (Test-Path "$BinPath.bak") { Copy-Item "$BinPath.bak" $BinPath -Force -ErrorAction SilentlyContinue }
  Write-Error-Exit "El binario copiado no coincide con el de origen; se restauro el anterior (rollback).`n  origen: $srcHash`n  copiado: $dstHash" -Code 4
}
Write-Step "Binario verificado (SHA256 $srcHash)"
# Residuo de instalaciones antiguas que usaban otro nombre de binario
Remove-Item "$InstallDir\sc-agent.exe" -Force -ErrorAction SilentlyContinue

# Paso 4c y 4b: GUI, lanzador y bases GeoLite2. Las mismas funciones se usan
# en la actualizacion, con las mismas comprobaciones de SHA.
Install-GuiAndLauncher -Dir $InstallDir -PackageDir $PSScriptRoot
$GeoIpAsnInstalled = Install-GeoDatabases -GeoDir $GeoIpDir -PackageDir $PSScriptRoot -ExplicitDb $GeoIpDbPath

# Paso 5: Generar config.toml
Write-Step "Revisando configuracion (un config.toml existente nunca se reescribe)..."
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
# Regla: un config.toml existente NUNCA se reescribe. Si la configuracion de
# esta version difiere (puertos del colector, rutas, endpoint), se deja
# config.toml.nuevo al lado y se avisa; antes de cualquier cambio se guarda un
# respaldo verificado (.bak + .sha256) en ProgramData\SC-Sentinel\backup.
$configResult = Set-ScsConfigToml -Path $ConfigFile -Content "$configContent`r`n" -BackupDir "$DataDir\backup"
switch ($configResult.Action) {
 'created' {
  Write-Step "config.toml creado (SHA256 $($configResult.Sha256.Substring(0, 12))...)"
 }
 'preserved' {
  Write-Step "config.toml existente intacto: no se reescribio (SHA256 $($configResult.Sha256.Substring(0, 12))...)"
 }
 'preserved-and-proposed' {
  Write-Host " ⚠ Ya existia config.toml: se conserva sin cambios (SHA256 $($configResult.Sha256.Substring(0, 12))...)." -ForegroundColor Yellow
  Write-Host "   La configuracion de esta version quedo en $($configResult.ProposalPath) (+ .sha256) para que la compares." -ForegroundColor Yellow
  Write-Host "   Para aplicarla: revisala, respalda la actual y renombra la propuesta a config.toml. El instalador no reinicia el servicio por esto." -ForegroundColor Yellow
 }
}
if ($configResult.BackupPath) {
 Write-Step "Respaldo verificado antes del cambio: $($configResult.BackupPath) (+ .sha256)"
}

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

# Base GeoLite2: lectura para SYSTEM y Administradores (no se modifica).
if (Test-Path $GeoIpDir) {
 icacls $GeoIpDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)(RX)" /grant "*${AdminsSid}:(OI)(CI)(RX)" | Out-Null
 if ($LASTEXITCODE -ne 0) {
  Write-Error-Exit "icacls base GeoLite2 falló"
 }
}
# Paso 7: Guardar token y device_id en Registry (nunca en config.toml)
Write-Step "Registrando variables de entorno en Registry..."
$ServiceRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"

# Environment del servicio (REG_MULTI_SZ): token + device id + base GeoLite2,
# fuera del archivo de config.
$envValue = @(
 "SC_INGEST_TOKEN=$IngestToken",
 "SC_SENTINEL_DEVICE_ID=$DeviceId"
)
if (Test-Path "$GeoIpDir\GeoLite2-Country.mmdb") {
 $envValue += "SC_GEOIP_DB=$GeoIpDir\GeoLite2-Country.mmdb"
}
if ($GeoIpAsnInstalled) {
 $envValue += "SC_GEOIP_ASN_DB=$GeoIpAsnInstalled"
}

# Paso 8: Crear servicio
Write-Step "Creando servicio Windows..."
# Modo de datos del servicio: collector-only (`--no-capture`) por defecto; con
# -CaptureInterface el agente arranca con captura local de la interfaz indicada.
# Fuente exclusiva por segmento: nunca captura Y colector a la vez
# (docs/testing/pcap-vs-flow.md §7, warning `source_overlap`).
Import-Module (Join-Path $PSScriptRoot "lib\agent-binpath.psm1")
$binPathQuoted = Get-AgentBinPath -BinPath $BinPath -ConfigFile $ConfigFile -CaptureInterface $CaptureInterface

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
Write-InstallLog 'SVC' "ImagePath previsto: $binPathQuoted"
$serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
Write-InstallLog 'SVC' ("ImagePath en registro: " + (Get-ItemProperty -LiteralPath $serviceKey -Name ImagePath -ErrorAction SilentlyContinue).ImagePath)

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
try {
 Start-Service -Name $ServiceName -ErrorAction Stop
} catch {
 # El SCM devuelve el error del arranque (por ejemplo 0xC0000135 si falta una
 # DLL); sin este catch el script moria con una excepcion sin traza util.
 Write-InstallLog 'WARN' "Start-Service fallo: $($_.Exception.Message)"
 Write-Host " ⚠ No se pudo iniciar el servicio: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Verificar que está corriendo. Un arranque real puede tardar varios segundos
# (carga del binario, spool, GeoLite2): se espera hasta 60 s antes de darlo
# por fallido, en vez de mirar una sola vez a los 2 s.
$service = $null
for ($wait = 0; $wait -lt 120; $wait += 2) {
 Start-Sleep -Seconds 2
 $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
 if ($service -and $service.Status -eq 'Running') { break }
}
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
if (Test-Path "$InstallDir\sc-gui.exe") {
 Write-Host "GUI: $InstallDir\sc-gui.exe (abrir con abrir-gui.bat)" -ForegroundColor Gray
}
Write-Host "Config: $ConfigFile" -ForegroundColor Gray
Write-Host "Log: $LogDir\agent.log" -ForegroundColor Gray
Write-Host "Spool: $SpoolDir" -ForegroundColor Gray
if (Test-Path $GeoIpDbInstalled) {
 Write-Host "GeoLite2: $GeoIpDir" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Comandos útiles:" -ForegroundColor Cyan
Write-Host " sc query $ServiceName # Ver estado" -ForegroundColor Gray
Write-Host " sc qfailure $ServiceName # Ver recovery" -ForegroundColor Gray
Write-Host " sc stop $ServiceName # Detener (drain ≤30s)" -ForegroundColor Gray
Write-Host " Get-Content $LogDir\agent.log -Tail 20 # Ver log" -ForegroundColor Gray
Write-Host ""

# Un servicio que no arranca no es una instalacion correcta: se informa del
# fallo con codigo de salida para que el e2e no lo de por bueno.
if (-not ($service -and $service.Status -eq 'Running')) {
 Write-InstallLog 'ERROR' 'el servicio quedo instalado pero no arranco'
 exit 1
}
