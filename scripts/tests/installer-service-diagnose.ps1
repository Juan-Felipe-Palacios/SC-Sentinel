#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnóstico corto del arranque del agente como servicio Windows.

.DESCRIPTION
  Instala el .exe del instalador en un runner desechable con la misma
  configuración que usa installer-e2e-windows.ps1 y vuelca, sin valores
  sensibles, todo lo necesario para explicar por qué el agente no escribe en
  agent.log después de arrancar:

    (a) con el servicio arrancado: sc qc, sc queryex, eventos 7000-7034 del
        Service Control Manager, procesos con su línea de órdenes, nombres de
        secciones y claves de config.toml y agent.log crudo;
    (b) tras sc stop: agent.log, estado y eventos nuevos;
    (c) el agente en consola con los MISMOS argumentos de su ImagePath durante
        10 s, capturando stdout, stderr y código de salida;
    (d) comparación de las claves de [log] con la plantilla que genera
        install-agent.ps1 y con la ruta efectiva del log.

  Nunca imprime el token: solo el nombre de la variable del servicio.
  Sale 0 aunque el diagnóstico encuentre un defecto (su propósito es recoger
  evidencia); sale 1 solo si no pudo instalar ni ejecutar el setup.

.PARAMETER SetupPath
  Instalador .exe compilado por scripts/build-installer.ps1.
.PARAMETER Version
  Versión del instalador (sin 'v').
.PARAMETER OutDir
  Carpeta de resultados (diagnose.txt y diagnose.json).
.PARAMETER InstallDir
  Carpeta de instalación del diagnóstico (por defecto C:\SCS-DIAG-App).
.PARAMETER AllowLocalRun
  Sin esto y sin CI=true se niega: instala un servicio y escribe ProgramData.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SetupPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$OutDir = (Join-Path $env:TEMP 'scs-diag-results'),
  [string]$InstallDir = 'C:\SCS-DIAG-App',
  [switch]$AllowLocalRun
)

$ErrorActionPreference = 'Continue'
$ServiceName = 'SC-Sentinel-Agent'
$DataDir = 'C:\ProgramData\SC-Sentinel'
$ServiceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$AgentLog = Join-Path $DataDir 'logs\agent.log'
$ConfigPath = Join-Path $DataDir 'config\config.toml'
# Token ficticio: el simulador no valida credenciales y el valor no se imprime.
$Token = 'sc_dev_ciPrueba0000000000000000000000000000'
$DeviceId = 'dev_ci0000000000000001'

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$lines = New-Object System.Collections.ArrayList
function Log { param([string]$Text) Write-Host $Text; [void]$lines.Add($Text) }

function Get-Sha {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 'AUSENTE' }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.Substring(0, 12)
}

function Get-ServiceState {
  $s = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $s) { return 'NO_EXISTE' }
  return "$($s.Status)"
}

function Save-AgentLog {
  param([string]$Tag)
  if (Test-Path -LiteralPath $AgentLog) {
    $fi = Get-Item -LiteralPath $AgentLog
    Log "agent.log [$Tag] bytes=$($fi.Length) creado=$($fi.CreationTimeUtc.ToString('o')) modificado=$($fi.LastWriteTimeUtc.ToString('o'))"
    foreach ($l in @(Get-Content -LiteralPath $AgentLog)) { Log "  | $l" }
    Copy-Item -LiteralPath $AgentLog -Destination (Join-Path $OutDir "agent.$Tag.log") -Force -ErrorAction SilentlyContinue
  } else {
    Log "agent.log [$Tag] AUSENTE ($AgentLog)"
  }
}

function Save-ScmEvents {
  param([datetime]$Since, [string]$Tag)
  Log "eventos del SCM [$Tag] desde $($Since.ToString('o'))"
  try {
    $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; StartTime = $Since } -ErrorAction Stop |
      Where-Object { $_.Id -ge 7000 -and $_.Id -le 7034 })
    Log "  total: $($events.Count)"
    foreach ($e in $events) {
      $msg = ($e.Message -split "`r?`n")[0]
      Log ("  {0:o} id={1} {2}" -f $e.TimeCreated, $e.Id, $msg)
    }
  } catch {
    Log "  no se pudieron leer los eventos: $($_.Exception.Message)"
  }
}

