#Requires -Version 5.1
<#
.SYNOPSIS
  Pruebas de la clasificacion de la carpeta de instalacion (installer/lib/install-state.nsh).
.DESCRIPTION
  Compila installer/tests/install-state-harness.nsi con makensis y ejecuta el
  .exe resultante sobre carpetas temporales. El harness enlaza la MISMA libreria
  que usa installer/sc-sentinel.nsi, asi que lo que se prueba es el codigo real
  de deteccion, no una copia.

  No toca el servicio, ni Program Files, ni ProgramData: solo carpetas
  temporales y variables de entorno del proceso de prueba. El harness corre sin
  elevacion.

  Cubre el defecto reportado (T18): una instalacion hecha con install-agent.ps1
  deja binario, GUI y .bak-<marca> sin marcador ni desinstalador, y la regla
  anterior la rechazaba con "La carpeta ... ya existe y tiene archivos que no
  son de SC-Sentinel".
.PARAMETER MakensisPath
  makensis.exe. Si se omite se busca en Program Files y en el PATH; sin NSIS las
  pruebas se marcan como omitidas.
.EXAMPLE
  powershell.exe -NoProfile -Command "Invoke-Pester scripts\tests\installer-state.Tests.ps1"
#>
[CmdletBinding()]
param(
  [string]$MakensisPath = ''
)

$ErrorActionPreference = 'Stop'

