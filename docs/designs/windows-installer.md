# Diseño — instalador de Windows de SC-Sentinel

**Fecha:** 2026-11-21. **Estado:** diseño, no implementación. **Alcance:** N0; no se instaló ni se modificó nada en este equipo. Las pruebas propuestas van en Windows Sandbox o VM desechable.

**Fuentes:** `scripts/install-agent.ps1`, `scripts/uninstall-agent.ps1`, `scripts/package-release.ps1`, `scripts/verify-agent.ps1`, `scripts/instalar-sc-sentinel.bat`, `scripts/desinstalar-sc-sentinel.bat`, ZIP `sc-sentinel-agent-v0.1.9-windows-x64.zip`, inventario del equipo, `docs/legal/npcap-notice.md`, `docs/legal/THIRD_PARTY_NOTICES.md`.

---

## 1. Inventario real del paquete 0.1.9

ZIP: `dist/sc-sentinel-agent-v0.1.9-windows-x64.zip`, **15.705.138 B**, 14 entradas. SHA256 de cada entrada (calculado el 2026-11-21):

| Archivo | Origen | Destino | ACL | Propósito | Obligatorio | Tamaño (B) | SHA256 |
|---|---|---|---|---|---|---|---|
| `sc-sentinel-agent.exe` | `agent/target/release` (build local/CI) | `C:\Program Files\SC-Sentinel\` | SYSTEM:(F), Administradores:(RX) | Servicio de captura/colector/sync | Sí | 9.095.168 | `dd90acde65a8a82b122077aaeb4678cd1e4ee9421c80e10f7836e4c91ce1e9e4` |
| `sc-gui.exe` | `agent/target/release` | `C:\Program Files\SC-Sentinel\` | hereda `Usuarios:(RX)` (el instalador no la restringe) | GUI de estado | Opcional | 9.419.264 | `e439a8a4d44a5fd7378e058452dd034bdb3b097d19a90a8fd61a45fc04faf90f` |
| `abrir-gui.bat` | `scripts/` | `C:\Program Files\SC-Sentinel\` | hereda | Lanzador de la GUI | Opcional | 1.434 | `7331d954677a0df174a0273f313a2cc9269809a64022162be951beba353d9eff` |
| `install-agent.ps1` | `scripts/` | No se copia (se ejecuta desde el paquete) | — | Lógica de instalación | Sí | 19.455 | `707b0873e56bb40d2fd33cdae3e81bee83b007f58e3d95d28cec10aef69699b8` |
| `uninstall-agent.ps1` | `scripts/` | No se copia (se ejecuta desde el paquete) | — | Lógica de desinstalación | Sí | 5.939 | `476d10ecb23ae0f5b1d3daec0b80043c5ac74ee3b732774b66584352c1c9a157` |
| `instalar-sc-sentinel.bat` | `scripts/` | No se copia | — | Instalador de un clic (UAC, pide device/token) | Sí | 9.605 | `1fdd065ed12aa4c9b06110b5d2203219f4286fca46a34af7740d99b571d93a47` |
| `desinstalar-sc-sentinel.bat` | `scripts/` | No se copia | — | Desinstalador de un clic | Sí | 4.162 | `4ae25dc04b6b52220a1b6dbc64ffc02c52a7dbdedd4cb56e4ab2bc79118172f8` |
| `LEEME-INSTALACION.txt` | `scripts/` | No se copia | — | Guía en lenguaje llano | Sí | 4.351 | `b372b953ac9a1702c38034fade84c0a4653f9e74621963ce99dc5897171c6d07` |
| `THIRD_PARTY_NOTICES.md` | `docs/legal/` | No se copia | — | Avisos legales | Sí | 16.214 | `5ecaa4b215829ac432573779f4b7488d97d8f38ef8b8250ce1be95b7a7b4c00a` |
| `licenses\sniffnet-LICENSE-MIT.txt` | `docs/legal/licenses/` | No se copia | — | MIT de Sniffnet | Sí | 1.075 | `d186600930bec3311df298ce8babd7f190d71eab3f405a13ac1924591c0181ec` |
| `licenses\sniffnet-LICENSE-APACHE.txt` | `docs/legal/licenses/` | No se copia | — | Apache-2.0 de Sniffnet | Sí | 9.723 | `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a` |
| `geolite2\GeoLite2-Country.mmdb` | `agent/resources/geolite2/` | `C:\Program Files\SC-Sentinel\geolite2\` | SYSTEM:(RX), Administradores:(RX) | País de hosts | Opcional | 3.394.049 | `bdb2b3f86dc278e5a5df64bc6fbe3de03f4844a5e97945a94df76e77049ee788` |
| `geolite2\GeoLite2-ASN.mmdb` | `agent/resources/geolite2/` | idem | idem | ASN de hosts | Opcional | 9.065.220 | `f2d4c3cd075d60378a177add27c092b536b2ed5aa651a1f8b9a6156f6e52085c` |
| `SHA256SUMS.txt` | generado por `package-release.ps1` | No se copia | — | Sumas internas | Sí | 1.170 | `9e5ae32549d40aea82dbf524a7a99fe1a6400550eebaee9d519e6bfe71a15496` |

**Hallazgo de identidad:** el `sc-gui.exe` instalado en este equipo es 9.505.792 B / `B1CB2ACF…`, distinto del ZIP (`E439A8A4…`, 9.419.264 B) y del build local (`26BE7031…`, 9.424.384 B). El instalador actual no garantiza que el GUI instalado sea el publicado. Esto debe corregirse antes de cualquier instalador nuevo (B-002).

---

## 2. Lo que se crea en tiempo de ejecución

| Ruta / registro | Contenido | ACL / condición | Se conserva al actualizar | Se borra al desinstalar |
|---|---|---|---|---|
| `C:\ProgramData\SC-Sentinel\config\config.toml` | Config del agente (`ingest.url`, privacidad, spool, log, collector) | SYSTEM:(R), Administradores:(R,W) | Sí | Solo con `-PurgeData` |
| `C:\ProgramData\SC-Sentinel\config\.host-key` | Clave HMAC de `host_mark` | generada por el agente; protegida por la carpeta | Sí | Solo con `-PurgeData` |
| `C:\ProgramData\SC-Sentinel\logs\agent.log` | Log operativo | SYSTEM:(F), Administradores:(F) | Sí | Solo con `-PurgeData` |
| `C:\ProgramData\SC-Sentinel\spool\sc-spool.sqlite` | Cola local de ventanas | SYSTEM:(F), Administradores:(RX) | Sí | Solo con `-PurgeData` |
| `HKLM\SYSTEM\CurrentControlSet\Services\SC-Sentinel-Agent` | Servicio: `ImagePath`, `Environment` (`SC_INGEST_TOKEN`, `SC_SENTINEL_DEVICE_ID`, `SC_GEOIP_DB`, `SC_GEOIP_ASN_DB`), `FailureActions` | requiere administrador | Sí | `sc delete` |
| Servicio `SC-Sentinel-Agent` | `AUTO_START`, recovery `restart/5000`, `restart/10000`, `restart/30000`, reset `86400` | SCM | Sí | `sc delete` |

**No crea** reglas de firewall, accesos directos ni tareas programadas. No instala Npcap. El binario del agente se copia a `Program Files`; la GUI se copia sin ACL explícita para que herede `Usuarios:(RX)`.

**Nombres de variables del servicio (solo nombres):** `SC_INGEST_TOKEN`, `SC_SENTINEL_DEVICE_ID`, `SC_GEOIP_DB`, `SC_GEOIP_ASN_DB`. Nunca se imprimen valores.

---

## 3. Requisitos del instalador

| # | Requisito | Criterio medible |
|---|---|---|
| R1 | Instalación silenciosa y con asistente | `/S` o `--silent` instala sin UI; el modo asistente pide device/token con entrada oculta |
| R2 | Enrolamiento seguro | device id y token por `Read-Host -AsSecureString` o variable de entorno; **nunca** por argv ni en logs; prueba de `Win32_Process.CommandLine` sin token |
| R3 | Modo colector o captura | Checkbox «Capturar esta interfaz» que pasa `--interface "\Device\NPF_{GUID}"`; por defecto `--no-capture` |
| R4 | Detección de Npcap | Detecta driver/runtime; si falta y se elige captura, guía a `npcap.com` y no falla en modo colector |
| R5 | ACL con SIDs | `S-1-5-18` y `S-1-5-32-544`, nunca SYSTEM-only; verificar `icacls` |
| R6 | Actualización conservando datos | No borra `config.toml`, `.host-key`, spool ni token; solo reemplaza binarios; verifica SHA |
| R7 | Desinstalación con opción de conservar datos | Sin `-PurgeData` conserva `ProgramData`; con purge borra todo; sin residuos en `Program Files` |
| R8 | Registro de instalación sin secretos | Log en `%TEMP%` o `ProgramData\logs\install.log` sin token; solo origen del token y versión |
| R9 | Versión incrustada | `FileVersion`/`ProductVersion` visibles en Propiedades y en `--version`; hoy vacíos |
| R10 | Idempotencia | Dos instalaciones seguidas dejan el mismo estado; no duplica servicio ni variables |
| R11 | Rollback | Si falla el arranque, restaura el binario anterior y el servicio; conserva el `.bak` verificado |
| R12 | Firma y suma | Firma Authenticode opcional; siempre `SHA256SUMS.txt` y verificación contra el manifiesto |

---

### 3.1 Detección de instalación existente (implementada en 0.1.10)

La regla anterior («la carpeta debe estar vacía») rechazaba instalaciones reales: `install-agent.ps1` deja binario, GUI y `.bak-<marca>` pero **no** escribe marcador ni desinstalador. La detección vive en `installer/lib/install-state.nsh` (la compila también `installer/tests/install-state-harness.nsi`) y clasifica:

| Estado | Condición | Comportamiento |
|---|---|---|
| 0 | Carpeta vacía o inexistente, sin servicio ni marcador | Instalación nueva (pide Device ID y Token) |
| 1 | Servicio `SC-Sentinel-Agent` existe (su `ImagePath` manda como destino) | Actualización: sin credenciales, sin recrear el servicio; conserva `config.toml`, `.host-key`, token, spool, logs y respaldos |
| 3 | Hay archivos que no son del producto y no hay servicio ni marcador | Se rechaza (exit `3` en `/S`): lista hasta cinco nombres y ofrece otra carpeta o cancelar |
| 4 | Marcador del instalador o solo nombres del producto, sin servicio | Actualización que vuelve a pedir credenciales (no hay `Environment` que conservar) y recrea el servicio |

Con servicio instalado el destino queda fijo (la página de carpeta se omite) y `/D` se ignora: reapuntar un servicio en marcha no es una operación del asistente.

**Estado 4, flujo exacto** (marcador o solo nombres del producto, sin servicio): el destino es la carpeta detectada; se conservan `config.toml`, `.host-key`, el spool, los logs y los respaldos; el asistente pide otra vez Device ID y Token (campo enmascarado, token por archivo temporal con ACL restringida); `install-agent.ps1` respalda el binario y la GUI actuales (`.bak` + `.sha256` en `ProgramData\SC-Sentinel\backup`), **no reescribe `config.toml`** y vuelve a crear el servicio con `--no-capture` y el `Environment` nuevo. El `config.toml.nuevo` solo aparece si la configuración generada difiere de la existente.

### 3.2 `config.toml`: nunca se reescribe, y respaldo antes de tocar datos

Caminos que escriben `config.toml` tras la corrección:

| Archivo | Línea | Cuándo | Puede pisar una configuración existente |
|---|---|---|---|
| `scripts/lib/config-toml.psm1` | `Set-ScsConfigToml` | única escritura real de la config | No: si existe, la conserva y deja `config.toml.nuevo` |
| `scripts/install-agent.ps1` | llamada en el paso «Revisando configuracion» | instalación nueva y estado 4 | No (delega en `Set-ScsConfigToml`) |
| `scripts/install-agent.ps1` | rama `-UpdateMode` | actualización con servicio | No escribe config: solo comprueba que el SHA no cambió |
| `installer/sc-sentinel.nsi` | — | el `.nsi` nunca ha escrito `config.toml` | No |

Antes de escribir o reemplazar cualquier archivo de `ProgramData` se deja `ProgramData\SC-Sentinel\backup\<nombre>.bak-<marca>` + `.sha256`, verificado comparando los dos hashes; si no coinciden, el respaldo se borra y la instalación se corta. Los respaldos no se sobrescriben (se añade `-1`, `-2`…).

**Versión detectada** (para la página de actualización y el aviso de degradación): 1) `GET http://127.0.0.1:8387/status` → `agent_version`, con tope de 2 s; 2) `DisplayVersion` de la clave de desinstalación; 3) `ProductVersion` de `sc-sentinel-agent.exe`; 4) `desconocida` (no falla). Si la versión instalada es mayor que la del instalador se pide confirmación explícita y, en `/S`, se aborta con código `7` sin escribir nada.