function Save-ServiceSnapshot {
  param([string]$Tag)
  Log "== estado del servicio [$Tag] $(Get-Date -Format o) =="
  Log "estado: $(Get-ServiceState)"
  foreach ($cmd in @('qc', 'queryex', 'qfailure')) {
    Log "sc $cmd $ServiceName"
    $out = & sc.exe $cmd $ServiceName 2>&1
    foreach ($l in @($out)) { Log "  $l" }
  }
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='sc-sentinel-agent.exe'" -ErrorAction SilentlyContinue)
  Log "procesos sc-sentinel-agent: $($procs.Count)"
  foreach ($p in $procs) {
    Log ("  pid={0} creado={1:o} cmd={2}" -f $p.ProcessId, $p.CreationDate, $p.CommandLine)
  }
  $envValue = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
  # Solo NOMBRES de variables, nunca valores (el token vive aquí).
  $names = @($envValue | Where-Object { $_ -match '^([A-Za-z_][A-Za-z0-9_]*)=' } | ForEach-Object { ($_ -split '=', 2)[0] })
  Log "Environment del servicio (nombres): $($names -join ', ')"
}

function Save-ConfigKeys {
  Log "== config.toml: secciones y claves (sin valores) =="
  if (-not (Test-Path -LiteralPath $ConfigPath)) { Log "  AUSENTE ($ConfigPath)"; return }
  $section = ''
  foreach ($l in @(Get-Content -LiteralPath $ConfigPath)) {
    $t = $l.Trim()
    if ($t -match '^\[(.+)\]$') {
      $section = $Matches[1]
      Log "  [$section]"
    } elseif ($t -match '^([A-Za-z0-9_]+)\s*=') {
      Log ("    {0}.{1}" -f $section, $Matches[1])
    }
  }
}

# --- precondiciones -------------------------------------------------------
try {
  if (-not (Test-Path -LiteralPath $SetupPath)) { throw "No existe el instalador $SetupPath" }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'El diagnóstico instala un servicio: requiere Administrador.' }
  if ($env:CI -ne 'true' -and -not $AllowLocalRun) {
    throw 'Sin CI=true ni -AllowLocalRun: instala un servicio y escribe ProgramData. Usa un Windows desechable.'
  }
} catch {
  Log "ABORTA: $($_.Exception.Message)"
  [System.IO.File]::WriteAllLines((Join-Path $OutDir 'diagnose.txt'), $lines, [System.Text.UTF8Encoding]::new($false))
  exit 1
}

Log "== Diagnóstico del servicio SC-Sentinel =="
Log "instalador: $SetupPath (sha $(Get-Sha $SetupPath))"
Log "version: $Version  equipo: $env:COMPUTERNAME  ps: $($PSVersionTable.PSVersion)"

$installStart = (Get-Date).ToUniversalTime()
$env:SCS_INSTALL_DEVICE_ID = $DeviceId
$env:SCS_INSTALL_TOKEN = $Token
try {
  Remove-Item Env:\SCS_INSTALL_SERVICE_IMAGEPATH -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $SetupPath -ArgumentList @('/S', "/D=$InstallDir") -Wait -PassThru
  Log "instalacion: exit $($proc.ExitCode)"
} catch {
  Log "ABORTA: no se pudo ejecutar el instalador: $($_.Exception.Message)"
  [System.IO.File]::WriteAllLines((Join-Path $OutDir 'diagnose.txt'), $lines, [System.Text.UTF8Encoding]::new($false))
  exit 1
} finally {
  Remove-Item Env:\SCS_INSTALL_DEVICE_ID, Env:\SCS_INSTALL_TOKEN -ErrorAction SilentlyContinue
}

# --- (a) servicio arrancado, 10 s ----------------------------------------
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline -and (Get-ServiceState) -ne 'Running') { Start-Sleep -Seconds 1 }
Start-Sleep -Seconds 10
Log ''
Log '== (a) servicio arrancado (10 s) =='
Save-ServiceSnapshot -Tag 'arrancado'
Save-ConfigKeys
Save-AgentLog -Tag 'arrancado'
Save-ScmEvents -Since $installStart -Tag 'arrancado'