Describe 'installer/lib/install-state.nsh (deteccion de instalacion existente)' {

  $testRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'scs-state-tests'
  $here = $PSScriptRoot
  if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
  $repo = Split-Path -Parent (Split-Path -Parent $here)
  $harnessNsi = Join-Path $repo 'installer\tests\install-state-harness.nsi'
  $harness = Join-Path $testRoot 'harness.exe'

  if (-not $MakensisPath) {
    $candidates = @()
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe') }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'NSIS\makensis.exe') }
    $onPath = Get-Command makensis -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $MakensisPath = @($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) }) | Select-Object -First 1
  }
  $hasMakensis = [bool]($MakensisPath -and (Test-Path -LiteralPath $MakensisPath))

  # Preparacion en tiempo de descubrimiento (Pester 3.4 no comparte variables
  # entre BeforeAll y los It de un Context anidado).
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $testRoot 'empty') -Force | Out-Null

  # Carpetas del caso real: una instalacion hecha con install-agent.ps1.
  $sym = Join-Path $testRoot 'scripts-install'
  New-Item -ItemType Directory -Path (Join-Path $sym 'geolite2') -Force | Out-Null
  foreach ($n in @('abrir-gui.bat', 'sc-gui.exe', 'sc-sentinel-agent.exe',
                   'sc-sentinel-agent.exe.bak-20261117093511',
                   'sc-sentinel-agent.exe.bak-20261117103747',
                   'sc-sentinel-agent.exe.bak-20261117104600',
                   'sc-sentinel-agent.exe.bak-20261117105009',
                   'sc-sentinel-agent.exe.bak-20261120191711')) {
    Set-Content -LiteralPath (Join-Path $sym $n) -Value '' -NoNewline
  }
  Set-Content -LiteralPath (Join-Path $sym 'geolite2\GeoLite2-Country.mmdb') -Value '' -NoNewline

  # Datos del cliente donde vive config.toml de verdad (ProgramData, fuera de la
  # carpeta de instalacion). La deteccion no debe tocarlos (T19).
  $dataRoot = Join-Path $testRoot 'data'
  $dataConfigDir = Join-Path $dataRoot 'config'
  New-Item -ItemType Directory -Path $dataConfigDir -Force | Out-Null
  $customerConfig = "# configuracion del cliente`r`n[collector]`r`nlisteners = [{ port = 9999, protocol = `"auto`" }]`r`n"
  $dataConfig = Join-Path $dataConfigDir 'config.toml'
  [System.IO.File]::WriteAllText($dataConfig, $customerConfig, [System.Text.UTF8Encoding]::new($false))

  $foreign = Join-Path $testRoot 'foreign'
  New-Item -ItemType Directory -Path $foreign -Force | Out-Null
  foreach ($n in @('sc-sentinel-agent.exe', 'ajeno-1.txt', 'ajeno-2.txt', 'ajeno-3.txt', 'ajeno-4.txt', 'ajeno-5.txt', 'ajeno-6.txt')) {
    Set-Content -LiteralPath (Join-Path $foreign $n) -Value '' -NoNewline
  }

  $unknownBak = Join-Path $testRoot 'unknown-bak'
  New-Item -ItemType Directory -Path $unknownBak -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $unknownBak 'otro.exe.bak-20260101000000') -Value '' -NoNewline

  $compileError = ''
  if ($hasMakensis) {
    $out = & $MakensisPath /V2 "/DOUTFILE=$harness" $harnessNsi 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $harness)) {
      $compileError = ($out -join [Environment]::NewLine)
    }
  }

  function Invoke-State {
    param([string]$Dir, [string]$ImagePath = '', [switch]$Marker,
          [string]$DisplayVersion = '', [string]$VersionA = '', [string]$VersionB = '')
    $outFile = Join-Path $testRoot ('out-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
    $env:SCS_TEST_DIR = $Dir
    $env:SCS_TEST_OUT = $outFile
    $env:SCS_TEST_SERVICE_IMAGEPATH = $ImagePath
    $env:SCS_TEST_MARKER = if ($Marker) { '1' } else { '' }
    $env:SCS_TEST_DISPLAYVERSION = $DisplayVersion
    $env:SCS_TEST_VERSION_A = $VersionA
    $env:SCS_TEST_VERSION_B = $VersionB
    $proc = Start-Process -FilePath $harness -Wait -PassThru
    if ($proc.ExitCode -ne 0) { throw "el harness salio con codigo $($proc.ExitCode)" }
    $raw = Get-Content -LiteralPath $outFile -Raw
    $foreignText = ''
    $m = [regex]::Match($raw, '(?s)foreign=(.*?)foreign-end')
    if ($m.Success) { $foreignText = $m.Groups[1].Value }
    [pscustomobject]@{
      State        = [int]([regex]::Match($raw, '(?m)^state=(\d+)').Groups[1].Value)
      Version      = [regex]::Match($raw, '(?m)^version=(.*)$').Groups[1].Value.Trim()
      VersionSource = [regex]::Match($raw, '(?m)^version_source=(.*)$').Groups[1].Value.Trim()
      CodeA        = [int]([regex]::Match($raw, '(?m)^version_code_a=(-?\d+)').Groups[1].Value)
      CodeB        = [int]([regex]::Match($raw, '(?m)^version_code_b=(-?\d+)').Groups[1].Value)
      InstallDir   = [regex]::Match($raw, '(?m)^installdir=(.*)$').Groups[1].Value.Trim()
      ServiceDir   = [regex]::Match($raw, '(?m)^servicedir=(.*)$').Groups[1].Value.Trim()
      Foreign      = $foreignText
      Reason       = [regex]::Match($raw, '(?ms)^reason=(.*)$').Groups[1].Value.Trim()
      LegacyReject = [regex]::Match($raw, '(?m)^legacy_reject=(\d)').Groups[1].Value -eq '1'
    }
  }

  $skip = -not ($hasMakensis -and -not $compileError)

  Context 'estructura de los archivos' {
    It 'la libreria de deteccion existe' {
      (Test-Path -LiteralPath (Join-Path $repo 'installer\lib\install-state.nsh')) | Should Be $true
    }
    It 'el .nsi de produccion incluye la libreria' {
      $text = Get-Content -LiteralPath (Join-Path $repo 'installer\sc-sentinel.nsi') -Raw
      $text | Should Match '!include "lib\\install-state\.nsh"'
    }
    It 'la regla "carpeta vacia" ya no esta en el .nsi' {
      $text = Get-Content -LiteralPath (Join-Path $repo 'installer\sc-sentinel.nsi') -Raw
      $text | Should Not Match 'Elegi una carpeta vacia o desinstala la version anterior'
    }
    It 'el archivado de respaldos no usa MoveFile (no existe en NSIS)' {
      $text = Get-Content -LiteralPath (Join-Path $repo 'installer\sc-sentinel.nsi') -Raw
      $text | Should Not Match 'MoveFile'
    }
  }

  Context 'deteccion con el harness compilado' {
    It 'carpeta vacia: instalacion nueva (state 0)' -Skip:$skip {
      (Invoke-State -Dir (Join-Path $testRoot 'empty')).State | Should Be 0
    }

    It 'T13/T18: la carpeta del sintoma no se rechaza; con servicio es actualizacion (state 1)' -Skip:$skip {
      $r = Invoke-State -Dir $sym -ImagePath ('"' + (Join-Path $sym 'sc-sentinel-agent.exe') + '" --no-capture')
      $r.State | Should Be 1
      $r.Foreign | Should Be ''
    }

    It 'T18: la misma carpeta sin servicio es actualizacion que pide credenciales (state 4)' -Skip:$skip {
      $r = Invoke-State -Dir $sym
      $r.State | Should Be 4
      $r.Foreign | Should Be ''
    }

    It 'T18 (regresion): con la regla anterior esa misma carpeta se rechazaba' -Skip:$skip {
      (Invoke-State -Dir $sym).LegacyReject | Should Be $true
    }

    It 'T15: con servicio, el destino es la carpeta del ImagePath' -Skip:$skip {
      $r = Invoke-State -Dir $sym -ImagePath ('"' + (Join-Path $sym 'sc-sentinel-agent.exe') + '" -config C:\ProgramData\SC-Sentinel\config\config.toml --no-capture')
      $r.State | Should Be 1
      $r.ServiceDir | Should Be $sym
      $r.InstallDir | Should Be $sym
    }

    It 'T15: un /D distinto se ignora si el servicio apunta a otra carpeta' -Skip:$skip {
      $r = Invoke-State -Dir (Join-Path $testRoot 'empty') -ImagePath ('"' + (Join-Path $sym 'sc-sentinel-agent.exe') + '"')
      $r.State | Should Be 1
      $r.InstallDir | Should Be $sym
    }

    It 'T14: archivos ajenos sin servicio se rechazan y se listan hasta 5 nombres' -Skip:$skip {
      $r = Invoke-State -Dir $foreign
      $r.State | Should Be 3
      $r.Foreign | Should Match 'ajeno-1\.txt'
      $r.Foreign | Should Match 'ajeno-5\.txt'
      $r.Foreign | Should Not Match 'ajeno-6\.txt'
      $r.Reason | Should Match 'no borra ni pisa archivos ajenos'
      $r.Reason | Should Not Match 'desinstala'
    }

    It 'T14: un .bak con otro nombre no es propio y bloquea' -Skip:$skip {
      $r = Invoke-State -Dir $unknownBak
      $r.State | Should Be 3
      $r.Foreign | Should Match 'otro\.exe\.bak-20260101000000'
    }

    It 'con marcador pero sin servicio es actualizacion que pide credenciales (state 4)' -Skip:$skip {
      (Invoke-State -Dir $sym -Marker).State | Should Be 4
    }

    It 'marcador + archivos ajenos no rechaza: la carpeta es del producto' -Skip:$skip {
      (Invoke-State -Dir $foreign -Marker).State | Should Be 4
    }
  }

  Context 'T19: datos del cliente intactos (la deteccion solo lee)' {
    It 'estado 1 (servicio en la carpeta): el hash de config.toml no cambia' -Skip:$skip {
      $before = (Get-FileHash -LiteralPath $dataConfig -Algorithm SHA256).Hash
      $r = Invoke-State -Dir $sym -ImagePath ('"' + (Join-Path $sym 'sc-sentinel-agent.exe') + '" --no-capture')
      $r.State | Should Be 1
      (Get-FileHash -LiteralPath $dataConfig -Algorithm SHA256).Hash | Should Be $before
      (Test-Path -LiteralPath "$dataConfig.nuevo") | Should Be $false
    }

    It 'estado 4 (sin servicio): el hash de config.toml no cambia' -Skip:$skip {
      $before = (Get-FileHash -LiteralPath $dataConfig -Algorithm SHA256).Hash
      $r = Invoke-State -Dir $sym
      $r.State | Should Be 4
      (Get-FileHash -LiteralPath $dataConfig -Algorithm SHA256).Hash | Should Be $before
      (Test-Path -LiteralPath "$dataConfig.nuevo") | Should Be $false
    }
  }

  Context 'version detectada y aviso de degradacion' {
    It 'sin /status usa el DisplayVersion del registro' -Skip:$skip {
      $r = Invoke-State -Dir $sym -DisplayVersion '2.5.0'
      $r.Version | Should Be '2.5.0'
      $r.VersionSource | Should Be 'registro'
    }

    It 'sin ninguna fuente devuelve "desconocida" y no falla' -Skip:$skip {
      $r = Invoke-State -Dir $sym
      $r.Version | Should Be 'desconocida'
      $r.VersionSource | Should Be ''
    }

    It '1.10.2 se compara como mas nueva que 1.9.9 (no es orden de texto)' -Skip:$skip {
      $r = Invoke-State -Dir $sym -VersionA '1.10.2' -VersionB '1.9.9'
      ($r.CodeA -gt $r.CodeB) | Should Be $true
      $r.CodeA | Should Be 1010002
      $r.CodeB | Should Be 1009009
    }

    It 'acepta prefijo v y sufijos de preestreno sin romper el codigo' -Skip:$skip {
      $r = Invoke-State -Dir $sym -VersionA 'v0.1.11' -VersionB '0.1.9-rc1'
      ($r.CodeA -gt $r.CodeB) | Should Be $true
    }

    It 'un texto sin numeros no produce codigo comparable (-1)' -Skip:$skip {
      $r = Invoke-State -Dir $sym -VersionA 'desconocida' -VersionB '0.1.9'
      $r.CodeA | Should Be -1
      ($r.CodeB -gt 0) | Should Be $true
    }
  }

  # Limpieza al terminar el Describe (Pester 3.4 ejecuta este bloque tras los It).
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:\SCS_TEST_DIR, Env:\SCS_TEST_OUT, Env:\SCS_TEST_MARKER, Env:\SCS_TEST_SERVICE_IMAGEPATH, Env:\SCS_TEST_DISPLAYVERSION, Env:\SCS_TEST_VERSION_A, Env:\SCS_TEST_VERSION_B -ErrorAction SilentlyContinue
}
