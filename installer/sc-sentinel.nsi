; installer/sc-sentinel.nsi — instalador .exe de SC-Sentinel (Windows x64).
;
; Lo compila scripts/build-installer.ps1 con tres defines obligatorios:
;   /DVERSION=<x.y.z>      version de la release (sin 'v')
;   /DPAYLOAD=<carpeta>    contenido ya verificado del ZIP de la release
;   /DOUTFILE=<ruta.exe>   .exe de salida
;
; Flujo para el usuario: doble clic -> UAC -> elegir carpeta (opcional) ->
; pegar Device ID y Token -> todo lo demas es automatico: copia de binarios,
; GUI, bases GeoLite2, config.toml, servicio con recovery, ACL y entrada en
; Agregar o quitar programas.
;
; Instalacion desatendida (sin UI):
;   set SCS_INSTALL_DEVICE_ID=dev_...
;   set SCS_INSTALL_TOKEN=sc_dev_...
;   sc-sentinel-agent-vX.Y.Z-windows-x64-setup.exe /S [/D=C:\ruta]
; El token viaja por variable de entorno, nunca por la linea de comandos.
;
; Codigos de salida (instalacion):
;   0 exito · 1 fallo del servicio · 2 faltan credenciales
;   3 carpeta de instalacion invalida · 4 GUI bloqueada o SHA distinto
;   5 fallo de la actualizacion (respaldo, drenaje o arranque)
;   7 la version instalada es mas nueva que la del instalador (/S se niega a
;     degradar sin confirmacion)
;   19 actualizacion aplicada pero sin sync_confirmed en 30 s (/S): el servicio
;     esta en ejecucion y el spool reintenta; el codigo solo marca advertencia
;
; Actualizacion: si el servicio SC-Sentinel-Agent ya existe, el destino queda
; fijo en la carpeta de su ImagePath, no se piden credenciales y se conservan
; config.toml, .host-key, el token del servicio, el spool, los logs y los
; respaldos. Vale tambien para una instalacion hecha con install-agent.ps1
; (sin marcador ni desinstalador), que hasta ahora se rechazaba.
; Con SCS_INSTALL_ARCHIVE_BAKS=1 (o la casilla "Archivar respaldos antiguos")
; los .bak-<marca> de la carpeta de instalacion se mueven, nunca se borran, a
; C:\ProgramData\SC-Sentinel\backup\legacy.
; Codigos de salida (desinstalacion):
;   0 exito · 6 no se borro recursivamente (carpeta ajena o del sistema)

Unicode true

!include "MUI2.nsh"

; Campo enmascarado del token (nsDialogs no lo define en todas las versiones).
!ifndef EM_SETPASSWORDCHAR
  !define EM_SETPASSWORDCHAR 0x00CC
!endif
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "TextFunc.nsh"

!ifndef VERSION
  !error "Falta /DVERSION=<x.y.z>"
!endif
!ifndef PAYLOAD
  !error "Falta /DPAYLOAD=<carpeta con el contenido del paquete>"
!endif
!ifndef OUTFILE
  !error "Falta /DOUTFILE=<ruta del .exe de salida>"
!endif

!define APP_NAME "SC-Sentinel Agent"
!define APP_PUBLISHER "SC-Sentinel"
; Titular literal de los headers del codigo fuente (AGENTS.md §12): cierra el
; aviso 9100 de makensis sin inventar una razon social distinta.
!define APP_COPYRIGHT "Copyright (c) 2026 Strategic Connex"
!define SERVICE_NAME "SC-Sentinel-Agent"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SC-Sentinel-Agent"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\SC-Sentinel"
InstallDirRegKey HKLM "Software\SC-Sentinel" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalador del agente SC-Sentinel"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=0 "LegalCopyright" "${APP_COPYRIGHT}"

; Clasificacion de la carpeta de destino: libre, actualizacion (servicio en la
; carpeta), instalacion sin servicio o archivos ajenos. La usa tambien
; installer/tests/install-state-harness.nsi, que compila la misma logica.
; Va despues de SetCompressor: incluye funciones y NSIS no admite cambiar el
; compresor cuando la cabecera ya se toco.
!include "lib\install-state.nsh"

Var CredDeviceId
Var CredToken
Var DeviceIdCtl
Var TokenCtl
Var ArchiveBaks
Var ArchiveBaksCtl
Var SyncPending
Var FinishText

