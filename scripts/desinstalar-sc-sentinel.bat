@echo off
REM ===========================================================================
REM  Desinstalador de un clic del agente SC-Sentinel para Windows.
REM
REM  Que hace este archivo:
REM    1. Pide permisos de administrador - ventana UAC - si no los tiene.
REM    2. Detiene y elimina el servicio "SC Sentinel Network Agent".
REM    3. Pregunta si quieres borrar tambien los datos locales.
REM
REM  Como usarlo: doble clic en este archivo.
REM
REM  Uso opcional (desinstalacion desatendida):
REM    desinstalar-sc-sentinel.bat S   (S = borrar tambien los datos locales)
REM    desinstalar-sc-sentinel.bat N   (N = conservar los datos locales)
REM
REM  Nota de implementacion: este archivo usa etiquetas "goto" en lugar de
REM  bloques "if (...)" porque cmd.exe interpreta los parentesis del texto
REM  mostrado como agrupacion de comandos y el script deja de funcionar.
REM ===========================================================================
setlocal EnableExtensions
title Desinstalador SC-Sentinel

set "DIR=%~dp0"
set "PS1=%DIR%uninstall-agent.ps1"
set "LOG=%TEMP%\sc-sentinel-desinstalador.log"
set "UNATTENDED=0"
if not "%~1"=="" set "UNATTENDED=1"

echo.
echo ==========================================================
echo    SC-Sentinel - Desinstalacion del agente de red
echo ==========================================================
echo.

REM --- 1. Permisos de administrador -----------------------------------------
net session >nul 2>&1
if errorlevel 1 goto :elevar
goto :ya_admin

:elevar
echo Se necesitan permisos de administrador para quitar el servicio.
echo Windows va a mostrar un aviso de seguridad: pulsa "Si" para continuar.
echo.
>> "%LOG%" echo [%date% %time%] no-admin: solicitando elevacion
set "ELEV_CMD=Start-Process -FilePath '%~f0' -Verb RunAs -Wait -PassThru"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $p = %ELEV_CMD%; exit $p.ExitCode } catch { Write-Host ('[X] No se pudo obtener permisos de administrador: ' + $_.Exception.Message); exit 1 }"
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo [%date% %time%] elevacion terminada con codigo %RC%
endlocal & exit /b %RC%

:ya_admin
>> "%LOG%" echo [%date% %time%] admin: ejecutando desinstalador
echo Permisos de administrador: correctos.

if not exist "%PS1%" goto :falta_script

REM --- 2. Preguntar por los datos --------------------------------------------
if "%UNATTENDED%"=="1" goto :datos_auto
echo.
echo Si borras los datos tambien, se eliminan el registro - logs - y las
echo facturas de trafico que el agente todavia no ha enviado al servidor.
echo.
choice /C SN /N /M "  Quieres borrar tambien los datos locales? S=Si N=No: "
if errorlevel 2 goto :sin_datos
goto :con_datos

:datos_auto
if /i "%~1"=="S" goto :con_datos
if /i "%~1"=="N" goto :sin_datos
echo  (sin opcion indicada: se conservan los datos locales)
goto :sin_datos

:con_datos
set "PURGE=-PurgeData"
echo  Se borraran los datos locales.
goto :instalar

:sin_datos
set "PURGE="
echo  Se conservaran los datos locales.

:instalar
echo.
>> "%LOG%" echo [%date% %time%] ejecutando uninstall-agent.ps1 purge=%PURGE%
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %PURGE%
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo [%date% %time%] desinstalacion rc=%RC%
if not "%RC%"=="0" goto :error

echo.
echo ==========================================================
echo    DESINSTALACION COMPLETADA
echo ==========================================================
echo.
>> "%LOG%" echo [%date% %time%] desinstalacion finalizada
call :pause_safe
endlocal & exit /b 0

:falta_script
echo.
echo [X] No se encuentra el archivo uninstall-agent.ps1 junto a este desinstalador.
echo     Descomprime todo el ZIP en una carpeta y vuelve a ejecutar este archivo.
echo.
call :pause_safe
endlocal & exit /b 1

:error
echo.
echo [X] La desinstalacion termino con errores. Lee el mensaje anterior.
echo.
call :pause_safe
endlocal & exit /b 1

REM --- 3. Pausa solo en modo interactivo -------------------------------------
:pause_safe
if "%UNATTENDED%"=="1" goto :eof
pause
goto :eof
