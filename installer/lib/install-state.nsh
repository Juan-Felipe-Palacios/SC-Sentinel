; installer/lib/install-state.nsh — clasificacion del estado de la carpeta de
; instalacion y version detectada.
;
; Lo incluyen installer/sc-sentinel.nsi (produccion) e
; installer/tests/install-state-harness.nsi, que compila la misma logica en un
; .exe de prueba ejecutable fuera del asistente.
;
; Entrada:  $INSTDIR y el registro (servicio y clave de desinstalacion).
; Salida:
;   $InstallState    0 carpeta libre (instalacion nueva)
;                    1 actualizacion sobre un servicio ya instalado
;                    3 carpeta con archivos ajenos (se rechaza)
;                    4 instalacion nuestra sin servicio (reparacion: pide
;                      Device ID y Token porque no hay Environment que conservar)
;   $InstallReason   texto accionable para el usuario (estado 3, con nombres)
;   $InstallForeign  nombres ajenos encontrados, hasta 5, uno por linea
;   $DetectedVersion version del agente ya instalado ("desconocida" si no hay)
;   $VersionSource   de donde salio: "status", "registro", "exe" o ""
;   $ServiceDir      carpeta del ImagePath del servicio ("" si no existe)
;
; Reglas (diseño, docs/designs/windows-installer.md §3 R6):
;   - Hay instalacion existente si el servicio SC-Sentinel-Agent existe (y su
;     ImagePath manda: el destino queda fijo en esa carpeta), si esta el
;     marcador del instalador, o si la carpeta solo contiene nombres del
;     producto (caso de las instalaciones hechas con install-agent.ps1, que no
;     escriben marcador ni desinstalador).
;   - Con archivos ajenos y sin rastro del producto se rechaza: el instalador
;     nunca pisa ni borra archivos que no reconoce.
;   - La version solo se lee; detectar el estado no escribe nada.

!ifndef SCS_INSTALL_STATE_NSH
!define SCS_INSTALL_STATE_NSH

!include "LogicLib.nsh"

!ifndef SERVICE_NAME
  !define SERVICE_NAME "SC-Sentinel-Agent"
!endif
!ifndef UNINST_KEY
  !define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SC-Sentinel-Agent"
!endif

Var InstallState
Var InstallReason
Var InstallForeign
Var DetectedVersion
Var VersionSource
Var DetectedMarker
Var ServiceDir
Var ServiceImagePath
Var ForeignCount
Var ScsEntry

; Entrada: $ScsEntry = nombre de una entrada de nivel superior de $INSTDIR.
; Salida:  $R1 = 1 si es un archivo o carpeta del producto.
; Los respaldos sc-sentinel-agent.exe.bak-<marca> y sc-gui.exe.bak-<marca> los
; dejan las instalaciones anteriores (y deploy-agent-service.ps1): son propios.
Function ScsIsKnownEntry
  StrCpy $R1 0
  ${If} $ScsEntry == "."
  ${OrIf} $ScsEntry == ".."
    StrCpy $R1 1
    Return
  ${EndIf}
  ${If} $ScsEntry == ".sc-sentinel-install"
  ${OrIf} $ScsEntry == ".sc-sentinel-manifest.txt"
  ${OrIf} $ScsEntry == "sc-sentinel-agent.exe"
  ${OrIf} $ScsEntry == "sc-sentinel-agent.exe.bak"
  ${OrIf} $ScsEntry == "sc-gui.exe"
  ${OrIf} $ScsEntry == "sc-gui.exe.bak"
  ${OrIf} $ScsEntry == "abrir-gui.bat"
  ${OrIf} $ScsEntry == "uninstall.exe"
  ${OrIf} $ScsEntry == "Uninstall.exe"
  ${OrIf} $ScsEntry == "installer"
  ${OrIf} $ScsEntry == "geolite2"
    StrCpy $R1 1
    Return
  ${EndIf}
  StrLen $R2 $ScsEntry
  ${If} $R2 > 26
    StrCpy $R3 $ScsEntry 26
    ${If} $R3 == "sc-sentinel-agent.exe.bak-"
      StrCpy $R1 1
      Return
    ${EndIf}
  ${EndIf}
  ${If} $R2 > 15
    StrCpy $R3 $ScsEntry 15
    ${If} $R3 == "sc-gui.exe.bak-"
      StrCpy $R1 1
    ${EndIf}
  ${EndIf}