; --------------------------------------------------------------------------
; Validacion de la carpeta de instalacion
; --------------------------------------------------------------------------
; Deja $R8 = 1 si $INSTDIR es aceptable y $R7 = motivo cuando no lo es.
; Rechaza raices de unidad, rutas relativas o UNC, Windows/System32, carpetas
; de usuario y las raices de Program Files/ProgramData, y cualquier carpeta no
; vacia que no sea una instalacion nuestra (marcador). Sin esto, el instalador
; podria escribir dentro de C:\Windows y el desinstalador borrar archivos
; ajenos.
Function ValidateInstallDir
  StrCpy $R8 1
  StrCpy $R7 ""

  StrLen $0 $INSTDIR
  ${If} $0 == 0
    StrCpy $R8 0
    StrCpy $R7 "Elegi una carpeta de instalacion: no puede quedar vacia."
    Return
  ${EndIf}

  ; Ruta absoluta con letra de unidad (descarta UNC y rutas relativas).
  StrCpy $1 $INSTDIR 2
  ${If} $1 == "\\"
    StrCpy $R8 0
    StrCpy $R7 "No se admiten rutas de red (\\servidor\carpeta). Elegi una carpeta del disco local, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}
  StrCpy $2 $INSTDIR 1 1
  ${If} $2 != ":"
    StrCpy $R8 0
    StrCpy $R7 "La carpeta debe ser una ruta absoluta con letra de unidad, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}

  ; Raiz de unidad: "C:" o "C:\".
  ${If} $0 < 4
    StrCpy $R8 0
    StrCpy $R7 "No se puede instalar en la raiz de una unidad. Elegi una carpeta propia, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}
  ; "C:\X" tiene 4 caracteres y es valido.

  ; Barra final: se normaliza para que el manifiesto y las rutas no lleven "\\".
  StrCpy $3 $INSTDIR 1 -1
  ${If} $3 == "\"
    StrCpy $INSTDIR $INSTDIR -1
  ${EndIf}

  ; Carpetas del sistema y de usuario: nunca.
  StrCpy $3 $INSTDIR
  StrCpy $4 "$WINDIR"
  Call IsSameOrUnder
  ${If} $5 == 1
    StrCpy $R8 0
    StrCpy $R7 "No se puede instalar dentro de $WINDIR. Elegi una carpeta propia, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}
  StrCpy $3 $INSTDIR
  StrCpy $4 "$SYSDIR"
  Call IsSameOrUnder
  ${If} $5 == 1
    StrCpy $R8 0
    StrCpy $R7 "No se puede instalar dentro de System32. Elegi una carpeta propia, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}
  StrCpy $3 $INSTDIR
  StrCpy $4 "$PROFILE"
  Call IsSameOrUnder
  ${If} $5 == 1
    StrCpy $R8 0
    StrCpy $R7 "No se puede instalar dentro de la carpeta del usuario (Escritorio, Documentos, Descargas...). Elegi una carpeta propia, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}
  StrCpy $3 $INSTDIR
  ; NSIS 3.10 no define $PUBLIC/$COMMONAPPDATA como constantes: se leen las
  ; variables de entorno del sistema (siempre presentes y sin depender del idioma).
  ReadEnvStr $4 "PUBLIC"
  Call IsSameOrUnder
  ${If} $5 == 1
    StrCpy $R8 0
    StrCpy $R7 "No se puede instalar dentro de la carpeta Publica. Elegi una carpeta propia, por ejemplo C:\SC-Sentinel."
    Return
  ${EndIf}

  ; Raices exactas de Program Files / ProgramData: se permite una subcarpeta
  ; (\SC-Sentinel), no la raiz compartida.
  ReadEnvStr $4 "ProgramData"
  ${If} $INSTDIR == "$PROGRAMFILES"
  ${OrIf} $INSTDIR == "$PROGRAMFILES64"
  ${OrIf} $INSTDIR == "$4"
    StrCpy $R8 0
    StrCpy $R7 "Elegi una subcarpeta propia (por ejemplo C:\Program Files\SC-Sentinel) y no la carpeta compartida."
    Return
  ${EndIf}

  ; Estado del contenido: instalacion previa (se actualiza) o archivos ajenos
  ; (se rechaza). La regla anterior ("la carpeta debe estar vacia") rechazaba
  ; instalaciones hechas con install-agent.ps1, que no dejan marcador ni
  ; desinstalador: el binario, la GUI y los .bak-<marca> son del producto.
  Call DetectInstallState
  ${If} $InstallState == 3
    StrCpy $R8 0
    StrCpy $R7 "$InstallReason"
    Return
  ${EndIf}
  StrCpy $R8 1
FunctionEnd

; Entrada: $R3 = ruta, $R4 = base. Salida: $R5 = 1 si $R3 es $R4 o esta debajo.
Function IsSameOrUnder
  StrCpy $R5 0
  StrLen $6 $R4
  ${If} $6 == 0
    Return
  ${EndIf}
  StrCpy $7 $R3 $6
  ${If} $7 == $R4
    StrCpy $7 $R3 1 $6
    ${If} $7 == ""
    ${OrIf} $7 == "\"
      StrCpy $R5 1
    ${EndIf}
  ${EndIf}
FunctionEnd

