<#
.SYNOPSIS
  Empaqueta el agente SC-Sentinel para publicarlo como artefacto de release.
.DESCRIPTION
  Genera el paquete de la release a partir del binario ya compilado:
    - windows-x64        -> sc-sentinel-agent-vX.Y.Z-windows-x64.zip
    - linux-x64          -> sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz
    - linux-x64-sensor   -> sc-sentinel-agent-vX.Y.Z-linux-x64-sensor.tar.gz
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
  [ValidateSet('windows-x64', 'linux-x64', 'linux-x64-sensor')]
  [string]$Target,

  [string]$RepoRoot = '',

  [string]$OutDir = '',

  # Valida target, version y runbook y sale sin compilar ni empaquetar.
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 no evalua $PSScriptRoot durante el binding del param;
# se resuelve aqui para que `powershell.exe -File` funcione igual que `pwsh`.
$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $scriptRoot }
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $scriptRoot) 'dist' }

# Escribe texto en UTF-8 sin BOM. `Set-Content -Encoding utf8` en Windows
# PowerShell 5.1 anade BOM, y un SHA256SUMS.txt con BOM rompe la verificacion
# con `sha256sum -c` en Linux.
function Write-TextNoBom {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

$repo = (Resolve-Path $RepoRoot).Path

$esWindows = $Target -eq 'windows-x64'
# El sensor Linux es el tercer artefacto: captura pasiva con libpcap, a
# diferencia de `linux-x64`, que es el colector NetFlow/IPFIX sin libpcap.
$esSensor = $Target -eq 'linux-x64-sensor'
$binaryName = if ($esWindows) { 'sc-sentinel-agent.exe' } else { 'sc-sentinel-agent' }
$binaryPath = Join-Path $repo "agent/target/release/$binaryName"

# Dry-run: comprueba lo que puede romper una release (target, runbook y
# versiones) sin exigir el binario ni escribir el paquete. Util en CI y en
# una maquina que no puede compilar el target (p.ej. sensor Linux en Windows).
if ($DryRun) {
  if (-not $esWindows) {
    $runbookName = if ($esSensor) { 'install-agent-linux-sensor.md' } else { 'install-agent-linux.md' }
    $runbook = Join-Path $repo "docs/runbooks/$runbookName"
    if (-not (Test-Path $runbook)) { throw "No existe $runbook" }
    $guideText = [System.IO.File]::ReadAllText($runbook)
    if ($guideText -notmatch '(?m)^VER=') { throw "El runbook $runbookName no tiene linea VER=." }
    $stale = [regex]::Matches($guideText, 'v\d+\.\d+\.\d+') |
      ForEach-Object { $_.Value } |
      Where-Object { $_ -ne "v$Version" } |
      Select-Object -Unique
    if ($stale) {
      throw "El runbook $runbookName menciona versiones obsoletas ($($stale -join ', ')); actualizalo a v$Version antes de empaquetar."
    }
    $guideOut = if ($esSensor) { 'INSTALACION-LINUX-SENSOR.md' } else { 'INSTALACION-LINUX.md' }
    Write-Host "==> Dry-run: guia $runbookName -> $guideOut"
  }
  $ext = if ($esWindows) { 'zip' } else { 'tar.gz' }
  Write-Host "==> Dry-run OK: sc-sentinel-agent-v$Version-$Target.$ext"
  exit 0
}

$out = if (Test-Path $OutDir) { (Resolve-Path $OutDir).Path } else { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null; (Resolve-Path $OutDir).Path }

if (-not (Test-Path $binaryPath)) {
  throw "No existe el binario $binaryPath. Compila antes: cargo build --release -p sc-agent"
}

# Gate: en Windows el agente publicado tiene que poder capturar (feature
# sc-capture/live). El texto 'captura live no compilada' solo existe en el
# binario cuando esa feature esta apagada, asi que su presencia significa que
# se compilo sin ella y el paquete no debe publicarse. En Linux la captura
# live es intencionalmente opcional (modo colector), por eso el gate solo
# aplica al target windows-x64.
# El sensor Linux tambien publica captura live: el mismo texto delata un
# binario compilado sin la feature y el paquete no debe salir.
if ($esWindows -or $esSensor) {
  $binaryBytes = [System.IO.File]::ReadAllBytes($binaryPath)
  $binaryText = [System.Text.Encoding]::ASCII.GetString($binaryBytes)
  if ($binaryText.Contains('captura live no compilada')) {
    throw "El binario $binaryPath se compilo sin la feature live (contiene 'captura live no compilada'). Recompila con: cargo build --release -p sc-agent --features sc-capture/live"
  }
  Write-Host "==> Gate captura live: OK ($binaryPath)"
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

# Bases GeoLite2 de países y ASN: el agente las resuelve en runtime
# (SC_GEOIP_DB/SC_GEOIP_ASN_DB o <dir del binario>/geolite2/). Sin ellas el
# agente arranca igual, pero los países/ASN de los snapshots salen vacíos.
$geoStage = Join-Path $stage 'geolite2'
if (-not (Test-Path $geoStage)) { New-Item -ItemType Directory -Path $geoStage -Force | Out-Null }
foreach ($geoName in @('GeoLite2-Country.mmdb', 'GeoLite2-ASN.mmdb')) {
  $geoDbSource = Join-Path $repo "agent/resources/geolite2/$geoName"
  if (Test-Path $geoDbSource) {
    Copy-Item $geoDbSource (Join-Path $geoStage $geoName) -Force
    $copied["geolite2/$geoName"] = $geoDbSource
  } else {
    Write-Warning "No se encontró ${geoDbSource}: el paquete saldrá sin esa base GeoLite2."
  }
}

# Avisos legales y licencias del código derivado: viajan en el paquete para
# que la atribución exigida por MIT/Apache-2.0 acompañe a los binarios.
$noticesSource = Join-Path $repo 'docs/legal/THIRD_PARTY_NOTICES.md'
if (-not (Test-Path $noticesSource)) { throw "No existe $noticesSource" }
Copy-Item $noticesSource (Join-Path $stage 'THIRD_PARTY_NOTICES.md') -Force
$copied['THIRD_PARTY_NOTICES.md'] = $noticesSource
$licensesStage = Join-Path $stage 'licenses'
if (-not (Test-Path $licensesStage)) { New-Item -ItemType Directory -Path $licensesStage -Force | Out-Null }
foreach ($licenseName in @('sniffnet-LICENSE-MIT.txt', 'sniffnet-LICENSE-APACHE.txt')) {
  $licenseSource = Join-Path $repo "docs/legal/licenses/$licenseName"
  if (-not (Test-Path $licenseSource)) { throw "No existe $licenseSource" }
  Copy-Item $licenseSource (Join-Path $licensesStage $licenseName) -Force
  $copied["licenses/$licenseName"] = $licenseSource
}

if ($esWindows) {
  foreach ($f in @('install-agent.ps1', 'uninstall-agent.ps1', 'deploy-agent-service.ps1', 'instalar-sc-sentinel.bat', 'desinstalar-sc-sentinel.bat', 'abrir-gui.bat', 'LEEME-INSTALACION.txt')) {
    Copy-Item (Join-Path $repo "scripts/$f") (Join-Path $stage $f) -Force
    $copied[$f] = Join-Path $repo "scripts/$f"
  }
  # install-agent.ps1 carga su helper por ruta relativa (lib\agent-binpath.psm1)
  # y la actualizacion llama a deploy-agent-service.ps1 para el respaldo
  # verificado y el drenaje: los dos viajan en el paquete, si no el instalador
  # falla en la maquina del usuario y no en la release.
  $libStage = Join-Path $stage 'lib'
  if (-not (Test-Path $libStage)) { New-Item -ItemType Directory -Path $libStage -Force | Out-Null }
  $binpathHelper = Join-Path $repo 'scripts/lib/agent-binpath.psm1'
  if (-not (Test-Path $binpathHelper)) { throw "No existe $binpathHelper" }
  Copy-Item $binpathHelper (Join-Path $libStage 'agent-binpath.psm1') -Force
  $copied['lib/agent-binpath.psm1'] = $binpathHelper
  # install-agent.ps1 importa lib\config-toml.psm1 para no reescribir nunca un
  # config.toml existente y para respaldar antes de tocar ProgramData: sin el
  # modulo el instalador falla en la maquina del usuario.
  $configHelper = Join-Path $repo 'scripts/lib/config-toml.psm1'
  if (-not (Test-Path $configHelper)) { throw "No existe $configHelper" }
  Copy-Item $configHelper (Join-Path $libStage 'config-toml.psm1') -Force
  $copied['lib/config-toml.psm1'] = $configHelper
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
  # Cada target lleva su guia: el colector no necesita libpcap y el sensor si.
  # El runbook lleva la version de la release en una linea `VER=`. Se reescribe
  # aqui con la version real del artefacto para que el paquete nunca apunte a
  # una release antigua (y a la version rota).
  $guideName = if ($esSensor) { 'INSTALACION-LINUX-SENSOR.md' } else { 'INSTALACION-LINUX.md' }
  $runbookName = if ($esSensor) { 'install-agent-linux-sensor.md' } else { 'install-agent-linux.md' }
  $linuxGuide = Join-Path $stage $guideName
  $guideText = [System.IO.File]::ReadAllText((Join-Path $repo "docs/runbooks/$runbookName"))
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
Get-ChildItem $stage -File -Recurse | Where-Object {
  $textExt -contains $_.Extension.ToLowerInvariant() -and
  $_.Name -ne 'THIRD_PARTY_NOTICES.md'  # contiene la version del tercero (v1.5.1), no la de la release
} | ForEach-Object {
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
