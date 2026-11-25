#Requires -Version 5.1
<#
.SYNOPSIS
  Prueba de instalacion, validacion de carpeta y desinstalacion del instalador
  .exe de SC-Sentinel.
.DESCRIPTION
  Se ejecuta DENTRO de Windows Sandbox (usuario WDAGUtilityAccount), nunca en el
  equipo real. Comprueba, en este orden:

    A. Validacion de carpeta (T5): raiz de unidad, C:\Windows, UNC y carpeta con
       archivos ajenos -> exit 3 sin escribir nada y sin tocar lo ajeno.
    B. Instalacion silenciosa /S /D=C:\SCS-App (carpeta distinta a la de por
       defecto) y verificacion de archivos, versiones, hash de la GUI, servicio,
       entorno, registro y ACL (install, installer/token y data).
    C. Desinstalacion /S con un archivo ajeno dentro: solo se borra lo del
       manifiesto, el ajeno y la carpeta sobreviven (exit 6).
    D. Registro tampeado (InstallDir=C:\Windows): el desinstalador no borra
       nada de C:\Windows ni del directorio real (exit 6).

  Nunca imprime el token: solo comprueba que la variable existe y que el valor
  no aparece en config.toml ni en el archivo temporal.

  Escribe result.json y transcript.txt en -OutDir (carpeta mapeada del
  anfitrion) y devuelve exit 0 solo si todas las comprobaciones pasan.
.PARAMETER SetupPath
  Ruta del instalador .exe (dentro del sandbox, p. ej. C:\SCSTest\setup.exe).
.PARAMETER OutDir
  Carpeta mapeada donde se escriben los resultados.
.PARAMETER InstallDir
  Carpeta de instalacion para esta prueba. Por defecto C:\SCS-App (no la de
  por defecto, para probar que el instalador respeta la eleccion).
.PARAMETER ExpectedGuiSha256
  SHA256 de sc-gui.exe del paquete (lo calcula el lanzador desde el ZIP). Si se
  omite, la comprobacion de hash de la GUI se marca como no verificada.
.PARAMETER DeviceId
  Device id de prueba. Por defecto uno ficticio: no hay red en el sandbox.
.PARAMETER Token
  Token de prueba. Por defecto uno ficticio con forma sc_dev_....
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SetupPath,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$InstallDir = 'C:\SCS-App',
  [string]$ExpectedGuiSha256 = '',
  [string]$DeviceId = 'dev_sandbox0001abc',
  [string]$Token = 'sc_dev_sandboxPrueba0000000000000000000000'
)

$ErrorActionPreference = 'Continue'
$ServiceName = 'SC-Sentinel-Agent'
$DataDir = 'C:\ProgramData\SC-Sentinel'
$UninstallKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SC-Sentinel-Agent'
$ServiceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$SoftwareKey = 'HKLM:\Software\SC-Sentinel'

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$logPath = Join-Path $OutDir 'transcript.txt'
$results = New-Object System.Collections.ArrayList

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