Function ValidateDirPageLeave
  Call ValidateInstallDir
  ${If} $R8 == 1
    Return
  ${EndIf}
  ; Archivos ajenos: dos salidas reales, elegir otra carpeta o cancelar. Nunca
  ; se sugiere desinstalar: puede no existir desinstalador (instalacion con
  ; scripts). El resto de los motivos solo admite corregir la ruta.
  ${If} $InstallState == 3
    MessageBox MB_YESNO|MB_ICONSTOP "$R7$\r$\n$\r$\nSi: elegir otra carpeta.   No: cancelar el asistente." IDYES +2
    Quit
    Abort
  ${EndIf}
  MessageBox MB_ICONSTOP "$R7"
  Abort
FunctionEnd

; --------------------------------------------------------------------------
; Paginas
; --------------------------------------------------------------------------
!define MUI_WELCOMEPAGE_TITLE "Instalar SC-Sentinel"
!define MUI_WELCOMEPAGE_TEXT "Este asistente instala el agente de red SC-Sentinel y su interfaz de estado.$\r$\n$\r$\nSolo hay que elegir la carpeta de instalacion (puedes dejar la que viene) y pegar el Device ID y el Token que muestra el panel web al enrolar el equipo. El resto lo hace el instalador."
!insertmacro MUI_PAGE_WELCOME

!define MUI_DIRECTORYPAGE_TEXT_TOP "El programa se instalara en esta carpeta. Los datos (configuracion, registro y cola local) se guardan aparte, en C:\ProgramData\SC-Sentinel. Si ya existe una configuracion, el instalador no la reescribe."
!define MUI_PAGE_CUSTOMFUNCTION_PRE DirPagePre
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE ValidateDirPageLeave
!insertmacro MUI_PAGE_DIRECTORY

Page custom UpdatePageCreate UpdatePageLeave
Page custom CredsPageCreate CredsPageLeave

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\sc-gui.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir la interfaz de SC-Sentinel"
; Texto variable: en una actualizacion sin sync confirmado (codigo 19) se cambia
; por una advertencia antes de mostrar la pagina final. MUI2 inserta el valor en
; una etiqueta en tiempo de ejecucion, asi que una variable funciona.
!define MUI_FINISHPAGE_TEXT "$FinishText"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

; --------------------------------------------------------------------------
; Datos del dispositivo
; --------------------------------------------------------------------------
; La pagina de carpeta se salta cuando el destino lo manda un servicio ya
; instalado: reapuntar un servicio en marcha no es una opcion del asistente.
Function DirPagePre
  ${If} $InstallState == 1
    Abort
  ${EndIf}
FunctionEnd

; Pagina de actualizacion: version detectada, carpeta fija y que se conserva.
Function UpdatePageCreate
  ${If} $InstallState == 0
    Abort
  ${EndIf}
  ${If} $InstallState == 3
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Actualizar SC-Sentinel" "Ya hay una instalacion en $INSTDIR: se actualiza sin perder datos."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 10u "Se detecto SC-Sentinel Agent $DetectedVersion en $INSTDIR (carpeta fija mientras el servicio apunte alli)."
  Pop $1
  ${If} $InstallState == 4
    ${NSD_CreateLabel} 0 12u 100% 44u "No hay servicio SC-Sentinel-Agent: se conservan config.toml, .host-key, el spool y los logs. config.toml NUNCA se reescribe; si esta version necesita otra configuracion, se deja config.toml.nuevo al lado para que la revises. El asistente pedira otra vez el Device ID y el Token (enmascarado), respaldara el binario y la GUI actuales (.bak + .sha256) y volvera a crear el servicio con esas credenciales."
  ${Else}
    ${NSD_CreateLabel} 0 12u 100% 40u "Se reemplazaran sc-sentinel-agent.exe y sc-gui.exe. Antes de tocar nada se guarda un respaldo verificado (.bak + .sha256) en C:\ProgramData\SC-Sentinel\backup y el servicio se detiene dejando que vacie su cola (spool_flushed pending=0)."
  ${EndIf}
  Pop $1
  ${NSD_CreateLabel} 0 54u 100% 32u "Se conservan los datos de C:\ProgramData\SC-Sentinel: config.toml, .host-key, el spool, los logs y los respaldos; en una actualizacion con servicio tambien el token del equipo, que no se vuelve a pedir."
  Pop $1
  ${NSD_CreateLabel} 0 88u 100% 22u "Si la interfaz SC-Sentinel (sc-gui.exe) esta abierta, cerrala antes de continuar: el instalador no cierra programas abiertos."
  Pop $1
  ${NSD_CreateCheckBox} 0 112u 100% 12u "Archivar respaldos antiguos (.bak-*) en ProgramData\SC-Sentinel\backup\legacy"
  Pop $ArchiveBaksCtl
  ${If} $ArchiveBaks == 1
    ${NSD_Check} $ArchiveBaksCtl
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function UpdatePageLeave
  ${NSD_GetState} $ArchiveBaksCtl $0
  StrCpy $ArchiveBaks $0
FunctionEnd

