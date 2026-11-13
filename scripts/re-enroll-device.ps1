#Requires -Version 5.1
<#
.SYNOPSIS
  Re-enrola el service SC-Sentinel-Agent con un device_id y un token nuevos.

.DESCRIPTION
  Cierra el bache de credenciales del agente instalado como service Windows
  (ADR-0010: enrollment manual desde el dashboard). Hace el ciclo completo:

    1. Valida los parámetros y comprueba que la consola es elevada.
    2. Detiene el service y espera a Stopped (el drenaje del pipeline está
       acotado a ~30 s por el propio agente).
    3. Escribe SC_INGEST_TOKEN y SC_SENTINEL_DEVICE_ID en el Environment del
       service (HKLM\\SYSTEM\\CurrentControlSet\\Services\\<service>), como
       REG_MULTI_SZ y conservando el resto de variables (SC_GEOIP_DB, ...).
       El token no se imprime nunca: solo su longitud.
    3b. Normaliza el binPath a modo colector (--config + --no-capture) si el
       service se instaló con --interface. Un servicio con captura live y
       colector a la vez usa dos fuentes sobre el mismo segmento; -KeepCapture
       desactiva esta normalización.
    4. Arranca el service y espera a Running.
    5. Vigila agent.log: exige al menos una ventana confirmada por el backend
       (evento sync_confirmed, solo lo produce un 2xx) y ninguna señal de
       re-enrolamiento (401/403) durante dos ciclos de agregación.

  Solo devuelve exit 0 si el agente publica de verdad. Códigos de salida:
    0 → el device publica con éxito
    1 → el service no arranca o no se observa publicación
    2 → parámetros inválidos o consola sin privilegios

.PARAMETER DeviceId
  Device id inscrito en el tenant (formato dev_...).

.PARAMETER IngestToken
  Token del device (formato sc_...). Se escribe en el Environment del service;
  no se registra en logs, ni en stdout, ni en config.toml.

.PARAMETER ServiceName
  Nombre del service. Por defecto SC-Sentinel-Agent.

.PARAMETER TimeoutSeconds
  Ventana de vigilancia del log tras arrancar. Por defecto 100 s (dos ciclos
  de ventana de 30 s más margen de reintento).

.PARAMETER SkipVerification
  No vigila el log. Solo se usa para diagnóstico; el resultado NO acredita que
  el device publique.

.PARAMETER KeepCapture
  No toca el binPath: conserva la captura live (--interface) tal cual. Por
  defecto el service queda en modo colector (--config + --no-capture), que es
  lo que exige `scripts/verify-agent.ps1` y la fuente exclusiva por segmento
  (docs/testing/pcap-vs-flow.md §7).

.EXAMPLE
  # Consola de PowerShell ejecutada como administrador
  .\\scripts\\re-enroll-device.ps1 -DeviceId dev_m5svc -IngestToken 'sc_dev_...'

.NOTES
  El token plaintext no se puede recuperar del backend (solo se guarda su
  SHA-256). Para re-enrolar hace falta un token vigente, rotado o emitido
  desde Dashboard → Configuración → Dispositivos enrolados.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DeviceId,

    [Parameter(Mandatory = $true)]
    [string]$IngestToken,

    [string]$ServiceName = 'SC-Sentinel-Agent',

    [int]$TimeoutSeconds = 100,

    [switch]$SkipVerification,

    [switch]$KeepCapture
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ServiceRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$DataDir = 'C:\ProgramData\SC-Sentinel'
$ConfigFile = Join-Path $DataDir 'config\config.toml'
$DefaultLogPath = Join-Path $DataDir 'logs\agent.log'
# Dos ciclos de 30 s: el criterio de "sin re-enrolamiento en los siguientes
# dos ciclos" sale de la ventana de agregación, no del tick de sync (1 s).
$TwoCyclesSeconds = 70

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host "  [ OK ] $Text" -ForegroundColor Green
}

