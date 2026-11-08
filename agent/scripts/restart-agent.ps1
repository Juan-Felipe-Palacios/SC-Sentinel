#Requires -Version 5.1
<#
.SYNOPSIS
  Recompila y reinicia el agente SC-Sentinel con captura live en Windows.

.DESCRIPTION
  Hace el ciclo completo sin pasos manuales:
    1. Resuelve el device id (parámetro, config/.device-id o SC_SENTINEL_DEVICE_ID)
       y el token del device desde config/.device-token (nunca por línea de comandos).
    2. Detiene cualquier sc-sentinel-agent.exe compilado en este árbol (libera el .exe
       antes de recompilar).
    3. Asegura el Npcap SDK en .tools/npcap-sdk (lo descarga si falta) y compila
       con la feature sc-capture/live.
    4. Detecta la interfaz de captura siguiendo la ruta por defecto
       (0.0.0.0/0) hasta el adaptador y su GUID de Npcap.
    5. Arranca el agente en segundo plano con logs en logs/ y verifica que siga
       vivo y sincronizando.

.PARAMETER DeviceId
  Device id inscrito en el tenant (dev_<uuid>). Si se indica, queda guardado en
  config/.device-id para los próximos arranques.

.PARAMETER InterfaceName
  Nombre del adaptador a capturar (p. ej. 'Wi-Fi', 'Ethernet'). Por defecto se
  elige el adaptador de la ruta por defecto.

.PARAMETER Interface
  Nombre Npcap exacto (\Device\NPF_{GUID}). Omite la detección automática.

.PARAMETER TokenFile
  Ruta al archivo con el token del device. Por defecto config/.device-token.

.PARAMETER SkipBuild
  No recompila: solo reinicia el binario existente.

.PARAMETER NoVerify
  No espera a comprobar que el proceso siga vivo y sincronizando.

.PARAMETER WaitSeconds
  Segundos extra de vigilancia tras el arranque (0 = solo la verificación corta).

.EXAMPLE
  .\scripts\restart-agent.ps1 -DeviceId dev_bee8a7f6-8191-47ef-9dc2-f1ef3a9d7636

.EXAMPLE
  .\scripts\restart-agent.ps1 -InterfaceName 'Ethernet'

.EXAMPLE
  .\scripts\restart-agent.ps1 -SkipBuild -WaitSeconds 40