Function CredsPageCreate
  ; En una actualizacion con servicio el token se conserva: no se pide.
  ${If} $InstallState == 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Datos del dispositivo" "Pega el Device ID y el Token del panel web (Configuracion -> Enrolar dispositivo)."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 34u "El panel web muestra estos dos datos al enrolar el equipo. El Token se muestra una sola vez: si no lo tienes, genera un dispositivo nuevo desde el panel."
  Pop $1

  ${NSD_CreateLabel} 0 40u 100% 10u "Device ID (empieza por dev_)"
  Pop $1
  ${NSD_CreateText} 0 50u 100% 12u "$CredDeviceId"
  Pop $DeviceIdCtl

  ${NSD_CreateLabel} 0 70u 100% 10u "Token (empieza por sc_dev_)"
  Pop $1
  ${NSD_CreateText} 0 80u 100% 12u "$CredToken"
  Pop $TokenCtl
  ; Campo enmascarado: el token no se ve mientras se pega.
  SendMessage $TokenCtl ${EM_SETPASSWORDCHAR} 0x25 0

  nsDialogs::Show
FunctionEnd

Function CredsPageLeave
  ${NSD_GetText} $DeviceIdCtl $CredDeviceId
  ${NSD_GetText} $TokenCtl $CredToken
  ${If} $CredDeviceId == ""
    MessageBox MB_ICONEXCLAMATION "Falta el Device ID (empieza por dev_). Lo muestra el panel web al enrolar el equipo."
    Abort
  ${EndIf}
  ${If} $CredToken == ""
    MessageBox MB_ICONEXCLAMATION "Falta el Token (empieza por sc_dev_). Lo muestra el panel web una sola vez al enrolar el equipo."
    Abort
  ${EndIf}
FunctionEnd

Function .onInit
  ; La entrada de "Agregar o quitar programas" debe caer en el registro de 64
  ; bits, no en WOW6432Node: makensis genera un .exe de 32 bits.
  SetRegView 64
  ; Estado de la carpeta antes de mostrar nada: decide si hay directorio
  ; editable, pagina de credenciales y pagina de actualizacion.
  Call DetectInstallState

  ; Red de seguridad: la actualizacion con servicio se salta la pagina de
  ; carpeta, asi que la ruta derivada del ImagePath nunca pasaba por
  ; ValidateInstallDir. Un ImagePath con formato inesperado no puede terminar
  ; copiando el paquete en la raiz de la unidad (defecto del 24/11:
  ; $INSTDIR = "C:" y C:\installer).
  ${If} $InstallState == 1
    Call ValidateInstallDir
    ${If} $R8 == 0
      ${IfNot} ${Silent}
        MessageBox MB_ICONSTOP "$R7"
      ${EndIf}
      SetErrorLevel 3
      Quit
    ${EndIf}
  ${EndIf}

  StrCpy $SyncPending 0
  StrCpy $FinishText "SC-Sentinel quedó instalado y el servicio está en ejecución.$\r$\n$\r$\nPara capturar tráfico local además de recibir NetFlow/IPFIX hace falta Npcap instalado en el equipo (no se incluye por su licencia)."

  ; Version instalada mas nueva que la de este instalador: degradar nunca es
  ; silencioso. En /S se aborta con codigo propio (7); con UI se pide
  ; confirmacion explicita y el No no toca nada.
  ${If} $InstallState == 1
  ${OrIf} $InstallState == 4
    ${If} $DetectedVersion != ""
    ${AndIf} $DetectedVersion != "desconocida"
      StrCpy $0 $DetectedVersion
      Call ScsVersionCode
      StrCpy $8 $R9
      StrCpy $0 "${VERSION}"
      Call ScsVersionCode
      StrCpy $9 $R9
      ${If} $8 != -1
      ${AndIf} $9 != -1
      ${AndIf} $8 > $9
        ${If} ${Silent}
          SetErrorLevel 7
          Quit
        ${EndIf}
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "La version instalada ($DetectedVersion) es mas nueva que la de este instalador (${VERSION}).$\r$\n$\r$\nSi continuas, el agente queda degradado a ${VERSION}. Continuar igual?" IDYES +2
        SetErrorLevel 7
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}

  StrCpy $ArchiveBaks 0
  ReadEnvStr $0 "SCS_INSTALL_ARCHIVE_BAKS"
  ${If} $0 == "1"
    StrCpy $ArchiveBaks 1
  ${EndIf}

  ReadEnvStr $CredDeviceId "SCS_INSTALL_DEVICE_ID"
  ReadEnvStr $CredToken "SCS_INSTALL_TOKEN"
  ${If} ${Silent}
    ; Carpeta con archivos ajenos: codigo 3, sin escribir nada.
    ${If} $InstallState == 3
      SetErrorLevel 3
      Quit
    ${EndIf}
    ; La actualizacion con servicio conserva el token del servicio, asi que no
    ; necesita credenciales. Instalacion nueva y reparacion sin servicio si:
    ; sin ellas se sale con codigo 2 y sin dialogo (un MessageBox bloquearia
    ; una instalacion por GPO/Intune).
    ${If} $InstallState != 1
      ${If} $CredDeviceId == ""
        SetErrorLevel 2
        Quit
      ${EndIf}
      ${If} $CredToken == ""
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${EndIf}
    ; Carpeta invalida en modo desatendido: codigo 3, sin escribir nada.
    Call ValidateInstallDir
    ${If} $R8 == 0
      SetErrorLevel 3
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