Códigos de salida del instalador: `0` correcto · `1` fallo del servicio · `2` faltan credenciales · `3` carpeta inválida o con ajenos · `4` GUI abierta o hash distinto · `5` fallo de la actualización · `7` degradación rechazada en `/S` · `19` actualización aplicada **sin `sync_confirmed`** en 120 s (el servicio queda en ejecución y el spool reintenta; no significa «sin red»).

## 4. Opciones de tecnología

| Opción | Licencia / costo | Uso comercial | Restricciones | Veredicto |
|---|---|---|---|---|
| **NSIS** | zlib/libpng, gratis | **Sí** | Sin restricciones relevantes; se puede redistribuir | **Recomendado** para propietario y costo cero |
| **Inno Setup** | Licencia permite uso comercial; el proyecto pide comprar licencia comercial desde Inno Setup 7 (2026) | Sí, con licencia comercial | La licencia textual es amplia, pero el sitio oficial pide compra para uso comercial; costo a confirmar | Viable si se paga; no es “gratis para comercial” en la práctica |
| **WiX / MSI** | MS-RL, gratis | Sí | El instalador generado no se considera derivado según FireGiant; MSI encaja en empresas | Recomendado si se necesita MSI/GPO |
| **Scripts + ZIP actual** | Propietario, gratis | Sí | Sin asistente nativo, sin upgrade/MSI, token por argv en PowerShell | Mantener solo como fallback |

