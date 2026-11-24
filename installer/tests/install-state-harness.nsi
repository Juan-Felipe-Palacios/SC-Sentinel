; installer/tests/install-state-harness.nsi — prueba ejecutable de la logica de
; deteccion de instalacion existente (installer/lib/install-state.nsh).
;
; Compila la MISMA libreria que usa el instalador en un .exe de consola sin UI,
; sin privilegios y sin tocar el servicio ni Program Files: solo lee la carpeta
; que se le indica por entorno y escribe el resultado en un archivo de texto.
;
; Entorno:
;   SCS_TEST_DIR                  carpeta a clasificar (obligatoria)
;   SCS_TEST_SERVICE_IMAGEPATH    ImagePath simulado del servicio (opcional)
;   SCS_TEST_MARKER               1 para simular el marcador del instalador
;   SCS_TEST_OUT                  archivo de salida (por defecto harness-result.txt)
;
; Compilacion (desde cualquier consola, sin elevacion):
;   makensis /DSCS_TEST_OUT_HINT=1 /DOUTFILE=C:\ruta\harness.exe installer\tests\install-state-harness.nsi
; El define SCS_TEST_HARNESS lo pone este archivo, no el llamador: el .nsi de
; produccion nunca compila con el gancho de entorno.

Unicode true

!define SCS_TEST_HARNESS
!include "..\lib\install-state.nsh"

!ifndef OUTFILE
  !error "Falta /DOUTFILE=<ruta del .exe de prueba>"
!endif

Name "scs-install-state-harness"
OutFile "${OUTFILE}"
RequestExecutionLevel user
SilentInstall silent
ShowInstDetails nevershow
InstallDir "$TEMP\scs-install-state-harness"

Section "Harness"
  ReadEnvStr $0 "SCS_TEST_DIR"
  ${If} $0 == ""
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $INSTDIR $0
  Call DetectInstallState

  ; Comparador de versiones (ScsVersionCode): dos entradas por entorno para
  ; poder probar el aviso de degradacion sin tocar el registro ni un servicio.
  ReadEnvStr $0 "SCS_TEST_VERSION_A"
  Call ScsVersionCode
  StrCpy $R0 $R9
  ReadEnvStr $0 "SCS_TEST_VERSION_B"
  Call ScsVersionCode
  StrCpy $R8 $R9

  ; Reproduccion literal de la regla anterior (sc-sentinel.nsi <= v0.1.10,
  ; ValidateInstallDir): si la carpeta tiene CUALQUIER entrada y no existe el
  ; marcador .sc-sentinel-install, se rechaza. Se conserva aqui como prueba de
  ; regresion (T18): con la regla nueva la misma carpeta es una actualizacion.
  StrCpy $2 0
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
        ${ExitDo}
      ${EndIf}
      ClearErrors
      FindNext $0 $1
    ${Loop}
    FindClose $0
  ${EndIf}
  StrCpy $4 0
  ${If} $2 == 1
  ${AndIfNot} ${FileExists} "$INSTDIR\.sc-sentinel-install"
    StrCpy $4 1
  ${EndIf}

  ReadEnvStr $0 "SCS_TEST_OUT"
  ${If} $0 == ""
    StrCpy $0 "$EXEDIR\harness-result.txt"
  ${EndIf}
  ClearErrors
  FileOpen $9 "$0" w
  ${If} $9 == ""
    SetErrorLevel 3
    Quit
  ${EndIf}
  FileWrite $9 "state=$InstallState$\r$\n"
  FileWrite $9 "version=$DetectedVersion$\r$\n"
  FileWrite $9 "version_source=$VersionSource$\r$\n"
  FileWrite $9 "installdir=$INSTDIR$\r$\n"
  FileWrite $9 "servicedir=$ServiceDir$\r$\n"
  FileWrite $9 "foreign=$InstallForeign"
  FileWrite $9 "foreign-end$\r$\n"
  FileWrite $9 "reason=$InstallReason$\r$\n"
  FileWrite $9 "version_code_a=$R0$\r$\n"
  FileWrite $9 "version_code_b=$R8$\r$\n"
  FileWrite $9 "legacy_reject=$4$\r$\n"
  FileClose $9
SectionEnd