function Test-ServiceRunning {
  param([int]$TimeoutSeconds = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

# SIDs universales en la ACL de un directorio (independiente del idioma).
function Get-AclEntries {
  param([string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  @($acl.Access | ForEach-Object {
    $sid = $_.IdentityReference.Value
    try { $sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { }
    [pscustomobject]@{ sid = $sid; rights = [string]$_.FileSystemRights; inherited = [bool]$_.IsInherited }
  })
}

function Test-AclLocked {
  param([string]$Path, [switch]$AllowUsersRead)
  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Check "seguridad.acl_$Path" $false "No existe $Path"
    return
  }
  $entries = Get-AclEntries $Path
  $sids = @($entries | ForEach-Object { $_.sid })
  $inherited = @($entries | Where-Object { $_.inherited }).Count
  $usersWrite = @($entries | Where-Object {
    $_.sid -eq 'S-1-5-32-545' -and $_.rights -match 'Write|Modify|FullControl|CreateFiles|AppendData'
  }).Count
  $ok = ($inherited -eq 0) -and ($sids -contains 'S-1-5-18') -and ($sids -contains 'S-1-5-32-544') -and ($usersWrite -eq 0)
  if (-not $AllowUsersRead) { $ok = $ok -and (-not ($sids -contains 'S-1-5-32-545')) }
  Add-Check "seguridad.acl_$Path" $ok ("SIDs: {0} · heredadas: {1} · escritura de Usuarios: {2}" -f ($sids -join ', '), $inherited, $usersWrite)
}

# Fase A: el instalador debe rechazar la carpeta con exit 3 y sin escribir.
function Test-RejectedDir {
  param([string]$Name, [string]$Dir, [string]$MarkerPath)
  $proc = Start-Process -FilePath $script:Setup -ArgumentList @('/S', "/D=$Dir") -Wait -PassThru
  Add-Check "directorio.$Name.exitcode" ($proc.ExitCode -eq 3) ("exit {0}, esperado 3" -f $proc.ExitCode)
  if ($MarkerPath) {
    Add-Check "directorio.$Name.sin_escritura" (-not (Test-Path -LiteralPath $MarkerPath)) "no existe $MarkerPath"
  }
}

Write-Log "== Prueba del instalador SC-Sentinel en Windows Sandbox =="
Write-Log ("Usuario: {0} · Equipo: {1} · {2}" -f $env:USERNAME, $env:COMPUTERNAME, [System.Environment]::OSVersion.VersionString)

if (-not (Test-Path -LiteralPath $SetupPath)) {
  Add-Check 'setup.presente' $false "No existe $SetupPath"
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir 'result.json') -Encoding UTF8
  exit 1
}
$script:Setup = $SetupPath
$setup = Get-Item -LiteralPath $SetupPath
$setupHash = (Get-FileHash -LiteralPath $setup.FullName -Algorithm SHA256).Hash
Write-Log ("Setup: {0} ({1} B) SHA256 {2}" -f $setup.FullName, $setup.Length, $setupHash)
$expectedVersion = $setup.VersionInfo.ProductVersion
Add-Check 'setup.version' ($expectedVersion -match '^\d+\.\d+\.\d+$') "ProductVersion $expectedVersion"
Add-Check 'setup.legalcopyright' (-not [string]::IsNullOrWhiteSpace($setup.VersionInfo.LegalCopyright)) "LegalCopyright '$($setup.VersionInfo.LegalCopyright)'"

$env:SCS_INSTALL_DEVICE_ID = $DeviceId
$env:SCS_INSTALL_TOKEN = $Token

# --- A. Validacion de carpeta ---------------------------------------------
Write-Log '== A. Carpetas rechazadas (/S, exit 3) =='

Test-RejectedDir 'raiz_unidad' 'C:\' 'C:\.sc-sentinel-install'
Test-RejectedDir 'windows' 'C:\Windows' 'C:\Windows\.sc-sentinel-install'
Test-RejectedDir 'windows_system32' 'C:\Windows\System32' 'C:\Windows\System32\.sc-sentinel-install'
Test-RejectedDir 'unc' '\\servidor\recurso' $null

$foreignContainer = 'C:\SCS-Ajeno'
New-Item -ItemType Directory -Path $foreignContainer -Force | Out-Null
$foreignFile = Join-Path $foreignContainer 'ajeno.txt'
Set-Content -LiteralPath $foreignFile -Value 'archivo ajeno: no debe borrarse ni pisarse' -Encoding UTF8
$foreignHashBefore = (Get-FileHash -LiteralPath $foreignFile -Algorithm SHA256).Hash
Test-RejectedDir 'con_ajenos' $foreignContainer $null
Add-Check 'directorio.con_ajenos.ajeno_intacto' (Test-Path -LiteralPath $foreignFile) "$foreignFile sigue existiendo"
Add-Check 'directorio.con_ajenos.sin_instalar' (-not (Test-Path -LiteralPath (Join-Path $foreignContainer 'sc-sentinel-agent.exe'))) 'no se copio el agente dentro'

# --- B. Instalacion silenciosa en una carpeta elegida ----------------------
Write-Log "== B. Instalacion /S en $InstallDir =="
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$install = Start-Process -FilePath $setup.FullName -ArgumentList @('/S', "/D=$InstallDir") -Wait -PassThru
$sw.Stop()
Add-Check 'instalacion.exitcode' ($install.ExitCode -eq 0) ("exit {0} en {1}s" -f $install.ExitCode, [int]$sw.Elapsed.TotalSeconds)

$agentExe = Join-Path $InstallDir 'sc-sentinel-agent.exe'
$guiExe = Join-Path $InstallDir 'sc-gui.exe'
$configFile = Join-Path $DataDir 'config\config.toml'
$installerDir = Join-Path $InstallDir 'installer'
$markerFile = Join-Path $InstallDir '.sc-sentinel-install'
$manifestFile = Join-Path $InstallDir '.sc-sentinel-manifest.txt'

Add-Check 'instalacion.binario' (Test-Path -LiteralPath $agentExe) $agentExe
if (Test-Path -LiteralPath $agentExe) {
  $agentVersion = (Get-Item -LiteralPath $agentExe).VersionInfo.FileVersion
  Add-Check 'instalacion.binario.version' ($agentVersion -eq $expectedVersion) "FileVersion $agentVersion, esperado $expectedVersion"
}
Add-Check 'instalacion.gui' (Test-Path -LiteralPath $guiExe) $guiExe
Add-Check 'instalacion.marcador' (Test-Path -LiteralPath $markerFile) $markerFile
Add-Check 'instalacion.manifiesto' (Test-Path -LiteralPath $manifestFile) $manifestFile
Add-Check 'instalacion.geolite2.country' (Test-Path -LiteralPath (Join-Path $InstallDir 'geolite2\GeoLite2-Country.mmdb')) 'GeoLite2-Country.mmdb'
Add-Check 'instalacion.geolite2.asn' (Test-Path -LiteralPath (Join-Path $InstallDir 'geolite2\GeoLite2-ASN.mmdb')) 'GeoLite2-ASN.mmdb'
Add-Check 'instalacion.config' (Test-Path -LiteralPath $configFile) $configFile
Add-Check 'instalacion.desinstalador' (Test-Path -LiteralPath (Join-Path $InstallDir 'uninstall.exe')) "$InstallDir\uninstall.exe"

# T2: la GUI instalada es la del paquete y declara version (B-002).
if (Test-Path -LiteralPath $guiExe) {
  $guiVersion = (Get-Item -LiteralPath $guiExe).VersionInfo.FileVersion
  Add-Check 'instalacion.gui.fileversion' ($guiVersion -eq $expectedVersion) "FileVersion $guiVersion, esperado $expectedVersion"
  if ($ExpectedGuiSha256) {
    $guiHash = (Get-FileHash -LiteralPath $guiExe -Algorithm SHA256).Hash.ToLowerInvariant()
    Add-Check 'instalacion.gui.hash' ($guiHash -eq $ExpectedGuiSha256.ToLowerInvariant()) "SHA256 $guiHash"
  } else {
    Add-Check 'instalacion.gui.hash' $false 'Sin -ExpectedGuiSha256: no se pudo comparar la GUI con el paquete'
  }
}

# El token no puede quedar ni en config.toml ni en el archivo temporal.
if (Test-Path -LiteralPath $configFile) {
  $configText = [System.IO.File]::ReadAllText($configFile)
  Add-Check 'seguridad.token_no_en_config' (-not $configText.Contains($Token)) 'config.toml no contiene el token'
}
Add-Check 'seguridad.token_temporal_borrado' (-not (Test-Path -LiteralPath (Join-Path $installerDir 'ingest-token.tmp'))) 'installer\ingest-token.tmp no existe'

# ACL (T1): instalacion, installer/token y datos.
Test-AclLocked $InstallDir -AllowUsersRead
Test-AclLocked $installerDir
Test-AclLocked $DataDir

# --- Servicio y registro ---------------------------------------------------
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
Add-Check 'servicio.instalado' ($null -ne $svc) $ServiceName
Add-Check 'servicio.running' (Test-ServiceRunning) 'servicio en ejecucion antes de 90 s'

if (Test-Path -LiteralPath $ServiceKey) {
  $imagePath = (Get-ItemProperty -LiteralPath $ServiceKey -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
  Add-Check 'servicio.imagepath' ($imagePath -like "*$agentExe*" -and $imagePath -like '*--no-capture*') $imagePath

  $envVars = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
  $tokenCount = @($envVars | Where-Object { $_ -like 'SC_INGEST_TOKEN=*' }).Count
  $deviceOk = @($envVars | Where-Object { $_ -like "SC_SENTINEL_DEVICE_ID=$DeviceId" }).Count -eq 1
  Add-Check 'servicio.env.token_presente' ($tokenCount -eq 1) ("SC_INGEST_TOKEN x{0} (valor no inspeccionado)" -f $tokenCount)
  Add-Check 'servicio.env.device_id' $deviceOk "SC_SENTINEL_DEVICE_ID = $DeviceId"
} else {
  Add-Check 'servicio.clave_registro' $false $ServiceKey
}

$uninst = Get-ItemProperty -LiteralPath $UninstallKey -ErrorAction SilentlyContinue
Add-Check 'registro.uninstall_key' ($null -ne $uninst) $UninstallKey
if ($uninst) {
  Add-Check 'registro.version' ($uninst.DisplayVersion -eq $expectedVersion) "DisplayVersion $($uninst.DisplayVersion), esperado $expectedVersion"
  Add-Check 'registro.quiet_uninstall' ("$($uninst.QuietUninstallString)" -like '*/S*') "$($uninst.QuietUninstallString)"
}
$regInstallDir = (Get-ItemProperty -LiteralPath $SoftwareKey -Name InstallDir -ErrorAction SilentlyContinue).InstallDir
Add-Check 'registro.installdir' ($regInstallDir -eq $InstallDir) "InstallDir $regInstallDir"
$regDataDir = (Get-ItemProperty -LiteralPath $SoftwareKey -Name DataDir -ErrorAction SilentlyContinue).DataDir
Add-Check 'registro.datadir' ($regDataDir -eq $DataDir) "DataDir $regDataDir"

# --- E. T13-T18: actualizacion sobre una instalacion hecha con scripts ----
# Se convierte la instalacion de la fase B en el escenario del defecto
# reportado: sin marcador, sin desinstalador, sin carpeta installer y con cinco
# respaldos .bak-<marca>; el servicio apunta a esa carpeta. Todo ocurre dentro
# del sandbox: nada de esto toca el equipo real.
Write-Log '== E. Actualizacion sobre una instalacion hecha con scripts (T13-T18) =='
$scriptInstall = 'C:\SCS-Scripts'
$otherDir = 'C:\SCS-Otro'
New-Item -ItemType Directory -Path $scriptInstall -Force | Out-Null
foreach ($f in @('sc-sentinel-agent.exe', 'sc-gui.exe', 'abrir-gui.bat')) {
  Copy-Item -LiteralPath (Join-Path $InstallDir $f) -Destination (Join-Path $scriptInstall $f) -Force
}
Copy-Item -LiteralPath (Join-Path $InstallDir 'geolite2') -Destination (Join-Path $scriptInstall 'geolite2') -Recurse -Force
for ($i = 1; $i -le 5; $i++) {
  Set-Content -LiteralPath (Join-Path $scriptInstall ("sc-sentinel-agent.exe.bak-2026010100000$i")) -Value '' -NoNewline
}
# El binario "instalado por scripts" se distingue del que trae el paquete: si
# fuera identico, deploy-agent-service.ps1 responderia "nada que desplegar" y
# la prueba no ejercitaria el reemplazo ni el respaldo.
[System.IO.File]::AppendAllText((Join-Path $scriptInstall 'sc-sentinel-agent.exe'), 'SCS-SANDBOX')
$oldAgentHash = (Get-FileHash -LiteralPath (Join-Path $scriptInstall 'sc-sentinel-agent.exe') -Algorithm SHA256).Hash

# El servicio se reapunta a la carpeta del sintoma conservando su Environment.
$savedEnv = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
$tokenBefore = @($savedEnv | Where-Object { $_ -like 'SC_INGEST_TOKEN=*' })[0]
Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
sc.exe delete $ServiceName | Out-Null
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  sc.exe query $ServiceName *> $null
  if ($LASTEXITCODE -eq 1060) { break }
  Start-Sleep -Seconds 1
}
$scriptBinPath = '"' + (Join-Path $scriptInstall 'sc-sentinel-agent.exe') + '" -config "' + (Join-Path $DataDir 'config\config.toml') + '" --no-capture'
New-Service -Name $ServiceName -BinaryPathName $scriptBinPath -DisplayName 'SC Sentinel sandbox' -StartupType Automatic | Out-Null
New-ItemProperty -Path $ServiceKey -Name Environment -Value $savedEnv -PropertyType MultiString -Force | Out-Null
Start-Service -Name $ServiceName
Add-Check 'actualizacion.servicio_ficticio' (Test-ServiceRunning 60) 'servicio apuntando a C:\SCS-Scripts en ejecucion'
Add-Check 'actualizacion.sin_marcador' (-not (Test-Path -LiteralPath (Join-Path $scriptInstall '.sc-sentinel-install'))) 'la carpeta no tiene marcador del instalador'
Add-Check 'actualizacion.sin_desinstalador' (-not (Test-Path -LiteralPath (Join-Path $scriptInstall 'uninstall.exe'))) 'la carpeta no tiene uninstall.exe'

$configHashBefore = if (Test-Path -LiteralPath $configFile) { (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash } else { '' }
$spoolFile = Join-Path $DataDir 'spool\sc-spool.sqlite'
$spoolHashBefore = if (Test-Path -LiteralPath $spoolFile) { (Get-FileHash -LiteralPath $spoolFile -Algorithm SHA256).Hash } else { '' }

# T15/T18: /S con otra carpeta. El destino lo manda el servicio: /D se ignora.
$upd = Start-Process -FilePath $setup.FullName -ArgumentList @('/S', "/D=$otherDir") -Wait -PassThru
Add-Check 'actualizacion.exitcode' ($upd.ExitCode -eq 0) ("exit {0}, esperado 0" -f $upd.ExitCode)
Add-Check 'actualizacion.destino_fijo' (-not (Test-Path -LiteralPath $otherDir)) "no se creo $otherDir"
$regInstallDir2 = (Get-ItemProperty -LiteralPath $SoftwareKey -Name InstallDir -ErrorAction SilentlyContinue).InstallDir
Add-Check 'actualizacion.registro_destino' ($regInstallDir2 -eq $scriptInstall) "InstallDir $regInstallDir2"
$installedAgent = Join-Path $scriptInstall 'sc-sentinel-agent.exe'
$payloadAgent = Join-Path $scriptInstall 'installer\sc-sentinel-agent.exe'
if (Test-Path -LiteralPath $payloadAgent) {
  $installedHash = (Get-FileHash -LiteralPath $installedAgent -Algorithm SHA256).Hash
  $payloadHash = (Get-FileHash -LiteralPath $payloadAgent -Algorithm SHA256).Hash
  Add-Check 'actualizacion.binario_reemplazado' ($installedHash -eq $payloadHash -and $installedHash -ne $oldAgentHash) ("sha instalado={0} sha paquete={1}" -f $installedHash.Substring(0, 12), $payloadHash.Substring(0, 12))
} else {
  Add-Check 'actualizacion.binario_reemplazado' $false "no existe $payloadAgent"
}
$agentVersion2 = (Get-Item -LiteralPath $installedAgent).VersionInfo.FileVersion
Add-Check 'actualizacion.binario_version' ($agentVersion2 -eq $expectedVersion) "FileVersion $agentVersion2"
$guiVersion2 = (Get-Item -LiteralPath (Join-Path $scriptInstall 'sc-gui.exe')).VersionInfo.FileVersion
Add-Check 'actualizacion.gui_version' ($guiVersion2 -eq $expectedVersion) "FileVersion $guiVersion2"
Add-Check 'actualizacion.desinstalador_creado' (Test-Path -LiteralPath (Join-Path $scriptInstall 'uninstall.exe')) 'uninstall.exe creado en la carpeta actualizada'
Add-Check 'actualizacion.marcador_creado' (Test-Path -LiteralPath (Join-Path $scriptInstall '.sc-sentinel-install')) '.sc-sentinel-install creado'
$uninst2 = Get-ItemProperty -LiteralPath $UninstallKey -ErrorAction SilentlyContinue
Add-Check 'actualizacion.registro_aplicaciones' ($null -ne $uninst2 -and $uninst2.DisplayVersion -eq $expectedVersion) "DisplayVersion $($uninst2.DisplayVersion)"
# Respaldo verificado de la version anterior (deploy-agent-service.ps1).
$bak = Join-Path $DataDir 'backup\sc-sentinel-agent.exe.bak'
$bakSha = Join-Path $DataDir 'backup\sc-sentinel-agent.exe.bak.sha256'
Add-Check 'actualizacion.respaldo' (Test-Path -LiteralPath $bak) $bak
if ((Test-Path -LiteralPath $bak) -and (Test-Path -LiteralPath $bakSha)) {
  $bakHash = (Get-FileHash -LiteralPath $bak -Algorithm SHA256).Hash
  $bakExpected = ((Get-Content -LiteralPath $bakSha -TotalCount 1) -split '\s+')[0].Trim().ToUpper()
  Add-Check 'actualizacion.respaldo_sha256' ($bakHash -eq $bakExpected -and $bakHash -eq $oldAgentHash) 'sha256 del .bak coincide con el binario anterior'
} else {
  Add-Check 'actualizacion.respaldo_sha256' $false 'falta el .bak o su .sha256'
}
# T16: datos y token intactos.
$configHashAfter = if (Test-Path -LiteralPath $configFile) { (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash } else { '' }
Add-Check 'actualizacion.config_conservado' ($configHashBefore -ne '' -and $configHashBefore -eq $configHashAfter) 'config.toml sin cambios'
$spoolHashAfter = if (Test-Path -LiteralPath $spoolFile) { (Get-FileHash -LiteralPath $spoolFile -Algorithm SHA256).Hash } else { '' }
Add-Check 'actualizacion.spool_conservado' ($spoolHashBefore -eq '' -or $spoolHashBefore -eq $spoolHashAfter) 'spool sin cambios'
$envAfter = @((Get-ItemProperty -LiteralPath $ServiceKey -Name Environment -ErrorAction SilentlyContinue).Environment)
$tokenAfter = @($envAfter | Where-Object { $_ -like 'SC_INGEST_TOKEN=*' })[0]
Add-Check 'actualizacion.token_conservado' ($tokenBefore -eq $tokenAfter -and -not [string]::IsNullOrEmpty($tokenBefore)) 'SC_INGEST_TOKEN igual antes y despues (valor no impreso)'
Add-Check 'actualizacion.servicio_running' (Test-ServiceRunning 90) 'servicio en ejecucion despues de actualizar'

# T17: casilla de archivado de respaldos (por entorno, para poder automatizarla).
$env:SCS_INSTALL_ARCHIVE_BAKS = '1'
$upd2 = Start-Process -FilePath $setup.FullName -ArgumentList @('/S') -Wait -PassThru
Remove-Item Env:\SCS_INSTALL_ARCHIVE_BAKS -ErrorAction SilentlyContinue
Add-Check 'archivado.exitcode' ($upd2.ExitCode -eq 0) ("exit {0}, esperado 0" -f $upd2.ExitCode)
$legacyDir = Join-Path $DataDir 'backup\legacy'
Add-Check 'archivado.carpeta' (Test-Path -LiteralPath $legacyDir) $legacyDir
$legacyBaks = @(Get-ChildItem -LiteralPath $legacyDir -Filter 'sc-sentinel-agent.exe.bak-*' -ErrorAction SilentlyContinue)
Add-Check 'archivado.cinco_respaldos' ($legacyBaks.Count -ge 5) ("{0} respaldos en legacy" -f $legacyBaks.Count)
$leftBaks = @(Get-ChildItem -LiteralPath $scriptInstall -Filter 'sc-sentinel-agent.exe.bak-*' -ErrorAction SilentlyContinue)
Add-Check 'archivado.sin_residuos' ($leftBaks.Count -eq 0) ("{0} respaldos quedan en la carpeta de instalacion" -f $leftBaks.Count)
if (Test-Path -LiteralPath $legacyDir) {
  $legacyAcl = Get-AclEntries $legacyDir
  $legacyInherited = @($legacyAcl | Where-Object { $_.inherited }).Count
  $legacySystem = @($legacyAcl | Where-Object { $_.sid -eq 'S-1-5-18' }).Count
  $legacyAdmins = @($legacyAcl | Where-Object { $_.sid -eq 'S-1-5-32-544' }).Count
  Add-Check 'archivado.acl' ($legacyInherited -eq 0 -and $legacySystem -gt 0 -and $legacyAdmins -gt 0) ("SIDs: {0} - heredadas: {1}" -f (@($legacyAcl | ForEach-Object { $_.sid }) -join ', '), $legacyInherited)
}

# La desinstalacion de la fase C pasa a operar sobre la instalacion actualizada.
$InstallDir = $scriptInstall
$agentExe = Join-Path $InstallDir 'sc-sentinel-agent.exe'
$guiExe = Join-Path $InstallDir 'sc-gui.exe'
$installerDir = Join-Path $InstallDir 'installer'
$markerFile = Join-Path $InstallDir '.sc-sentinel-install'
$manifestFile = Join-Path $InstallDir '.sc-sentinel-manifest.txt'

# --- C. Desinstalacion con un archivo ajeno -------------------------------
# Se copia la instalacion para la fase D antes de tocar nada.
Write-Log '== C. Desinstalacion /S con archivo ajeno =='
$tamperCopy = 'C:\SCS-Copia'
Copy-Item -LiteralPath $InstallDir -Destination $tamperCopy -Recurse -Force
Add-Check 'desinstalacion.copia_para_tamper' (Test-Path -LiteralPath (Join-Path $tamperCopy 'sc-sentinel-agent.exe')) $tamperCopy

$ownFile = Join-Path $InstallDir 'nota-ajena.txt'
Set-Content -LiteralPath $ownFile -Value 'archivo ajeno dentro de la instalacion' -Encoding UTF8
$uninstallExe = Join-Path $InstallDir 'uninstall.exe'
$uninstProc = Start-Process -FilePath $uninstallExe -ArgumentList @('/S') -Wait -PassThru
Add-Check 'desinstalacion.exitcode' ($uninstProc.ExitCode -eq 6) ("exit {0}, esperado 6 por la carpeta con ajenos" -f $uninstProc.ExitCode)

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 2
}
$svcAfter = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
Add-Check 'desinstalacion.servicio_eliminado' ($null -eq $svcAfter) 'el servicio ya no existe'
Add-Check 'desinstalacion.registro_eliminado' (-not (Test-Path -LiteralPath $UninstallKey)) $UninstallKey
Add-Check 'desinstalacion.clave_software_eliminada' (-not (Test-Path -LiteralPath $SoftwareKey)) 'HKLM\Software\SC-Sentinel'
Add-Check 'desinstalacion.propios_eliminados' (-not (Test-Path -LiteralPath $agentExe) -and -not (Test-Path -LiteralPath $guiExe)) 'agente y GUI eliminados'
Add-Check 'desinstalacion.installer_dir_eliminado' (-not (Test-Path -LiteralPath $installerDir)) "$installerDir eliminado"
Add-Check 'desinstalacion.ajeno_intacto' ((Test-Path -LiteralPath $ownFile) -and ((Get-Content -LiteralPath $ownFile -Raw).Trim() -eq 'archivo ajeno dentro de la instalacion')) "$ownFile sigue con su contenido"
Add-Check 'desinstalacion.directorio_con_ajeno_conservado' (Test-Path -LiteralPath $InstallDir) "$InstallDir se conservo"
Add-Check 'desinstalacion.programdata_conservado' (Test-Path -LiteralPath $configFile) "$configFile se conserva"
Add-Check 'desinstalacion.ajeno_externo_intacto' ((Get-FileHash -LiteralPath $foreignFile -Algorithm SHA256).Hash -eq $foreignHashBefore) "$foreignFile sin cambios"

# --- D. Registro tampeado a una carpeta de sistema ------------------------
Write-Log '== D. Registro tampeado (InstallDir=C:\Windows) =='
New-Item -Path $SoftwareKey -Force | Out-Null
Set-ItemProperty -LiteralPath $SoftwareKey -Name InstallDir -Value 'C:\Windows' -Force
$tamperUninstaller = Join-Path $tamperCopy 'uninstall.exe'
$tamperProc = Start-Process -FilePath $tamperUninstaller -ArgumentList @('/S') -Wait -PassThru
Add-Check 'tamper.exitcode' ($tamperProc.ExitCode -eq 6) ("exit {0}, esperado 6" -f $tamperProc.ExitCode)
Add-Check 'tamper.windows_intacto' (-not (Test-Path -LiteralPath 'C:\Windows\.sc-sentinel-install')) 'C:\Windows sin marcador'
Add-Check 'tamper.windows_sin_agente' (-not (Test-Path -LiteralPath 'C:\Windows\sc-sentinel-agent.exe')) 'C:\Windows sin sc-sentinel-agent.exe'
Add-Check 'tamper.copia_intacta' (Test-Path -LiteralPath (Join-Path $tamperCopy 'sc-sentinel-agent.exe')) 'la carpeta real no se borro'
Add-Check 'tamper.registro_eliminado' (-not (Test-Path -LiteralPath $SoftwareKey)) 'HKLM\Software\SC-Sentinel eliminada'

# --- Limpieza de las carpetas de la prueba --------------------------------
Write-Log '== Limpieza =='
foreach ($dir in @($tamperCopy, $foreignContainer, $InstallDir, 'C:\SCS-App')) {
  if (Test-Path -LiteralPath $dir) {
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log ("  {0} eliminado: {1}" -f $dir, (-not (Test-Path -LiteralPath $dir)))
  }
}
Remove-Item -LiteralPath $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $SoftwareKey -Recurse -Force -ErrorAction SilentlyContinue

# --- Resumen --------------------------------------------------------------
$failed = @($results | Where-Object { -not $_.ok })
$summary = [pscustomobject]@{
  fecha = (Get-Date).ToString('s')
  equipo = $env:COMPUTERNAME
  usuario = $env:USERNAME
  setup = $setup.FullName
  setup_sha256 = $setupHash
  install_dir = $InstallDir
  total = $results.Count
  fallos = $failed.Count
  ok = ($failed.Count -eq 0)
  checks = $results
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutDir 'result.json') -Encoding UTF8

Write-Log "== Resumen: $($results.Count) comprobaciones, $($failed.Count) fallo(s) =="
if ($failed.Count -gt 0) {
  foreach ($f in $failed) { Write-Log ("  FALLO {0}: {1}" -f $f.check, $f.detail) }
}
Set-Content -LiteralPath (Join-Path $OutDir 'done.txt') -Value $summary.fecha -Encoding UTF8

if ($failed.Count -gt 0) { exit 1 }
exit 0
