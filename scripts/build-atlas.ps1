# scripts/build-atlas.ps1 — regenera docs/atlas.html + docs/atlas.pdf
# Requiere: pandoc en PATH, Chrome en la ruta estándar.
# Uso: pwsh ./scripts/build-atlas.ps1  (desde la raíz del repo)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$docs = Join-Path $root 'docs'

# 1. Selección y orden de documentos (README primero, luego secciones curadas;
#    cualquier otro .md cae al final en orden alfabético).
$prioridad = @(
  'docs\README.md',
  'docs\superpowers\specs\*',
  'docs\superpowers\plans\*',
  'docs\rfc\*',
  'docs\adr\*',
  'docs\contracts\*',
  'docs\runbooks\*',
  'docs\testing\*',
  'docs\release\*',
  'docs\operations\*',
  'docs\architecture\*',
  'docs\reference\*',
  'docs\governance\*',
  'docs\security\*',
  'docs\legal\*',
  'docs\ux\*',
  'docs\diagrams\*'
)
$elegidos = [System.Collections.Generic.List[string]]::new()
$usados = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($patron in $prioridad) {
  $rutas = Get-ChildItem -Path (Join-Path $docs $patron) -Filter *.md -File -ErrorAction SilentlyContinue |
    Sort-Object FullName
  foreach ($r in $rutas) {
    $full = $r.FullName
    if (-not $usados.Contains($full)) {
      [void]$usados.Add($full)
      $elegidos.Add($full)
    }
  }
}
Get-ChildItem $docs -Recurse -Filter *.md -File |
  # La evidencia (docs/evidence) queda fuera del atlas: son bitacoras de
  # corridas, no documentacion, y no se versionan.
  Where-Object { -not $usados.Contains($_.FullName) -and $_.FullName -notmatch '\\diagrams\\exports\\' -and $_.FullName -notmatch '[\\/]evidence[\\/]' } |
  Sort-Object FullName |
  ForEach-Object { $elegidos.Add($_.FullName) }

if ($elegidos.Count -eq 0) { throw 'No se encontraron .md en docs/' }
Write-Host ("Docs incluidos: {0}" -f $elegidos.Count)

# 2. pandoc → HTML (standalone + TOC). Se ejecuta dentro de docs/ para que las
#    rutas de imágenes (SVG) queden relativas y Chrome las resuelva al imprimir.
Push-Location $docs
try {
  pandoc -s --toc --toc-depth=3 -t html5 --metadata title='SC-Sentinel - Atlas de documentación' `
    -o atlas.html @elegidos
  if ($LASTEXITCODE -ne 0) { throw "pandoc salió con código $LASTEXITCODE" }

  # 3. Forzar A4 en impresión (Chrome headless usa @page para el tamaño).
  $html = Get-Content atlas.html -Raw
  if ($html -notmatch '@page') {
    $html = $html.Replace('@media print', "@page { size: A4; margin: 16mm 14mm; }`n@media print")
    Set-Content atlas.html -Value $html -Encoding UTF8 -NoNewline
  }
}
finally { Pop-Location }

# 4. Chrome headless → PDF A4 (perfil temporal para no chocar con instancias abiertas).
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { throw "Chrome no encontrado en $chrome" }
$pdfDest = Join-Path $docs 'atlas.pdf'
if (Test-Path $pdfDest) { Remove-Item $pdfDest -Force }
$uri = ([System.Uri]($pdfDest -replace '\.pdf$', '.html')).AbsoluteUri
& $chrome --headless --disable-gpu --no-pdf-header-footer `
  --user-data-dir="$env:TEMP\sc-atlas-chrome" `
  --print-to-pdf="$pdfDest" $uri 2>$null | Out-Null
if (-not (Test-Path $pdfDest)) { throw 'atlas.pdf no se generó' }
Write-Host 'atlas.html y atlas.pdf regenerados.'
