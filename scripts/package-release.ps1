<#
.SYNOPSIS
  Empaqueta el agente SC-Sentinel para publicarlo como artefacto de release.
.DESCRIPTION
  Genera el paquete de la release a partir del binario ya compilado:
    - windows-x64 -> sc-sentinel-agent-vX.Y.Z-windows-x64.zip
    - linux-x64   -> sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz
  El paquete Windows incluye el instalador de un clic (auto-elevado), los
  scripts PowerShell de instalacion/desinstalacion y la guia para usuarios
  sin conocimientos de informatica. El paquete Linux incluye el binario y
  el runbook de instalacion.
  Ademas escribe un fichero de sumas SHA256 por artefacto (SHA256SUMS-<target>.txt)
  que el job de publicacion concatena en el SHA256SUMS.txt de la release.
.EXAMPLE
  pwsh ./scripts/package-release.ps1 -Version 0.1.0 -Target windows-x64
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, HelpMessage = "Version sin 'v' (p.ej. 0.1.0)")]
  [string]$Version,

  [Parameter(Mandatory = $true, HelpMessage = "Plataforma objetivo")]
  [ValidateSet('windows-x64', 'linux-x64')]
  [string]$Target,

  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

  [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist')
)

$ErrorActionPreference = 'Stop'

# Escribe texto en UTF-8 sin BOM. `Set-Content -Encoding utf8` en Windows
# PowerShell 5.1 anade BOM, y un SHA256SUMS.txt con BOM rompe la verificacion
# con `sha256sum -c` en Linux.
function Write-TextNoBom {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

$repo = (Resolve-Path $RepoRoot).Path
$out = if (Test-Path $OutDir) { (Resolve-Path $OutDir).Path } else { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null; (Resolve-Path $OutDir).Path }

$esWindows = $Target -eq 'windows-x64'
$binaryName = if ($esWindows) { 'sc-sentinel-agent.exe' } else { 'sc-sentinel-agent' }
$binaryPath = Join-Path $repo "agent/target/release/$binaryName"

if (-not (Test-Path $binaryPath)) {
  throw "No existe el binario $binaryPath. Compila antes: cargo build --release -p sc-agent"
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) "sc-sentinel-pkg-$Target"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Write-Host "==> Preparando paquete $Target (v$Version)"

Copy-Item $binaryPath (Join-Path $stage $binaryName) -Force

if ($esWindows) {
  foreach ($f in @('install-agent.ps1', 'uninstall-agent.ps1', 'instalar-sc-sentinel.bat', 'desinstalar-sc-sentinel.bat', 'LEEME-INSTALACION.txt')) {
    Copy-Item (Join-Path $repo "scripts/$f") (Join-Path $stage $f) -Force
  }
} else {
  # Linux no tiene instalador de un clic: el runbook documenta el paso a paso.
  Copy-Item (Join-Path $repo 'docs/runbooks/install-agent-linux.md') (Join-Path $stage 'INSTALACION-LINUX.md') -Force
}

# SHA256 del binario contenido en el paquete (verificacion tras descomprimir).
# Se escribe sin BOM: `sha256sum -c` en Linux rechaza un fichero con BOM.
$binHash = (Get-FileHash (Join-Path $stage $binaryName) -Algorithm SHA256).Hash.ToLowerInvariant()
$sumsInner = Join-Path $stage 'SHA256SUMS.txt'
Write-TextNoBom $sumsInner "$binHash  $binaryName`n"

$base = "sc-sentinel-agent-v$Version-$Target"
$artifactPath = Join-Path $out $base
if ($esWindows) {
  $artifact = "$artifactPath.zip"
  if (Test-Path $artifact) { Remove-Item $artifact -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $artifact -CompressionLevel Optimal
} else {
  $artifact = "$artifactPath.tar.gz"
  if (Test-Path $artifact) { Remove-Item $artifact -Force }
  # `tar` existe en los runners de ubuntu y en windows-latest.
  & tar -czf $artifact -C $stage . 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "tar fallo con codigo $LASTEXITCODE" }
}

$artifactHash = (Get-FileHash $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
$sumsOut = Join-Path $out "SHA256SUMS-$Target.txt"
Write-TextNoBom $sumsOut "$artifactHash  $(Split-Path -Leaf $artifact)`n"

Write-Host "==> Artefacto: $artifact ($([math]::Round((Get-Item $artifact).Length / 1KB, 1)) KB)"
Write-Host "==> SHA256:    $artifactHash"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
