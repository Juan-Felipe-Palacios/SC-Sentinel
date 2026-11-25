<#
.SYNOPSIS
  Corre el instalador .exe de SC-Sentinel en Windows Sandbox y verifica la
  instalacion y la desinstalacion sin tocar el equipo real.
.DESCRIPTION
  Prepara una carpeta de staging fuera del repo con el instalador y la prueba,
  genera el .wsb, lo lanza y espera los resultados. La prueba dentro del sandbox
  es scripts/tests/installer-sandbox-test.ps1: instala con /S en C:\SCS-App
  (carpeta distinta de la de por defecto), verifica servicio, archivos, registro,
  ACL y token temporal, y desinstala con /S comprobando que no queda residuo.

  Windows Sandbox es desechable: nada de lo que ocurre dentro afecta a este
  equipo. Requiere la caracteristica opcional Containers-DisposableClientVM.
.PARAMETER SetupPath
  Instalador .exe. Por defecto el mas reciente de dist/*-windows-x64-setup.exe.
.PARAMETER TimeoutMinutes
  Espera maxima de los resultados. Por defecto 20.
.PARAMETER KeepStage
  No borra la carpeta de staging al terminar (conserva el transcript).
.EXAMPLE
  pwsh ./scripts/tests/run-installer-sandbox.ps1
#>
[CmdletBinding()]
param(
  [string]$SetupPath = '',

  [int]$TimeoutMinutes = 20,

  [switch]$KeepStage,

  # Prepara y valida el .wsb pero no lanza la VM (sirve como comprobacion en
  # equipos donde Windows Sandbox todavia no esta habilitado).
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
$repo = Split-Path -Parent (Split-Path -Parent $scriptRoot)

if (-not $SetupPath) {
  $candidate = Get-ChildItem -Path (Join-Path $repo 'dist') -Filter '*-windows-x64-setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) {
    throw 'No hay instalador en dist/*-windows-x64-setup.exe. Compilalo con scripts/build-installer.ps1 -Version <x.y.z>.'
  }
  $SetupPath = $candidate.FullName
}
if (-not (Test-Path -LiteralPath $SetupPath)) { throw "No existe el instalador: $SetupPath" }
$SetupPath = (Resolve-Path -LiteralPath $SetupPath).Path

$sandboxExe = @(
  (Join-Path $env:WINDIR 'System32\WindowsSandbox.exe'),
  (Join-Path $env:ProgramFiles 'WindowsSandbox\WindowsSandbox.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $sandboxExe) {
  $sandboxError = @'
Windows Sandbox no esta disponible en este equipo (no existe WindowsSandbox.exe).
Para habilitarlo hace falta una consola elevada y reiniciar:

  dism /online /enable-feature /featurename:Containers-DisposableClientVM /all /norestart

Requiere virtualizacion activada y Windows 10/11 Pro, Enterprise o Education.
Despues, volver a ejecutar este script.
'@
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "scs-sandbox-$stamp"
$resultsDir = Join-Path $stage 'results'
New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null

Copy-Item -LiteralPath $SetupPath -Destination (Join-Path $stage 'setup.exe')
Copy-Item -LiteralPath (Join-Path $scriptRoot 'installer-sandbox-test.ps1') -Destination (Join-Path $stage 'installer-sandbox-test.ps1')

# Hash de sc-gui.exe segun el ZIP de la misma version: la prueba lo compara
# con la GUI instalada (B-002). Se calcula desde el ZIP, no desde el setup,
# porque el setup embebe el payload comprimido.
$setupVersion = if ((Split-Path -Leaf $SetupPath) -match 'v(\d+\.\d+\.\d+)-windows-x64-setup') { $Matches[1] } else { '' }
$expectedGuiSha = ''
if ($setupVersion) {
  $zipCandidate = Join-Path $repo "dist/sc-sentinel-agent-v$setupVersion-windows-x64.zip"
  if (Test-Path -LiteralPath $zipCandidate) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipCandidate)
    try {
      $entry = $zip.Entries | Where-Object { $_.FullName -eq 'sc-gui.exe' } | Select-Object -First 1
      if ($entry) {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
          $stream = $entry.Open()
          try { $expectedGuiSha = ([BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
          finally { $stream.Dispose() }
        } finally { $sha.Dispose() }
      }
    } finally { $zip.Dispose() }
  }
}
if (-not $expectedGuiSha) {
  Write-Warning "No se pudo calcular el SHA256 de sc-gui.exe desde dist/sc-sentinel-agent-v$setupVersion-windows-x64.zip: la prueba marcara el hash de la GUI como fallo."
}

# ACL restrictiva del staging (AGENTS.md §6.9): sin herencia de %TEMP%, solo
# SYSTEM, Administradores y el usuario que prepara la prueba.
Write-Host '==> icacls del staging (antes):'
& icacls $stage
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$null = & icacls $stage /inheritance:r /grant "*S-1-5-18:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F" /grant "$($currentUser):(OI)(CI)F"
$aclExit = $LASTEXITCODE
Write-Host "==> icacls del staging (despues): exit $aclExit"
& icacls $stage
if ($aclExit -ne 0) { throw "No se pudo restringir la ACL del staging: $stage" }

$wsbPath = Join-Path $stage 'installer-sandbox.wsb'
$wsb = @"
<Configuration>
  <Networking>Disable</Networking>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$stage</HostFolder>
      <SandboxFolder>C:\SCSTest</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell -NoProfile -ExecutionPolicy Bypass -File C:\SCSTest\installer-sandbox-test.ps1 -SetupPath C:\SCSTest\setup.exe -OutDir C:\SCSTest\results -ExpectedGuiSha256 $expectedGuiSha</Command>
  </LogonCommand>
  <MemoryInMB>4096</MemoryInMB>
</Configuration>
"@
[System.IO.File]::WriteAllText($wsbPath, $wsb, [System.Text.UTF8Encoding]::new($false))
# Se valida el XML antes de lanzar la VM: un .wsb mal formado falla en silencio.
[void][xml](Get-Content -LiteralPath $wsbPath -Raw)

Write-Host "==> Instalador: $SetupPath"
Write-Host "==> Staging:   $stage"

if ($DryRun) {
  Write-Host '==> -DryRun: .wsb preparado y validado; no se lanza la VM.'
  Get-Content -LiteralPath $wsbPath
  Write-Host "==> Comando del sandbox: powershell -NoProfile -ExecutionPolicy Bypass -File C:\SCSTest\installer-sandbox-test.ps1 -SetupPath C:\SCSTest\setup.exe -OutDir C:\SCSTest\results -ExpectedGuiSha256 $expectedGuiSha"
  exit 0
}

if ($sandboxError) { throw $sandboxError }

Write-Host "==> Lanzando Windows Sandbox (la ventana de la VM es normal)..."

Start-Process -FilePath $sandboxExe -ArgumentList "`"$wsbPath`"" | Out-Null

$resultFile = Join-Path $resultsDir 'result.json'
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$lastReport = Get-Date

while ((Get-Date) -lt $deadline) {
  if (Test-Path -LiteralPath $resultFile) { break }
  if (((Get-Date) - $lastReport).TotalSeconds -ge 30) {
    Write-Host ('    esperando resultados... {0:N0}s' -f ((Get-Date) - ($deadline.AddMinutes(-$TimeoutMinutes))).TotalSeconds)
    $lastReport = Get-Date
  }
  Start-Sleep -Seconds 3
}

if (-not (Test-Path -LiteralPath $resultFile)) {
  Write-Host '!! No se recibieron resultados dentro del plazo.' -ForegroundColor Red
  $transcript = Join-Path $resultsDir 'transcript.txt'
  if (Test-Path -LiteralPath $transcript) {
    Write-Host '--- transcript parcial ---'
    Get-Content -LiteralPath $transcript | Select-Object -Last 60
  }
  Write-Host "Staging conservado para diagnostico: $stage"
  exit 2
}

$result = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
Write-Host ''
Write-Host "== Resultados: $($result.total) comprobaciones, $($result.fallos) fallo(s) ==" -ForegroundColor $(if ($result.ok) { 'Green' } else { 'Red' })
$result.checks | ForEach-Object {
  $color = if ($_.ok) { 'Green' } else { 'Red' }
  Write-Host ("  [{0}] {1}: {2}" -f $(if ($_.ok) { ' OK ' } else { 'FALLO' }), $_.check, $_.detail) -ForegroundColor $color
}
Write-Host ''
Write-Host "Setup SHA256: $($result.setup_sha256)"
Write-Host "Carpeta de resultados: $resultsDir"
Write-Host 'La ventana del sandbox se puede cerrar: es desechable.'

if ($KeepStage) {
  Write-Host "Staging conservado en $stage (-KeepStage)."
} else {
  try {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction Stop
    Write-Host "Staging eliminado: $stage"
  } catch {
    Write-Warning "No se pudo borrar el staging ($stage): $($_.Exception.Message)"
  }
}

if ($result.ok) { exit 0 }
exit 1
