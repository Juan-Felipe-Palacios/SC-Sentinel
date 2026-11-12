#Requires -Version 5.1
<#
.SYNOPSIS
  Verifica que el agente SC-Sentinel funciona, en dos niveles independientes:

    1. PAQUETE  - el ZIP de la release: hash, contenido, sumas internas,
                   version, captura live compilada, higiene del binario y
                   arranque real con la base GeoLite2.
    2. SERVICIO - la instalacion Windows: estado del SCM, acciones de
                   recovery, clave HMAC, spool, variable SC_GEOIP_DB y log.

.DESCRIPTION
  No modifica nada del sistema, salvo un directorio temporal donde extrae el
  ZIP para poder ejecutarlo. El nivel SERVICIO solo LEE el estado instalado.

  Cada comprobacion imprime OK / FALLO / AVISO. El script termina con un
  resumen y un codigo de salida: 0 = todo correcto, 1 = hay algun fallo.

.PARAMETER ZipPath
  Ruta del ZIP de Windows a verificar. Por defecto, el mas reciente de
  dist\sc-sentinel-agent-v*-windows-x64.zip.

.PARAMETER Service
  Anade la verificacion de la instalacion del servicio Windows.

.PARAMETER SkipPackage
  Omite la verificacion del paquete y solo comprueba el servicio.

.EXAMPLE
  .\scripts\verify-agent.ps1
  .\scripts\verify-agent.ps1 -Service
  .\scripts\verify-agent.ps1 -ZipPath C:\descargas\sc-sentinel-agent-v0.1.4-windows-x64.zip
#>
[CmdletBinding()]
param(
  [string] $ZipPath,
  [switch] $Service,
  [switch] $SkipPackage
)

$ErrorActionPreference = 'Continue'
$script:Failures = 0
$script:Warnings = 0

function Write-Head {
  param([string] $Text)
  Write-Host ''
  Write-Host "== $Text " -ForegroundColor Cyan -NoNewline
  Write-Host ('=' * [Math]::Max(0, 60 - $Text.Length)) -ForegroundColor DarkCyan
}

function Write-Ok   { param([string] $Text) Write-Host "  [ OK ] $Text" -ForegroundColor Green }
function Write-Fail { param([string] $Text) Write-Host "  [FALLO] $Text" -ForegroundColor Red; $script:Failures++ }
function Write-Warn { param([string] $Text) Write-Host "  [AVISO] $Text" -ForegroundColor Yellow; $script:Warnings++ }
function Write-Info { param([string] $Text) Write-Host "  [INFO] $Text" -ForegroundColor DarkGray }

function Test-Expect {
  param([bool] $Condition, [string] $OkText, [string] $FailText)
  if ($Condition) { Write-Ok $OkText } else { Write-Fail $FailText }
}

$repoRoot = Split-Path -Parent $PSScriptRoot

