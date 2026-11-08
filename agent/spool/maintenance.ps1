# MANTENIMIENTO DE SPOOL (solo cuando el agente esté en baja actividad o pausado)
# Qué hace: respalda el spool, trunca el WAL, hace VACUUM y verifica integridad.
# Seguridad: no ejecutar mientras el agente escribe activamente, si es posible.
# Qué no hace: no limpia ni borra nada de forma agresiva.

$ErrorActionPreference = 'Stop'

$Spool = "agent/spool/sc-spool.sqlite"
$Backup = "agent/spool/sc-spool.sqlite.bak"
$ToolDir = (Join-Path (Get-Location).Path 'agent/spool/.tools')
$SqliteExe = "sqlite3"

if (-not (Get-Command -Name $SqliteExe -ErrorAction SilentlyContinue)) {
    $LocalSqlite = Join-Path $ToolDir 'sqlite3.exe'
    if (Test-Path $LocalSqlite) {
        $SqliteExe = $LocalSqlite
        Write-Host "Usando sqlite3 local: $SqliteExe"
    } else {
        Write-Host "[ERROR] sqlite3 no está en PATH ni en $ToolDir"
        exit 1
    }
}

if (-not (Test-Path $Spool)) {
    Write-Host "[WARN] No se encontró el spool en $Spool. Nada que hacer."
    exit 0
}

function Run-Sqlite([string]$Sql) {
    & $SqliteExe $Spool $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "sqlite3 falló para: $Sql"
    }
}

Write-Host "[1/4] Respaldo -> $Backup"
Copy-Item -Path $Spool -Destination $Backup -Force

Write-Host "[2/4] Truncar WAL (checkpoint TRUNCATE)"
Run-Sqlite "PRAGMA wal_checkpoint(TRUNCATE);"

Write-Host "[3/4] VACUUM"
Run-Sqlite "VACUUM;"

Write-Host "[4/4] Verificación de integridad"
$Integrity = Run-Sqlite "PRAGMA integrity_check;"
if ($Integrity.Trim() -eq 'ok') {
    Write-Host "OK: integridad correcta"
} else {
    Write-Host "[PELIGRO] integridad: $Integrity"
    exit 1
}

Write-Host "Tamaños (KB):"
Get-Item $Spool, $Backup | ForEach-Object {
    [PSCustomObject]@{ Name = $_.Name; KB = [math]::Round($_.Length / 1KB, 1) }
} | Format-Table -AutoSize

Write-Host "Listo. Respaldo conservado en $Backup (ignorado por .gitignore)."