function Write-Warn2([string]$Text) {
    Write-Host "  [AVISO] $Text" -ForegroundColor Yellow
}

function Fail([string]$Text, [int]$Code = 1) {
    Write-Host "  [FALLO] $Text" -ForegroundColor Red
    exit $Code
}

# --- 0. Privilegios -------------------------------------------------------
# Sin elevation no se puede escribir el Environment del service ni controlarlo.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host 'Este script necesita una consola elevada.' -ForegroundColor Red
    Write-Host 'Abre PowerShell con "Ejecutar como administrador" y vuelve a ejecutarlo.' -ForegroundColor Yellow
    exit 2
}

# --- 1. Validación de parámetros -----------------------------------------
Write-Step 'Validando parámetros'

$DeviceId = $DeviceId.Trim()
if ($DeviceId -notmatch '^dev_[A-Za-z0-9][A-Za-z0-9_\-]{2,}$') {
    Fail "el device id '$DeviceId' no tiene el formato dev_<id> del dashboard." 2
}
# El token viaja como bearer plano: se validan longitud y prefijo, pero nunca
# se imprime su valor.
$IngestToken = $IngestToken.Trim()
if ($IngestToken.Length -lt 20) {
    Fail ("el token tiene {0} caracteres; un token de device ronda los 43. Revisa el valor." -f $IngestToken.Length) 2
}
if ($IngestToken -notmatch '^sc_') {
    Write-Warn2 "el token no empieza por 'sc_': ¿seguro que es el del device y no otro secreto?"
}
Write-Ok ("device id: {0} · token: {1} caracteres (oculto)" -f $DeviceId, $IngestToken.Length)

# --- 2. Precondiciones de la instalación ---------------------------------
Write-Step 'Comprobando la instalación del service'

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Fail "el service '$ServiceName' no está instalado en este equipo." 2
}
if (-not (Test-Path $ServiceRegPath)) {
    Fail "no existe la clave del service en el registro: $ServiceRegPath" 2
}

# Ruta del log: la del config.toml si existe, si no la de la instalación.
$LogPath = $DefaultLogPath
if (Test-Path $ConfigFile) {
    try {
        $configText = Get-Content -Path $ConfigFile -Raw
        if ($configText -match '(?m)^\s*file\s*=\s*"([^"]+)"') {
            $LogPath = $Matches[1]
        }
    } catch {
        Write-Warn2 "no se pudo leer $ConfigFile; se usa el log por defecto."
    }
}
Write-Ok ("service instalado · estado actual: {0}" -f $service.Status)
Write-Host "  log vigilado: $LogPath" -ForegroundColor DarkGray

# --- 3. Detener el service ------------------------------------------------
Write-Step 'Deteniendo el service (drenaje acotado)'

