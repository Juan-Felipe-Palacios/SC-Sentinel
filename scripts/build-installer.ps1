<#
.SYNOPSIS
  Compila el instalador .exe de Windows (NSIS) a partir del ZIP de la release.
.DESCRIPTION
  Toma el paquete ya generado por package-release.ps1, verifica cada fichero
  contra su SHA256SUMS.txt interno, y compila con makensis un unico .exe que
  instala todo: binario del agente, GUI, bases GeoLite2, config.toml, servicio
  con recovery, ACL y entrada en "Agregar o quitar programas".

  El usuario final solo elige la carpeta de instalacion (la que viene por
  defecto vale) y pega el Device ID y el Token del panel web.

  El instalador resultante se suma a dist/SHA256SUMS-windows-x64.txt, que el
  job de publicacion fusiona en el SHA256SUMS.txt de la release.
.PARAMETER Version
  Version sin 'v' (p.ej. 0.1.10).
.PARAMETER ZipPath
  ZIP de entrada. Por defecto dist/sc-sentinel-agent-v<Version>-windows-x64.zip.
.PARAMETER OutFile
  .exe de salida. Por defecto dist/sc-sentinel-agent-v<Version>-windows-x64-setup.exe.
.PARAMETER MakensisPath
  makensis.exe. Por defecto se busca en la instalacion de NSIS y en el PATH.
.EXAMPLE
  pwsh ./scripts/build-installer.ps1 -Version 0.1.10
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, HelpMessage = "Version sin 'v' (p.ej. 0.1.10)")]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [string]$ZipPath = '',

  [string]$OutFile = '',

  [string]$MakensisPath = '',

  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) { $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $scriptRoot }
$repo = (Resolve-Path $RepoRoot).Path
$dist = Join-Path $repo 'dist'

if (-not $ZipPath) { $ZipPath = Join-Path $dist "sc-sentinel-agent-v$Version-windows-x64.zip" }
if (-not (Test-Path $ZipPath)) {
  throw "No existe el ZIP $ZipPath. Empaqueta primero: pwsh ./scripts/package-release.ps1 -Version $Version -Target windows-x64"
}
$ZipPath = (Resolve-Path $ZipPath).Path
if (-not $OutFile) { $OutFile = Join-Path $dist "sc-sentinel-agent-v$Version-windows-x64-setup.exe" }

if (-not $MakensisPath) {
  $candidates = @()
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe') }
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'NSIS\makensis.exe') }
  $onPath = Get-Command makensis -ErrorAction SilentlyContinue
  if ($onPath) { $candidates += $onPath.Source }
  $MakensisPath = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $MakensisPath) {
  throw 'No se encontro makensis.exe. Instala NSIS 3.x (choco install nsis) o pasa -MakensisPath.'
}

$nsi = Join-Path $repo 'installer/sc-sentinel.nsi'
if (-not (Test-Path $nsi)) { throw "No existe el script NSIS: $nsi" }

Write-Host "==> Paquete de entrada: $ZipPath"
Write-Host "==> NSIS: $MakensisPath"

# El payload vive fuera del repo y se borra al terminar (AGENTS.md §6.9).
$payload = Join-Path ([System.IO.Path]::GetTempPath()) "sc-sentinel-installer-$Version"
if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item -ItemType Directory -Path $payload -Force | Out-Null

