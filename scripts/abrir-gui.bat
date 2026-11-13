@echo off
REM ===========================================================================
REM  Abre la GUI de SC-Sentinel (sc-gui.exe).
REM
REM  La GUI es un binario aparte del agente: sc-sentinel-agent.exe no tiene
REM  subcomando "gui". Este lanzador busca sc-gui.exe en este orden:
REM    1. %ProgramFiles%\SC-Sentinel\sc-gui.exe   (instalacion)
REM    2. junto a este .bat                       (paquete)
REM    3. ..\agent\target\release\sc-gui.exe      (build del repo)
REM
REM  No requiere elevacion: la GUI lee el estado por el endpoint loopback del
REM  agente y por el SCM. Acepta argumentos y los reenvia tal cual:
REM    abrir-gui.bat --balloon-test "Titulo" "Mensaje"
REM ===========================================================================
setlocal EnableExtensions

set "GUI="
if exist "%ProgramFiles%\SC-Sentinel\sc-gui.exe" set "GUI=%ProgramFiles%\SC-Sentinel\sc-gui.exe"
if not defined GUI if exist "%~dp0sc-gui.exe" set "GUI=%~dp0sc-gui.exe"
if not defined GUI if exist "%~dp0..\agent\target\release\sc-gui.exe" set "GUI=%~dp0..\agent\target\release\sc-gui.exe"

if not defined GUI (
  echo No se encontro sc-gui.exe. Rutas comprobadas:
  echo   %ProgramFiles%\SC-Sentinel\sc-gui.exe
  echo   %~dp0sc-gui.exe
  echo   %~dp0..\agent\target\release\sc-gui.exe
  echo.
  echo Compilalo con:  cargo build --release -p sc-gui
  pause
  exit /b 1
)

start "" "%GUI%" %*
exit /b 0