if ($service.Status -ne 'Stopped') {
    # sc.exe localiza sus mensajes; el estado se confirma con Get-Service.
    sc.exe stop $ServiceName | Out-Null
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Service -Name $ServiceName).Status -ne 'Stopped') {
        if ((Get-Date) -gt $deadline) {
            Fail 'el service no llegó a Stopped en 120 s. Revisa el log antes de reintentar.'
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Ok 'service detenido'
} else {
    Write-Ok 'el service ya estaba detenido'
}

# Posición del log antes de arrancar: solo interesa lo que escriba el proceso
# nuevo, no los 401/403 anteriores.
$script:LogOffset = 0
if (Test-Path $LogPath) {
    try {
        $script:LogOffset = (Get-Item -Path $LogPath).Length
    } catch {
        $script:LogOffset = 0
    }
}

# --- 3b. Modo del service (colector) -------------------------------------
# `verify-agent.ps1` exige `--config` + `--no-capture`. Un service instalado
# con `--interface` captura en vivo y ademas escucha el colector: dos fuentes
# sobre el mismo segmento (docs/testing/pcap-vs-flow.md §7). Se normaliza para
# que el re-enrolamiento deje el service como lo espera el verificador.
if (-not $KeepCapture) {
    Write-Step 'Comprobando el modo del service (colector)'

    $imagePath = (Get-ItemProperty -Path $ServiceRegPath -Name 'ImagePath' -ErrorAction SilentlyContinue).ImagePath
    $exe = $null
    if ($imagePath -match '^\s*"?([^"]+?\.exe)"?(\s|$)') { $exe = $Matches[1] }

    if ($exe) {
        $configArg = $ConfigFile
        if ($imagePath -match '--config\s+"([^"]+)"') { $configArg = $Matches[1] }
        elseif ($imagePath -match '--config\s+(\S+)') { $configArg = $Matches[1] }

        $desired = '"{0}" --config "{1}" --no-capture' -f $exe, $configArg
        if ($imagePath.Trim() -ne $desired) {
            New-ItemProperty -Path $ServiceRegPath -Name 'ImagePath' -Value $desired -PropertyType ExpandString -Force | Out-Null
            $readBack = (Get-ItemProperty -Path $ServiceRegPath -Name 'ImagePath').ImagePath
            if ($readBack.Trim() -ne $desired) {
                Fail 'no se pudo normalizar el binPath del service.'
            }
            if ($imagePath -match '--interface') {
                Write-Warn2 'se quitó --interface: captura live desactivada (fuente exclusiva: colector).'
            }
            Write-Ok ('binPath en modo colector: --config "{0}" --no-capture' -f $configArg)
        } else {
            Write-Ok 'binPath ya en modo colector (--config + --no-capture)'
        }
    } else {
        Write-Warn2 'no se pudo leer el binPath del service; se deja como estaba.'
    }
}

# --- 4. Escribir el Environment del service ------------------------------
Write-Step 'Actualizando el Environment del service (registro)'

$existing = @()
try {
    $existing = @((Get-ItemProperty -Path $ServiceRegPath -Name 'Environment' -ErrorAction Stop).Environment)
} catch {
    $existing = @()
}
$existing = @($existing | Where-Object { $_ -and ($_ -notmatch '^\s*(SC_INGEST_TOKEN|SC_SENTINEL_DEVICE_ID)\s*=') })

# REG_MULTI_SZ: se conserva lo que ya estaba (p. ej. SC_GEOIP_DB) y se
# reemplazan solo las dos claves de credenciales.
$newValue = @($existing) + @(
    "SC_INGEST_TOKEN=$IngestToken",
    "SC_SENTINEL_DEVICE_ID=$DeviceId"
)
New-ItemProperty -Path $ServiceRegPath -Name 'Environment' -Value $newValue -PropertyType MultiString -Force | Out-Null

# Verificación de lectura: las dos claves presentes y ninguna duplicada.
$written = @((Get-ItemProperty -Path $ServiceRegPath -Name 'Environment').Environment)
$tokenCount = @($written | Where-Object { $_ -like 'SC_INGEST_TOKEN=*' }).Count
$deviceCount = @($written | Where-Object { $_ -like 'SC_SENTINEL_DEVICE_ID=*' }).Count
$deviceWritten = @($written | Where-Object { $_ -like 'SC_SENTINEL_DEVICE_ID=*' })[0]
if ($tokenCount -ne 1 -or $deviceCount -ne 1) {
    Fail "el Environment quedó inconsistente (SC_INGEST_TOKEN x$tokenCount, SC_SENTINEL_DEVICE_ID x$deviceCount)."
}
if ($deviceWritten -ne "SC_SENTINEL_DEVICE_ID=$DeviceId") {
    Fail 'el device_id leído del registro no coincide con el que se escribió.'
}
Write-Ok ("Environment actualizado: {0} variable(s) en total, device {1}" -f $written.Count, $DeviceId)

# --- 5. Arrancar el service ----------------------------------------------
Write-Step 'Arrancando el service'

sc.exe start $ServiceName | Out-Null
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Service -Name $ServiceName).Status -ne 'Running') {
    if ((Get-Date) -gt $deadline) {
        Fail 'el service no llegó a Running en 60 s. Revisa el log antes de reintentar.'
    }
    Start-Sleep -Milliseconds 500
}
$agentProc = @(Get-CimInstance Win32_Process -Filter "Name='sc-sentinel-agent.exe'" -ErrorAction SilentlyContinue |
    Select-Object -First 1)