FunctionEnd

; Entrada: pila = valor de ImagePath del servicio.
; Salida:  pila = carpeta del ejecutable, sin comillas y sin argumentos.
; ImagePath puede venir como '"C:\ruta\agente.exe" -config ...', como
; 'C:\ruta\agente.exe --no-capture' o con variables sin expandir; en ese ultimo
; caso la comparacion falla y se usa el destino por defecto.
Function ScsImagePathToDir
  Exch $0
  ; Sin comillas iniciales (New-Service las escribe alrededor del .exe).
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $2 $0 "" 1
  ${Else}
    StrCpy $2 $0
  ${EndIf}
  ; Recorte en la primera comilla o espacio: quedan solo el .exe y su ruta.
  StrLen $4 $2
  StrCpy $5 $4
  StrCpy $6 0
  ${Do}
    ${If} $6 >= $4
      ${ExitDo}
    ${EndIf}
    StrCpy $7 $2 1 $6
    ${If} $7 == '"'
    ${OrIf} $7 == " "
      StrCpy $5 $6
      ${ExitDo}
    ${EndIf}
    IntOp $6 $6 + 1
  ${Loop}
  StrCpy $2 $2 $5
  ; Recorte en la ultima barra: queda la carpeta.
  ${Do}
    ${If} $5 == 0
      ${ExitDo}
    ${EndIf}
    IntOp $5 $5 - 1
    StrCpy $7 $2 1 $5
    ${If} $7 == "\"
      StrCpy $2 $2 $5
      ${ExitDo}
    ${EndIf}
  ${Loop}
  StrCpy $0 $2
  Exch $0
FunctionEnd

; Entrada: pila = texto. Salida: pila = el mismo texto sin espacios, CR, LF ni
; tabuladores al final (la salida de powershell.exe los anade).
Function ScsTrimTrailing
  Exch $0
  ${Do}
    StrLen $1 $0
    ${If} $1 == 0
      ${ExitDo}
    ${EndIf}
    StrCpy $2 $0 1 -1
    ${If} $2 == "$\r"
    ${OrIf} $2 == "$\n"
    ${OrIf} $2 == " "
    ${OrIf} $2 == "$\t"
      StrCpy $0 $0 -1
    ${Else}
      ${ExitDo}
    ${EndIf}
  ${Loop}
  Exch $0
FunctionEnd

; Entrada: $0 = version ("1.2.3", "0.1.10.0", "v1.2.3-rc1"...).
; Salida:  $R9 = major*1000000 + minor*1000 + patch, o -1 si no hay ningun
;          numero legible. Solo cuentan los tres primeros grupos: alcanza para
;          detectar que la version instalada es mas nueva que la del instalador.
Function ScsVersionCode
  StrCpy $R9 -1
  StrLen $1 $0
  ${If} $1 == 0
    Return
  ${EndIf}
  StrCpy $2 0      ; indice del caracter
  StrCpy $3 0      ; grupo actual (0, 1 o 2)
  StrCpy $4 -1     ; valor del grupo; -1 = todavia sin digitos
  StrCpy $5 0      ; codigo acumulado
  StrCpy $6 0      ; 1 si se leyo algun digito
  ${Do}
    ${If} $2 >= $1
      ${ExitDo}
    ${EndIf}
    StrCpy $7 $0 1 $2
    ${If} $7 == "."
      ${If} $4 >= 0
        Call ScsAddVersionGroup
        StrCpy $4 -1
        IntOp $3 $3 + 1
        ${If} $3 > 2
          ${ExitDo}
        ${EndIf}
      ${EndIf}
    ${ElseIf} $7 == "0"
    ${OrIf} $7 == "1"
    ${OrIf} $7 == "2"
    ${OrIf} $7 == "3"
    ${OrIf} $7 == "4"
    ${OrIf} $7 == "5"
    ${OrIf} $7 == "6"
    ${OrIf} $7 == "7"
    ${OrIf} $7 == "8"
    ${OrIf} $7 == "9"
      ${If} $4 < 0
        StrCpy $4 0
      ${EndIf}
      IntOp $4 $4 * 10
      IntOp $8 $7 + 0
      IntOp $4 $4 + $8
      StrCpy $6 1
    ${ElseIf} $7 == "-"
    ${OrIf} $7 == "+"
      ${ExitDo}
    ${Else}
      ; Un prefijo no numerico ("v", "release-") se ignora solo antes del
      ; primer digito; un sufijo ("1.2.3a") corta la lectura.
      ${If} $6 == 1
        ${ExitDo}
      ${EndIf}
    ${EndIf}
    IntOp $2 $2 + 1
  ${Loop}
  ${If} $4 >= 0
    Call ScsAddVersionGroup
  ${EndIf}
  ${If} $6 == 1
    StrCpy $R9 $5
  ${EndIf}
