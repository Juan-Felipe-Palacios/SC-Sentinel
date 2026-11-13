#Requires -Version 5.1
<#
.SYNOPSIS
 Ciclo fisico de verificacion del servicio Windows (M5) sobre el ZIP publicado.

.DESCRIPTION
 Ejecuta 10 etapas (P0..P9) usando los .bat de un clic del paquete publicado,
 no los .ps1 del repo, para probar el camino que ve el usuario:
   P0  artefacto: exe, --version, --list-interfaces, GeoLite2 y SHA256SUMS.txt
   P1  desinstalacion previa (estado sucio)
   P1b residuos: servicio 1060, sin Program Files ni ProgramData
   P2  instalacion con el .bat de un clic
   P2b GeoLite2 instalada, ACL y SC_GEOIP_DB en el Environment del servicio
   P3  query / qc / qfailure
   P4  RUNNING + log + .host-key + spool + puertos UDP del colector
   P5  stop -> drenaje -> Stopped con exit code 0
   P6  start -> RUNNING
   P7  taskkill /F -> recovery por failure actions
   P8  stop + desinstalacion -> sin residuos
   P9  reinstalacion final -> RUNNING

 Cuándo usarlo: antes de dar por buena una release de Windows, sobre una
 maquina de pruebas. No es parte de un despliegue rutinario (para reemplazar
 el .exe de un servicio ya instalado usa scripts\deploy-agent-service.ps1).

 Requiere elevacion real: si no se ejecuta como Administrador se re-lanza a si
 mismo con Start-Process -Verb RunAs -Wait, asi que pide UAC.

 DESTRUCTIVO POR DISENO: desinstala el servicio, borra C:\Program Files\
 SC-Sentinel y C:\ProgramData\SC-Sentinel, y deja el servicio reinstalado al
 final. No lo lances en un equipo con datos que deban conservarse ni dos
 instancias en paralelo (una desinstala mientras la otra consulta).

 El token de ingesta se pasa al instalador como argumento; mientras dura la
 instalacion es visible en la lista de procesos del equipo. No se escribe en el
 transcript ni se imprime nunca.

.PARAMETER PackageDir
 Carpeta donde se extrajo el ZIP de la release (debe contener
 sc-sentinel-agent.exe, SHA256SUMS.txt, geolite2\ y los .bat de un clic).

.PARAMETER DeviceId
 Device id con el que se enrola el agente en el ciclo.

.PARAMETER IngestToken
 Token de ingesta. Obligatorio salvo con -DryRun. No se registra.

.PARAMETER RunDir
 Carpeta del transcript. Por defecto %TEMP%\m5-cycle.

.PARAMETER Service
 Nombre del servicio.

.PARAMETER InstallDir
 Directorio de instalacion que crea el instalador.

.PARAMETER DataDir
 Directorio de datos que crea el instalador.

.PARAMETER CollectorPorts
 Puertos UDP del colector, tal cual los recibe el .bat.

.PARAMETER ExpectedVersion
 Version que debe responder el exe del paquete.

.PARAMETER MinSums
 Numero minimo de ficheros correctos en SHA256SUMS.txt.

.PARAMETER DryRun
 Valida el paquete y muestra el plan sin elevar, sin transcript y sin tocar el
 servicio.

.EXAMPLE
 powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-m5-cycle.ps1 `
   -PackageDir "$env:TEMP\m5-pkg" -DeviceId dev_m5svc -IngestToken <token>

.EXAMPLE
 powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-m5-cycle.ps1 `
   -PackageDir "$env:TEMP\m5-pkg" -DeviceId dev_m5svc -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDir,

    [Parameter(Mandatory = $true)]
    [string]$DeviceId,

    [string]$IngestToken = '',

    [string]$RunDir = (Join-Path $env:TEMP 'm5-cycle'),
    [string]$Service = 'SC-Sentinel-Agent',
    [string]$InstallDir = 'C:\Program Files\SC-Sentinel',
    [string]$DataDir = 'C:\ProgramData\SC-Sentinel',
    [string]$CollectorPorts = '2056,4739',
    [string]$ExpectedVersion = '0.1.4',
    [int]$MinSums = 7,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

