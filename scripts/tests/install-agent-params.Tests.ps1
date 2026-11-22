# Pester 3.4 (Windows PowerShell 5.1): sintaxis Should Be / Should Match.
# Verifica los invariantes del instalador que no requieren instalar nada:
# B-014 (token fuera de argv), T2 (corte duro de la GUI) y T5 (validacion de
# carpeta y desinstalacion por manifiesto).

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installAgent = (Resolve-Path (Join-Path $here '..\install-agent.ps1')).Path
$nsiPath = (Resolve-Path (Join-Path $here '..\..\installer\sc-sentinel.nsi')).Path
$agentText = [System.IO.File]::ReadAllText($installAgent)

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($installAgent, [ref]$tokens, [ref]$errors)
$params = @($ast.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })

Describe 'install-agent.ps1 (B-014: el token no viaja por argv)' {
    It 'no declara un parametro de token' {
        ($params -contains 'IngestToken') | Should Be $false
    }

    It 'acepta el token por archivo' {
        ($params -contains 'IngestTokenFile') | Should Be $true
    }

    It 'lee SCS_INSTALL_TOKEN del entorno' {
        $agentText | Should Match 'SCS_INSTALL_TOKEN'
    }

    It 'el parametro de carpeta existe y se normaliza' {
        ($params -contains 'InstallDir') | Should Be $true
        $agentText | Should Match 'TrimEnd'
    }
}

Describe 'install-agent.ps1 (T2: nunca GUI vieja en silencio)' {
    It 'corta antes de tocar nada si sc-gui esta en ejecucion' {
        $agentText | Should Match "Get-Process -Name 'sc-gui'"
        $agentText | Should Match 'exit 4'
    }

    It 'compara el hash de la GUI copiada y conserva un .bak para el rollback' {
        $agentText | Should Match 'guiSrcHash'
        $agentText | Should Match 'GuiBak'
    }

    It 'verifica el SHA del agente con codigo 4' {
        $agentText | Should Match 'rollback'
        $agentText | Should Match '-Code 4'
    }

    It 'aplica ACL de datos sin herencia ni Usuarios' {
        $agentText | Should Match 'icacls \$DataDir /inheritance:r'
    }
}

Describe 'instalador NSIS (T5: no tocar sistema ni archivos ajenos)' {
    $nsi = [System.IO.File]::ReadAllText($nsiPath)

    It 'sale con codigo 3 si la carpeta es invalida en modo silencioso' {
        $nsi | Should Match 'SetErrorLevel 3'
    }

    It 'rechaza rutas UNC y raices de unidad' {
        $nsi | Should Match 'No se admiten rutas de red'
        $nsi | Should Match 'No se puede instalar en la raiz de una unidad'
    }

    It 'exige marcador para aceptar una carpeta no vacia' {
        $nsi | Should Match '\.sc-sentinel-install'
    }

    It 'desinstala por manifiesto y no hace RMDir /r sobre el directorio' {
        $nsi | Should Match '\.sc-sentinel-manifest\.txt'
        ($nsi -match 'RMDir /r "\$INSTDIR"') | Should Be $false
    }

    It 'usa SIDs universales (SYSTEM y Administradores)' {
        $nsi | Should Match 'S-1-5-18'
        $nsi | Should Match 'S-1-5-32-544'
    }

    It 'cierra el aviso 9100 con LegalCopyright' {
        $nsi | Should Match 'VIAddVersionKey /LANG=0 "LegalCopyright"'
    }
}

Describe 're-enroll-device.ps1 (B-014: el token tampoco viaja por argv)' {
    $reEnrollPath = (Resolve-Path (Join-Path $here '..\re-enroll-device.ps1')).Path
    $reEnrollText = [System.IO.File]::ReadAllText($reEnrollPath)
    $reTokens = $null
    $reErrors = $null
    $reAst = [System.Management.Automation.Language.Parser]::ParseFile($reEnrollPath, [ref]$reTokens, [ref]$reErrors)
    $reParams = @($reAst.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })

    It 'no declara un parametro de token' {
        ($reParams -contains 'IngestToken') | Should Be $false
    }

    It 'acepta el token por archivo y lee SC_ENROLL_TOKEN del entorno' {
        ($reParams -contains 'IngestTokenFile') | Should Be $true
        $reEnrollText | Should Match 'SC_ENROLL_TOKEN'
    }

    It 'borra el archivo del token al leerlo' {
        $reEnrollText | Should Match 'Remove-Item -LiteralPath \$IngestTokenFile'
    }

    It 'la GUI pasa el token por entorno, no por argv' {
        $enrollRs = [System.IO.File]::ReadAllText((Resolve-Path (Join-Path $here '..\..\agent\crates\sc-gui\src\enroll.rs')).Path)
        ($enrollRs -match '"-IngestToken"') | Should Be $false
        $enrollRs | Should Match 'SC_ENROLL_TOKEN'
    }
}

