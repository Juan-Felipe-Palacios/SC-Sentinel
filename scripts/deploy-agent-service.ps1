# Despliega o revierte el binario del agente SC-Sentinel-Agent con drenaje verificado.
#
# Requiere consola elevada (Administrador) salvo con -DryRun, que solo lee.
# No toca el binPath del servicio, no lo reinstala, no toca el registro ni ACLs y
# no borra nada de la carpeta de respaldo.
#
# Uso:
#   # Desplegar el binario recien compilado
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1
#
#   # Volver al binario anterior (el .bak guardado por el ultimo Deploy)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 -Mode Rollback
#
#   # Volver adelante despues de un rollback
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 `
#       -Mode Deploy -Source "$env:TEMP\sc-rollback-agent\sc-sentinel-agent.exe.new"
#
#   # Ensenar el plan sin tocar el servicio (funciona sin elevacion)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-agent-service.ps1 -DryRun
#
# Nota: los comandos elevados largos escritos en linea fallan en este equipo con
# "The elevated command never reported back"; este script va siempre en disco.

[CmdletBinding()]
param(
    [ValidateSet('Deploy', 'Rollback')]
    [string]$Mode = 'Deploy',
    [string]$Source = '',
    [string]$Target = 'C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe',
    [string]$Service = 'SC-Sentinel-Agent',
    [string]$BackupDir = (Join-Path $env:TEMP 'sc-rollback-agent'),
    [string]$LogPath = 'C:\ProgramData\SC-Sentinel\logs\agent.log',
    [int]$StopTimeoutSec = 45,
    [int]$StartTimeoutSec = 45,
    [int]$SyncTimeoutSec = 60,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $Source) { $Source = Join-Path $PSScriptRoot '..\agent\target\release\sc-sentinel-agent.exe' }

$BakPath = Join-Path $BackupDir 'sc-sentinel-agent.exe.bak'
$BakShaPath = "$BakPath.sha256"
$NewPath = Join-Path $BackupDir 'sc-sentinel-agent.exe.new'
$Stamp = Get-Date -Format 'yyyyMMddHHmmss'

function Get-Sha([string]$path) {
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}

function Get-Bytes([string]$path) {
    return (Get-Item -LiteralPath $path).Length
}

function Get-LogTail([int]$lines = 80) {
    if (-not (Test-Path -LiteralPath $LogPath)) { return @() }
    return @(Get-Content -LiteralPath $LogPath -Tail $lines -ErrorAction Stop)
}

function Get-LineStamp([string]$line) {
    $m = [regex]::Match($line, '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})')
    if (-not $m.Success) { return $null }
    return [datetime]::Parse(
        $m.Groups[1].Value + 'Z',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AdjustToUniversal
    )
}

function Show-State {
    $status = 'NO_EXISTE'
    try { $status = (Get-Service -Name $Service -ErrorAction Stop).Status } catch { }
    $sha = 'AUSENTE'
    if (Test-Path -LiteralPath $Target) { $sha = Get-Sha $Target }
    Write-Host "estado servicio : $status"
    Write-Host "sha instalado   : $sha"
}

function Wait-ServiceState([string]$want, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        Start-Sleep -Milliseconds 400
        $state = (Get-Service -Name $Service -ErrorAction SilentlyContinue).Status
    } while ("$state" -ne $want -and (Get-Date) -lt $deadline)
    return "$state"
}

function Wait-SpoolDrained([int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        foreach ($line in (Get-LogTail 40)) {
            if ($line -match 'spool_flushed' -and $line -match 'pending=0') { return $line }
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $null
}

function Wait-SyncAfter([datetime]$sinceUtc, [int]$seconds) {
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($seconds)
    do {
        foreach ($line in (Get-LogTail 60)) {
            if ($line -notmatch 'sync_confirmed') { continue }
            $stamp = Get-LineStamp $line
            if ($stamp -and $stamp -ge $sinceUtc) { return $line }
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date).ToUniversalTime() -lt $deadline)
    return $null
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

# ---------------------------------------------------------------- inventario
$shaInstalled = $null
$bytesInstalled = 0
if (Test-Path -LiteralPath $Target) {
    try {
        $shaInstalled = Get-Sha $Target
        $bytesInstalled = Get-Bytes $Target
    } catch {
        # Sin elevacion no se puede leer Program Files: DryRun lo informa.
        $shaInstalled = 'NO_LEGIBLE'
    }
}

$shaSource = $null
$bytesSource = 0
if (Test-Path -LiteralPath $Source) {
    try {
        $shaSource = Get-Sha $Source
        $bytesSource = Get-Bytes $Source
    } catch {
        $shaSource = 'NO_LEGIBLE'
    }
}

$logReadable = $false
$logLast = ''
if (Test-Path -LiteralPath $LogPath) {
    try {
        # La ultima linea fisica puede ser un fragmento sin marca: se informa la
        # ultima linea con timestamp, que es la que usan drenaje y sync.
        foreach ($line in (Get-LogTail 200)) {
            if (Get-LineStamp $line) {
                $logLast = $line
                if ($logLast.Length -gt 140) { $logLast = $logLast.Substring(0, 140) + '...' }
            }
        }
        $logReadable = $true
    } catch { $logReadable = $false }
}

$shaBakFile = $null
if (Test-Path -LiteralPath $BakShaPath) {
    $shaBakFile = ((Get-Content -LiteralPath $BakShaPath -TotalCount 1) -split '\s+')[0].Trim().ToUpper()
}
$shaBak = $null
if (Test-Path -LiteralPath $BakPath) {
    try { $shaBak = Get-Sha $BakPath } catch { $shaBak = 'NO_LEGIBLE' }
}

$rollbackCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode Rollback"

# El origen no puede ser el propio respaldo ni la copia para volver adelante:
# el Deploy los rota, y usarlos como origen confunde respaldo con binario nuevo.
$sourceFull = ''
if (Test-Path -LiteralPath $Source) { $sourceFull = (Resolve-Path -LiteralPath $Source).Path }
$artifactClash = $null
if ($Mode -eq 'Deploy' -and $sourceFull) {
    foreach ($candidate in @($BakPath, $NewPath)) {
        if ((Test-Path -LiteralPath $candidate) -and
            ((Resolve-Path -LiteralPath $candidate).Path -ieq $sourceFull)) {
            $artifactClash = $candidate
        }
    }
}

# ------------------------------------------------------------------- DryRun
if ($DryRun) {
    Write-Host "=== DryRun: $Mode (no se modifica nada) ==="
    Write-Host "elevado    : $(if ($isAdmin) { 'si' } else { 'no (la ejecucion real lo exige)' })"
    Write-Host "servicio   : $Service"
    Write-Host "instalado  : $Target"
    Write-Host "             sha=$shaInstalled bytes=$bytesInstalled"
    Write-Host "origen     : $Source"
    Write-Host "             sha=$shaSource bytes=$bytesSource"
    Write-Host "respaldo   : $BakPath"
    Write-Host "             sha=$shaBak sha_esperado=$shaBakFile"
    Write-Host "copia new  : $NewPath"
    Write-Host "log        : $LogPath legible=$(if ($logReadable) { 'si' } else { 'NO' })"
    if ($logLast) { Write-Host "             ultima: $logLast" }
    Write-Host ""

    $abort = $null
    if (-not (Test-Path -LiteralPath $Target)) {
        $abort = "ABORTA (11): no existe el binario instalado $Target"
        Write-Host "PASO 0 inventario"
        Write-Host "  -> $abort"
    } elseif (-not $logReadable) {
        $abort = "ABORTA (12): el log $LogPath no se puede leer; sin el no se verifica drenaje ni sync"
        Write-Host "PASO 0 inventario"
        Write-Host "  -> $abort"
    }

    if (-not $abort) {
        if ($Mode -eq 'Deploy') {
            if (-not (Test-Path -LiteralPath $Source)) {
                $abort = "ABORTA (10): no existe el binario de origen $Source"
            } elseif ($artifactClash) {
                $abort = "ABORTA (25): el origen es el propio artefacto de respaldo $artifactClash; compila el binario o apunta a la copia .new"
            } elseif ($shaSource -and $shaInstalled -and
                      $shaSource -ne 'NO_LEGIBLE' -and $shaInstalled -ne 'NO_LEGIBLE' -and
                      $shaSource -eq $shaInstalled) {
                Write-Host "PASO 0 inventario: sha origen == sha instalado ($shaInstalled)"
                Write-Host "  -> NADA QUE DESPLEGAR: saldria con codigo 0 sin parar el servicio"
                if (-not (Test-Path -LiteralPath $BakPath)) {
                    Write-Host "  -> aviso: no hay .bak; un rollback no estaria disponible"
                }
                Write-Host ""
                Write-Host 'VEREDICTO: no hay nada que desplegar'
                exit 0
            }

            if ($abort) {
                Write-Host ''
                Write-Host "VEREDICTO: la ejecucion real abortaria antes de tocar el servicio: $abort"
                exit 20
            }

            Write-Host "PASO 1 respaldo del instalado"
            Write-Host "  copiaria $Target -> $BakPath (sha=$shaInstalled)"
            if (Test-Path -LiteralPath $BakPath) {
                if ($shaBak -eq $shaInstalled) {
                    Write-Host "  .bak ya coincide con el instalado: se reutiliza"
                } else {
                    Write-Host "  .bak distinto (sha=$shaBak): se apartaria como .bak-$Stamp antes de pisarlo"
                }
            }
            Write-Host '  si falla -> ABORTA (13): no se pudo crear o verificar el respaldo'

            Write-Host "PASO 2 copia del nuevo y guia de ida y vuelta"
            Write-Host "  guardaria el origen como $NewPath (sha=$shaSource)"
            Write-Host '  si falla -> ABORTA (14): no se pudo preparar la copia para volver adelante'

            Write-Host "PASO 3 parada con drenaje (tope ${StopTimeoutSec}s)"
            Write-Host "  sc stop $Service; esperaria Stopped y 'spool_flushed pending=0'"
            Write-Host '  si falla -> ABORTA (15): el servicio no paro a tiempo'
            Write-Host '  si falla -> ABORTA (16): el drenaje no confirmo pending=0'

            Write-Host "PASO 4 copia, verificacion y arranque"
            Write-Host "  copiaria a $Target y exigiria sha=$shaSource"
            Write-Host '  si falla -> ABORTA (17): la copia no coincide con el origen (servicio detenido)'
            Write-Host "  sc start $Service; esperaria Running (tope ${StartTimeoutSec}s)"
            Write-Host '  si falla -> RESUMEN: binario nuevo instalado, servicio detenido + comando de rollback'
            Write-Host "  esperaria un sync_confirmed posterior al arranque (tope ${SyncTimeoutSec}s)"
            Write-Host '  si falla -> ABORTA (19): arranco pero sin sync confirmado'
        } else {
            if (-not (Test-Path -LiteralPath $BakPath)) {
                $abort = "ABORTA (20): no existe el respaldo $BakPath"
            } elseif (-not $shaBakFile) {
                $abort = "ABORTA (21): falta $BakShaPath; no se puede verificar el respaldo"
            } elseif ($shaBak -ne $shaBakFile) {
                $abort = "ABORTA (22): el .bak no coincide con su .sha256 (bak=$shaBak esperado=$shaBakFile)"
            }
            if ($abort) {
                Write-Host 'PASO 1 verificacion del respaldo'
                Write-Host "  -> $abort"
            } else {
                Write-Host "PASO 1 verificacion del respaldo"
                Write-Host "  .bak sha=$shaBak coincide con .sha256: continuaria"

                Write-Host "PASO 2 copia del binario actual antes de pisarlo"
                Write-Host "  guardaria $Target como $BackupDir\sc-sentinel-agent.exe.new-$Stamp (sha=$shaInstalled)"
                Write-Host '  si falla -> ABORTA (23): no se pudo guardar el binario actual'
                if (Test-Path -LiteralPath $NewPath) {
                    Write-Host "  $NewPath ya existe y no se toca (se usa la marca de tiempo)"
                }

                Write-Host "PASO 3 parada con drenaje (tope ${StopTimeoutSec}s)"
                Write-Host "  sc stop $Service; esperaria Stopped y 'spool_flushed pending=0'"
                Write-Host '  si falla -> ABORTA (15): el servicio no paro a tiempo'
                Write-Host '  si falla -> ABORTA (16): el drenaje no confirmo pending=0'

                Write-Host "PASO 4 restauracion, verificacion y arranque"
                Write-Host "  copiaria el .bak a $Target y exigiria sha=$shaBak"
                Write-Host '  si falla -> ABORTA (17): la copia no coincide con el respaldo (servicio detenido)'
                Write-Host "  sc start $Service; esperaria Running (tope ${StartTimeoutSec}s)"
                Write-Host '  si falla -> RESUMEN: binario restaurado instalado, servicio detenido + comando para volver adelante'
                Write-Host "  esperaria un sync_confirmed posterior al arranque (tope ${SyncTimeoutSec}s)"
                Write-Host '  si falla -> ABORTA (19): arranco pero sin sync confirmado'
            }
        }
    }

    Write-Host ""
    if ($abort) {
        Write-Host "VEREDICTO: la ejecucion real abortaria antes de tocar el servicio: $abort"
        exit 20
    }
    Write-Host "VEREDICTO: $Mode puede ejecutarse; ningun paso previo abortaria"
    if (-not $isAdmin) { Write-Host 'AVISO: la ejecucion real necesita consola elevada' }
    exit 0
}

# ------------------------------------------------------------------- ejecucion
if (-not $isAdmin) {
    Write-Host 'ABORTA (2): ejecuta este script en una consola elevada (Administrador).'
    exit 2
}
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

if (-not (Test-Path -LiteralPath $Target)) {
    Write-Host "ABORTA (11): no existe el binario instalado $Target"
    Show-State
    exit 11
}
if ($shaInstalled -eq 'NO_LEGIBLE') {
    Write-Host "ABORTA (24): no se puede leer el binario instalado $Target; usa una consola elevada"
    Show-State
    exit 24
}
if (-not $logReadable) {
    Write-Host "ABORTA (12): el log $LogPath no se puede leer; sin el no se verifica drenaje ni sync"
    Show-State
    exit 12
}

if ($Mode -eq 'Deploy') {
    if (-not (Test-Path -LiteralPath $Source)) {
        Write-Host "ABORTA (10): no existe el binario de origen $Source"
        Show-State
        exit 10
    }
    if ($artifactClash) {
        Write-Host "ABORTA (25): el origen es el propio artefacto de respaldo $artifactClash"
        Write-Host 'compila el binario (cargo build --release) o apunta a la copia .new'
        Show-State
        exit 25
    }
    if ($shaSource -eq $shaInstalled) {
        Write-Host "NADA QUE DESPLEGAR: el binario instalado ya es el de origen (sha=$shaInstalled)"
        if (-not (Test-Path -LiteralPath $BakPath)) {
            Write-Host 'aviso: no hay .bak; un rollback no estaria disponible hasta el proximo Deploy'
        }
        exit 0
    }

    # Paso 1: respaldo del instalado (sin pisar un .bak anterior distinto).
    if ((Test-Path -LiteralPath $BakPath) -and $shaBak -ne $shaInstalled) {
        $rotated = "$BakPath-$Stamp"
        Copy-Item -LiteralPath $BakPath -Destination $rotated -Force
        Write-Host "respaldo anterior apartado: $rotated (sha=$shaBak)"
    }
    if (-not (Test-Path -LiteralPath $BakPath) -or (Get-Sha $BakPath) -ne $shaInstalled) {
        Copy-Item -LiteralPath $Target -Destination $BakPath -Force
    }
    $shaBakNow = Get-Sha $BakPath
    if ($shaBakNow -ne $shaInstalled) {
        Write-Host "ABORTA (13): el respaldo no coincide con el instalado (bak=$shaBakNow esperado=$shaInstalled)"
        Show-State
        exit 13
    }
    [System.IO.File]::WriteAllText($BakShaPath, "$shaBakNow`r`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "respaldo   : $BakPath (sha=$shaBakNow)"

    # Paso 2: copia del nuevo para poder volver adelante tras un rollback.
    if ((Test-Path -LiteralPath $NewPath) -and (Get-Sha $NewPath) -ne $shaSource) {
        Copy-Item -LiteralPath $NewPath -Destination "$NewPath-$Stamp" -Force
    }
    Copy-Item -LiteralPath $Source -Destination $NewPath -Force
    if ((Get-Sha $NewPath) -ne $shaSource) {
        Write-Host 'ABORTA (14): la copia para volver adelante no coincide con el origen'
        Show-State
        exit 14
    }

    $shaTarget = $shaSource
    $bytesTarget = $bytesSource
    $artifactToInstall = $Source
    $what = 'nuevo'
    $forwardHint = ''
} else {
    # Rollback: el respaldo se verifica contra su .sha256 antes de tocar nada.
    if (-not (Test-Path -LiteralPath $BakPath)) {
        Write-Host "ABORTA (20): no existe el respaldo $BakPath"
        Show-State
        exit 20
    }
    if (-not $shaBakFile) {
        Write-Host "ABORTA (21): falta $BakShaPath; no se puede verificar el respaldo"
        Show-State
        exit 21
    }
    if ($shaBak -ne $shaBakFile) {
        Write-Host "ABORTA (22): el .bak no coincide con su .sha256 (bak=$shaBak esperado=$shaBakFile)"
        Show-State
        exit 22
    }
    Write-Host "respaldo   : $BakPath (sha=$shaBak verificado contra .sha256)"

    # Paso 2: guardar el binario actual con marca de tiempo, sin pisar el .new.
    $currentCopy = "$NewPath-$Stamp"
    Copy-Item -LiteralPath $Target -Destination $currentCopy -Force
    if ((Get-Sha $currentCopy) -ne $shaInstalled) {
        Write-Host "ABORTA (23): no se pudo guardar el binario actual en $currentCopy"
        Show-State
        exit 23
    }
    Write-Host "copia actual: $currentCopy (sha=$shaInstalled)"

    $shaTarget = $shaBak
    $bytesTarget = (Get-Bytes $BakPath)
    $artifactToInstall = $BakPath
    $what = 'restaurado'
    $forwardHint = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode Deploy -Source `"$currentCopy`""
}