try {
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $payload -Force

  # Todo lo que se embebe en el .exe se compara con la suma del paquete: si
  # alguien sustituyo un fichero del ZIP, el instalador no se compila.
  $sumsFile = Join-Path $payload 'SHA256SUMS.txt'
  if (-not (Test-Path $sumsFile)) { throw "El ZIP no trae SHA256SUMS.txt: $ZipPath" }
  $verified = 0
  foreach ($line in (Get-Content -LiteralPath $sumsFile)) {
    if (-not $line.Trim()) { continue }
    if ($line -notmatch '^([0-9a-fA-F]{64})  (.+)$') {
      throw "Linea invalida en SHA256SUMS.txt: $line"
    }
    $expected = $Matches[1].ToLowerInvariant()
    $relative = $Matches[2]
    $file = Join-Path $payload ($relative -replace '/', '\')
    if (-not (Test-Path $file)) { throw "Falta en el ZIP el fichero $relative" }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
      throw "El fichero $relative no coincide con su suma (esperado $expected, actual $actual)"
    }
    $verified++
  }
  if ($verified -eq 0) { throw 'SHA256SUMS.txt no tiene entradas' }
  Write-Host "==> Sumas verificadas: $verified ficheros"

  if (-not (Test-Path (Join-Path $payload 'sc-sentinel-agent.exe'))) {
    throw 'El paquete no contiene sc-sentinel-agent.exe'
  }
  if (-not (Test-Path (Join-Path $payload 'install-agent.ps1'))) {
    throw 'El paquete no contiene install-agent.ps1'
  }
  if (-not (Test-Path (Join-Path $payload 'uninstall-agent.ps1'))) {
    throw 'El paquete no contiene uninstall-agent.ps1'
  }
  # La actualizacion sobre una instalacion existente reutiliza
  # deploy-agent-service.ps1 (respaldo verificado, drenaje, sync) y su helper
  # lib\agent-binpath.psm1: sin ellos el instalador compila pero falla al
  # ejecutarse en la maquina del usuario.
  if (-not (Test-Path (Join-Path $payload 'deploy-agent-service.ps1'))) {
    throw 'El paquete no contiene deploy-agent-service.ps1 (lo necesita la actualizacion)'
  }
  if (-not (Test-Path (Join-Path $payload 'lib\agent-binpath.psm1'))) {
    throw 'El paquete no contiene lib\agent-binpath.psm1 (lo carga install-agent.ps1)'
  }
  # install-agent.ps1 importa lib\config-toml.psm1 (config.toml existente nunca
  # se reescribe + respaldo verificado). Si falta, el instalador falla al
  # arrancar en la maquina del usuario y no aqui.
  if (-not (Test-Path (Join-Path $payload 'lib\config-toml.psm1'))) {
    throw 'El paquete no contiene lib\config-toml.psm1 (lo importa install-agent.ps1)'
  }
  # Los tres scripts de la actualizacion viajan incrustados y se ejecutan desde
  # $INSTDIR\installer (nunca desde el directorio de trabajo ni %TEMP%).
  if (-not (Test-Path (Join-Path $payload 'SHA256SUMS.txt'))) { throw 'Falta SHA256SUMS.txt en el payload' }
  $manifestLines = @(Get-Content -LiteralPath (Join-Path $payload 'SHA256SUMS.txt'))
  foreach ($required in @('install-agent.ps1', 'deploy-agent-service.ps1', 'lib\config-toml.psm1')) {
    $abs = Join-Path $payload $required
    if (-not (Test-Path $abs)) { throw "El payload no contiene $required" }
    $rel = $required.Replace('\', '/')
    $pattern = '  ' + [regex]::Escape($rel) + '$'
    $sumLine = @($manifestLines | Where-Object { $_ -match $pattern })
    if ($sumLine.Count -eq 0) { throw "SHA256SUMS.txt no lista ${rel}: el payload no esta verificado" }
  }

  if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

  # NSIS recibe rutas con '/' para no pelear con los escapes del script.
  & $MakensisPath /V2 `
    "/DVERSION=$Version" `
    "/DPAYLOAD=$($payload -replace '\\', '/')" `
    "/DOUTFILE=$($OutFile -replace '\\', '/')" `
    $nsi
  if ($LASTEXITCODE -ne 0) { throw "makensis fallo con codigo $LASTEXITCODE" }
  if (-not (Test-Path $OutFile)) { throw "makensis no genero $OutFile" }

  $hash = (Get-FileHash -LiteralPath $OutFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $name = Split-Path -Leaf $OutFile

  # El manifiesto por target es lo que el job de publicacion fusiona en
  # SHA256SUMS.txt; el instalador entra en el mismo fichero que el ZIP.
  $sumsOut = Join-Path $dist 'SHA256SUMS-windows-x64.txt'
  $lines = @()
  if (Test-Path $sumsOut) {
    $lines = @(Get-Content -LiteralPath $sumsOut | Where-Object { $_ -and $_ -notmatch [regex]::Escape($name) })
  }
  $lines += "$hash  $name"
  [System.IO.File]::WriteAllText($sumsOut, (($lines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))

  $sizeMb = [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 1)
  Write-Host "==> Instalador: $OutFile ($sizeMb MB)"
  Write-Host "==> SHA256:    $hash"
} finally {
  Remove-Item $payload -Recurse -Force -ErrorAction SilentlyContinue
}
