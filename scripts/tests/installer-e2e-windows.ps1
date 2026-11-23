#Requires -Version 5.1
<#
.SYNOPSIS
  Pruebas de extremo a extremo del instalador .exe en un Windows efimero
  (runner de GitHub Actions o Windows Sandbox), nunca en un equipo de trabajo.

.DESCRIPTION
  Instala, actualiza, revierte, desinstala y vuelve a instalar el agente real
  con un servidor de ingesta local simulado (HTTP 2xx en 127.0.0.1) para que el
  agente produzca `sync_confirmed` y `spool_flushed pending=0` sin backend ni
  credenciales reales. El token es ficticio, se pasa por entorno y nunca se
  imprime.

  Cubre:
    T1  instalacion limpia (servicio Running, archivos, registro, ACL)
    T4  actualizacion silenciosa: binario nuevo, datos y token conservados
    T5  rollback con deploy-agent-service.ps1 -Mode Rollback
    T6  desinstalacion /S conservando ProgramData
    T7  desinstalacion con -PurgeData (sin ProgramData ni servicio)
    T8  reinstalacion idempotente
    T9  sin residuos (servicio, carpetas, claves)
    T13 actualizacion sobre una instalacion hecha con scripts (sin marcador)
    T14 carpeta con archivos ajenos: exit 3 y nada escrito
    T15 /D se ignora cuando el servicio manda el destino
    T16 config.toml y spool con el mismo hash antes y despues
    T17 archivado de .bak-* en ProgramData\SC-Sentinel\backup\legacy
    T18 la carpeta del sintoma reportado no se rechaza

  Escribe result.json y transcript.txt en -OutDir; exit 0 solo si todo pasa.
  -Mode BuildOnly no instala nada: util para el disparo por defecto (dry_run).

.PARAMETER SetupPath
  .exe compilado por scripts/build-installer.ps1.
.PARAMETER Version
  Version del instalador (sin 'v'), p. ej. 0.1.10.
.PARAMETER Mode
  Full (por defecto) o BuildOnly (sin instalar nada).
.PARAMETER AllowLocalRun
  Sin esto y sin CI=true, -Mode Full se niega a ejecutarse: instala servicios y
  borra C:\ProgramData\SC-Sentinel, y eso solo vale en un Windows desechable.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SetupPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [ValidateSet('Full', 'BuildOnly')][string]$Mode = 'Full',
  [string]$OutDir = (Join-Path $env:TEMP 'scs-e2e-results'),
  [string]$InstallDir = 'C:\SCS-E2E-App',
  [string]$OtherDir = 'C:\SCS-E2E-Otro',
  [string]$ForeignDir = 'C:\SCS-E2E-Ajeno',
  [string]$ScriptsInstalledDir = 'C:\SCS-E2E-Scripts',
  [int]$IngestPort = 8788,
  [switch]$AllowLocalRun
)

$ErrorActionPreference = 'Continue'
$ServiceName = 'SC-Sentinel-Agent'
$DataDir = 'C:\ProgramData\SC-Sentinel'
$UninstallKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SC-Sentinel-Agent'
$ServiceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$SoftwareKey = 'HKLM:\Software\SC-Sentinel'
$DeviceId = 'dev_ci0000000000000001'
$Token = 'sc_dev_ciPrueba0000000000000000000000000000'
$IngestUrl = "http://127.0.0.1:$IngestPort/api/ingest"

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$logPath = Join-Path $OutDir 'transcript.txt'
$results = New-Object System.Collections.ArrayList
$simulator = $null

function Write-Log {
  param([string]$Line)
  Write-Host $Line
  Add-Content -LiteralPath $logPath -Value $Line -Encoding UTF8
}

function Add-Check {
  param([string]$Name, [bool]$Ok, [string]$Detail)
  [void]$results.Add([pscustomobject]@{ check = $Name; ok = $Ok; detail = $Detail })
  Write-Log ("[{0}] {1}: {2}" -f $(if ($Ok) { ' OK ' } else { 'FALLO' }), $Name, $Detail)
}