Fuentes: `nsis.sourceforge.io/Docs/AppendixI.html`; `jrsoftware.org/files/is/license.txt` y `jrsoftware.org/files/is7-whatsnew.htm`; `docs.firegiant.com/wix/` (consultadas 2026-11-21).

**Recomendación:** NSIS para el instalador principal (asistente + silencioso, costo cero, licencia permisiva). Si un cliente exige MSI/GPO, añadir un paquete WiX en la misma release.

---

## 5. Npcap y firma de código

### 5.1 Npcap

- La licencia free permite **5 instalaciones** y **no permite redistribución**; el OEM es pago (`npcap.com/license`, `npcap.com/oem/redist`; consultado 2026-11-21).
- **No empaquetar Npcap free** dentro del instalador. El diseño debe:
  1. Detectar si el driver/runtime está presente.
  2. Si el usuario elige captura y falta, abrir la página oficial y explicar que debe instalar con «WinPcap API-compatible mode».
  3. Si el usuario elige solo colector, no exigirlo.
- Para distribución comercial a escala, la decisión es **OEM redistribution** (contrato y costo) o que cada cliente gestione su licencia. Registrarlo en ADR.

### 5.2 Firma de código

| Opción | Costo | SmartScreen | Elegibilidad del proyecto |
|---|---|---|---|
| Sin firma + SHA256SUMS | Gratis | Bloqueo fuerte; «Unknown Publisher» | Siempre |
| Azure Artifact Signing (ex Trusted Signing) | ~US$9,99/mes | Reputación se construye con el tiempo | Organizaciones EE. UU./Canadá/UE/Reino Unido; individuos EE. UU./Canadá |
| OV | US$150–300/año | Igual que Azure: sin bypass inmediato | Mundial |
| EV | US$400+/año | **Ya no evita SmartScreen** | Mundial |
| SignPath Foundation | Gratis | Firmado como SignPath Foundation | Solo OSS; **no aplica** a software propietario |

