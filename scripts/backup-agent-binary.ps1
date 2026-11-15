#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Crea (o verifica en -DryRun) un respaldo .bak + .bak.sha256 del binario
  instalado de SC-Sentinel, sin tocar el servicio ni el binario original.

.DESCRIPTION
  - Sin -DryRun: copia C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe a
    C:\ProgramData\SC-Sentinel\backup\sc-sentinel-agent.exe.bak, escribe su
    SHA256 en .bak.sha256 y restringe ACLs (SYSTEM + Administradores).
  - Con -DryRun: NO modifica nada; verifica que el respaldo y su .sha256
    existan y coincidan, e informa qué haría un rollback (sin ejecutarlo).

  No detiene ni arranca el servicio. Solo lectura/escritura del respaldo.
#>
[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$InstalledBin = 'C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe'
$BackupDir    = 'C:\ProgramData\SC-Sentinel\backup'
$BakPath      = Join-Path $BackupDir 'sc-sentinel-agent.exe.bak'
$BakShaPath   = "$BakPath.sha256"
$SystemSid    = 'S-1-5-18'
$AdminsSid    = 'S-1-5-32-544'

if (-not (Test-Path -LiteralPath $InstalledBin)) {
  throw "No existe el binario instalado: $InstalledBin"
}

if ($DryRun) {
  if (-not (Test-Path -LiteralPath $BakPath)) {
    Write-Host "DRY RUN: FALTA el respaldo $BakPath" -ForegroundColor Red
    exit 20
  }
  if (-not (Test-Path -LiteralPath $BakShaPath)) {
    Write-Host "DRY RUN: FALTA $BakShaPath" -ForegroundColor Red
    exit 21
  }
  $expected = (Get-Content -LiteralPath $BakShaPath -Raw).Trim().Split()[0]
  $actual   = (Get-FileHash -LiteralPath $BakPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) {
    Write-Host "DRY RUN: SHA no coincide (bak=$actual esperado=$expected)" -ForegroundColor Red
    exit 22
  }
  Write-Host "DRY RUN OK: respaldo presente y verificado (SHA=$actual)" -ForegroundColor Green
  Write-Host "Un rollback restauraria $BakPath -> $InstalledBin (con drenaje del servicio)."
  exit 0
}

# Crear directorio y ACLs.
if (-not (Test-Path -LiteralPath $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
icacls $BackupDir /inheritance:r /grant "*${SystemSid}:(OI)(CI)(F)" "*${AdminsSid}:(OI)(CI)(F)" | Out-Null

# Copiar binario y verificar hash.
Copy-Item -LiteralPath $InstalledBin -Destination $BakPath -Force
$srcHash = (Get-FileHash -LiteralPath $InstalledBin -Algorithm SHA256).Hash.ToLowerInvariant()
$dstHash = (Get-FileHash -LiteralPath $BakPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($srcHash -ne $dstHash) {
  throw "La copia del respaldo no coincide (origen=$srcHash copiado=$dstHash)"
}
[System.IO.File]::WriteAllText($BakShaPath, "$srcHash  sc-sentinel-agent.exe.bak`n", [System.Text.UTF8Encoding]::new($false))

# ACLs de los archivos.
icacls $BakPath    /inheritance:r /grant "*${SystemSid}:(F)" "*${AdminsSid}:(RX)" | Out-Null
icacls $BakShaPath /inheritance:r /grant "*${SystemSid}:(F)" "*${AdminsSid}:(RX)" | Out-Null

Write-Host "Respaldo creado: $BakPath" -ForegroundColor Green
Write-Host "SHA256: $srcHash"