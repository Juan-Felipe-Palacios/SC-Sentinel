#Requires -Version 5.1
<#
.SYNOPSIS
  Reglas de escritura de config.toml y respaldo verificado de datos.

.DESCRIPTION
  El instalador y la reparacion (estado 4, marcador sin servicio) pueden
  encontrar un config.toml ya existente: el cliente pudo cambiar el endpoint de
  ingesta, los puertos del colector, la privacidad o las rutas. Reescribirlo
  pierde esa configuracion sin aviso.

  Regla: si config.toml existe, NO se reescribe nunca. Si la configuracion
  generada difiere de la instalada, se escribe config.toml.nuevo al lado y se
  informa para que una persona decida. Antes de escribir o reemplazar cualquier
  archivo de ProgramData se deja un respaldo verificado (.bak-<marca> + .sha256)
  en ProgramData\SC-Sentinel\backup.

  Ninguna funcion imprime contenido de configuracion ni credenciales: solo rutas
  y hashes SHA256.
#>

$script:SystemSid = 'S-1-5-18'
$script:AdminsSid = 'S-1-5-32-544'

function Get-ScsFileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  # Hash propio en vez de Get-FileHash: en el powershell.exe 5.1 que lanza
  # NSIS el cmdlet no existe (run 45258353232: getFileHash=False) y el modulo
  # fallaba al escribir config.toml. FileShare.ReadWrite evita chocar con el
  # escaner de archivos.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      return ([System.BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sha.Dispose()
  }
}

function Get-ScsTextSha256 {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
  } finally {
    $sha.Dispose()
  }
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Write-ScsTextNoBom {
  param([Parameter(Mandatory = $true)][string]$Path, [AllowEmptyString()][string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

# Crea la carpeta de respaldo si falta, sin herencia y solo SYSTEM +
# Administradores (SIDs universales: no dependen del idioma de Windows).
#
# Si el proceso no esta elevado (pruebas Pester, desarrollo) no se toca la ACL:
# quitar la herencia sin tener los SIDs en el token dejaria la carpeta sin
# acceso ni para quien la creo. El instalador real siempre corre elevado y ahi
# si se aplica la ACL restringida.
function Initialize-ScsBackupDir {
  param([Parameter(Mandatory = $true)][string]$BackupDir)
  if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if ($isAdmin) {
    icacls $BackupDir /inheritance:r /grant "*${script:SystemSid}:(OI)(CI)F" /grant "*${script:AdminsSid}:(OI)(CI)F" 2>&1 | Out-Null
  }
  return (Test-Path -LiteralPath $BackupDir)
}

<#
.SYNOPSIS
  Copia un archivo de datos a la carpeta de respaldo y verifica la copia.
.DESCRIPTION
  Escribe <nombre>.bak-<marca de tiempo> y, al lado, su .sha256. Si el hash de
  la copia no coincide con el del original se borra la copia y se lanza un
  error: nunca se da por bueno un respaldo sin comprobarlo. Nunca sobrescribe un
  respaldo anterior (anade -1, -2... si la marca se repite).
#>
function Backup-ScsDataFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$BackupDir
  )

  $result = [pscustomobject]@{
    Path       = $Path
    BackupPath = ''
    Sha256     = ''
    Verified   = $false
  }
  if (-not (Test-Path -LiteralPath $Path)) { return $result }

  $sha = Get-ScsFileSha256 -Path $Path
  $result.Sha256 = $sha
  if (-not (Initialize-ScsBackupDir -BackupDir $BackupDir)) {
    throw "No se pudo preparar la carpeta de respaldo $BackupDir"
  }

  $stamp = Get-Date -Format 'yyyyMMddHHmmss'
  $name = Split-Path -Leaf $Path
  $target = Join-Path $BackupDir "$name.bak-$stamp"
  $n = 1
  while (Test-Path -LiteralPath $target) {
    $target = Join-Path $BackupDir "$name.bak-$stamp-$n"
    $n++
  }

  Copy-Item -LiteralPath $Path -Destination $target -Force
  $copied = Get-ScsFileSha256 -Path $target
  if ($copied -ne $sha) {
    Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    throw "El respaldo de $name no coincide con el original (copia $copied, original $sha)"
  }
  Write-ScsTextNoBom -Path "$target.sha256" -Text "$copied`r`n"
  $sidecar = ((Get-Content -LiteralPath "$target.sha256" -TotalCount 1) -split '\s+')[0].Trim().ToLowerInvariant()
  if ($sidecar -ne $sha) {
    throw "El .sha256 del respaldo de $name no coincide (lado $sidecar, original $sha)"
  }

  $result.BackupPath = $target
  $result.Verified = $true
  return $result
}

<#
.SYNOPSIS
  Crea config.toml solo si no existe; si existe, no la toca.
.DESCRIPTION
  Devuelve un objeto con Action:
    created               no habia config.toml y se escribio.
    preserved             ya habia config.toml y el contenido propuesto es
                          identico: no se toco nada (tampoco se respalda porque
                          no hubo cambio).
    preserved-and-proposed ya habia config.toml con otro contenido: se conserva
                          intacta, se respalda antes y la propuesta se deja en
                          config.toml.nuevo (+ .sha256) para revision humana.
#>
function Set-ScsConfigToml {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
    [Parameter(Mandatory = $true)][string]$BackupDir
  )

  $result = [pscustomobject]@{
    Action       = ''
    Path         = $Path
    Sha256       = ''
    BackupPath   = ''
    ProposalPath = ''
  }

  $existing = Get-ScsFileSha256 -Path $Path
  $proposed = Get-ScsTextSha256 -Text $Content

  if ($existing) {
    $result.Sha256 = $existing
    if ($existing -eq $proposed) {
      $result.Action = 'preserved'
      return $result
    }
    $backup = Backup-ScsDataFile -Path $Path -BackupDir $BackupDir
    $result.BackupPath = $backup.BackupPath
    $proposalPath = "$Path.nuevo"
    Write-ScsTextNoBom -Path $proposalPath -Text $Content
    $proposalSha = Get-ScsFileSha256 -Path $proposalPath
    if ($proposalSha -ne $proposed) {
      throw "La propuesta $proposalPath no coincide con el contenido generado (escrito $proposalSha, esperado $proposed)"
    }
    Write-ScsTextNoBom -Path "$proposalPath.sha256" -Text "$proposalSha`r`n"
    $result.Action = 'preserved-and-proposed'
    $result.ProposalPath = $proposalPath
    return $result
  }

  Write-ScsTextNoBom -Path $Path -Text $Content
  $written = Get-ScsFileSha256 -Path $Path
  if (-not $written) {
    throw "No se pudo escribir $Path"
  }
  if ($written -ne $proposed) {
    throw "El config.toml escrito no coincide con el generado (escrito $written, esperado $proposed)"
  }
  $result.Action = 'created'
  $result.Sha256 = $written
  return $result
}

Export-ModuleMember -Function Get-ScsFileSha256, Get-ScsTextSha256, Write-ScsTextNoBom,
  Initialize-ScsBackupDir, Backup-ScsDataFile, Set-ScsConfigToml