if ($agentProc.Count -gt 0) {
    Write-Ok ("service RUNNING (PID {0})" -f $agentProc[0].ProcessId)
} else {
    Write-Ok 'service RUNNING'
}

if ($SkipVerification) {
    Write-Warn2 '-SkipVerification: no se comprobó que el device publique. Esto no acredita el re-enrolamiento.'
    exit 1
}

# --- 6. Vigilar el log ----------------------------------------------------
Write-Step 'Vigilando agent.log (publicación real)'

function Get-LogDelta {
    # Lectura con FileShare.ReadWrite: el service mantiene el archivo abierto.
    if (-not (Test-Path $LogPath)) { return '' }
    try {
        $stream = [System.IO.File]::Open(
            $LogPath,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
    } catch {
        return ''
    }
    try {
        $length = $stream.Length
        if ($length -lt $script:LogOffset) { $script:LogOffset = 0 }  # log rotado o truncado
        $null = $stream.Seek($script:LogOffset, [System.IO.SeekOrigin]::Begin)
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        $text = $reader.ReadToEnd()
        $script:LogOffset = $stream.Position
        return $text
    } finally {
        $stream.Close()
    }
}

$started = Get-Date
$deadline = $started.AddSeconds($TimeoutSeconds)
$confirmed = @()
$authErrors = @()
$retained = @()

while ((Get-Date) -lt $deadline) {
    $delta = Get-LogDelta
    if ($delta) {
        foreach ($line in ($delta -split "`r?`n")) {
            if ($line -match 'sync_confirmed') { $confirmed += $line }
            elseif ($line -match '401/403|necesita enrolarse') { $authErrors += $line }
            elseif ($line -match 'batch retenido para reintento') { $retained += $line }
        }
    }
    # Un 401/403 con el token nuevo es terminal: no hace falta esperar el resto.
    if ($authErrors.Count -gt 0) { break }
    # Con una ventana confirmada y dos ciclos cubiertos, el criterio está cumplido.
    if ($confirmed.Count -gt 0 -and ((Get-Date) - $started).TotalSeconds -ge $TwoCyclesSeconds) { break }
    Start-Sleep -Seconds 2
}

$elapsed = [int]((Get-Date) - $started).TotalSeconds
$serviceNow = (Get-Service -Name $ServiceName).Status

if ($serviceNow -ne 'Running') {
    Fail "el service quedó en estado $serviceNow durante la vigilancia."
}

if ($authErrors.Count -gt 0) {
    Fail @"
el backend siguió rechazando las credenciales (401/403). Causas típicas:
  - el device_id no es el dueño del token;
  - el token se rotó o el device se eliminó desde el dashboard;
  - el token no es el plaintext completo.

Primera línea del log:
  $($authErrors[0])
"@
}

if ($confirmed.Count -eq 0) {
    Fail @"
sin publicación confirmada en $elapsed s: el log no registra ninguna ventana
aceptada por el backend (sync_confirmed). El service está Running y sin 401/403,
así que las credenciales parecen válidas, pero no llegó tráfico nuevo al
colector. Envía tráfico al colector o repite con -TimeoutSeconds mayor.
"@
}

Write-Ok ("{0} ventana(s) aceptada(s) por el backend en {1} s" -f $confirmed.Count, $elapsed)
if ($retained.Count -gt 0) {
    Write-Warn2 ("{0} batch(es) retenidos para reintento: el backend sigue con backoff." -f $retained.Count)
}

Write-Host "`nRe-enrolamiento completado. El spool pendiente se drena a ~60 req/min (ADR-0011)." -ForegroundColor Green
Write-Host "  Última confirmación: $($confirmed[-1])" -ForegroundColor DarkGray
exit 0
