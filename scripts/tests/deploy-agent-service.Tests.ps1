$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $here '..\deploy-agent-service.ps1'
$fixture = Join-Path $here 'fixtures\deploy-agent-service.log.txt'

$env:SC_DEPLOY_TEST_MODE = '1'
. $scriptPath -ExportFunctions
Remove-Item Env:\SC_DEPLOY_TEST_MODE -ErrorAction SilentlyContinue

Describe 'deploy-agent-service Get-LineStamp' {
    It 'conserva la fraccion de segundo' {
        $line = '2026-11-13T21:52:32.634451Z  INFO x event="spool_flushed" pending=0'
        (Get-LineStamp $line).ToString('o') | Should Be '2026-11-13T21:52:32.6344510Z'
    }

    It 'acepta una linea sin fraccion' {
        $line = '2026-11-13T21:52:30Z  INFO x event="spool_flushed" pending=0'
        (Get-LineStamp $line).ToString('o') | Should Be '2026-11-13T21:52:30.0000000Z'
    }

    It 'devuelve null si no hay sello ISO' {
        Get-LineStamp 'sin fecha' | Should Be $null
    }
}

Describe 'deploy-agent-service Wait-SpoolDrained' {
    BeforeEach {
        $script:LogPath = $fixture
    }

    It 'acepta con since 21:52:31.000Z' {
        $since = [datetime]::Parse('2026-11-13T21:52:31.000Z', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
        $line = Wait-SpoolDrained $since 1
        $line | Should Not Be $null
        $line | Should Match 'spool_flushed'
    }

    It 'acepta con since 21:52:32.377Z' {
        $since = [datetime]::Parse('2026-11-13T21:52:32.377Z', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
        $line = Wait-SpoolDrained $since 1
        $line | Should Not Be $null
        $line | Should Match 'spool_flushed'
    }

    It 'rechaza con since 21:52:33.000Z' {
        $since = [datetime]::Parse('2026-11-13T21:52:33.000Z', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
        $line = Wait-SpoolDrained $since 1
        $line | Should Be $null
    }
}