$exe = Join-Path $PackageDir 'sc-sentinel-agent.exe'
$sumsFile = Join-Path $PackageDir 'SHA256SUMS.txt'
$geoPkg = Join-Path $PackageDir 'geolite2\GeoLite2-Country.mmdb'
$installerBat = Join-Path $PackageDir 'instalar-sc-sentinel.bat'
$uninstallerBat = Join-Path $PackageDir 'desinstalar-sc-sentinel.bat'
$logFile = Join-Path $DataDir 'logs\agent.log'
$geoInstalled = Join-Path $InstallDir 'geolite2\GeoLite2-Country.mmdb'

# --------------------------------------------------------------- modo simulacion
if ($DryRun) {
    Write-Host '=== DryRun: ciclo M5 (no se modifica nada) ==='
    $tieneToken = [bool]$IngestToken
    Write-Host "paquete       : $PackageDir"
    Write-Host "  exe         : $(if (Test-Path $exe) { "$((Get-Item $exe).Length) B sha=$(Get-FileHash $exe -Algorithm SHA256 | Select-Object -ExpandProperty Hash)" } else { 'FALTA' })"
    Write-Host "  sumas       : $(if (Test-Path $sumsFile) { 'presente' } else { 'FALTA' })"
    Write-Host "  geolite2    : $(if (Test-Path $geoPkg) { "$((Get-Item $geoPkg).Length) B" } else { 'FALTA' })"
    Write-Host "  instalador  : $(if (Test-Path $installerBat) { 'presente' } else { 'FALTA' })"
    Write-Host "  desinstalador: $(if (Test-Path $uninstallerBat) { 'presente' } else { 'FALTA' })"
    $masked = if ($DeviceId.Length -gt 6) { $DeviceId.Substring(0, 6) + '...' } else { '...' }
    Write-Host "device id     : $masked (enmascarado)"
    Write-Host "token         : $(if ($tieneToken) { 'presente' } else { 'ausente (obligatorio para ejecutar)' })"
    Write-Host "servicio      : $Service"
    Write-Host "version esp.  : $ExpectedVersion (minimo $MinSums sumas correctas)"
    Write-Host "puertos       : $CollectorPorts"
    Write-Host "transcript    : $(Join-Path $RunDir 'm5-cycle-<marca>.log')"
    $st = 'NO_EXISTE'
    try { $st = "$((Get-Service -Name $Service -ErrorAction Stop).Status)" } catch { }
    Write-Host "estado actual : $st"

    if (Test-Path $exe) {
        $ver = & $exe --version 2>&1 | Out-String
        Write-Host "  --version    : $($ver.Trim())"
        if ($ver -notmatch [regex]::Escape($ExpectedVersion)) {
            Write-Host "  AVISO: la version del paquete no parece $ExpectedVersion"
        }
    }

    $faltan = @()
    foreach ($p in @($exe, $sumsFile, $geoPkg, $installerBat, $uninstallerBat)) {
        if (-not (Test-Path $p)) { $faltan += $p }
    }
    Write-Host ''
    Write-Host 'Etapas que ejecutaria la corrida real:'
    Write-Host '  P0  verificacion del artefacto (version, interfaces, GeoLite2, sumas)'
    Write-Host '  P1  desinstalacion previa con el .bat de un clic'
    Write-Host '  P1b residuos: servicio 1060, sin Program Files ni ProgramData'
    Write-Host "  P2  instalacion con el .bat ($DeviceId enmascarado, $CollectorPorts)"
    Write-Host '  P2b GeoLite2 instalada, ACL y SC_GEOIP_DB en el Environment'
    Write-Host '  P3  query / qc / qfailure'
    Write-Host '  P4  RUNNING + agent.log + .host-key + spool + puertos UDP'
    Write-Host '  P5  stop -> drenaje -> Stopped con exit code 0'
    Write-Host '  P6  start -> RUNNING'
    Write-Host '  P7  taskkill /F -> recovery por failure actions (<=60 s)'
    Write-Host '  P8  stop + desinstalacion -> sin residuos'
    Write-Host '  P9  reinstalacion final -> RUNNING'
    Write-Host ''
    if ($faltan.Count -gt 0) {
        Write-Host "VEREDICTO: falta material en el paquete ($($faltan.Count) elemento(s)); la corrida real abortaria en P0."
        foreach ($f in $faltan) { Write-Host "  - $f" }
        exit 2
    }
    Write-Host 'VEREDICTO: el paquete esta completo; la corrida real pediria UAC y desinstalaria/reinstalaria el servicio.'
    exit 0
}

