@echo off
REM ===========================================================================
REM  Instalador de un clic del agente SC-Sentinel para Windows.
REM
REM  Que hace este archivo:
REM    1. Pide permisos de administrador (ventana UAC) si no los tiene.
REM    2. Te pregunta el ID del dispositivo y el token de ingesta.
REM    3. Instala el servicio de Windows y lo deja funcionando.
REM
REM  Como usarlo: descomprime el ZIP y doble clic en este archivo.
REM
REM  Uso opcional (instalacion desatendida):
REM    instalar-sc-sentinel.bat <device_id> <token> [puertos]
REM
REM  "puertos" es opcional y son los puertos UDP del colector, separados por
REM  comas (por defecto 2055,4739). Solo hace falta si el equipo ya tiene otro
REM  programa escuchando en esos puertos.
REM
REM  Nota de implementacion: este archivo usa etiquetas "goto" en lugar de
REM  bloques "if (...)" porque cmd.exe interpreta los parentesis del texto
REM  mostrado como agrupacion de comandos y el script deja de funcionar.
REM ===========================================================================
setlocal EnableExtensions
title Instalador SC-Sentinel

set "DIR=%~dp0"
set "BIN=%DIR%sc-sentinel-agent.exe"
set "PS1=%DIR%install-agent.ps1"
set "LOG=%TEMP%\sc-sentinel-instalador.log"
set "PSOUT=%TEMP%\sc-sentinel-instalador-ps.log"

REM Modo desatendido: si vienen los dos datos por linea de comandos, no se
REM pide nada por teclado y no se espera una tecla al final (uso en CI).
set "UNATTENDED=0"
if not "%~1"=="" if not "%~2"=="" set "UNATTENDED=1"

echo.
echo ==========================================================
echo    SC-Sentinel - Instalacion del agente de red
echo ==========================================================
echo.

REM --- 1. Permisos de administrador -----------------------------------------
net session >nul 2>&1
if errorlevel 1 goto :elevar
goto :ya_admin

:elevar
echo [1/4] Se necesitan permisos de administrador para instalar el servicio.
echo       Windows va a mostrar un aviso de seguridad: pulsa "Si" para continuar.
echo.
>> "%LOG%" echo [%date% %time%] no-admin: solicitando elevacion
REM Re-lanzar el propio .bat con privilegios de administrador. -Wait mantiene
REM al proceso padre vivo hasta que termina el hijo, de modo que el codigo de
REM salida real - 0 es ok, 1 es error - se propaga al llamante.
set "ELEV_CMD=Start-Process -FilePath '%~f0'"
if not "%~1"=="" set "ELEV_CMD=%ELEV_CMD% -ArgumentList '%*'"
set "ELEV_CMD=%ELEV_CMD% -Verb RunAs -Wait -PassThru"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $p = %ELEV_CMD%; exit $p.ExitCode } catch { Write-Host ('[X] No se pudo obtener permisos de administrador: ' + $_.Exception.Message); exit 1 }"
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo [%date% %time%] elevacion terminada con codigo %RC%
endlocal & exit /b %RC%

:ya_admin
>> "%LOG%" echo [%date% %time%] admin: ejecutando instalador
echo [1/4] Permisos de administrador: correctos.

REM --- 2. Comprobar que estan los archivos necesarios -------------------------
if not exist "%BIN%" goto :falta_binario
if not exist "%PS1%" goto :falta_script
>> "%LOG%" echo [%date% %time%] paso-archivos-ok

REM --- 3. Pedir los datos del dispositivo ------------------------------------
set "DEVICE_ID=%~1"
set "INGEST_TOKEN=%~2"
REM cmd.exe parte los argumentos por comas y punto y coma, de modo que
REM "2056,4739" llega como dos argumentos. Se recogen todos los argumentos a
REM partir del tercero y se unen con comas.
set "COLLECTOR_PORTS="
shift
shift
:recoger_puertos
if "%~1"=="" goto :puertos_listos
if defined COLLECTOR_PORTS set "COLLECTOR_PORTS=%COLLECTOR_PORTS%,%~1"
if not defined COLLECTOR_PORTS set "COLLECTOR_PORTS=%~1"
shift
goto :recoger_puertos
:puertos_listos

if defined DEVICE_ID goto :token_paso
echo.
echo [2/4] Ahora necesito los datos de tu dispositivo.
echo.
echo       Donde CONSEGUIRLOS: en el panel web de SC-Sentinel, entra en
echo       "Configuracion" y pulsa el boton "Enrolar dispositivo".
echo       Ahi aparece el "Device ID" y el "Token". El token se muestra
echo       una sola vez: copialo antes de cerrar la pagina.
echo.
echo.
set /p "DEVICE_ID=       Pega el Device ID - empieza por dev_: "
if defined DEVICE_ID goto :token_paso
>> "%LOG%" echo [%date% %time%] ERROR: sin device id
echo.
echo [X] No pegaste el Device ID. Se cancela la instalacion.
echo.
goto :salir_error