#>
[CmdletBinding()]
param(
    [string]$DeviceId,
    [string]$InterfaceName,
    [string]$Interface,
    [string]$TokenFile,
    [switch]$SkipBuild,
    [switch]$NoVerify,
    [int]$WaitSeconds = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $Root 'target\release\sc-sentinel-agent.exe'
$ConfigPath = Join-Path $Root 'config\sc-agent.toml'
$ConfigSample = Join-Path $Root 'config\sc-agent.toml.sample'
$DeviceIdFile = Join-Path $Root 'config\.device-id'
$SdkDir = Join-Path $Root '.tools\npcap-sdk'
$LogDir = Join-Path $Root 'logs'

if (-not $TokenFile) { $TokenFile = Join-Path $Root 'config\.device-token' }

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Fail([string]$Text) {
    throw "sc-sentinel-agent: $Text"
}

# --- 1. Device id ---------------------------------------------------------
Write-Step 'Device id'
if ($DeviceId) {
    $DeviceId = $DeviceId.Trim()
    Set-Content -Path $DeviceIdFile -Value $DeviceId -Encoding ASCII
    Write-Host "  usando -DeviceId y guardándolo en config\.device-id"
} elseif (Test-Path $DeviceIdFile) {
    $DeviceId = (Get-Content -Path $DeviceIdFile -Raw).Trim()
    Write-Host "  leído de config\.device-id"
} elseif ($env:SC_SENTINEL_DEVICE_ID) {
    $DeviceId = $env:SC_SENTINEL_DEVICE_ID.Trim()
    Write-Host '  leído de SC_SENTINEL_DEVICE_ID'
} else {
    Fail @'
falta el device id. Pásalo una vez y quedará guardado:

  .\scripts\restart-agent.ps1 -DeviceId dev_<uuid>

El id sale de la tabla `devices` del dashboard (formato dev_<uuid>).
'@
}
if ($DeviceId -notmatch '^dev_[0-9a-fA-F\-]{8,}$') {
    Write-Warning "el device id '$DeviceId' no parece un dev_<uuid> del dashboard."
}
Write-Host "  device id: $DeviceId"

# --- 2. Token -------------------------------------------------------------
Write-Step 'Token del device'
if (-not (Test-Path $TokenFile)) {
    Fail @"
no existe $TokenFile. El agente necesita el token del device en SC_INGEST_TOKEN.

  - Enrola/rota el device desde el dashboard.
  - Guarda el token en config\.device-token (una sola línea, sin comillas) y vuelve a ejecutar.
"@
}
$Token = (Get-Content -Path $TokenFile -Raw).Trim()
if (-not $Token) { Fail "el archivo $TokenFile está vacío." }
if ($Token -notmatch '^sc_') {
    Write-Warning "el token de $TokenFile no empieza por 'sc_'; ¿seguro que es el del device?"
}
# Nunca se imprime el token: solo su longitud.
Write-Host ("  token cargado ({0} caracteres, oculto)" -f $Token.Length)

# --- 3. Detener instancias en ejecución -----------------------------------
Write-Step 'Deteniendo instancias del agente'
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'sc-sentinel-agent.exe'" -ErrorAction SilentlyContinue)
$stopped = 0
$blocked = @()
foreach ($proc in $running) {
    $path = $proc.ExecutablePath
    # Sin ruta legible el proceso corre con más privilegios que esta consola:
    # se intenta parar igual, porque dos agentes sobre el mismo device duplican ventanas.
    if (-not $path) {
        Write-Host "  PID $($proc.ProcessId) no expone su ruta (corre como administrador); intentando detenerlo"
    }
    if ((-not $path) -or ($path -ieq $ExePath)) {
        if ($path -and ($path -ieq $ExePath)) {
            Write-Host "  deteniendo PID $($proc.ProcessId) (árbol del proyecto)"
        }
        # Primero un cierre suave; si el proceso no atiende la señal, se fuerza.
        # (`taskkill` escribe en stderr incluso sin error: se captura para no abortar.)
        $softErrorPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $taskkillOutput = & taskkill.exe /PID $proc.ProcessId 2>&1
        $ErrorActionPreference = $softErrorPreference
        if ($taskkillOutput -match 'no se pudo|ERROR|Error') {
            Write-Verbose ($taskkillOutput -join ' ')
        }
        for ($i = 0; $i -lt 20; $i++) {
            if (-not (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 250
        }
        if (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                Write-Host "  PID $($proc.ProcessId) terminado a la fuerza (se pierde la ventana en curso, <30 s; el spool pendiente se envía al arrancar)"
            } catch {
                $blocked += $proc.ProcessId
            }
        }
        $stopped++
    } else {
        Write-Warning "PID $($proc.ProcessId) es sc-sentinel-agent.exe desde '$path'; no lo toco (no es este árbol)."
    }
}
if ($blocked.Count -gt 0) {
    Fail @"
quedó una instancia viva: PID $($blocked -join ', ') (acceso denegado, corre como administrador).

Dos agentes sobre el mismo device duplican las ventanas en el dashboard, así que no arranco otro.
Cierra esa instancia y vuelve a ejecutar:

  abre PowerShell como administrador  ->  Stop-Process -Id $($blocked -join ',') -Force

"@
}
if ($stopped -eq 0) { Write-Host '  no había ninguna instancia de este árbol corriendo' }

# --- 4. Compilar ----------------------------------------------------------
if (-not $SkipBuild) {
    Write-Step 'Compilando con captura live'
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Fail 'cargo no está en PATH. Instala Rust o añade %USERPROFILE%\.cargo\bin al PATH.'
    }

    $LibDir = Join-Path $SdkDir 'Lib\x64'
    if (-not (Test-Path (Join-Path $LibDir 'wpcap.lib'))) {
        Write-Host '  Npcap SDK no encontrado: descargando en .tools\npcap-sdk'
        New-Item -ItemType Directory -Force -Path (Join-Path $Root '.tools') | Out-Null
        $zip = Join-Path $Root '.tools\npcap-sdk.zip'
        Invoke-WebRequest -Uri 'https://npcap.com/dist/npcap-sdk-1.13.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -Force -Path $zip -DestinationPath $SdkDir
        Remove-Item -Path $zip -Force
        if (-not (Test-Path (Join-Path $LibDir 'wpcap.lib'))) {
            Fail "el SDK descargado no contiene Lib\x64\wpcap.lib en $SdkDir"
        }
    }

    # LIBPCAP_VER evita que el build script intente deducir la versión leyendo wpcap.dll.
    $env:LIBPCAP_VER = '1.0.0'
    $env:LIBPCAP_LIBDIR = $LibDir

    Push-Location $Root
    try {
        & cargo build --release -p sc-agent --features sc-capture/live
        if ($LASTEXITCODE -ne 0) { Fail "cargo build falló (código $LASTEXITCODE). Revisa la salida de arriba." }
    } finally {
        Pop-Location
    }
} else {
    Write-Step 'Compilación omitida (-SkipBuild)'
}

if (-not (Test-Path $ExePath)) { Fail "no existe $ExePath; ejecuta sin -SkipBuild." }

# El runtime de Npcap no se puede instalar en silencio: solo se avisa.
if (-not (Test-Path 'C:\Windows\System32\Npcap\wpcap.dll')) {
    Write-Warning 'no encuentro el runtime de Npcap (C:\Windows\System32\Npcap\wpcap.dll). Instálalo desde https://npcap.com/#download antes de capturar.'
}

# --- 5. Detectar la interfaz ---------------------------------------------
Write-Step 'Detectando interfaz de captura'

# Los comandos nativos escriben en stderr con normalidad; se captura sin abortar.
$natErr = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$listed = @(& $ExePath --list-interfaces 2>&1)
$listCode = $LASTEXITCODE
$ErrorActionPreference = $natErr
if ($listCode -ne 0) { Fail "no se pudieron listar las interfaces:`n$($listed -join "`n")" }

$devices = @()
foreach ($line in $listed) {
    $text = "$line".Trim()
    if ($text -match '^(\\Device\\NPF_\{[0-9A-Fa-f\-]+\})\s*(?:\((.*)\))?$') {
        $desc = ''
        if ($Matches.ContainsKey(2) -and $Matches[2]) { $desc = $Matches[2] }
        $devices += [pscustomobject]@{ Name = $Matches[1]; Description = $desc }
    }
}
if ($devices.Count -eq 0) { Fail "sc-sentinel-agent --list-interfaces no devolvió dispositivos Npcap:`n$($listed -join "`n")" }

$chosen = $null
$chosenAdapter = $null
if ($Interface) {
    $match = $devices | Where-Object { $_.Name -ieq $Interface } | Select-Object -First 1
    if (-not $match) { Fail "la interfaz '$Interface' no está en --list-interfaces. Opciones:`n$($devices | ForEach-Object { "  $($_.Name) ($($_.Description))" } | Out-String)" }
    $chosen = $match
    Write-Host '  interfaz forzada con -Interface'
} else {
    $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric)
    foreach ($route in $routes) {
        $adapter = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
        if (-not $adapter) { continue }
        if ($InterfaceName -and ($adapter.Name -ine $InterfaceName)) { continue }

        $byGuid = $null
        if ($adapter.InterfaceGuid) {
            $expected = '\Device\NPF_' + $adapter.InterfaceGuid.ToUpper()
            $byGuid = $devices | Where-Object { $_.Name -ieq $expected } | Select-Object -First 1
        }
        if (-not $byGuid -and $adapter.InterfaceDescription) {
            $byGuid = $devices | Where-Object { $_.Description -and ($_.Description -like "*$($adapter.InterfaceDescription)*") } | Select-Object -First 1
        }
        if ($byGuid) {
            $chosen = $byGuid
            $chosenAdapter = $adapter
            Write-Host ("  por ruta por defecto: adaptador '{0}' ({1})" -f $adapter.Name, $adapter.InterfaceDescription)
            break
        }
    }
    if (-not $chosen -and $InterfaceName) {
        Fail "ningún adaptador de la ruta por defecto se llama '$InterfaceName'. Usa -Interface con un nombre exacto de --list-interfaces."
    }
    if (-not $chosen) { Fail "no pude emparejar la ruta por defecto con un dispositivo Npcap. Usa -Interface `$Interface con uno de:`n$($devices | ForEach-Object { "  $($_.Name) ($($_.Description))" } | Out-String)" }
}

# IPv4 de la interfaz elegida: sirve para avisar si el parser no tendría nada que atribuir.
if (-not $chosenAdapter) {
    $chosenAdapter = Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object { ('\Device\NPF_' + $_.InterfaceGuid.ToUpper()) -ieq $chosen.Name } |
        Select-Object -First 1
}
$ifaceIps = @()
if ($chosenAdapter) {
    $ifaceIps = @(Get-NetIPAddress -InterfaceIndex $chosenAdapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        ForEach-Object { $_.IPAddress })
}
Write-Host "  interfaz: $($chosen.Name)"
if ($chosen.Description) { Write-Host "  descripción: $($chosen.Description)" }
if ($ifaceIps.Count -gt 0) { Write-Host "  IPv4 locales: $($ifaceIps -join ', ')" } else { Write-Warning '  la interfaz no reporta IPv4: el parser descartará todo el tráfico.' }

# --- 6. Config ------------------------------------------------------------
if (-not (Test-Path $ConfigPath)) {
    if (Test-Path $ConfigSample) {
        Copy-Item -Path $ConfigSample -Destination $ConfigPath
        Write-Host "`n  config\sc-agent.toml no existía: copiado desde el .sample"
    } else {
        Fail "no existe $ConfigPath"
    }
}

# --- 7. Arrancar ----------------------------------------------------------
Write-Step 'Arrancando el agente'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $LogDir "sc-agent-$stamp.out.log"
$errLog = Join-Path $LogDir "sc-agent-$stamp.err.log"

$env:SC_INGEST_TOKEN = $Token
$agentArgs = @(
    '--device-id', $DeviceId,
    '--interface', $chosen.Name,
    '--config', $ConfigPath
)

$proc = Start-Process -FilePath $ExePath -ArgumentList $agentArgs -WorkingDirectory $Root `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

$env:SC_INGEST_TOKEN = $null  # el hijo ya heredó su entorno

Write-Host "  PID: $($proc.Id)"
Write-Host "  log: $outLog"

if ($NoVerify) { return }

# --- 8. Verificar ---------------------------------------------------------
Write-Step 'Verificando arranque'
$alive = $false
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) { break }
    $alive = $true
    # Con 3 s de vida la captura ya está abierta o falló de forma explícita.
    if ($i -ge 6) { break }
}
if ($proc.HasExited) {
    $tail = @()
    foreach ($log in @($outLog, $errLog)) {
        if ((Test-Path $log) -and ((Get-Item $log).Length -gt 0)) {
            $tail += "--- $log ---"
            $tail += (Get-Content -Path $log -Tail 20)
        }
    }
    Fail "el agente terminó al arrancar (código $($proc.ExitCode)).`n$($tail -join "`n")"
}

