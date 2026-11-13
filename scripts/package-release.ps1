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

# Origen de cada fichero copiado. Las sumas se calculan desde el ORIGEN y se
# comprueba que lo copiado al stage es identico: el stage vive en %TEMP%, que
# cualquier proceso del usuario puede escribir, asi que si alguien lo sustituye
# entre la copia y el zip esta comprobacion corta la release en vez de publicar
# un binario que no es el compilado.
$copied = [ordered]@{}

Copy-Item $binaryPath (Join-Path $stage $binaryName) -Force
$copied[$binaryName] = $binaryPath

# Base GeoLite2 de países: el agente la resuelve en runtime (SC_GEOIP_DB o
# <dir del binario>/geolite2/). Sin ella el agente arranca igual, pero los
# países de los snapshots salen vacíos.
$geoDbSource = Join-Path $repo 'agent/resources/geolite2/GeoLite2-Country.mmdb'
if (Test-Path $geoDbSource) {
  $geoStage = Join-Path $stage 'geolite2'
  if (-not (Test-Path $geoStage)) { New-Item -ItemType Directory -Path $geoStage -Force | Out-Null }
  Copy-Item $geoDbSource (Join-Path $geoStage 'GeoLite2-Country.mmdb') -Force
  $copied['geolite2/GeoLite2-Country.mmdb'] = $geoDbSource
} else {
  Write-Warning "No se encontró ${geoDbSource}: el paquete saldrá sin base GeoLite2 (países vacíos)."
}

if ($esWindows) {
  foreach ($f in @('install-agent.ps1', 'uninstall-agent.ps1', 'instalar-sc-sentinel.bat', 'desinstalar-sc-sentinel.bat', 'abrir-gui.bat', 'LEEME-INSTALACION.txt')) {
    Copy-Item (Join-Path $repo "scripts/$f") (Join-Path $stage $f) -Force
    $copied[$f] = Join-Path $repo "scripts/$f"
  }
  # La GUI viaja en el paquete: install-agent.ps1 la copia a Program Files y
  # abrir-gui.bat la lanza. Sin ella el usuario solo tendria el servicio.
  $guiSource = Join-Path $repo 'agent/target/release/sc-gui.exe'
  if (-not (Test-Path $guiSource)) {
    throw "No existe $guiSource. Compila antes: cargo build --release -p sc-gui"
  }
  Copy-Item $guiSource (Join-Path $stage 'sc-gui.exe') -Force
  $copied['sc-gui.exe'] = $guiSource
} else {
  # Linux no tiene instalador de un clic: el runbook documenta el paso a paso.
  # El runbook lleva la version de la release en una linea `VER=`. Se reescribe
  # aqui con la version real del artefacto para que el paquete nunca apunte a
  # una release antigua (y a la version rota).
  $linuxGuide = Join-Path $stage 'INSTALACION-LINUX.md'
  $guideText = [System.IO.File]::ReadAllText((Join-Path $repo 'docs/runbooks/install-agent-linux.md'))
  $guideText = [regex]::Replace($guideText, '(?m)^VER=.*$', "VER=$Version")
  # Si sobrevive alguna version literal distinta de la del paquete, es un
  # forgot de actualizar el runbook: se corta la release en vez de publicar
  # una guia que descarga un binario roto.
  $stale = [regex]::Matches($guideText, 'v\d+\.\d+\.\d+') |
    ForEach-Object { $_.Value } |
    Where-Object { $_ -ne "v$Version" } |
    Select-Object -Unique
  if ($stale) {
    throw "El runbook de Linux menciona versiones obsoletas ($($stale -join ', ')); actualizalo a v$Version antes de empaquetar."
  }
  Write-TextNoBom $linuxGuide $guideText
}

# Guardia de version en TODO el paquete: ninguna guia, script ni README puede
# apuntar a una release distinta de la que se esta empaquetando. Si lo hacen,
# se corta la release en vez de publicar instrucciones que descargan un
# binario roto (o ya retirado).
$textExt = @('.md', '.txt', '.ps1', '.bat', '.sh', '.toml', '.json')
$staleRefs = @()
Get-ChildItem $stage -File -Recurse | Where-Object { $textExt -contains $_.Extension.ToLowerInvariant() } | ForEach-Object {
  $file = $_
  $content = [System.IO.File]::ReadAllText($file.FullName)
  [regex]::Matches($content, 'v\d+\.\d+\.\d+') | ForEach-Object {
    if ($_.Value -ne "v$Version") {
      $staleRefs += "$($_.Value) en $($file.Name)"
    }
  }
}
if ($staleRefs) {
  throw "El paquete menciona versiones obsoletas ($($staleRefs -join '; ')); debe ser solo v$Version."
}

# SHA256 de todos los ficheros del paquete (verificacion tras descomprimir).
# Se escribe sin BOM: `sha256sum -c` en Linux rechaza un fichero con BOM.
$sumsInner = Join-Path $stage 'SHA256SUMS.txt'
$stageFull = (Resolve-Path $stage).Path

# Todo lo que venga del repo se compara con su origen antes de sumarlo.
foreach ($rel in $copied.Keys) {
  if (-not (Test-Path (Join-Path $stage ($rel -replace '/', '\')))) {
    throw "Falta en el paquete un fichero que deberia estar: $rel"
  }
}

$innerLines = @()
foreach ($file in (Get-ChildItem $stage -File -Recurse | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object FullName)) {
  # `sha256sum` usa separadores de dos espacios; las rutas van con `/` y son
  # relativas a la raíz del paquete.
  $relative = $file.FullName.Substring($stageFull.Length).TrimStart('\', '/').Replace('\', '/')
  $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($copied.Contains($relative)) {
    $srcHash = (Get-FileHash $copied[$relative] -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($srcHash -ne $hash) {
      throw "El fichero del paquete no coincide con su origen: $relative (origen $srcHash, paquete $hash)"
    }
  }
  $innerLines += "$hash  $relative"
}
if (-not $innerLines) { throw 'El paquete ha quedado vacío' }
Write-TextNoBom $sumsInner (($innerLines -join "`n") + "`n")

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