FunctionEnd

; Auxiliar de ScsVersionCode: suma $4 al codigo $5 con el peso del grupo $3.
Function ScsAddVersionGroup
  ${If} $3 == 0
    IntOp $4 $4 * 1000000
  ${ElseIf} $3 == 1
    IntOp $4 $4 * 1000
  ${EndIf}
  IntOp $5 $5 + $4
FunctionEnd

; Llena $InstallState, $InstallReason, $InstallForeign, $DetectedVersion,
; $VersionSource y $ServiceDir. Puede cambiar $INSTDIR cuando el servicio apunta
; a otra carpeta: reapuntar un servicio instalado no es una opcion del
; asistente.
Function DetectInstallState
  StrCpy $InstallState 0
  StrCpy $InstallReason ""
  StrCpy $InstallForeign ""
  StrCpy $DetectedVersion ""
  StrCpy $VersionSource ""
  StrCpy $DetectedMarker 0
  StrCpy $ServiceDir ""
  StrCpy $ServiceImagePath ""
  StrCpy $ForeignCount 0

  ; 1) Servicio instalado: el ImagePath dice donde vive el agente.
  ;    En la compilacion de prueba el valor llega por entorno: la prueba corre
  ;    sin privilegios y no puede escribir HKLM\SYSTEM.
  !ifdef SCS_TEST_HARNESS
    ReadEnvStr $ServiceImagePath "SCS_TEST_SERVICE_IMAGEPATH"
  !else
    ReadRegStr $ServiceImagePath HKLM "SYSTEM\CurrentControlSet\Services\${SERVICE_NAME}" "ImagePath"
  !endif
  ${If} $ServiceImagePath != ""
    Push $ServiceImagePath
    Call ScsImagePathToDir
    Pop $ServiceDir
  ${EndIf}

  ; 2) Marcador del instalador .exe: su propia ruta en el registro, el
  ;    desinstalador escrito por WriteUninstaller o install.json.
  ReadRegStr $0 HKLM "Software\SC-Sentinel" "InstallDir"
  ${If} $0 != ""
  ${AndIf} $0 == $INSTDIR
    StrCpy $DetectedMarker 1
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\.sc-sentinel-install"
    StrCpy $DetectedMarker 1
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\installer\install.json"
    StrCpy $DetectedMarker 1
  ${EndIf}
  !ifdef SCS_TEST_HARNESS
    ReadEnvStr $0 "SCS_TEST_MARKER"
    ${If} $0 == "1"
      StrCpy $DetectedMarker 1
    ${EndIf}
  !endif

  ; 3) Contenido de la carpeta: propio, ajeno o vacia.
  StrCpy $2 0
  StrCpy $3 0
  ClearErrors
  FindFirst $0 $1 "$INSTDIR\*.*"
  ${If} $0 != ""
    ${Do}
      ${If} $1 == ""
        ${ExitDo}
      ${EndIf}
      ${If} $1 != "."
      ${AndIf} $1 != ".."
        StrCpy $2 1
        StrCpy $ScsEntry $1
        Call ScsIsKnownEntry
        ${If} $R1 == 0
          StrCpy $3 1
          ${If} $ForeignCount < 5
            IntOp $ForeignCount $ForeignCount + 1
            StrCpy $InstallForeign "$InstallForeign  - $1$\r$\n"
          ${EndIf}
        ${EndIf}
      ${EndIf}
      ClearErrors
      FindNext $0 $1
    ${Loop}
    FindClose $0
  ${EndIf}

  ; 4) Clasificacion.
  ${If} $3 == 1
    ; Un archivo ajeno solo bloquea cuando no hay nada que demuestre que la
    ; carpeta es del producto: con servicio o marcador la actualizacion sigue y
    ; el desinstalador conserva lo ajeno.
    ${If} $ServiceDir == ""
    ${AndIf} $DetectedMarker == 0
      StrCpy $InstallState 3
      StrCpy $InstallReason "La carpeta $INSTDIR tiene archivos que no son de SC-Sentinel:$\r$\n$\r$\n$InstallForeign$\r$\nElegi otra carpeta (por ejemplo C:\SC-Sentinel) o cancela el asistente. El instalador no borra ni pisa archivos ajenos."
      Return
    ${EndIf}
  ${EndIf}

  ${If} $ServiceDir != ""
    ${If} $ServiceDir != $INSTDIR
      StrCpy $INSTDIR $ServiceDir
    ${EndIf}
    StrCpy $InstallState 1
  ${ElseIf} $DetectedMarker == 1
    StrCpy $InstallState 4
  ${ElseIf} $2 == 1
    ; Solo nombres del producto y sin servicio: instalacion hecha con
    ; install-agent.ps1 cuyo servicio ya no existe. Es una actualizacion, pero
    ; sin Environment que conservar: hay que volver a pasar el token.
    StrCpy $InstallState 4
  ${Else}
    StrCpy $InstallState 0
  ${EndIf}

  ; 5) Version detectada. Orden: 1) /status del agente en ejecucion (tope 2 s),
  ;    2) DisplayVersion del registro, 3) ProductVersion del .exe,
  ;    4) "desconocida" (no es un error y no bloquea nada).
  ${If} $InstallState != 0
    !ifndef SCS_TEST_HARNESS
      ; GET http://127.0.0.1:8387/status -> agent_version. Si el servicio esta
      ; detenido la conexion se rechaza al instante y se sigue con el registro;
      ; -TimeoutSec 2 evita que un agente colgado retrase el asistente.
      nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "try { Invoke-RestMethod -Uri ''http://127.0.0.1:8387/status'' -TimeoutSec 2 | Select-Object -ExpandProperty agent_version } catch { }"'
      Pop $0
      Pop $1
      ${If} $0 == "0"
        Push $1
        Call ScsTrimTrailing
        Pop $1
        ${If} $1 != ""
          StrCpy $DetectedVersion "$1"
          StrCpy $VersionSource "status"
        ${EndIf}
      ${EndIf}
    !endif
    ${If} $DetectedVersion == ""
      ; En la compilacion de prueba el valor llega por entorno: leer HKLM lo
      ; haria dependiente del equipo donde corre la prueba.
      !ifdef SCS_TEST_HARNESS
        ReadEnvStr $0 "SCS_TEST_DISPLAYVERSION"
      !else
        ReadRegStr $0 HKLM "${UNINST_KEY}" "DisplayVersion"
      !endif
      ${If} $0 != ""
        StrCpy $DetectedVersion "$0"
        StrCpy $VersionSource "registro"
      ${EndIf}
    ${EndIf}
    ${If} $DetectedVersion == ""
    ${AndIf} ${FileExists} "$INSTDIR\sc-sentinel-agent.exe"
      nsExec::ExecToStack "powershell.exe -NoProfile -NonInteractive -Command (Get-Item -LiteralPath '$INSTDIR\sc-sentinel-agent.exe').VersionInfo.ProductVersion"
      Pop $0
      Pop $1
      ${If} $0 == "0"
        Push $1
        Call ScsTrimTrailing
        Pop $1
        ${If} $1 != ""
          StrCpy $DetectedVersion "$1"
          StrCpy $VersionSource "exe"
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} $DetectedVersion == ""
      StrCpy $DetectedVersion "desconocida"
    ${EndIf}
  ${EndIf}
FunctionEnd

!endif ; SCS_INSTALL_STATE_NSH