if ($WaitSeconds -gt 0) {
    Write-Host "  vigilando $WaitSeconds s…"
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        if ($proc.HasExited) { Fail "el agente se cayó durante la vigilancia (código $($proc.ExitCode)). Revisa $outLog" }
    }
}

$logText = ''
if (Test-Path $outLog) { $logText = Get-Content -Path $outLog -Raw }
$problems = @()
if ($logText -match 'InterfaceNotFound') { $problems += 'InterfaceNotFound: la interfaz no abrió.' }
if ($logText -match 'necesita enrolarse') { $problems += 'el device necesita enrolarse (401/403): token inválido, rotado o device.id que no coincide.' }
if ($logText -match 'captura live no compilada') { $problems += 'el binario no tiene la feature live: recompila sin -SkipBuild.' }
if ($logText -match 'error de lectura') { $problems += 'error de lectura de pcap (¿Npcap instalado y permisos de administrador?).' }

if ($problems.Count -gt 0) {
    Write-Warning ("arrancó (PID {0}) pero hay problemas en el log:`n  - {1}" -f $proc.Id, ($problems -join "`n  - "))
} else {
    Write-Host "  agente vivo (PID $($proc.Id)) y capturando; sincroniza ventanas cada 30 s."
}
Write-Host "`nListo. Para pararlo: Stop-Process -Id $($proc.Id)"
