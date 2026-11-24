# Pester 3.4 (Windows PowerShell 5.1): sintaxis Should Be / Should Match.
# Prueba la regla "si config.toml existe, nunca se reescribe" y el respaldo
# verificado (.bak + .sha256) antes de tocar datos de ProgramData.
#
# Solo usa carpetas temporales: no toca ProgramData, el servicio ni el registro.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = (Resolve-Path (Join-Path $here '..\lib\config-toml.psm1')).Path
$installAgent = (Resolve-Path (Join-Path $here '..\install-agent.ps1')).Path
$agentText = [System.IO.File]::ReadAllText($installAgent)

Import-Module $modulePath -Force

function Get-TestSha {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

Describe 'scripts/lib/config-toml.psm1 (config.toml existente nunca se reescribe)' {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) 'scs-config-toml-tests'
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $root -Force | Out-Null

    $customerConfig = "# configuracion del cliente`r`n[ingest]`r`nurl = `"https://ingesta.interna/api/ingest`"`r`n`r`n[collector]`r`nlisteners = [{ port = 9999, protocol = `"auto`" }]`r`n"
    $generatedConfig = "# SC-Sentinel Agent Configuration`r`n[ingest]`r`nurl = `"https://sc-sentinel.vercel.app/api/ingest`"`r`n"

    It 'crea config.toml cuando no existe y verifica el contenido escrito' {
        $dir = Join-Path $root 'nuevo'
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $cfg = Join-Path $dir 'config.toml'
        $res = Set-ScsConfigToml -Path $cfg -Content $generatedConfig -BackupDir (Join-Path $dir 'backup')
        $res.Action | Should Be 'created'
        (Get-Content -LiteralPath $cfg -Raw) | Should Be $generatedConfig
        $res.Sha256 | Should Be (Get-TestSha $cfg)
        $res.Sha256 | Should Be (Get-ScsTextSha256 -Text $generatedConfig)
    }

    It 'estado 1/4: un config.toml existente con otra configuracion queda intacto' {
        $dir = Join-Path $root 'existente'
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $cfg = Join-Path $dir 'config.toml'
        [System.IO.File]::WriteAllText($cfg, $customerConfig, [System.Text.UTF8Encoding]::new($false))
        $before = Get-TestSha $cfg

        $res = Set-ScsConfigToml -Path $cfg -Content $generatedConfig -BackupDir (Join-Path $dir 'backup')

        $res.Action | Should Be 'preserved-and-proposed'
        (Get-TestSha $cfg) | Should Be $before
        (Get-Content -LiteralPath $cfg -Raw) | Should Be $customerConfig
    }

    It 'estado 1/4: la propuesta se deja en config.toml.nuevo con su .sha256' {
        $dir = Join-Path $root 'existente'
        $cfg = Join-Path $dir 'config.toml'
        $res = Set-ScsConfigToml -Path $cfg -Content $generatedConfig -BackupDir (Join-Path $dir 'backup')
        $res.ProposalPath | Should Be "$cfg.nuevo"
        (Test-Path -LiteralPath $res.ProposalPath) | Should Be $true
        (Get-Content -LiteralPath $res.ProposalPath -Raw) | Should Be $generatedConfig
        ((Get-Content -LiteralPath "$($res.ProposalPath).sha256" -TotalCount 1).Trim()) | Should Be (Get-TestSha $res.ProposalPath)
    }

    It 'estado 1/4: antes de proponer deja un respaldo verificado de la configuracion' {
        $dir = Join-Path $root 'existente'
        $cfg = Join-Path $dir 'config.toml'
        $res = Set-ScsConfigToml -Path $cfg -Content $generatedConfig -BackupDir (Join-Path $dir 'backup')
        (Test-Path -LiteralPath $res.BackupPath) | Should Be $true
        (Get-TestSha $res.BackupPath) | Should Be $res.Sha256
        ((Get-Content -LiteralPath "$($res.BackupPath).sha256" -TotalCount 1).Trim()) | Should Be $res.Sha256
        $res.Sha256 | Should Be (Get-TestSha $cfg)
    }

    It 'no toca ni respalda nada si el contenido generado es identico al instalado' {
        $dir = Join-Path $root 'identico'
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $cfg = Join-Path $dir 'config.toml'
        [System.IO.File]::WriteAllText($cfg, $generatedConfig, [System.Text.UTF8Encoding]::new($false))
        $before = Get-TestSha $cfg
        $res = Set-ScsConfigToml -Path $cfg -Content $generatedConfig -BackupDir (Join-Path $dir 'backup')
        $res.Action | Should Be 'preserved'
        (Get-TestSha $cfg) | Should Be $before
        (Test-Path -LiteralPath "$cfg.nuevo") | Should Be $false
        (Test-Path -LiteralPath (Join-Path $dir 'backup')) | Should Be $false
    }

    It 'dos respaldos seguidos no se pisan' {
        $dir = Join-Path $root 'dos-respaldos'
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $cfg = Join-Path $dir 'config.toml'
        [System.IO.File]::WriteAllText($cfg, $customerConfig, [System.Text.UTF8Encoding]::new($false))
        $backupDir = Join-Path $dir 'backup'
        $first = Backup-ScsDataFile -Path $cfg -BackupDir $backupDir
        $second = Backup-ScsDataFile -Path $cfg -BackupDir $backupDir
        ($first.BackupPath -ne $second.BackupPath) | Should Be $true
        (Test-Path -LiteralPath $first.BackupPath) | Should Be $true
        (Test-Path -LiteralPath $second.BackupPath) | Should Be $true
        @(Get-ChildItem -LiteralPath $backupDir -File | Where-Object { $_.Name -match '^config\.toml\.bak-\d+(-\d+)?$' }).Count | Should Be 2
    }

    It 'un archivo inexistente no genera respaldo (nada que conservar)' {
        $dir = Join-Path $root 'sin-archivo'
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $res = Backup-ScsDataFile -Path (Join-Path $dir 'no-existe.toml') -BackupDir (Join-Path $dir 'backup')
        $res.BackupPath | Should Be ''
        $res.Verified | Should Be $false
    }

    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Describe 'install-agent.ps1 (unica escritura de config.toml y aviso de cambio)' {
    It 'importa el modulo de configuracion desde el paquete' {
        $agentText | Should Match 'Import-Module \(Join-Path \$PSScriptRoot'
        $agentText | Should Match 'config-toml\.psm1'
    }

    It 'escribe la configuracion solo a traves de Set-ScsConfigToml' {
        $agentText | Should Match 'Set-ScsConfigToml -Path \$ConfigFile'
        ($agentText -match 'WriteAllText\(\$ConfigFile') | Should Be $false
        ($agentText -match 'Ensure-FileWritable \$ConfigFile') | Should Be $false
    }

    It 'informa cuando conserva la configuracion y cuando deja config.toml.nuevo' {
        $agentText | Should Match "'preserved-and-proposed'"
        $agentText | Should Match 'se conserva sin cambios'
        $agentText | Should Match 'ProposalPath'
    }

    It 'la rama -UpdateMode no escribe config.toml: solo compara el hash' {
        $start = $agentText.IndexOf('if ($UpdateMode) {')
        $end = $agentText.IndexOf('# Paso 1: Verificar servicio previo y binario')
        ($start -gt 0 -and $end -gt $start) | Should Be $true
        $branch = $agentText.Substring($start, $end - $start)
        ($branch -match 'Set-ScsConfigToml') | Should Be $false
        ($branch -match 'WriteAllText') | Should Be $false
        $branch | Should Match '\$configBefore'
        $branch | Should Match 'config\.toml cambio durante la actualizacion'
    }

    It 'no escribe el config.toml antes de crear el respaldo verificado' {
        $agentText | Should Match '\$configResult = Set-ScsConfigToml'
        $agentText | Should Match 'BackupDir "\$DataDir\\backup"'
    }
}
