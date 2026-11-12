<#
.SYNOPSIS
  Comprueba que los skills del proyecto son descubribles por OpenCode.
.DESCRIPTION
  OpenCode carga un skill desde un directorio que contenga un fichero llamado
  exactamente `SKILL.md`. El ID del skill es el nombre del directorio (no el
  campo `name` del frontmatter, que es solo una etiqueta visible) y el modelo
  solo recibe los skills que tienen `description`.

  Un skill puede "no funcionar" sin que nada falle de forma visible: si el
  directorio no esta en la rama activa, si el fichero se llama de otra forma,
  si le falta la descripcion o si el frontmatter marca `autoinvoke: false`,
  OpenCode simplemente no lo anuncia y el modelo nunca lo carga.

  Este script valida esas condiciones en `.opencode/skills` (skills de proyecto)
  y en `.agents/skills` (skills de compatibilidad).

  Uso: pwsh ./scripts/check-skills.ps1
.EXAMPLE
  pwsh ./scripts/check-skills.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path $RepoRoot).Path

# Fuentes que OpenCode discovers: proyecto (.opencode/skills) y compatibilidad
# (.agents/skills, .claude/skills). La precedencia de OpenCode es
# .agents/skills < .opencode/skills, de modo que un ID duplicado en las dos
# rutas lo resuelve el de .opencode.
$sources = @(
  @{ Path = '.opencode/skills'; Required = $true },
  @{ Path = '.agents/skills'; Required = $false }
)

$problems = @()
$warnings = @()
$total = 0

foreach ($source in $sources) {
  $root = Join-Path $repo $source.Path
  $label = $source.Path

  if (-not (Test-Path $root)) {
    if ($source.Required) {
      $problems += "$label no existe: OpenCode no puede descubrir ningun skill de proyecto"
    }
    else {
      Write-Host "-- $label no existe (opcional, se omite)"
    }
    continue
  }

  $dirs = @(Get-ChildItem -Path $root -Directory | Sort-Object Name)
  if ($dirs.Count -eq 0) {
    if ($source.Required) {
      $problems += "$label existe pero esta vacio: no hay ningun skill que descubrir"
    }
    continue
  }

  Write-Host "-- $label : $($dirs.Count) skill(s)"

  foreach ($dir in $dirs) {
    $total++
    $id = $dir.Name

    # El ID es el nombre del directorio: debe ser kebab-case para ser portable.
    if ($id -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $id.Length -gt 64) {
      $problems += "$label/$id : el ID debe ser kebab-case (^[a-z0-9]+(-[a-z0-9]+)*$) y de 64 caracteres como maximo"
    }

    $skillFile = Join-Path $dir.FullName 'SKILL.md'
    if (-not (Test-Path $skillFile)) {
      $problems += "$label/$id : falta SKILL.md (un directorio sin SKILL.md no es un skill)"
      continue
    }

    $lines = @(Get-Content -LiteralPath $skillFile)
    if ($lines.Count -lt 3 -or $lines[0].Trim() -ne '---') {
      $problems += "$label/$id : SKILL.md no empieza con frontmatter YAML (---)"
      continue
    }

    $end = -1
    for ($i = 1; $i -lt $lines.Count; $i++) {
      if ($lines[$i].Trim() -eq '---') { $end = $i; break }
    }
    if ($end -lt 0) {
      $problems += "$label/$id : el frontmatter no se cierra con ---"
      continue
    }

    $front = $lines[1..($end - 1)]

    $name = ''
    $description = ''
    $hidden = $false
    foreach ($line in $front) {
      if ($line -match '^\s*name\s*:\s*(.+?)\s*$') {
        $name = $Matches[1].Trim('"', "'")
      }
      elseif ($line -match '^\s*description\s*:\s*(.+?)\s*$') {
        $description = $Matches[1].Trim('"', "'")
      }
      elseif ($line -match '^\s*opencode/autoinvoke\s*:\s*false\s*$') {
        $hidden = $true
      }
      elseif ($line -match '^\s*disable-model-invocation\s*:\s*true\s*$') {
        $hidden = $true
      }
    }

    if (-not $name) {
      $problems += "$label/$id : el frontmatter no declara 'name'"
    }
    elseif ($name -ne $id) {
      # No es un error: `name` es la etiqueta visible. Avisamos por si confunde.
      $warnings += "$label/$id : el frontmatter declara name='$name' (el ID real es '$id')"
    }

    if (-not $description) {
      $problems += "$label/$id : el frontmatter no declara 'description' (sin ella OpenCode no anuncia el skill)"
    }

    if ($hidden) {
      $warnings += "$label/$id : esta oculto al modelo (autoinvoke: false / disable-model-invocation)"
    }
  }
}

Write-Host ''
if ($warnings) {
  foreach ($w in $warnings) { Write-Host "  [AVISO] $w" -ForegroundColor Yellow }
  Write-Host ''
}

if ($problems) {
  foreach ($p in $problems) { Write-Host "  [FALLO] $p" -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Corrige los skills indicados: mientras haya fallos, OpenCode no los anunciara al modelo.' -ForegroundColor Yellow
  exit 1
}

Write-Host "OK: $total skill(s) con SKILL.md, frontmatter valido, ID kebab-case y description." -ForegroundColor Green
exit 0