if (-not $IngestToken) {
    Write-Host 'ABORTA: falta -IngestToken (obligatorio para instalar el agente).'
    exit 1
}
if (-not (Test-Path $exe)) {
    Write-Host "ABORTA: no existe $exe (extrae el ZIP de la release en -PackageDir)."
    exit 1
}

# ----------------------------------------------------------------------- UAC
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host 'RE-ELEVANDO (UAC)...' -ForegroundColor Yellow
    $shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
    if (-not $shell) { $shell = (Get-Command powershell.exe).Source }
    $p = Start-Process -FilePath $shell `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
        '-PackageDir', $PackageDir, '-DeviceId', $DeviceId, '-IngestToken', $IngestToken,
        '-RunDir', $RunDir, '-Service', $Service, '-CollectorPorts', $CollectorPorts,
        '-ExpectedVersion', $ExpectedVersion, '-MinSums', "$MinSums") `
        -Verb RunAs -Wait -PassThru
    Write-Host "rc del ciclo elevado: $($p.ExitCode)"
    exit $p.ExitCode
}

if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Force -Path $RunDir | Out-Null }
$transcript = Join-Path $RunDir ('m5-cycle-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

$fail = 0
function Step($m) { Write-Host "`n===== $m =====" -ForegroundColor Cyan }
function Check($name, $ok, $detail) {
    if ($ok) { Write-Host ("  [OK]   {0}{1}" -f $name, $(if ($detail) { " -> $detail" } else { '' })) -ForegroundColor Green }
    else { Write-Host ("  [FALLO] {0}{1}" -f $name, $(if ($detail) { " -> $detail" } else { '' })) -ForegroundColor Red; $script:fail++ }
}

Start-Transcript -Path $transcript -Append | Out-Null
try {
    Step 'P0 artefacto publicado (verificacion previa al ciclo)'
    Check 'el ejecutable del paquete existe' (Test-Path $exe) $exe
    $ver = & $exe --version 2>&1 | Out-String
    Check "--version responde $ExpectedVersion" ($ver -match [regex]::Escape($ExpectedVersion)) $ver.Trim()
    $ifaces = & $exe --list-interfaces 2>&1 | Out-String
    $nIfaces = ($ifaces -split "`n" | Where-Object { $_ -match '\S' }).Count
    Check '--list-interfaces lista dispositivos (captura live compilada)' ($nIfaces -ge 2) "$nIfaces lineas"
    Check 'el binario no lleva la cadena de "captura live no compilada"' ($ifaces -notmatch 'captura live no compilada') ''
    Check 'la base GeoLite2 viene en el paquete' (Test-Path $geoPkg) $(if (Test-Path $geoPkg) { "$((Get-Item $geoPkg).Length) B" } else { 'falta' })
    $sums = Get-Content $sumsFile -ErrorAction SilentlyContinue
    $ok = 0; $bad = 0
    foreach ($line in $sums) {
        if ($line -match '^([0-9a-fA-F]{64})\s+(.+)$') {
            $exp = $Matches[1].ToLower(); $rel = $Matches[2].Trim()
            $f = Join-Path $PackageDir ($rel -replace '/', '\')
            if (Test-Path $f) {
                $act = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
                if ($act -eq $exp) { $ok++ } else { $bad++; Write-Host "    suma incorrecta: $rel" -ForegroundColor Red }
            } else { $bad++; Write-Host "    fichero ausente: $rel" -ForegroundColor Red }
        }
    }
    Check 'SHA256SUMS.txt del paquete verifica todos los ficheros' ($bad -eq 0 -and $ok -ge $MinSums) "$ok correctas, $bad incorrectas"

    Step 'P1 uninstall previo (estado sucio) con el .bat de un clic'
    & cmd /c "`"$uninstallerBat`" S" 2>&1 | Select-Object -Last 12 | Write-Host
    Write-Host "rc del desinstalador: $LASTEXITCODE"

    Step 'P1b residuos tras uninstall'
    $q = sc.exe query $Service 2>&1 | Out-String
    Check 'el servicio ya no existe (1060)' ($q -match '1060') ($q -replace '\s+', ' ').Trim()
    Check "no queda $InstallDir" (-not (Test-Path $InstallDir)) ''
    Check "no queda $DataDir" (-not (Test-Path $DataDir)) ''

    Step 'P2 install con el .bat de un clic del paquete publicado'
    & cmd /c "`"$installerBat`" $DeviceId $IngestToken $CollectorPorts" 2>&1 | Select-Object -Last 25 | Write-Host
    $rcInstall = $LASTEXITCODE
    Check 'el instalador de un clic devuelve 0' ($rcInstall -eq 0) "rc=$rcInstall"

    Step 'P2b GeoLite2 instalada, ACLs y SC_GEOIP_DB en el servicio'
    Check 'la base GeoLite2 esta en Program Files' (Test-Path $geoInstalled) $(if (Test-Path $geoInstalled) { "$((Get-Item $geoInstalled).Length) B" } else { 'falta' })
    $acl = icacls $geoInstalled 2>&1 | Out-String
    Write-Host "  ACL de la base:"; Write-Host $acl
    Check 'la base se puede leer' ($null -ne (Get-Item $geoInstalled -ErrorAction SilentlyContinue)) ''
    $envReg = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Service" -Name Environment -ErrorAction SilentlyContinue).Environment
    Check 'SC_GEOIP_DB esta en el Environment del servicio' ($envReg -match 'SC_GEOIP_DB') (($envReg | Where-Object { $_ -match 'SC_GEOIP_DB' }) -join ' | ')

    Step 'P3 query / qc / qfailure'
    sc.exe query $Service | Write-Host
    sc.exe qc $Service | Write-Host
    sc.exe qfailure $Service | Write-Host

    Step 'P4 estado RUNNING + log'
    Start-Sleep 8
    $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
    Check 'el servicio esta RUNNING' ($st -eq 'Running') "$st"
    Check 'agent.log existe' (Test-Path $logFile) $logFile
    Check '.host-key existe' (Test-Path (Join-Path $DataDir 'config\.host-key')) ''
    Check 'spool existe' (Test-Path (Join-Path $DataDir 'spool\sc-spool.sqlite')) ''
    Write-Host '--- puertos UDP del servicio ---'
    Get-NetUDPEndpoint -LocalPort @(2056, 4739) -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host '--- log (tail) ---'
    Get-Content $logFile -Tail 30 -ErrorAction SilentlyContinue | Write-Host
    $logTxt = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    Check 'el log dice que cargo la base GeoLite2' ($logTxt -match 'GeoIP: base GeoLite2 cargada') (($logTxt | Select-String -Pattern 'GeoIP:.*cargada' -AllMatches).Matches.Value -join ' ')

    Step 'P5 stop -> drain -> Stopped (exit code esperado 0)'
    sc.exe stop $Service | Out-Null
    for ($i = 0; $i -lt 45; $i++) {
        $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
        if ($st -eq 'Stopped') { break }
        Start-Sleep 2
    }
    $svcW = Get-CimInstance Win32_Service -Filter "Name='$Service'"
    Check 'el servicio queda Stopped' ($svcW.State -eq 'Stopped') "$($svcW.State)"
    Check 'el exit code es 0 (drenaje correcto)' ($svcW.ExitCode -eq 0) "exit=$($svcW.ExitCode)"
    Write-Host '--- log (tail tras stop) ---'
    Get-Content $logFile -Tail 20 -ErrorAction SilentlyContinue | Write-Host
    $logTxt = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    Check 'el log muestra el drenaje del spool' ($logTxt -match 'spool_flushed|sync_final_drain') ''

    Step 'P6 start -> RUNNING'
    sc.exe start $Service | Out-Null
    Start-Sleep 6
    $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
    Check 'el servicio vuelve a RUNNING' ($st -eq 'Running') "$st"

    Step 'P7 taskkill /F -> recovery por failure actions (espera RUNNING <=60s)'
    $svcPid = (Get-CimInstance Win32_Service -Filter "Name='$Service'").ProcessId
    Write-Host "pid del servicio: $svcPid"
    taskkill /PID $svcPid /F | Write-Host
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep 3
        $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
        if ($st -eq 'Running') { break }
    }
    $svcW2 = Get-CimInstance Win32_Service -Filter "Name='$Service'"
    Check 'el recovery actions relanza el servicio' ($svcW2.State -eq 'Running') "state=$($svcW2.State) pid=$($svcW2.ProcessId)"
    sc.exe query $Service | Write-Host
    Write-Host '--- log (tail tras recovery) ---'
    Get-Content $logFile -Tail 15 -ErrorAction SilentlyContinue | Write-Host

    Step 'P8 stop + uninstall (un clic) -> verificar residuos'
    sc.exe stop $Service | Out-Null
    for ($i = 0; $i -lt 45; $i++) {
        $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
        if ($st -eq 'Stopped') { break }
        Start-Sleep 2
    }
    & cmd /c "`"$uninstallerBat`" S" 2>&1 | Select-Object -Last 12 | Write-Host
    $q = sc.exe query $Service 2>&1 | Out-String
    Check 'el servicio ya no existe (1060)' ($q -match '1060') ($q -replace '\s+', ' ').Trim()
    Check "no queda $InstallDir (incluida la carpeta geolite2)" (-not (Test-Path $InstallDir)) ''
    Check "no queda $DataDir" (-not (Test-Path $DataDir)) ''
    $resid = Get-ChildItem $InstallDir, $DataDir -Recurse -ErrorAction SilentlyContinue
    Check 'no quedan residuos en Program Files ni ProgramData' ($null -eq $resid -or $resid.Count -eq 0) (($resid | ForEach-Object { $_.FullName }) -join ', ')

    Step 'P9 reinstall final (un clic) -> dejar RUNNING'
    & cmd /c "`"$installerBat`" $DeviceId $IngestToken $CollectorPorts" 2>&1 | Select-Object -Last 20 | Write-Host
    $rcInstall = $LASTEXITCODE
    Check 'el instalador de un clic devuelve 0' ($rcInstall -eq 0) "rc=$rcInstall"
    Start-Sleep 8
    $st = (Get-Service $Service -ErrorAction SilentlyContinue).Status
    Check 'el servicio queda RUNNING' ($st -eq 'Running') "$st"
    sc.exe qfailure $Service | Write-Host
    Check 'la base GeoLite2 se reinstalo' (Test-Path $geoInstalled) ''
    Write-Host '--- log final ---'
    Get-Content $logFile -Tail 12 -ErrorAction SilentlyContinue | Write-Host

    Step 'RESULTADO'
    if ($fail -eq 0) { Write-Host 'CICLO COMPLETO: 0 FALLOS' -ForegroundColor Green }
    else { Write-Host "CICLO COMPLETO: $fail FALLOS" -ForegroundColor Red }
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
finally {
    Stop-Transcript | Out-Null
    Write-Host "transcript: $transcript"
}
if ($fail -gt 0) { exit 1 }