function Get-Sha {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Get-SafeSha {
  param([string]$Path)
  $sha = Get-Sha $Path
  if (-not $sha) { return 'AUSENTE' }
  return $sha.Substring(0, 12)
}

function Wait-ServiceRunning {
  param([int]$TimeoutSeconds = 120)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Get-LogLineStamp {
  param([string]$Line)
  $m = [regex]::Match($Line, '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)')
  if (-not $m.Success) { return $null }
  return [datetime]::Parse($m.Groups[1].Value + 'Z', [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AdjustToUniversal)
}

function Wait-LogMarker {
  param([string]$Marker, [datetime]$SinceUtc, [int]$TimeoutSeconds = 180)
  $log = Join-Path $DataDir 'logs\agent.log'
  $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
  do {
    if (Test-Path -LiteralPath $log) {
      foreach ($line in (Get-Content -LiteralPath $log -Tail 200 -ErrorAction SilentlyContinue)) {
        if ($line -notmatch $Marker) { continue }
        $stamp = Get-LogLineStamp $line
        if ($stamp -and $stamp -ge $SinceUtc) { return $true }
      }
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date).ToUniversalTime() -lt $deadline)
  return $false
}

# Servidor de ingesta simulado: cualquier POST a /api/ingest recibe 200. El
# agente lo interpreta como ventana aceptada (`sync_confirmed`) y vacia el
# spool. No valida el token: es un entorno de prueba.
function Start-IngestSimulator {
  param([int]$Port)
  $simPath = Join-Path $env:TEMP 'scs-ingest-sim.ps1'
  $code = @'
param([int]$Port)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
while ($true) {
  try {
    $ctx = $listener.GetContext()
    $null = $ctx.Request.InputStream.Length
    $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream)
    $null = $reader.ReadToEnd()
    $body = '{"accepted":true,"windows":1}'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = 'application/json'
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
  } catch { Start-Sleep -Milliseconds 200 }
}
'@
  [System.IO.File]::WriteAllText($simPath, $code, [System.Text.UTF8Encoding]::new($false))
  return Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $simPath, '-Port', $Port)
}

function Stop-IngestSimulator {
  if ($script:simulator -and -not $script:simulator.HasExited) {
    Stop-Process -Id $script:simulator.Id -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Setup {
  param([string[]]$Arguments = @('/S'))
  $env:SCS_INSTALL_DEVICE_ID = $DeviceId
  $env:SCS_INSTALL_TOKEN = $Token
  try {
    $proc = Start-Process -FilePath $SetupPath -ArgumentList $Arguments -Wait -PassThru
    return $proc.ExitCode
  } finally {
    Remove-Item Env:\SCS_INSTALL_DEVICE_ID, Env:\SCS_INSTALL_TOKEN -ErrorAction SilentlyContinue
  }
}

# NetFlow v5 sintetico (header de 24 bytes + un registro de 48 bytes) con los
# mismos valores que agent/crates/sc-collector/src/fixtures.rs. Sin trafico el
# agente no encola ninguna ventana y `sync_confirmed` no puede aparecer.
function Add-Be16 {
  param([System.Collections.Generic.List[byte]]$List, [uint16]$Value)
  $b = [BitConverter]::GetBytes($Value)
  if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($b) }
  $List.AddRange($b)
}

function Add-Be32 {
  param([System.Collections.Generic.List[byte]]$List, [uint32]$Value)
  $b = [BitConverter]::GetBytes($Value)
  if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($b) }
  $List.AddRange($b)
}

function New-NetFlowV5Datagram {
  $p = New-Object 'System.Collections.Generic.List[byte]'
  Add-Be16 $p 5          # version
  Add-Be16 $p 1          # count
  Add-Be32 $p 1000       # sys_uptime
  Add-Be32 $p ([uint32][DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
  Add-Be32 $p 0          # unix_nsecs
  Add-Be32 $p 42         # flow_sequence
  $p.AddRange([byte[]](0, 0))   # engine_type, engine_id
  Add-Be16 $p 0          # sampling_interval
  $p.AddRange([byte[]](192, 168, 1, 41))  # src
  $p.AddRange([byte[]](8, 8, 8, 8))      # dst
  $p.AddRange([byte[]](0, 0, 0, 0))      # next_hop
  Add-Be16 $p 0          # input
  Add-Be16 $p 0          # output
  Add-Be32 $p 10         # dPkts
  Add-Be32 $p 1500       # dOctets
  Add-Be32 $p 0          # first
  Add-Be32 $p 0          # last
  Add-Be16 $p 51234      # src_port
  Add-Be16 $p 443        # dst_port
  $p.AddRange([byte[]](0, 0x10, 6, 0))   # pad1, tcp_flags, prot, tos
  Add-Be16 $p 0          # src_as
  Add-Be16 $p 0          # dst_as
  $p.AddRange([byte[]](0, 0))   # src_mask, dst_mask
  $p.AddRange([byte[]](0, 0))   # pad2
  return $p.ToArray()
}

function Send-NetFlowV5 {
  param([int]$Port = 2055, [int]$Packets = 3)
  $payload = New-NetFlowV5Datagram
  $udp = New-Object System.Net.Sockets.UdpClient
  try {
    for ($i = 0; $i -lt $Packets; $i++) {
      $null = $udp.Send($payload, $payload.Length, '127.0.0.1', $Port)
      Start-Sleep -Milliseconds 300
    }
  } finally {
    $udp.Close()
  }
}

function Get-ConfigPath { return (Join-Path $DataDir 'config\config.toml') }
function Get-SpoolPath { return (Join-Path $DataDir 'spool\sc-spool.sqlite') }

function Set-IngestToSimulator {
  # Cambio deliberado del entorno de prueba: el instalador no toca config.toml,
  # asi que para que el agente hable con el simulador hay que editarlo aqui y
  # comprobar despues que el instalador lo deja igual.
  $cfg = Get-ConfigPath
  $text = [System.IO.File]::ReadAllText($cfg)
  $text = [regex]::Replace($text, 'url = "[^"]*"', "url = `"$IngestUrl`"")
  [System.IO.File]::WriteAllText($cfg, $text, [System.Text.UTF8Encoding]::new($false))
}

function Get-TokenEnvironment {
  $envValue = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
  return @($envValue | Where-Object { $_ -like 'SC_INGEST_TOKEN=*' })[0]
}

# --------------------------------------------------------------------------
try {
  if (-not (Test-Path -LiteralPath $SetupPath)) { throw "No existe el instalador $SetupPath" }
  $setupSha = Get-Sha $SetupPath
  Write-Log "== Instalador: $SetupPath (sha $(if ($setupSha) { $setupSha.Substring(0, 12) } else { 'AUSENTE' }))"
  Write-Log "== Version: $Version  Modo: $Mode  Equipo: $env:COMPUTERNAME"

  if ($Mode -eq 'BuildOnly') {
    Add-Check 'setup.existe' $true $SetupPath
    Add-Check 'setup.version' ((Get-Item -LiteralPath $SetupPath).VersionInfo.ProductVersion -eq $Version) `
      "ProductVersion $((Get-Item -LiteralPath $SetupPath).VersionInfo.ProductVersion), esperado $Version"
    # La deteccion y la config se prueban sin instalar: Pester (installer-state,
    # config-toml) corre en el paso anterior del workflow.
    Write-Log 'Modo BuildOnly: no se instala nada (T1/T4-T9/T13-T18 requieren dry_run=false).'
  } else {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
      [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) { throw 'La ejecucion completa requiere Administrador.' }
    if ($env:CI -ne 'true' -and -not $AllowLocalRun) {
      throw 'Modo Full sin CI=true ni -AllowLocalRun: instala servicios y purga ProgramData. Usa un Windows desechable.'
    }

    $script:simulator = Start-IngestSimulator -Port $IngestPort
    Start-Sleep -Seconds 2
    Add-Check 'ingesta.simulador' (-not $script:simulator.HasExited) "HttpListener en 127.0.0.1:$IngestPort"

    # ---------------- T1: instalacion limpia ----------------
    Write-Log '== T1. Instalacion limpia =='
    foreach ($d in @($InstallDir, $OtherDir, $ForeignDir, $ScriptsInstalledDir)) {
      if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
    }
    $code = Invoke-Setup -Arguments @('/S', "/D=$InstallDir")
    Add-Check 'T1.exitcode' ($code -eq 0) "exit $code, esperado 0"
    Add-Check 'T1.agente' (Test-Path -LiteralPath (Join-Path $InstallDir 'sc-sentinel-agent.exe')) 'binario instalado'
    Add-Check 'T1.gui' (Test-Path -LiteralPath (Join-Path $InstallDir 'sc-gui.exe')) 'GUI instalada'
    Add-Check 'T1.installer_payload' (Test-Path -LiteralPath (Join-Path $InstallDir 'installer\install-agent.ps1')) 'payload en installer\'
    Add-Check 'T1.deploy_script' (Test-Path -LiteralPath (Join-Path $InstallDir 'installer\deploy-agent-service.ps1')) 'deploy-agent-service.ps1 incrustado'
    Add-Check 'T1.config_helper' (Test-Path -LiteralPath (Join-Path $InstallDir 'installer\lib\config-toml.psm1')) 'lib\config-toml.psm1 incrustado'
    Add-Check 'T1.servicio' (Wait-ServiceRunning 120) 'servicio SC-Sentinel-Agent en ejecucion'
    $uninst = Get-ItemProperty -LiteralPath $UninstallKey -ErrorAction SilentlyContinue
    Add-Check 'T1.registro' ($null -ne $uninst -and $uninst.DisplayVersion -eq $Version) "DisplayVersion $($uninst.DisplayVersion)"
    Add-Check 'T1.config' (Test-Path -LiteralPath (Get-ConfigPath)) (Get-ConfigPath)
    $cfgText = if (Test-Path -LiteralPath (Get-ConfigPath)) { [System.IO.File]::ReadAllText((Get-ConfigPath)) } else { '' }
    Add-Check 'T1.token_fuera_de_config' (-not ($cfgText -match [regex]::Escape($Token))) 'el token no esta en config.toml'
    Add-Check 'T1.token_en_servicio' ((Get-TokenEnvironment) -like 'SC_INGEST_TOKEN=*') 'SC_INGEST_TOKEN presente (valor no impreso)'

    # El agente necesita hablar con el simulador para el sync: se edita el
    # config.toml aqui (accion del test) y el instalador debe dejarlo igual.
    Set-IngestToSimulator
    Restart-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue

    # ---------------- T4/T16: actualizacion silenciosa ----------------
    Write-Log '== T4/T16. Actualizacion silenciosa =='
    # Version anterior distinta: con el mismo sha el deploy no copia el binario
    # ni deja .bak, asi que T5 no tendria respaldo que revertir ni T4 un
    # drenaje que observar. El PE sigue ejecutable con bytes de mas al final.
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    $stopBy = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $stopBy) {
      $svcNow = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
      if (-not $svcNow -or $svcNow.Status -eq 'Stopped') { break }
      Start-Sleep -Seconds 1
    }
    $installedExe = Join-Path $InstallDir 'sc-sentinel-agent.exe'
    $prevExe = Join-Path $env:TEMP 'scs-prev-agent.exe'
    Copy-Item -LiteralPath $installedExe -Destination $prevExe -Force
    [System.IO.File]::AppendAllText($prevExe, 'SCS-PREV')
    Remove-Item -LiteralPath $installedExe -Force
    Copy-Item -LiteralPath $prevExe -Destination $installedExe -Force
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $null = Wait-ServiceRunning 60
    $cfgHashBefore = Get-Sha (Get-ConfigPath)
    $spoolHashBefore = Get-Sha (Get-SpoolPath)
    $tokenBefore = Get-TokenEnvironment
    $syncSince = (Get-Date).ToUniversalTime()
    $code = Invoke-Setup -Arguments @('/S')
    # 0 = sync confirmado; 19 = advertencia documentada (sin sync en 30 s).
    Add-Check 'T4.exitcode' ($code -eq 0 -or $code -eq 19) "exit $code, esperado 0 o 19"
    Add-Check 'T16.config_intacto' ($cfgHashBefore -ne '' -and $cfgHashBefore -eq (Get-Sha (Get-ConfigPath))) "sha $(Get-SafeSha (Get-ConfigPath))"
    Add-Check 'T16.config_nuevo_ausente' (-not (Test-Path -LiteralPath "$(Get-ConfigPath).nuevo")) 'no se dejo config.toml.nuevo'
    # El spool es una SQLite viva: el agente escribe en ella mientras corre, asi
    # que el hash exacto cambia por actividad normal. Lo que se exige es que el
    # instalador no la reemplace: sigue existiendo y conserva su fecha de
    # creacion (no se recreo ni se trunco a cero).
    $spoolNow = Get-Item -LiteralPath (Get-SpoolPath) -ErrorAction SilentlyContinue
    $spoolIntacto = $null -ne $spoolNow -and $spoolNow.Length -gt 0 -and $spoolNow.CreationTimeUtc -le $syncSince
    $spoolDetalle = if ($spoolNow) {
      "spool conservado ({0} bytes, creado {1:o})" -f $spoolNow.Length, $spoolNow.CreationTimeUtc
    } else {
      'spool ausente'
    }
    Add-Check 'T16.spool_intacto' $spoolIntacto $spoolDetalle
    Add-Check 'T16.token_intacto' ($tokenBefore -eq (Get-TokenEnvironment) -and $tokenBefore) 'SC_INGEST_TOKEN igual antes y despues (valor no impreso)'
    # El binario recien instalado ya esta corriendo: se le manda una ventana
    # NetFlow para que el sync tenga algo que publicar contra el simulador.
    Send-NetFlowV5 -Port 2055
    Add-Check 'T16.sync_confirmado' (Wait-LogMarker -Marker 'sync_confirmed' -SinceUtc $syncSince -TimeoutSeconds 240) 'sync_confirmed en agent.log'
    Add-Check 'T4.servicio' (Wait-ServiceRunning 120) 'servicio en ejecucion tras actualizar'
    $deployLog = Join-Path $DataDir 'logs\agent.log'
    $drainSeen = $false
    if (Test-Path -LiteralPath $deployLog) {
      $drainSeen = [bool](Get-Content -LiteralPath $deployLog -Tail 200 | Where-Object { $_ -match 'spool_flushed' -and $_ -match 'pending=0' })
    }
    Add-Check 'T4.drenaje' $drainSeen 'spool_flushed pending=0 en agent.log'

    # ---------------- T5: rollback ----------------
    Write-Log '== T5. Rollback con deploy-agent-service.ps1 -Mode Rollback =='
    $bakPath = Join-Path $DataDir 'backup\sc-sentinel-agent.exe.bak'
    if (Test-Path -LiteralPath $bakPath) {
      $bakSha = Get-Sha $bakPath
      $deployScript = Join-Path $InstallDir 'installer\deploy-agent-service.ps1'
      $proc = Start-Process -FilePath 'powershell.exe' -Wait -PassThru -NoNewWindow -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $deployScript, '-Mode', 'Rollback',
        '-Service', $ServiceName, '-BackupDir', (Join-Path $DataDir 'backup'),
        '-LogPath', (Join-Path $DataDir 'logs\agent.log')
      )
      Add-Check 'T5.exitcode' ($proc.ExitCode -eq 0) "exit $($proc.ExitCode), esperado 0"
      Add-Check 'T5.binario_restaurado' ((Get-Sha (Join-Path $InstallDir 'sc-sentinel-agent.exe')) -eq $bakSha) 'sha instalado == sha del .bak'
      Add-Check 'T5.servicio' (Wait-ServiceRunning 120) 'servicio en ejecucion'
    } else {
      Add-Check 'T5.respaldo' $false "no existe $bakPath (la actualizacion no dejo respaldo)"
    }

    # ---------------- T13/T15/T18: instalacion hecha con scripts ----------------
    Write-Log '== T13/T15/T18. Actualizacion sobre una instalacion hecha con scripts =='
    Copy-Item -LiteralPath $InstallDir -Destination $ScriptsInstalledDir -Recurse -Force
    foreach ($own in @('.sc-sentinel-install', '.sc-sentinel-manifest.txt', 'uninstall.exe')) {
      Remove-Item -LiteralPath (Join-Path $ScriptsInstalledDir $own) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath (Join-Path $ScriptsInstalledDir 'installer') -Recurse -Force -ErrorAction SilentlyContinue
    # El binario "de scripts" debe diferir del del paquete o no habria nada que desplegar.
    [System.IO.File]::AppendAllText((Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe'), 'SCS-E2E')
    for ($i = 1; $i -le 5; $i++) {
      Set-Content -LiteralPath (Join-Path $ScriptsInstalledDir ("sc-sentinel-agent.exe.bak-2026010100000$i")) -Value '' -NoNewline
    }
    $oldAgentHash = Get-Sha (Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe')
    $savedEnv = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      sc.exe query $ServiceName *> $null
      if ($LASTEXITCODE -eq 1060) { break }
      Start-Sleep -Seconds 1
    }
    # `--config` (dos guiones): clap rechaza `-config` y el servicio no arranca.
    $scriptBinPath = '"' + (Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe') + '" --config "' + (Get-ConfigPath) + '" --no-capture'
    New-Service -Name $ServiceName -BinaryPathName $scriptBinPath -DisplayName 'SC Sentinel e2e' -StartupType Automatic | Out-Null
    New-ItemProperty -Path $ServiceKey -Name Environment -Value $savedEnv -PropertyType MultiString -Force | Out-Null
    Start-Service -Name $ServiceName
    Add-Check 'T18.servicio_scripts' (Wait-ServiceRunning 120) 'servicio apuntando a la carpeta sin marcador'

    $cfgHashBefore = Get-Sha (Get-ConfigPath)
    $code = Invoke-Setup -Arguments @('/S', "/D=$OtherDir")
    Add-Check 'T13.exitcode' ($code -eq 0 -or $code -eq 19) "exit $code, esperado 0 o 19"
    Add-Check 'T15.destino_fijo' (-not (Test-Path -LiteralPath $OtherDir)) "/D no creo $OtherDir"
    $regInstallDir = (Get-ItemProperty -LiteralPath $SoftwareKey -Name InstallDir -ErrorAction SilentlyContinue).InstallDir
    Add-Check 'T15.registro_destino' ($regInstallDir -eq $ScriptsInstalledDir) "InstallDir $regInstallDir"
    $payloadAgent = Join-Path $ScriptsInstalledDir 'installer\sc-sentinel-agent.exe'
    Add-Check 'T13.binario_reemplazado' ((Get-Sha (Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe')) -eq (Get-Sha $payloadAgent) -and (Get-Sha (Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe')) -ne $oldAgentHash) 'sha instalado == sha del paquete y != anterior'
    Add-Check 'T13.desinstalador' (Test-Path -LiteralPath (Join-Path $ScriptsInstalledDir 'uninstall.exe')) 'uninstall.exe creado'
    Add-Check 'T13.marcador' (Test-Path -LiteralPath (Join-Path $ScriptsInstalledDir '.sc-sentinel-install')) '.sc-sentinel-install creado'
    Add-Check 'T16.config_intacto_scripts' ($cfgHashBefore -eq (Get-Sha (Get-ConfigPath))) "sha $(Get-SafeSha (Get-ConfigPath))"
    $bakSha = Get-Sha $bakPath
    $bakSidecar = ''
    if (Test-Path -LiteralPath "$bakPath.sha256") {
      $bakSidecar = ((Get-Content -LiteralPath "$bakPath.sha256" -TotalCount 1) -split '\s+')[0].Trim().ToUpperInvariant()
    }
    Add-Check 'T13.respaldo' ($bakSha -ne '' -and $bakSha -eq $bakSidecar) 'respaldo .bak con su .sha256'

    # ---------------- T17: archivado de respaldos ----------------
    Write-Log '== T17. Archivado de .bak-* =='
    $env:SCS_INSTALL_ARCHIVE_BAKS = '1'
    $code = Invoke-Setup -Arguments @('/S')
    Remove-Item Env:\SCS_INSTALL_ARCHIVE_BAKS -ErrorAction SilentlyContinue
    $legacyDir = Join-Path $DataDir 'backup\legacy'
    $legacyBaks = @(Get-ChildItem -LiteralPath $legacyDir -Filter 'sc-sentinel-agent.exe.bak-*' -ErrorAction SilentlyContinue)
    Add-Check 'T17.exitcode' ($code -eq 0 -or $code -eq 19) "exit $code"
    Add-Check 'T17.archivados' ($legacyBaks.Count -ge 5) "$($legacyBaks.Count) respaldos en backup\legacy"
    Add-Check 'T17.sin_residuos' (@(Get-ChildItem -LiteralPath $ScriptsInstalledDir -Filter 'sc-sentinel-agent.exe.bak-*' -ErrorAction SilentlyContinue).Count -eq 0) 'ninguno queda en la carpeta de instalacion'

    # ---------------- T14: archivos ajenos ----------------
    Write-Log '== T14. Carpeta con archivos ajenos =='
    # Sin servicio, el instalador evalua /D; con uno, va por actualizacion y el
    # destino lo manda el servicio, asi que la carpeta ajena nunca se mira.
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      sc.exe query $ServiceName *> $null
      if ($LASTEXITCODE -eq 1060) { break }
      Start-Sleep -Seconds 1
    }
    New-Item -ItemType Directory -Path $ForeignDir -Force | Out-Null
    for ($i = 1; $i -le 6; $i++) { Set-Content -LiteralPath (Join-Path $ForeignDir "ajeno-$i.txt") -Value 'x' -NoNewline }
    $code = Invoke-Setup -Arguments @('/S', "/D=$ForeignDir")
    Add-Check 'T14.exitcode' ($code -eq 3) "exit $code, esperado 3"
    Add-Check 'T14.sin_escritura' (-not (Test-Path -LiteralPath (Join-Path $ForeignDir '.sc-sentinel-install')) -and -not (Test-Path -LiteralPath (Join-Path $ForeignDir 'sc-sentinel-agent.exe'))) 'no se escribio nada'
    Add-Check 'T14.ajenos_intactos' (@(Get-ChildItem -LiteralPath $ForeignDir -Filter 'ajeno-*.txt').Count -eq 6) 'los seis archivos siguen'

    # ---------------- T6: desinstalacion /S ----------------
    Write-Log '== T6. Desinstalacion /S conservando ProgramData =='
    $uninstaller = Join-Path $ScriptsInstalledDir 'uninstall.exe'
    $proc = Start-Process -FilePath $uninstaller -ArgumentList @('/S') -Wait -PassThru
    Add-Check 'T6.exitcode' ($proc.ExitCode -eq 0) "exit $($proc.ExitCode)"
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline -and (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 1 }
    Add-Check 'T6.servicio_eliminado' ($null -eq (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) 'sin servicio'
    Add-Check 'T6.programdata_conservado' (Test-Path -LiteralPath (Get-ConfigPath)) 'config.toml se conserva'
    Add-Check 'T6.archivos_eliminados' (-not (Test-Path -LiteralPath (Join-Path $ScriptsInstalledDir 'sc-sentinel-agent.exe')) -and -not (Test-Path -LiteralPath (Join-Path $ScriptsInstalledDir 'installer'))) 'binario y payload eliminados'

    # ---------------- T8: reinstalacion ----------------
    Write-Log '== T8. Reinstalacion =='
    $code = Invoke-Setup -Arguments @('/S', "/D=$InstallDir")
    Add-Check 'T8.exitcode' ($code -eq 0 -or $code -eq 19) "exit $code"
    Add-Check 'T8.servicio' (Wait-ServiceRunning 120) 'servicio en ejecucion'
    Add-Check 'T8.config_conservado' (Test-Path -LiteralPath (Get-ConfigPath)) 'config.toml del cliente sigue'

    # ---------------- T7: purga de datos ----------------
    Write-Log '== T7. Desinstalacion con -PurgeData =='
    $proc = Start-Process -FilePath 'powershell.exe' -Wait -PassThru -NoNewWindow -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $InstallDir 'installer\uninstall-agent.ps1'),
      '-InstallDir', $InstallDir, '-PurgeData'
    )
    Add-Check 'T7.exitcode' ($proc.ExitCode -eq 0) "exit $($proc.ExitCode)"
    Add-Check 'T7.programdata_purgado' (-not (Test-Path -LiteralPath $DataDir)) "$DataDir eliminado"
    Add-Check 'T7.servicio_eliminado' ($null -eq (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) 'sin servicio'

    # ---------------- T9: sin residuos ----------------
    Write-Log '== T9. Sin residuos =='
    foreach ($d in @($InstallDir, $OtherDir, $ForeignDir, $ScriptsInstalledDir)) {
      Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $SoftwareKey -Recurse -Force -ErrorAction SilentlyContinue
    Add-Check 'T9.servicio' ($null -eq (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) 'sin servicio'
    Add-Check 'T9.registro' (-not (Test-Path -LiteralPath $UninstallKey) -and -not (Test-Path -LiteralPath $SoftwareKey)) 'sin claves del producto'
  }
}
catch {
  Add-Check 'ejecucion' $false $_.Exception.Message
  Write-Log ("EXCEPCION: {0}`n{1}" -f $_.Exception.Message, $_.ScriptStackTrace)
}
finally {
  if ($Mode -ne 'BuildOnly') { Stop-IngestSimulator }
  $failed = @($results | Where-Object { -not $_.ok })
  $summary = [pscustomobject]@{
    fecha = (Get-Date).ToString('s')
    equipo = $env:COMPUTERNAME
    setup = $SetupPath
    version = $Version
    modo = $Mode
    total = $results.Count
    fallos = $failed.Count
    ok = ($failed.Count -eq 0 -and $results.Count -gt 0)
    checks = $results
  }
  # Traza del instalador: en /S su stdout se pierde, asi que el diagnostico de
  # un fallo (hash, FileVersion, ACL) queda en este log.
  $installLog = Join-Path $env:ProgramData 'SC-Sentinel\logs\install-agent.log'
  if (Test-Path -LiteralPath $installLog) {
    Write-Log '== install-agent.log (ultimas 40 lineas) =='
    Get-Content -LiteralPath $installLog -Tail 40 | ForEach-Object { Write-Log "  $_" }
  }
  # Log del agente: un servicio que no arranca (DLL faltante, config invalida)
  # deja aqui el motivo real.
  $agentLog = Join-Path $env:ProgramData 'SC-Sentinel\logs\agent.log'
  if (Test-Path -LiteralPath $agentLog) {
    Write-Log '== agent.log (ultimas 60 lineas) =='
    Get-Content -LiteralPath $agentLog -Tail 60 | ForEach-Object { Write-Log "  $_" }
  }
  $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutDir 'result.json') -Encoding UTF8
  Write-Log "== Resumen: $($results.Count) comprobaciones, $($failed.Count) fallo(s) =="
  foreach ($f in $failed) { Write-Log ("  FALLO {0}: {1}" -f $f.check, $f.detail) }
  if ($failed.Count -gt 0 -or $results.Count -eq 0) { exit 1 }
  exit 0
}