Write-Host "sha antes  : $shaInstalled ($bytesInstalled bytes)"
Write-Host "sha destino: $shaTarget ($bytesTarget bytes)"

# Paso 3: parada con drenaje.
sc.exe stop $Service | Out-Null
$state = Wait-ServiceState 'Stopped' $StopTimeoutSec
if ($state -ne 'Stopped') {
    Write-Host "ABORTA (15): el servicio no paro en ${StopTimeoutSec}s (estado=$state); no se copio nada"
    Show-State
    exit 15
}
$drain = Wait-SpoolDrained 15
if (-not $drain) {
    Write-Host 'ABORTA (16): el drenaje no confirmo spool_flushed pending=0; no se copio nada'
    Show-State
    exit 16
}
Write-Host "drenaje    : $drain"

# Paso 4: copia verificada, arranque y sync.
Copy-Item -LiteralPath $artifactToInstall -Destination $Target -Force
$shaCopied = Get-Sha $Target
if ($shaCopied -ne $shaTarget) {
    Write-Host "ABORTA (17): la copia no coincide (copiado=$shaCopied esperado=$shaTarget); servicio detenido"
    Show-State
    exit 17
}

$startUtc = (Get-Date).ToUniversalTime()
sc.exe start $Service | Out-Null
$state = Wait-ServiceState 'Running' $StartTimeoutSec
if ($state -ne 'Running') {
    Write-Host "RESUMEN: binario $what instalado, servicio detenido (estado=$state)"
    Write-Host "sha instalado : $shaCopied"
    if ($Mode -eq 'Deploy') {
        Write-Host "rollback      : $rollbackCmd"
    } else {
        Write-Host "volver adelante: $forwardHint"
    }
    Show-State
    exit 18
}

$sync = Wait-SyncAfter $startUtc $SyncTimeoutSec
if (-not $sync) {
    Write-Host "ABORTA (19): el servicio arranco pero no hubo sync_confirmed en ${SyncTimeoutSec}s"
    Show-State
    Write-Host "log         : $LogPath"
    exit 19
}

Write-Host "servicio    : Running"
Write-Host "sha despues : $shaCopied"
Write-Host "sync        : $sync"
Write-Host "OK: $Mode completado ($what)."
exit 0