; --------------------------------------------------------------------------
; Instalacion
; --------------------------------------------------------------------------
Section "Instalar SC-Sentinel" SecInstall
  SetShellVarContext all

  ; ACL del directorio de instalacion antes de copiar nada: sin herencia,
  ; SYSTEM y Administradores con control total, Usuarios solo lectura y
  ; ejecucion (la GUI la abre el usuario interactivo; no puede escribir).
  CreateDirectory "$INSTDIR"
  nsExec::ExecToLog 'icacls "$INSTDIR" /inheritance:r /grant "*S-1-5-18:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F" /grant "*S-1-5-32-545:(OI)(CI)RX"'
  Pop $0
  ${If} "$0" != "0"
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP "No se pudieron aplicar los permisos a $INSTDIR (codigo $0). La instalacion se cancela."
    ${EndIf}
    SetErrorLevel 1
    Abort
  ${EndIf}

  SetOutPath "$INSTDIR"
  DetailPrint "Copiando archivos a $INSTDIR"

  ; El paquete completo se copia a $INSTDIR\installer y desde ahi se ejecuta
  ; install-agent.ps1: el flujo elevado nunca corre desde una carpeta que el
  ; usuario pueda escribir (Descargas, Escritorio, %TEMP%).
  SetOutPath "$INSTDIR\installer"
  File /r "${PAYLOAD}\*"

  ; ACL del directorio del instalador y del token temporal: sin herencia,
  ; solo SYSTEM y Administradores. Ni siquiera Usuarios puede leerlo, asi que
  ; el token temporal no queda expuesto a otros usuarios del equipo.
  nsExec::ExecToLog 'icacls "$INSTDIR\installer" /inheritance:r /grant "*S-1-5-18:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F"'
  Pop $0
  ${If} "$0" != "0"
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP "No se pudieron aplicar los permisos a $INSTDIR\installer (codigo $0). La instalacion se cancela."
    ${EndIf}
    SetErrorLevel 1
    Abort
  ${EndIf}

  ${If} $InstallState == 1
    ; ACTUALIZACION con servicio: no se pide ni se escribe token, no se
    ; reinstala el servicio y no se toca config.toml. install-agent.ps1
    ; reutiliza el procedimiento de deploy-agent-service.ps1: .bak verificado
    ; con su .sha256, parada con drenaje, copia con SHA y arranque con espera
    ; de sync_confirmed.
    DetailPrint "Actualizando SC-Sentinel en $INSTDIR (se conservan los datos)"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\install-agent.ps1" -InstallDir "$INSTDIR" -BinaryPath "$INSTDIR\installer\sc-sentinel-agent.exe" -UpdateMode'
    Pop $0
    ${If} "$0" == "19"
      ; Codigo 19 de deploy-agent-service.ps1: el binario nuevo arranco pero el
      ; servidor de ingesta no confirmo ninguna ventana en 30 s. NO es un fallo
      ; de la actualizacion ni prueba de que el equipo no tenga red; se avisa en
      ; la pagina final y en /S el .exe termina con 19 (distinto de cero) para
      ; que GPO/Intune lo registre como advertencia.
      StrCpy $SyncPending 1
      StrCpy $FinishText "SC-Sentinel se actualizo, pero el servicio no confirmo la sincronizacion con el servidor de ingesta en 30 s.$\r$\n$\r$\nEl agente esta instalado y en ejecucion; el spool reintenta el envio solo. Revisa conectividad, proxy/firewall, que el device siga enrolado y C:\ProgramData\SC-Sentinel\logs\agent.log.$\r$\n$\r$\nPara capturar trafico local ademas de recibir NetFlow/IPFIX hace falta Npcap instalado en el equipo (no se incluye por su licencia)."
      DetailPrint "ADVERTENCIA: actualizacion aplicada sin sync confirmado (codigo 19)"
    ${ElseIf} "$0" != "0"
      ${IfNot} ${Silent}
        ${If} "$0" == "4"
          MessageBox MB_ICONSTOP "No se pudo actualizar SC-Sentinel porque la interfaz (sc-gui.exe) esta abierta o un binario copiado no coincide (codigo 4).$\r$\n$\r$\nCerra la interfaz SC-Sentinel y volve a ejecutar el instalador. El servicio y la version anterior quedaron como estaban."
        ${Else}
          MessageBox MB_ICONSTOP "La actualizacion fallo (codigo $0).$\r$\n$\r$\nEl detalle esta en la ventana del instalador y en C:\ProgramData\SC-Sentinel\logs\agent.log. Si el servicio quedo detenido, volve a la version anterior ejecutando deploy-agent-service.ps1 -Mode Rollback desde $INSTDIR\installer."
        ${EndIf}
      ${EndIf}
      ${If} "$0" == "4"
        SetErrorLevel 4
      ${Else}
        SetErrorLevel 5
      ${EndIf}
      Abort
    ${EndIf}
  ${Else}
  ; Instalacion nueva o reparacion sin servicio. El token pasa por un archivo
  ; temporal con ACL restringida (no por argv): install-agent.ps1 lo lee y lo
  ; borra antes de crear el servicio.
  FileOpen $9 "$INSTDIR\installer\ingest-token.tmp" w
  FileWrite $9 "$CredToken"
  FileClose $9

  DetailPrint "Instalando el servicio SC-Sentinel-Agent"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\install-agent.ps1" -InstallDir "$INSTDIR" -BinaryPath "$INSTDIR\installer\sc-sentinel-agent.exe" -DeviceId "$CredDeviceId" -IngestTokenFile "$INSTDIR\installer\ingest-token.tmp"'
  Pop $0
  ${If} "$0" != "0"
    ; El token no puede quedar en disco aunque el servicio no llegara a crearse.
    Delete "$INSTDIR\installer\ingest-token.tmp"
    ${IfNot} ${Silent}
      ${If} "$0" == "4"
        MessageBox MB_ICONSTOP "No se pudo actualizar SC-Sentinel porque la interfaz (sc-gui.exe) esta abierta o el binario copiado no coincide (codigo 4).$\r$\n$\r$\nCerra la interfaz SC-Sentinel y volve a ejecutar el instalador. No se cambio ninguna version en silencio."
      ${ElseIf} "$0" == "3"
        MessageBox MB_ICONSTOP "La carpeta de instalacion no es valida (codigo 3).$\r$\n$\r$\nElegi otra carpeta al volver a ejecutar el instalador."
      ${Else}
        MessageBox MB_ICONSTOP "La instalacion del servicio fallo (codigo $0).$\r$\n$\r$\nRevisa C:\ProgramData\SC-Sentinel\logs\agent.log para el detalle."
      ${EndIf}
    ${EndIf}
    ${If} "$0" == "4"
      SetErrorLevel 4
    ${ElseIf} "$0" == "3"
      SetErrorLevel 3
    ${Else}
      SetErrorLevel 1
    ${EndIf}
    Abort
  ${EndIf}
  Delete "$INSTDIR\installer\ingest-token.tmp"
  ${EndIf}

  ; Respaldos antiguos .bak-<marca>: casilla desmarcada por defecto. Se MUEVEN
  ; a la carpeta de respaldo (ACL SYSTEM + Administradores, sin herencia); si
  ; el movimiento falla se dejan donde estan. Nunca se borra un respaldo.
  ${If} $ArchiveBaks == 1
    ReadRegStr $0 HKLM "Software\SC-Sentinel" "DataDir"
    ${If} $0 == ""
      StrCpy $0 "C:\ProgramData\SC-Sentinel"
    ${EndIf}
    CreateDirectory "$0\backup\legacy"
    nsExec::ExecToLog 'icacls "$0\backup\legacy" /inheritance:r /grant "*S-1-5-18:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F"'
    Pop $1
    DetailPrint "Archivando respaldos antiguos en $0\backup\legacy"
    ClearErrors
    FindFirst $2 $3 "$INSTDIR\sc-sentinel-agent.exe.bak-*"
    ${If} $2 != ""
      ${Do}
        ${If} $3 == ""
          ${ExitDo}
        ${EndIf}
        ClearErrors
        Rename "$INSTDIR\$3" "$0\backup\legacy\$3"
        ${If} ${Errors}
          DetailPrint "No se pudo mover $3: se conserva en $INSTDIR"
        ${Else}
          DetailPrint "Archivado $3"
        ${EndIf}
        ClearErrors
        FindNext $2 $3
      ${Loop}
      FindClose $2
    ${EndIf}
    ClearErrors
    FindFirst $2 $3 "$INSTDIR\sc-gui.exe.bak-*"
    ${If} $2 != ""
      ${Do}
        ${If} $3 == ""
          ${ExitDo}
        ${EndIf}
        ClearErrors
        Rename "$INSTDIR\$3" "$0\backup\legacy\$3"
        ${If} ${Errors}
          DetailPrint "No se pudo mover $3: se conserva en $INSTDIR"
        ${Else}
          DetailPrint "Archivado $3"
        ${EndIf}
        ClearErrors
        FindNext $2 $3
      ${Loop}
      FindClose $2
    ${EndIf}
  ${EndIf}

  ; Marcador y manifiesto: el desinstalador solo borra lo listado aqui y se
  ; niega a borrar recursivamente una carpeta que no reconoce como suya.
  FileOpen $9 "$INSTDIR\.sc-sentinel-install" w
  FileWrite $9 "SC-Sentinel Agent ${VERSION}$\r$\n"
  FileClose $9
  FileOpen $9 "$INSTDIR\.sc-sentinel-manifest.txt" w
  FileWrite $9 ".sc-sentinel-install$\r$\n"
  FileWrite $9 ".sc-sentinel-manifest.txt$\r$\n"
  FileWrite $9 "sc-sentinel-agent.exe$\r$\n"
  FileWrite $9 "sc-sentinel-agent.exe.bak$\r$\n"
  FileWrite $9 "sc-gui.exe$\r$\n"
  FileWrite $9 "sc-gui.exe.bak$\r$\n"
  FileWrite $9 "abrir-gui.bat$\r$\n"
  FileWrite $9 "uninstall.exe$\r$\n"
  FileClose $9

  DetailPrint "Registrando el desinstalador"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\SC-Sentinel" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\sc-gui.exe"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1

  ; Advertencia sin sync (19) en modo desatendido: el trabajo termina con un
  ; codigo distinto de cero aunque el servicio quede en ejecucion. Se fija al
  ; final para que ningun paso posterior lo sobrescriba.
  ${If} $SyncPending == 1
    ${If} ${Silent}
      SetErrorLevel 19
    ${EndIf}
  ${EndIf}