:token_paso
if defined INGEST_TOKEN goto :datos_ok
echo.
set /p "INGEST_TOKEN=       Pega el Token - empieza por sc_dev_: "
if defined INGEST_TOKEN goto :datos_ok
>> "%LOG%" echo [%date% %time%] ERROR: sin token
echo.
echo [X] No pegaste el Token. Se cancela la instalacion.
echo.
goto :salir_error

:datos_ok
>> "%LOG%" echo [%date% %time%] paso-datos-ok device_id=%DEVICE_ID%

REM --- 4. Instalar -----------------------------------------------------------
echo.
echo [3/4] Instalando el servicio de Windows... puede tardar unos segundos
echo.
REM Los datos se pasan por variables de entorno: asi el token y las rutas con
REM espacios llegan intactos al script de instalacion, porque el token puede
REM llevar caracteres que la linea de comandos interpretaria mal.
set "SCS_INSTALL_PS1=%PS1%"
set "SCS_INSTALL_BIN=%BIN%"
set "SCS_INSTALL_DEVICE_ID=%DEVICE_ID%"
set "SCS_INSTALL_TOKEN=%INGEST_TOKEN%"
if not "%COLLECTOR_PORTS%"=="" set "SCS_INSTALL_PORTS=%COLLECTOR_PORTS%"
if not defined SCS_INSTALL_PORTS set "SCS_INSTALL_PORTS=2055,4739"
>> "%LOG%" echo [%date% %time%] paso-instalando puertos=%SCS_INSTALL_PORTS%
powershell -NoProfile -ExecutionPolicy Bypass -Command "& $env:SCS_INSTALL_PS1 -DeviceId $env:SCS_INSTALL_DEVICE_ID -IngestToken $env:SCS_INSTALL_TOKEN -BinaryPath $env:SCS_INSTALL_BIN -CollectorPorts ($env:SCS_INSTALL_PORTS -split ',')" > "%PSOUT%" 2>&1
set "RC=%ERRORLEVEL%"
set "SCS_INSTALL_TOKEN="
>> "%LOG%" echo [%date% %time%] paso-instalado rc=%RC%
if not "%RC%"=="0" goto :error_instalacion

REM --- 5. Verificacion y siguientes pasos ------------------------------------
echo [4/4] Comprobando que el servicio esta funcionando...
sc query SC-Sentinel-Agent | find /i "RUNNING" >nul 2>&1
if errorlevel 1 goto :no_running
>> "%LOG%" echo [%date% %time%] OK: servicio en ejecucion
echo       Servicio "SC Sentinel Network Agent": EN EJECUCION.
goto :resumen

:no_running
>> "%LOG%" echo [%date% %time%] AVISO: el servicio no aparece como RUNNING
echo.
echo [!] El servicio esta instalado, pero no aparece como "En ejecucion".
echo     Revisa el log: C:\ProgramData\SC-Sentinel\logs\agent.log

:resumen
echo.
echo ==========================================================
echo    INSTALACION COMPLETADA
echo ==========================================================
echo.
echo  Como comprobar que funciona:
echo    1. Abre "services.msc" - teclado Windows + R, escribe services.msc -
echo       y busca "SC Sentinel Network Agent": debe decir "En ejecucion".
echo    2. En el panel web, entra en "Configuracion" y mira la fecha
echo       del ultimo envio correcto: es la prueba definitiva.
echo.
echo  Archivos del agente:
echo    Programa:    C:\Program Files\SC-Sentinel\
echo    Datos:       C:\ProgramData\SC-Sentinel\
echo    Registro:    C:\ProgramData\SC-Sentinel\logs\agent.log
echo.
echo  Para desinstalarlo, ejecuta "desinstalar-sc-sentinel.bat".
echo.
if "%UNATTENDED%"=="1" goto :fin_desatendido
choice /C S /N /M "  Pulsa una tecla para abrir la lista de servicios y salir... "
if errorlevel 2 goto :fin
start "" mmc.exe services.msc
goto :fin

:fin_desatendido
>> "%LOG%" echo [%date% %time%] instalacion desatendida finalizada
:fin
endlocal & exit /b 0

REM --- Errores ---------------------------------------------------------------
:falta_binario
>> "%LOG%" echo [%date% %time%] ERROR: falta sc-sentinel-agent.exe
echo.
echo [X] No se encuentra el archivo sc-sentinel-agent.exe junto a este instalador.
echo     Descomprime todo el ZIP en una carpeta y vuelve a ejecutar este archivo.
echo.
goto :salir_error

:falta_script
>> "%LOG%" echo [%date% %time%] ERROR: falta install-agent.ps1
echo.
echo [X] No se encuentra el archivo install-agent.ps1 junto a este instalador.
echo     Descomprime todo el ZIP en una carpeta y vuelve a ejecutar este archivo.
echo.
goto :salir_error

:error_instalacion
>> "%LOG%" echo [%date% %time%] ERROR: install-agent.ps1 devolvio codigo de error
echo.
echo [X] La instalacion termino con errores. Lee el mensaje anterior.
echo     Detalle completo: %PSOUT%
echo.
type "%PSOUT%"
echo.
goto :salir_error

:salir_error
if "%UNATTENDED%"=="1" goto :salir_error_silencioso
pause
:salir_error_silencioso
endlocal & exit /b 1