# --------------------------------------------------------------------------
# NIVEL 1 - PAQUETE
# --------------------------------------------------------------------------
if (-not $SkipPackage) {
  Write-Head 'PAQUETE (artefacto publicado)'

  if (-not $ZipPath) {
    $candidate = Get-ChildItem (Join-Path $repoRoot 'dist') -Filter 'sc-sentinel-agent-v*-windows-x64.zip' -ErrorAction SilentlyContinue |
                 Sort-Object Name -Descending | Select-Object -First 1
    if ($candidate) { $ZipPath = $candidate.FullName }
  }

  if (-not $ZipPath -or -not (Test-Path $ZipPath)) {
    Write-Fail "No se encuentra el ZIP. Descarga la release o indica -ZipPath."
  } else {
    Write-Info "ZIP: $ZipPath"
    $zipHash = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLower()
    Write-Info "SHA256: $zipHash"

    # --- Contenido esperado ---
    $work = Join-Path $env:TEMP ("sc-sentinel-verify-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    try {
      Expand-Archive -Path $ZipPath -DestinationPath $work -Force

      $required = @(
        'sc-sentinel-agent.exe',
        'install-agent.ps1',
        'uninstall-agent.ps1',
        'instalar-sc-sentinel.bat',
        'desinstalar-sc-sentinel.bat',
        'LEEME-INSTALACION.txt',
        'SHA256SUMS.txt',
        'geolite2\GeoLite2-Country.mmdb'
      )
      $missing = @()
      foreach ($r in $required) {
        if (-not (Test-Path (Join-Path $work $r))) { $missing += $r }
      }
      Test-Expect ($missing.Count -eq 0) `
        "Contenido completo: $($required.Count) ficheros esperados" `
        "Faltan ficheros en el paquete: $($missing -join ', ')"

      # --- Sumas internas ---
      $sumsFile = Join-Path $work 'SHA256SUMS.txt'
      if (Test-Path $sumsFile) {
        $ok = 0; $bad = 0
        foreach ($line in Get-Content $sumsFile) {
          if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') {
            $expected = $Matches[1].ToLower()
            $rel = $Matches[2] -replace '/', '\'
            $target = Join-Path $work $rel
            if (-not (Test-Path $target)) { $bad++; continue }
            if ((Get-FileHash $target -Algorithm SHA256).Hash.ToLower() -eq $expected) { $ok++ } else { $bad++ }
          }
        }
        Test-Expect ($bad -eq 0 -and $ok -gt 0) "Sumas internas verificadas: $ok correctas, $bad incorrectas" "Sumas internas: $ok correctas, $bad incorrectas"
      } else {
        Write-Warn 'El paquete no trae SHA256SUMS.txt'
      }

      # --- Version ---
      $exe = Join-Path $work 'sc-sentinel-agent.exe'
      if (Test-Path $exe) {
        $version = (& $exe --version 2>&1 | Out-String).Trim()
        Test-Expect ($version -match '^sc-sentinel-agent\s+\d+\.\d+\.\d+') "Version: $version" "Version inesperada: '$version'"
      } else {
        Write-Fail 'El paquete no contiene sc-sentinel-agent.exe'
      }

      # --- Captura live compilada (Defecto 1) ---
      if (Test-Path $exe) {
        $ifaces = (& $exe --list-interfaces 2>&1 | Out-String)
        $ifaceLines = @($ifaces -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
        $compiled = ($ifaces -notmatch 'captura live no compilada')
        Test-Expect $compiled "Captura live compilada en el binario" "El binario responde 'captura live no compilada' (se publico sin --features sc-capture/live)"
        Test-Expect ($ifaceLines.Count -gt 0) "Interfaces detectadas: $($ifaceLines.Count)" "No se ha detectado ninguna interfaz (el runtime de Npcap no esta instalado: https://npcap.com/#download)"
        # Si la lista viene vacia, el crate pcap no ha encontrado dispositivos:
        # casi siempre es que falta el runtime de Npcap, no el binario.
        if ($ifaceLines.Count -eq 0) {
          Write-Warn 'Sin interfaces: revisa el runtime de Npcap (https://npcap.com/#download). El servicio NO lo necesita (arranca en modo colector)'
        } else {
          Write-Info 'Runtime de Npcap operativo (hay dispositivos enumerables)'
        }
      }

      # --- Higiene del binario (Defecto 2) ---
      if (Test-Path $exe) {
        $bytes = [System.IO.File]::ReadAllBytes($exe)
        $ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
        foreach ($pattern in @('captura live no compilada', 'CARGO_MANIFEST_DIR', 'D:\ProyectosWeb', 'crates\sc-geo', '.cargo\registry')) {
          if ($ascii.Contains($pattern)) { Write-Fail "El binario filtra '$pattern'" }
        }
        Write-Ok 'Higiene del binario: sin rutas de compilacion'
      }

      # --- Arranque real con GeoLite2 ---
      if (Test-Path $exe) {
        $outFile = Join-Path $work 'boot.out'
        $errFile = Join-Path $work 'boot.err'
        $env:SC_INGEST_TOKEN = 'sc_verify_dummy'
        $env:SC_INGEST_URL = 'http://127.0.0.1:1/api/ingest'
        $env:SC_SENTINEL_DEVICE_ID = 'dev_verify_0000'
        $proc = Start-Process -FilePath $exe -ArgumentList @('--no-capture', '--no-collector') `
                 -WorkingDirectory $work -NoNewWindow -PassThru `
                 -RedirectStandardOutput $outFile -RedirectStandardError $errFile
        $finished = $proc.WaitForExit(25000)
        if (-not $finished) { try { $proc.Kill() } catch { } }
        $boot = ((Get-Content $outFile -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $errFile -Raw -ErrorAction SilentlyContinue))

        Test-Expect ($boot -match 'GeoIP: base GeoLite2 cargada') `
          'Base GeoLite2 cargada en el arranque' `
          'El arranque no cargo la base GeoLite2 (los paises saldran vacios)'
        Test-Expect ($boot -notmatch 'falta la variable de entorno SC_INGEST_TOKEN') `
          'Arranque completado con las variables de entorno' `
          'El agente no arranco (faltan variables de entorno)'
        Remove-Item Env:\SC_INGEST_TOKEN, Env:\SC_INGEST_URL, Env:\SC_SENTINEL_DEVICE_ID -ErrorAction SilentlyContinue
      }
    } finally {
      Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# --------------------------------------------------------------------------
# NIVEL 2 - SERVICIO INSTALADO
# --------------------------------------------------------------------------
if ($Service) {
  Write-Head 'SERVICIO (instalacion Windows)'

  $svc = Get-Service -Name 'SC-Sentinel-Agent' -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Fail 'El servicio SC-Sentinel-Agent no esta instalado'
  } else {
    Test-Expect ($svc.Status -eq 'Running') "Estado del servicio: $($svc.Status)" "El servicio esta $($svc.Status), deberia estar Running"

    $qfail = (sc.exe qfailure 'SC-Sentinel-Agent' 2>&1 | Out-String)
    # sc.exe localize los nombres de accion: "RESTART" en ingles, "REINICIAR" en castellano.
    $restart = ($qfail -match 'RESTART|REINICIAR')
    Test-Expect ($restart -and $qfail -match '5000' -and $qfail -match '10000' -and $qfail -match '30000') `
      'Acciones de recovery: restart 5 s / 10 s / 30 s' `
      "Acciones de recovery incompletas: $($qfail.Trim())"

    $binPath = (sc.exe qc 'SC-Sentinel-Agent' 2>&1 | Out-String)
    Test-Expect ($binPath -match '--config' -and $binPath -match '--no-capture') `
      'binPath con --config y --no-capture (modo colector)' `
      'El binPath no lleva --config / --no-capture'

    # El Environment es una PROPIEDAD de la clave del servicio (REG_MULTI_SZ),
    # no una subclave.
    $svcKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent'
    $envVal = @((Get-ItemProperty -Path $svcKey -ErrorAction SilentlyContinue).Environment)
    $hasToken = [bool]($envVal -match '^SC_INGEST_TOKEN=.+')
    $hasGeo = [bool]($envVal -match '^SC_GEOIP_DB=.+')
    Test-Expect $hasToken 'SC_INGEST_TOKEN en el Environment del servicio' 'SC_INGEST_TOKEN no esta en el Environment del servicio'
    if ($hasGeo) { Write-Ok 'SC_GEOIP_DB en el Environment del servicio' }
    else { Write-Warn 'SC_GEOIP_DB no esta en el Environment: se usara la busqueda automatica junto al binario' }
  }

  # El instalador deja config/spool/logs solo para SYSTEM y Administradores,
  # asi que sin elevación no se pueden leer: se avisa en vez de fallar.
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Warn 'Sin permisos de administrador: config/spool/logs no son legibles (el instalador los restringe a SYSTEM y Administradores).'
    Write-Info 'Para comprobarlo todo: ejecuta como administrador ->  Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile","-File","scripts\verify-agent.ps1","-Service"'
  }

  $dataDir = 'C:\ProgramData\SC-Sentinel'
  $hostKey = "$dataDir\config\.host-key"
  $spool = "$dataDir\spool\sc-spool.sqlite"
  $logFile = "$dataDir\logs\agent.log"

  $hostOk = $false
  try { $hostOk = Test-Path $hostKey -ErrorAction Stop } catch { }
  if ($hostOk) { Write-Ok 'Clave HMAC del host presente (config\.host-key)' }
  elseif (-not $isAdmin) { Write-Warn 'No se puede leer config\.host-key sin elevación' }
  else { Write-Fail 'Falta config\.host-key' }

  $spoolOk = $false
  try { $spoolOk = Test-Path $spool -ErrorAction Stop } catch { }
  if ($spoolOk) { Write-Ok 'Spool inicializado (spool\sc-spool.sqlite)' }
  elseif (-not $isAdmin) { Write-Warn 'No se puede leer spool\sc-spool.sqlite sin elevación' }
  else { Write-Fail 'Falta spool\sc-spool.sqlite' }

  $log = $null
  try { $log = Get-Content $logFile -Tail 400 -ErrorAction Stop | Out-String } catch { }
  if ($log) {
    Write-Info "Log: $logFile"
    Test-Expect ($log -match 'GeoIP: base GeoLite2 cargada') 'El log registra la carga de GeoLite2' 'El log no registra la carga de GeoLite2'
    Test-Expect ($log -match 'spool_flushed|sync_final_drain|sync_ok') 'El log registra un drain/sync del spool' 'El log no registra ningun drain/sync'
    if ($log -match '401|403') { Write-Warn 'El log muestra 401/403: revisa que el token y el device_id sean el mismo par' }
  } elseif (-not $isAdmin) {
    Write-Warn 'No se puede leer el log sin elevación'
  } else {
    Write-Fail "No existe el log $logFile"
  }
}

# --------------------------------------------------------------------------
Write-Head 'RESUMEN'
if ($script:Failures -eq 0) {
  Write-Host "  TODO CORRECTO ($($script:Warnings) aviso(s))" -ForegroundColor Green
  exit 0
} else {
  Write-Host "  $($script:Failures) FALLO(S), $($script:Warnings) aviso(s)" -ForegroundColor Red
  exit 1
}