Describe 'install-agent.ps1 (actualizacion sobre un servicio existente)' {
    It 'declara -UpdateMode' {
        ($params -contains 'UpdateMode') | Should Be $true
    }

    It 'en modo actualizacion no exige token ni device id' {
        $agentText | Should Match 'if \(-not \$UpdateMode\) \{'
    }

    It 'delega el reemplazo en deploy-agent-service.ps1 (respaldo verificado, drenaje, sync)' {
        $agentText | Should Match 'deploy-agent-service\.ps1'
        $agentText | Should Match '-Mode Deploy'
        $agentText | Should Match 'SyncTimeoutSec'
    }

    It 'no recrea ni borra el servicio en la rama de actualizacion' {
        $start = $agentText.IndexOf('if ($UpdateMode) {')
        $end = $agentText.IndexOf('# Paso 1: Verificar servicio previo y binario')
        ($start -gt 0 -and $end -gt $start) | Should Be $true
        $branch = $agentText.Substring($start, $end - $start)
        ($branch -match 'sc\.exe delete') | Should Be $false
        ($branch -match 'New-Service') | Should Be $false
        $branch | Should Match 'Install-GuiAndLauncher'
    }

    It 'no imprime el Device ID completo' {
        ($agentText -match 'Write-Host "Device ID: \$DeviceId"') | Should Be $false
        $agentText | Should Match 'DeviceIdShort'
    }
}

Describe 'instalador NSIS (actualizacion, no rechazo de instalacion existente)' {
    $nsi = [System.IO.File]::ReadAllText($nsiPath)

    It 'incluye la libreria de deteccion de estado' {
        $nsi | Should Match 'install-state\.nsh'
    }

    It 'no exige la carpeta vacia ni sugiere desinstalar' {
        ($nsi -match 'Elegi una carpeta vacia') | Should Be $false
        ($nsi -match 'desinstala la version anterior') | Should Be $false
    }

    It 'pasa -UpdateMode solo para una actualizacion con servicio' {
        $nsi | Should Match '\$InstallState == 1'
        $nsi | Should Match '-UpdateMode'
    }

    It 'archiva respaldos antiguos con Rename (nunca Delete) y ACL SYSTEM+Administradores' {
        $nsi | Should Match 'Rename '
        ($nsi -match 'MoveFile') | Should Be $false
        $nsi | Should Match 'backup\\legacy'
    }
}

Describe 'install-agent.ps1 (config.toml intacto, codigo 19 y copia instalada)' {
    It 'declara -AllowLocalScripts y exige ejecutar desde <InstallDir>\installer' {
        ($params -contains 'AllowLocalScripts') | Should Be $true
        $agentText | Should Match 'expectedDir'
        $agentText | Should Match 'La actualizacion solo puede ejecutarse desde la copia instalada'
    }

    It 'propaga el codigo 19 de deploy-agent-service.ps1 y sale con 19' {
        $agentText | Should Match '\$syncPending = \$true'
        $agentText | Should Match 'exit 19'
    }

    It 'no describe el 19 como falta de red' {
        ($agentText -match 'equipo sin red') | Should Be $false
        $agentText | Should Match 'no fue posible confirmar|no confirmo ninguna ventana'
    }

    It 'verifica la GUI contra SHA256SUMS.txt y respalda antes de reemplazar' {
        $agentText | Should Match 'Get-PackageManifestHash'
        $agentText | Should Match 'SHA256SUMS\.txt'
        $agentText | Should Match '\$guiBak\.sha256'
    }
}

Describe 'instalador NSIS (version detectada y avisos 7/19)' {
    $nsi = [System.IO.File]::ReadAllText($nsiPath)
    $lib = [System.IO.File]::ReadAllText((Resolve-Path (Join-Path $here '..\..\installer\lib\install-state.nsh')).Path)

    It 'consulta /status en loopback con tope de 2 s antes que el registro' {
        $lib | Should Match '127\.0\.0\.1:8387/status'
        $lib | Should Match 'TimeoutSec 2'
        $statusAt = $lib.IndexOf('8387/status')
        $regAt = $lib.LastIndexOf('DisplayVersion')
        ($statusAt -gt 0 -and $regAt -gt $statusAt) | Should Be $true
    }

    It 'cae a desconocida sin fallar' {
        $lib | Should Match 'StrCpy \$DetectedVersion "desconocida"'
        $lib | Should Match '\$VersionSource "exe"'
    }

    It 'aborta en /S una degradacion con codigo 7 y pide confirmacion con UI' {
        $nsi | Should Match 'SetErrorLevel 7'
        $nsi | Should Match 'es mas nueva que la de este instalador'
        $nsi | Should Match 'Call ScsVersionCode'
    }

    It 'muestra el aviso 19 en la pagina final y devuelve 19 en /S' {
        $nsi | Should Match '\$FinishText'
        $nsi | Should Match '\$SyncPending 1'
        $nsi | Should Match 'SetErrorLevel 19'
        ($nsi -match 'MUI_FINISHPAGE_TEXT "SC-Sentinel qued') | Should Be $false
    }

    It 'el estado 4 conserva config.toml y avisa de config.toml.nuevo' {
        $nsi | Should Match 'config\.toml NUNCA se reescribe'
        $nsi | Should Match 'config\.toml\.nuevo'
    }
}