SectionEnd

; --------------------------------------------------------------------------
; Desinstalacion
; --------------------------------------------------------------------------
Function un.onInit
  ; Mismo motivo que en el instalador: leer y borrar en la vista de 64 bits.
  SetRegView 64
FunctionEnd

; Entrada: $R3 = ruta, $R4 = base. Salida: $R5 = 1 si $R3 es $R4 o esta debajo.
Function un.IsSameOrUnder
  StrCpy $R5 0
  StrLen $R6 $R4
  ${If} $R6 == 0
    Return
  ${EndIf}
  StrCpy $R7 $R3 $R6
  ${If} $R7 == $R4
    StrCpy $R7 $R3 1 $R6
    ${If} $R7 == ""
    ${OrIf} $R7 == "\"
      StrCpy $R5 1
    ${EndIf}
  ${EndIf}
FunctionEnd

; Entrada: $R0 = ruta. Salida: $R1 = 1 si es raiz de unidad o esta dentro de
; una carpeta del sistema o de usuario: ahi nunca se borra recursivamente.
Function un.IsForbiddenDir
  StrCpy $R1 1
  StrLen $R2 $R0
  ${If} $R2 > 3
    StrCpy $R1 0
    StrCpy $R3 $R0
    StrCpy $R4 "$WINDIR"
    Call un.IsSameOrUnder
    ${If} $R5 == 1
      StrCpy $R1 1
    ${EndIf}
    StrCpy $R3 $R0
    StrCpy $R4 "$SYSDIR"
    Call un.IsSameOrUnder
    ${If} $R5 == 1
      StrCpy $R1 1
    ${EndIf}
    StrCpy $R3 $R0
    StrCpy $R4 "$PROFILE"
    Call un.IsSameOrUnder
    ${If} $R5 == 1
      StrCpy $R1 1
    ${EndIf}
    StrCpy $R3 $R0
    ReadEnvStr $R4 "PUBLIC"
    Call un.IsSameOrUnder
    ${If} $R5 == 1
      StrCpy $R1 1
    ${EndIf}
    ReadEnvStr $R4 "ProgramData"
    ${If} $R0 == "$PROGRAMFILES"
    ${OrIf} $R0 == "$PROGRAMFILES64"
    ${OrIf} $R0 == "$R4"
      StrCpy $R1 1
    ${EndIf}
  ${EndIf}