Fuente: `learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options` y `smartscreen-reputation` (consultadas 2026-11-21).

**Recomendación:** Azure Artifact Signing si la organización califica; si no, OV. Mientras tanto, publicar `SHA256SUMS.txt` y `verify-agent.ps1` y avisar del prompt de SmartScreen.

---

## 6. Plan de pruebas (Sandbox/VM, nunca este equipo)

| # | Escenario | Pasos | Criterio |
|---|---|---|---|
| T1 | Instalación limpia | Sandbox sin servicio; ejecutar instalador con device/token de prueba; modo colector | Servicio `Running`, `agent_version` correcta, `capture_status=ok`, sin token en argv/log |
| T2 | Instalación con captura | Sandbox con Npcap; elegir interfaz `\Device\NPF_{GUID}` | `--interface` en `ImagePath`; `packets_seen` creciente |
| T3 | Sin Npcap, modo captura | Sandbox sin Npcap; elegir captura | Mensaje claro, enlace oficial, sin fallo del servicio |
| T4 | Actualización | Instalar 0.1.9, generar spool, instalar 0.1.10 | Config, `.host-key`, token y spool conservados; SHA del binario nuevo |
| T5 | Rollback | Forzar fallo del binario nuevo | Servicio vuelve al binario anterior; `.bak` verificado |
| T6 | Desinstalación sin purge | Desinstalar | Sin `Program Files\SC-Sentinel`; `ProgramData` conservado |
| T7 | Desinstalación con purge | `-PurgeData` | Sin `ProgramData\SC-Sentinel`; sin servicio; sin reglas |
| T8 | Reinstalación | Instalar → desinstalar → instalar | Idempotente; mismo estado; sin `marked for delete` |
| T9 | Sin residuos | Comparar `Get-ChildItem` y `Get-Service` antes/después | 0 archivos, 0 servicio, 0 variable |
| T10 | `verify-agent.ps1` | Ejecutar sobre el ZIP publicado y `-Service` | `TODO CORRECTO` |
| T11 | `deploy-agent-service.ps1 -DryRun` | Simular rollback | Veredicto «puede ejecutarse» |
| T12 | Accesibilidad del asistente | Teclado, foco, lector de pantalla | Flujo completo sin ratón |
| T13 | Actualización sobre una instalación hecha con scripts | Sandbox: copiar binario, GUI y `geolite2` a una carpeta, añadir cinco `sc-sentinel-agent.exe.bak-<marca>` y crear el servicio con `ImagePath` a esa carpeta (sin marcador, sin `installer\`, sin `uninstall.exe`); ejecutar el instalador `/S` | Exit `0`, binario y GUI reemplazados con el SHA del paquete, `uninstall.exe` y entrada en «Aplicaciones instaladas» creados; `.bak` + `.sha256` en `ProgramData\SC-Sentinel\backup` |
| T14 | Archivo ajeno bloquea y lista los nombres | Carpeta con `ajeno-1.txt`…`ajeno-6.txt` y sin rastro del producto | Exit `3` sin escribir; el mensaje lista cinco nombres y no sugiere desinstalar; nada ajeno se borra |
| T15 | Servicio presente con otra ruta | Servicio apuntando a `C:\SCS-Scripts`; ejecutar `/S /D=C:\SCS-Otro` | Destino fijo en `C:\SCS-Scripts`; `C:\SCS-Otro` no se crea; `InstallDir` del registro sigue siendo el del servicio |
| T16 | Actualización silenciosa conserva datos y token | `/S` sobre T13, con `config.toml` y spool ya existentes | Hashes de `config.toml` y del spool sin cambios; `SC_INGEST_TOKEN` idéntico antes y después (valor no impreso). La actualización completa se ejecuta contra un servidor de ingesta local simulado (2xx) para obtener `sync_confirmed` y `spool_flushed pending=0` |
| T19 | `config.toml` intacto en los estados 1 y 4 | Copiar una `config.toml` con valores no por defecto en la carpeta de datos y ejecutar `/S` sobre el servicio (estado 1) y sobre la carpeta sin servicio (estado 4) | SHA256 idéntico antes y después; ni `config.toml.nuevo` ni cambios de contenido. Pester: `scripts/tests/config-toml.Tests.ps1` y los casos de `installer-state.Tests.ps1` con el harness |
| T20 | Aviso de degradación | Instalar 0.1.10 y ejecutar el instalador 0.1.9 `/S` | Exit `7` sin escribir; con UI pide confirmación y el «No» no toca nada |
| T17 | Archivado de respaldos `.bak-*` | `/S` con `SCS_INSTALL_ARCHIVE_BAKS=1` | Los cinco `.bak-<marca>` quedan en `ProgramData\SC-Sentinel\backup\legacy` con ACL SYSTEM+Administradores sin herencia; ninguno en la carpeta de instalación; ninguno borrado |
| T18 | Regresión del síntoma exacto | Carpeta del reporte (binario, GUI, `abrir-gui.bat`, `geolite2` y cinco `.bak-*`) sin marcador | No aparece «La carpeta … ya existe y tiene archivos que no son de SC-Sentinel»; entra en modo actualización. La regla anterior se reproduce en `scripts/tests/installer-state.Tests.ps1` (`legacy_reject`) |

**Conexión con scripts existentes:** el instalador debe llamar a `install-agent.ps1` (no duplicar lógica), respetar `verify-agent.ps1` y dejar el `.bak` que consume `deploy-agent-service.ps1 -Mode Rollback`.

**Pruebas sin Sandbox local:** `.github/workflows/installer-windows.yml` (solo `workflow_dispatch`, sin tags ni release) instala NSIS 3.10 y el SDK de Npcap 1.13 fijados por SHA256, compila el agente con `--features sc-capture/live` (gate: el `.exe` no puede contener «captura live no compilada»), compila el setup con `build-installer.ps1` y ejecuta T1, T4–T9 y T13–T18 en un runner `windows-latest` efímero. Con `dry_run=true` (por defecto) solo compila y corre Pester (detección de estado, `config.toml` intacto, parámetros); con `dry_run=false` ejecuta además las pruebas que instalan el servicio, con el agente real en modo colector (`--no-capture`) contra un servidor de ingesta local simulado que responde 2xx, y compara los hashes de `config.toml` y del spool antes y después. El token de prueba es ficticio y nunca se imprime. Artefactos con retención de 7 días.

```powershell
# disparar el workflow (no empuja commits ni crea tags)
gh workflow run "Instalador Windows (NSIS)" -f dry_run=false -f version=0.1.10
```

---

## 7. Criterios de aceptación

1. Instalación limpia, actualización, rollback y desinstalación pasan T1–T9 en Sandbox.
2. El token nunca aparece en argv, logs, registro legible ni capturas.
3. `sc-gui.exe` instalado == `sc-gui.exe` del ZIP (hash).
4. `FileVersion`/`ProductVersion` presentes y coincidentes con `--version`.
5. Npcap se detecta; no se redistribuye; el modo colector no lo exige.
6. Desinstalación sin purge conserva datos y sin purge no deja residuos.
7. `verify-agent.ps1` sobre el ZIP y `-Service` da `TODO CORRECTO`.
8. El instalador está firmado o la release publica SHA256SUMS y un aviso explícito de SmartScreen.

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Npcap free no escala | Licencia/instalación | OEM o guía + licencia del cliente |
| GUI no reproducible | Instalación con binario distinto | Verificar hash del GUI en `verify-agent.ps1` |
| Token en argv | Fuga de credencial | `Read-Host`/entorno; test de `CommandLine` |
| Sin firma | SmartScreen bloquea | Azure/OV o aviso + SHA |
| Actualización pisa config | Pérdida de enrolamiento | Probar T4; no tocar `ProgramData` |
| Servicio “marked for delete” | Reinstalación falla | Esperar `sc query` 1060 como ya hace el script |

---

## 9. Lo que no se hizo

No se instaló NSIS/Inno/WiX, no se compiló un instalador, no se probó en Sandbox y no se modificó `install-agent.ps1`. Cualquier implementación requiere autorización N1/N3 y una VM/Sandbox.

## 10. Lo que solo se puede verificar en una VM o un equipo real

| Comprobación | Por qué no cabe en el CI ni en este equipo | Cómo se prueba |
|---|---|---|
| Npcap y captura local (T2/T3) | La licencia free no permite redistribuirlo ni automatizar su instalación | Sandbox/VM con y sin Npcap: elegir interfaz y comprobar `--interface` en `ImagePath` y `packets_seen` creciente |
| UAC y SmartScreen | Dependen del usuario interactivo y de la reputación del binario | Equipo real: doble clic, aceptar UAC, ver el aviso de editor desconocido |
| Páginas del asistente (bienvenida, carpeta, actualización, credenciales, final) | Son UI nativa; el CI solo puede ejecutar `/S` | Sandbox con escritorio: recorrer el asistente con teclado y ratón, incluidas las advertencias 7 y 19 |
| Reemplazo de una GUI abierta | Requiere un proceso interactivo que bloquee el `.exe` | Sandbox: abrir `sc-gui.exe` y ejecutar el instalador; debe salir con 4 sin tocar nada |
| Firma Authenticode | Requiere el certificado del propietario | `Get-AuthenticodeSignature` sobre el `.exe` publicado |
