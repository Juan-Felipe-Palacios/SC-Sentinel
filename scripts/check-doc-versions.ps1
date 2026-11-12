<#
.SYNOPSIS
  Comprueba que la documentacion y los scripts de entrega no apunten a una
  version de release distinta de la que se va a publicar.
.DESCRIPTION
  Las guias de instalacion y los README de los paquetes llevan la version de
  la release en texto plano (URLs de descarga, `VER=x.y.z`). Si alguien sube
  el numero de version y olvida actualizar esos textos, la guia acaba
  mandando al usuario a descargar un binario roto o ya retirado.

  Este script compara las versiones citadas con la version del workspace de
  Rust (`agent/Cargo.toml`) y falla si encuentra alguna distinta.

  Uso: pwsh ./scripts/check-doc-versions.ps1 [-Version x.y.z]
.EXAMPLE
  pwsh ./scripts/check-doc-versions.ps1
#>
[CmdletBinding()]
param(
  # Version esperada. Por defecto, la del workspace de Rust.
  [string]$Version,

  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path $RepoRoot).Path

if (-not $Version) {
  $cargoToml = Join-Path $repo 'agent/Cargo.toml'
  if (-not (Test-Path $cargoToml)) { throw "No se encuentra $cargoToml" }
  $match = Select-String -Path $cargoToml -Pattern '^\s*version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"' -AllMatches |
    Select-Object -First 1
  if (-not $match) { throw "No se pudo leer la version del workspace en $cargoToml" }
  $Version = $match.Matches[0].Groups[1].Value
}

Write-Host "==> Version esperada: $Version"

# Ficheros que llegan al usuario dentro de los paquetes de release, mas los
# runbooks del repositorio (que es donde se copia el texto de las guias).
$candidates = @(
  (Join-Path $repo 'docs/runbooks/install-agent-windows.md'),
  (Join-Path $repo 'docs/runbooks/install-agent-linux.md'),
  (Join-Path $repo 'scripts/LEEME-INSTALACION.txt'),
  (Join-Path $repo 'scripts/instalar-sc-sentinel.bat'),
  (Join-Path $repo 'scripts/desinstalar-sc-sentinel.bat'),
  (Join-Path $repo 'scripts/install-agent.ps1'),
  (Join-Path $repo 'scripts/uninstall-agent.ps1')
)

$problems = @()
foreach ($file in $candidates) {
  if (-not (Test-Path $file)) { continue }
  $lines = Get-Content $file
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    # v0.1.3 (con 'v' delante) o VER=0.1.3 / version = "0.1.3"
    [regex]::Matches($line, '(?:v|VER=|version\s*=\s*")([0-9]+\.[0-9]+\.[0-9]+)') | ForEach-Object {
      $found = $_.Groups[1].Value
      if ($found -ne $Version) {
        $rel = $file.Substring($repo.Length).TrimStart('\', '/')
        $problems += "$rel`:$($i + 1) cita la version $found (se esperaba $Version)"
      }
    }
  }
}

if ($problems) {
  Write-Host ''
  foreach ($p in $problems) { Write-Host "  [FALLO] $p" -ForegroundColor Red }
  Write-Host ''
  Write-Host "Actualiza esas referencias o deja que el empaquetador las reescriba antes de publicar." -ForegroundColor Yellow
  exit 1
}

Write-Host 'OK: ninguna guia apunta a otra version.' -ForegroundColor Green
exit 0
