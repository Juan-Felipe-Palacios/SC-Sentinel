# scripts/test-install-agent-binpath.ps1 — verifica Get-AgentBinPath (sin instalar nada).
# Uso: pwsh -File scripts/test-install-agent-binpath.ps1  (exit 0 = ok)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "lib\agent-binpath.psm1")

$bin = "C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe"
$cfg = "C:\ProgramData\SC-Sentinel\config\config.toml"
$failures = @()

function Assert-Eq {
 param([string]$Name, [string]$Expected, [string]$Actual)
 if ($Expected -ne $Actual) {
  $script:failures += "$Name`n  esperado: $Expected`n  actual  : $Actual"
 }
}

# 1. Sin -CaptureInterface: modo collector-only por defecto.
Assert-Eq "default es collector-only" `
 "`"$bin`" --config `"$cfg`" --no-capture" `
 (Get-AgentBinPath -BinPath $bin -ConfigFile $cfg)

# 2. Con -CaptureInterface: captura local en la interfaz indicada.
Assert-Eq "captura local" `
 "`"$bin`" --config `"$cfg`" --interface `"Intel(R) Wireless-AC 9560 160MHz`"" `
 (Get-AgentBinPath -BinPath $bin -ConfigFile $cfg -CaptureInterface "Intel(R) Wireless-AC 9560 160MHz")

# 3. Las comillas internas sobreviven (el binPath tiene espacios en la ruta y en la interfaz).
$withSpaces = Get-AgentBinPath -BinPath $bin -ConfigFile $cfg -CaptureInterface "Intel(R) Wireless-AC 9560 160MHz"
if ($withSpaces -notmatch '^"C:\\Program Files\\SC-Sentinel\\sc-sentinel-agent\.exe" ') {
 $failures += "el binario no queda citado al inicio: $withSpaces"
}
if ($withSpaces -notmatch '--interface "Intel\(R\) Wireless-AC 9560 160MHz"$') {
 $failures += "la interfaz no queda citada al final: $withSpaces"
}

if ($failures.Count -gt 0) {
 Write-Host "FALLOS:" -ForegroundColor Red
 $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
 exit 1
}
Write-Host "OK: Get-AgentBinPath (collector-only por defecto, captura local con -CaptureInterface, comillas intactas)"
exit 0