FunctionEnd

; Entrada: $R0 = nombre de una entrada de nivel superior de $INSTDIR.
; Salida: $R1 = 1 si es un archivo o carpeta propios.
Function un.IsOwnEntry
  StrCpy $R1 0
  ${If} $R0 == ".sc-sentinel-install"
  ${OrIf} $R0 == ".sc-sentinel-manifest.txt"
  ${OrIf} $R0 == "sc-sentinel-agent.exe"
  ${OrIf} $R0 == "sc-sentinel-agent.exe.bak"
  ${OrIf} $R0 == "sc-gui.exe"
  ${OrIf} $R0 == "sc-gui.exe.bak"
  ${OrIf} $R0 == "abrir-gui.bat"
  ${OrIf} $R0 == "uninstall.exe"
  ${OrIf} $R0 == "installer"
  ${OrIf} $R0 == "geolite2"
    StrCpy $R1 1
  ${EndIf}
FunctionEnd

Section "Uninstall"
  SetRegView 64
  ; El desinstalador de NSIS se ejecuta desde una copia en %TEMP%, asi que
  ; puede borrar $INSTDIR sin bloquearse con su propio .exe. $INSTDIR se toma
  ; del registro por si el .exe se movio de sitio despues de instalar.
  ReadRegStr $R9 HKLM "Software\SC-Sentinel" "InstallDir"
  ${If} $R9 != ""
    StrCpy $INSTDIR $R9
  ${EndIf}
  StrCpy $R1 $INSTDIR 1 -1
  ${If} $R1 == "\"
    StrCpy $INSTDIR $INSTDIR -1
  ${EndIf}

  ; $R2 = 1 solo si la carpeta es nuestra (marcador + desinstalador del
  ; paquete) y no esta en la lista de sistema. Un registro tampeado que apunte
  ; a C:\Windows no puede provocar un RMDir /r alli.
  StrCpy $R0 $INSTDIR
  Call un.IsForbiddenDir
  StrCpy $R2 0
  ${If} $R1 == 0
  ${AndIf} ${FileExists} "$INSTDIR\.sc-sentinel-install"
  ${AndIf} ${FileExists} "$INSTDIR\installer\uninstall-agent.ps1"
    StrCpy $R2 1
  ${EndIf}

  DetailPrint "Deteniendo y quitando el servicio"
  ${If} $R2 == 1
    ; -KeepInstallDir: los archivos los borra este desinstalador segun el
    ; manifiesto; uninstall-agent.ps1 solo quita el servicio y cierra procesos.
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\uninstall-agent.ps1" -InstallDir "$INSTDIR" -KeepInstallDir'
    Pop $0
    ${If} "$0" != "0"
      ${IfNot} ${Silent}
        MessageBox MB_ICONEXCLAMATION "El servicio no se pudo quitar del todo (codigo $0). Se eliminan igualmente los archivos instalados; revisa services.msc si el servicio sigue apareciendo."
      ${EndIf}
    ${EndIf}
  ${Else}
    ; Carpeta no reconocida: no se ejecuta nada de ahi ni se borra nada de
    ; ahi; solo se quita el servicio para no dejar el agente corriendo.
    nsExec::ExecToLog 'sc.exe delete ${SERVICE_NAME}'
    Pop $0
  ${EndIf}

  ${If} $R2 == 1
    ; 1) Se enumeran las entradas de nivel superior: cualquier archivo que no
    ;    sea nuestro impide borrar la carpeta (no se pisan datos ajenos).
    StrCpy $R3 0
    ClearErrors
    FindFirst $R4 $R5 "$INSTDIR\*.*"
    ${If} $R4 != ""
      ${Do}
        ${If} $R5 == ""
          ${ExitDo}
        ${EndIf}
        ${If} $R5 != "."
        ${AndIf} $R5 != ".."
          StrCpy $R0 $R5
          Call un.IsOwnEntry
          ${If} $R1 == 0
            StrCpy $R3 1
          ${EndIf}
        ${EndIf}
        ClearErrors
        FindNext $R4 $R5
      ${Loop}
      FindClose $R4
    ${EndIf}

    ; 2) Se borra SOLO lo listado en el manifiesto, mas las dos carpetas
    ;    propias del paquete. Nunca RMDir /r sobre $INSTDIR.
    DetailPrint "Eliminando archivos de SC-Sentinel"
    ClearErrors
    FileOpen $R4 "$INSTDIR\.sc-sentinel-manifest.txt" r
    ${If} $R4 != ""
      ${Do}
        FileRead $R4 $R5
        ${If} $R5 == ""
          ${ExitDo}
        ${EndIf}
        ${TrimNewLines} "$R5" $R6
        ${If} $R6 != ""
          ClearErrors
          Delete "$INSTDIR\$R6"
        ${EndIf}
      ${Loop}
      FileClose $R4
    ${EndIf}
    RMDir /r "$INSTDIR\installer"
    RMDir /r "$INSTDIR\geolite2"
    Delete "$INSTDIR\uninstall.exe"
    Delete "$INSTDIR\.sc-sentinel-manifest.txt"
    Delete "$INSTDIR\.sc-sentinel-install"

    ${If} $R3 == 0
      RMDir "$INSTDIR"
    ${Else}
      DetailPrint "La carpeta $INSTDIR tiene archivos ajenos: se conserva"
      ${IfNot} ${Silent}
        MessageBox MB_ICONINFORMATION "Se eliminaron los archivos de SC-Sentinel, pero $INSTDIR contiene archivos que el desinstalador no borra (respaldos .bak-<marca> o archivos ajenos) y la carpeta se conservo. No se borro nada ajeno."
      ${EndIf}
      SetErrorLevel 6
    ${EndIf}
  ${Else}
    DetailPrint "No se borran archivos: $INSTDIR no es una instalacion de SC-Sentinel"
    ${IfNot} ${Silent}
      MessageBox MB_ICONEXCLAMATION "La carpeta registrada ($INSTDIR) no es una instalacion de SC-Sentinel (o es una carpeta del sistema), asi que no se borro ningun archivo. Se quito el servicio y las claves de registro del producto."
    ${EndIf}
    SetErrorLevel 6
  ${EndIf}

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\SC-Sentinel"
SectionEnd