# --- (b) sc stop ---------------------------------------------------------
if (Test-Path -LiteralPath $ServiceKey) {
  Log ''
  Log '== (b) parada con sc stop =='
  $stopStart = (Get-Date).ToUniversalTime()
  & sc.exe stop $ServiceName | Out-Null
  $stopDeadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $stopDeadline -and (Get-ServiceState) -ne 'Stopped') { Start-Sleep -Milliseconds 500 }
  Log "estado tras la parada: $(Get-ServiceState)"
  Save-AgentLog -Tag 'detenido'
  Save-ScmEvents -Since $stopStart -Tag 'parada'

  # --- (c) consola con los MISMOS argumentos del ImagePath ---------------
  Log ''
  Log '== (c) agente en consola con los argumentos de su ImagePath (10 s) =='
  $image = (Get-ItemProperty -LiteralPath $ServiceKey -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
  if (-not $image) {
    Log '  sin ImagePath: no se puede reproducir la línea de órdenes'
  } else {
    Log "  ImagePath: $image"
    $exe = $image.Trim()
    $rest = ''
    if ($exe.StartsWith('"')) {
      $end = $exe.IndexOf('"', 1)
      if ($end -gt 1) {
        $rest = $exe.Substring($end + 1).Trim()
        $exe = $exe.Substring(1, $end - 1)
      }
    } else {
      $parts = $exe -split '\s+', 2
      $exe = $parts[0]
      if ($parts.Count -gt 1) { $rest = $parts[1] }
    }
    $outFile = Join-Path $OutDir 'console.out.txt'
    $errFile = Join-Path $OutDir 'console.err.txt'
    $env:SC_INGEST_TOKEN = $Token
    $env:SC_SENTINEL_DEVICE_ID = $DeviceId
    try {
      $consoleArgs = @()
      if ($rest) { $consoleArgs = @($rest) }
      $p = Start-Process -FilePath $exe -ArgumentList $consoleArgs -PassThru -NoNewWindow `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile
      Start-Sleep -Seconds 10
      $p.Refresh()
      if ($p.HasExited) {
        Log "  salio solo en 10 s: exitcode=$($p.ExitCode)"
      } else {
        Log '  sigue vivo a los 10 s'
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Log "  no se pudo ejecutar en consola: $($_.Exception.Message)"
    } finally {
      Remove-Item Env:\SC_INGEST_TOKEN, Env:\SC_SENTINEL_DEVICE_ID -ErrorAction SilentlyContinue
    }
    foreach ($pair in @(@($outFile, 'stdout'), @($errFile, 'stderr'))) {
      Log "  $($pair[1]):"
      if (Test-Path -LiteralPath $pair[0]) {
        $text = @(Get-Content -LiteralPath $pair[0])
        if ($text.Count -eq 0) { Log '    (vacio)' }
        foreach ($l in $text) { Log "    $l" }
      } else { Log '    (sin archivo)' }
    }
    Save-AgentLog -Tag 'consola'
  }
}

# --- (d) comparación con la plantilla de install-agent.ps1 ----------------
Log ''
Log '== (d) [log] instalado frente a la plantilla de install-agent.ps1 =='
$templateScript = Join-Path $InstallDir 'installer\install-agent.ps1'
if (Test-Path -LiteralPath $templateScript) {
  Log "  plantilla: $templateScript (sha $(Get-Sha $templateScript))"
} else {
  Log "  plantilla AUSENTE en $templateScript"
}
if (Test-Path -LiteralPath $ConfigPath) {
  $text = [System.IO.File]::ReadAllText($ConfigPath)
  $m = [regex]::Match($text, '(?ms)^\[log\]\s*$.*?(?=^\[|\z)')
  if ($m.Success) {
    Log '  config.toml [log]:'
    foreach ($l in ($m.Value -split "`r?`n")) {
      if ($l.Trim()) { Log "    $($l.Trim())" }
    }
  } else {
    Log '  config.toml no tiene sección [log]'
  }
  $declared = [regex]::Match($text, '(?m)^\s*file\s*=\s*"([^"]*)"').Groups[1].Value
  Log "  ruta declarada: $(if ($declared) { $declared } else { '(sin file: se usa la ruta por defecto)' })"
  Log "  ruta efectiva del servicio: $AgentLog"
  if ($declared) {
    $normal = $declared.Replace('/', '\')
    Log "  coincide con la efectiva: $($normal -ieq $AgentLog)"
  }
} else {
  Log '  config.toml AUSENTE: el agente arranca con la ruta por defecto'
}

$summary = [pscustomobject]@{
  fecha = (Get-Date).ToString('s')
  equipo = $env:COMPUTERNAME
  version = $Version
  setup = $SetupPath
  install_exit = $proc.ExitCode
  estado_final = (Get-ServiceState)
  agent_log = $AgentLog
  lineas_agent_log = if (Test-Path -LiteralPath $AgentLog) { @(Get-Content -LiteralPath $AgentLog).Count } else { 0 }
  lineas_diagnostico = $lines.Count
}
[System.IO.File]::WriteAllLines((Join-Path $OutDir 'diagnose.txt'), $lines, [System.Text.UTF8Encoding]::new($false))
$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir 'diagnose.json') -Encoding UTF8
Write-Host "== Diagnóstico escrito en $OutDir (agent.log con $($summary.lineas_agent_log) líneas) =="
exit 0
