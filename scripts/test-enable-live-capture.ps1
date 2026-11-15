# scripts/test-enable-live-capture.ps1 — pruebas de -NoRestart sin tocar el servicio.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-enable-live-capture.ps1
# No requiere elevación: escribe en una clave temporal de HKCU y solo lee el script.

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "lib\agent-binpath.psm1") -Force

$bin = "C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe"
$cfg = "C:\ProgramData\SC-Sentinel\config\config.toml"
$iface = "\Device\NPF_{5ED97C9D-575C-401F-A3C9-1397C3BD738A}"
$expected = "`"$bin`" --config `"$cfg`" --interface `"$iface`""
$failures = @()

function Assert-Eq {
    param([string]$Name, [string]$Expected, [string]$Actual)
    if ($Expected -ne $Actual) {
        $script:failures += "$Name`n  esperado: $Expected`n  actual  : $Actual"
    }
}

# 1. El módulo arma el binPath con el GUID, sin comillas manuales.
Assert-Eq "binPath con GUID" $expected `
    (Get-AgentBinPath -BinPath $bin -ConfigFile $cfg -CaptureInterface $iface)

# 2. Set-AgentImagePath escribe el valor en una clave temporal (sin servicio).
$testKey = "HKCU:\Software\SC-Sentinel-Test-$PID"
try {
    if (Test-Path -LiteralPath $testKey) { Remove-Item -LiteralPath $testKey -Recurse -Force }
    New-Item -Path $testKey -Force | Out-Null
    New-ItemProperty -Path $testKey -Name ImagePath -Value "viejo" -PropertyType String -Force | Out-Null

    $written = Set-AgentImagePath -ServiceKey $testKey -BinPath $bin `
        -ConfigFile $cfg -CaptureInterface $iface
    $actual = (Get-ItemProperty -Path $testKey -Name ImagePath).ImagePath

    Assert-Eq "retorno de Set-AgentImagePath" $expected $written
    Assert-Eq "ImagePath persistido" $expected $actual
} finally {
    if (Test-Path -LiteralPath $testKey) { Remove-Item -LiteralPath $testKey -Recurse -Force }
}

# 3. El camino -NoRestart actualiza y sale antes de cualquier sc.exe stop/start.
$scriptText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "enable-live-capture.ps1") -Raw
$noRestartIndex = $scriptText.IndexOf('if ($NoRestart)')
$setIndex = $scriptText.IndexOf('Set-AgentImagePath')
$stopIndex = $scriptText.IndexOf('sc.exe stop')

if ($scriptText -notmatch '\[switch\]\$NoRestart') {
    $failures += "falta el parámetro [switch]`$NoRestart"
}
if ($setIndex -lt 0) {
    $failures += "el script no usa Set-AgentImagePath"
}
if ($noRestartIndex -lt 0) {
    $failures += "falta el bloque if (`$NoRestart)"
}
if ($stopIndex -lt 0 -or $stopIndex -lt $noRestartIndex) {
    $failures += "sc.exe stop aparece antes del corte -NoRestart"
}
if ($setIndex -gt $noRestartIndex) {
    $failures += "Set-AgentImagePath no se ejecuta antes del corte -NoRestart"
}
if ($scriptText -match '\$newPath\s*=\s*[''"]') {
    $failures += "el script sigue armando comillas a mano"
}

if ($failures.Count -gt 0) {
    Write-Host "FALLOS:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "OK: binPath con GUID, ImagePath persistido y -NoRestart sale antes de stop/start"
exit 0
