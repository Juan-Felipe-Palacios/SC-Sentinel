# Diseño — release 0.1.10: reproducible, instaladores NSIS y shell

**Fecha:** 2026-11-22. **Estado:** diseño; no se escribió código, no se creó tag, no se hizo push. **Alcance:** N0/documentación. Este archivo queda **sin versionar** hasta que el propietario lo autorice.

**Recorte:** una sola release, **0.1.10** (nunca publicada): `FileVersion`/`ProductVersion`, hash del GUI verificado, asset Linux e instaladores NSIS/`.sh` (§4–§8). El propietario unificó aquí la versión para no publicar 0.1.10 sin instaladores y volver a etiquetar 0.1.11 con el mismo código. Fuera de esta release: firma Authenticode, `.deb`/`.rpm` y EULA.

**Decisiones del propietario:** I-1, I-2, I-3 (§2). **Documento predecesor:** `docs/designs/windows-installer.md` (sin versionar, no se modifica en esta ronda).

---

## §1 · Alcance por release

| Release | Contenido | No incluye |
|---|---|---|
| **0.1.10** | A1 `FileVersion`/`ProductVersion` en ambos `.exe` · A2 hash del GUI verificado (B-002) · A3 asset Linux publicado · I-1 NSIS + R13 · I-2 instalador shell + unit endurecida · página de licencia · `dry_run` · upgrade con servicio y GUI vivos · runbooks y ADR | Firma Authenticode, `.deb`/`.rpm`, EULA redactado, cambios de contrato o de esquema |

Cada release se publica una sola vez y una release no se puede reemplazar (§7.5 de `AGENTS.md`), así que 0.1.10 se publica completa y una sola vez, con el gate de instalación real en verde.

---

## §2 · Decisiones confirmadas

| # | Decisión | Release | Estado |
|---|---|---|---|
| I-1 | Windows: **NSIS** (`.nsi`) como instalador principal; el ZIP con `instalar-sc-sentinel.bat` queda como alternativa documentada | 0.1.10 | confirmada |
| I-2 | Linux: **instalador shell** dentro del `.tar.gz`; `.deb`/`.rpm` fuera de alcance | 0.1.10 | confirmada |
| I-3 | **Sin firma Authenticode** por ahora: se publica `SHA256SUMS.txt` y aviso de SmartScreen; B-013 sigue abierto | 0.1.10 | confirmada |

No se reutilizan las etiquetas D1–D7 para no colisionar con el plan de solución.

---

## §3 · Estado verificado (comandos ejecutados, salida recortada)

| Hecho | Evidencia |
|---|---|
| El CI compila ambos targets y fusiona sumas | `.github/workflows/release.yml` matriz en `:24`, job `publish` en `:184-186` |
| La release se puede recompilar desde un tag existente | `release.yml` hace `checkout` con `ref: ${{ steps.meta.outputs.tag }}`; el comentario del workflow ya dice que así un `workflow_dispatch` reproduce esa release |
| El empaquetado ya es multiplataforma | `scripts/package-release.ps1:23` → `[ValidateSet('windows-x64','linux-x64')]`; `.zip` para Windows, `.tar.gz` para Linux |
| El paquete verifica que lo copiado es idéntico al origen | `package-release.ps1` compara `Get-FileHash` de cada fichero del stage contra `$copied[<origen>]` antes de escribir `SHA256SUMS.txt` |
| `sc-gui.exe` entra al paquete y a las sumas internas | `package-release.ps1` aborta si falta `agent/target/release/sc-gui.exe` y lo suma como cualquier otro fichero |
| `verify-agent.ps1` verifica el hash del GUI **dentro del paquete** | `:95-96` (lista de archivos) y `:123` (comparación con el manifiesto del paquete) |
| El CI **no** comprueba `FileVersion`/`ProductVersion` | no hay `build.rs` en `agent/` (`glob agent/**/build.rs` → 0 ficheros) ni paso de `VersionInfo` en `release.yml` |
| La versión del workspace está en 0.1.10 | `agent/Cargo.toml:6` |
| v0.1.8 publicó asset Linux; v0.1.9 no | `gh release view`: v0.1.8 → `…-linux-x64.tar.gz` + `.zip`; v0.1.9 → solo `…-windows-x64.zip` + `SHA256SUMS.txt` (B-017) |
| `cargo deny` permite MIT | `agent/deny.toml` → `allow = [… "MIT" …]`; gate en `.github/workflows/rust.yml:93` |
| `designs/` está indexado | `docs/README.md:18` (tabla) y `:82` (fila de estado) |

**No verificado en esta ronda:** causa de que v0.1.9 no publicara el `.tar.gz`; hash del `sc-gui.exe` instalado frente al del paquete (B-002); `FileVersion` actual (no existe). Los dos primeros se cierran dentro de 0.1.10; el tercero lo crea A1.

---

## §4 · 0.1.10 — release reproducible desde CI verde

### 4.1 A1 · `FileVersion` y `ProductVersion`

Hoy los `.exe` no llevan `VERSIONINFO`: `agent/` no tiene ningún `build.rs`, así que el Explorador y `Get-Item` no muestran versión y no hay forma de distinguir dos builds por metadatos.

- `winresource` **0.1.34**, licencia **MIT** (publicada 2026-10-12), como `build-dependency` bajo `cfg(windows)` en `sc-agent` y `sc-gui`; `build.rs` de cada crate fija `FileVersion` y `ProductVersion` desde `CARGO_PKG_VERSION`.
- Gate nuevo en el job Windows de `release.yml`: `(Get-Item <exe>).VersionInfo` de `sc-sentinel-agent.exe` **y** `sc-gui.exe` debe devolver `${{ steps.meta.outputs.version }}`; si no, se corta antes de empaquetar.
- `verify-agent.ps1` suma la misma comprobación sobre el paquete descomprimido, con la versión esperada tomada del nombre del ZIP.

**Criterio de aceptación:** los dos `.exe` del ZIP muestran la versión de la release en `FileVersion` y `ProductVersion`; un cambio de versión en `agent/Cargo.toml` sin rebuild produce un gate rojo.

### 4.2 A2 · Hash del GUI verificado (B-002)

B-002 registra tres hashes distintos del mismo `sc-gui.exe`: instalado 9.505.792 B `B1CB2ACF…`, ZIP 9.419.264 B `E439A8A4…`, build local 9.424.384 B `26BE7031…`. El verificador actual no podía detectarlo porque compara **el paquete contra su propio manifiesto**, nunca el binario instalado.

| Pieza | Estado | Acción en 0.1.10 |
|---|---|---|
| Paquete: `sc-gui.exe` == build | ya cubierto por `package-release.ps1` y `verify-agent.ps1:123` | dejarlo como gate, nombrarlo en el runbook |
| Build: `sc-gui.exe` == binario compilado en CI | implícito (se compila y se copia en el mismo job) | gate explícito de tamaño y SHA del `.exe` en el log del job Windows |
| Instalado: `Program Files\SC-Sentinel\sc-gui.exe` == paquete | **no existe** | nueva comprobación **de solo lectura** en `verify-agent.ps1 -Service`: si el fichero existe, comparar su SHA256 contra la entrada `sc-gui.exe` de `SHA256SUMS.txt` del paquete y reportar `FALLO` con ambos hashes si difieren |

`verify-agent.ps1` no modifica el equipo (según su `.DESCRIPTION`), así que la comprobación nueva respeta la regla de solo lectura.

**Alcance honesto:** 0.1.10 entrega la **detección**; no promete explicar la causa raíz de B-002 (copia desde otra ruta, ACL que impidió el reemplazo o un `.exe` puesto a mano). B-002 se cierra cuando, con la release 0.1.10 instalada, el hash instalado coincide con el del paquete o la diferencia queda explicada por la auditoría N0 (§9). Si la auditoría no se ejecuta antes del release, el gate es lo único que se puede afirmar.

### 4.3 A3 · Asset Linux en la release

- El `.tar.gz` de Linux ya se produce (`package-release.ps1`, rama `else`) pero v0.1.9 se publicó sin él. La causa no está verificada en esta ronda y **no se infiere**.
- Gate nuevo en el job `publish`: antes de `gh release create`, exigir que `dist/` contenga exactamente un `sc-sentinel-agent-*-windows-x64.zip`, un `sc-sentinel-agent-*-linux-x64.tar.gz` y un `SHA256SUMS-<target>.txt` por target. Si falta cualquiera, el job falla sin publicar (hoy solo comprueba que haya *algún* fichero).
- Smoke del binario Linux en su job: `./sc-sentinel-agent --version` responde la versión esperada y el binario **sí** contiene `captura live no compilada`, que es lo correcto: Linux se construye sin la feature `live` (comentario del job en `release.yml`). Es el gate de Windows invertido.
- `SHA256SUMS.txt` de la release debe listar los dos artefactos; es el mismo fichero que verifica el usuario.

### 4.4 Fuera de alcance de 0.1.10

Firma Authenticode (I-3), `.deb`/`.rpm`, EULA redactado, cambios de contrato, de esquema o de comportamiento del agente. El bump de `agent/Cargo.toml` `0.1.9` → `0.1.10` es mecánico y obligatorio; no es una funcionalidad.

### 4.5 Verificación de 0.1.10

1. Corrida del job Windows: log con `FileVersion`/`ProductVersion` de ambos `.exe` y SHA del `sc-gui.exe` compilado.
2. `./scripts/verify-agent.ps1` sobre el ZIP: contenido, sumas, versión, `VERSIONINFO` y hash del GUI del paquete.
3. `./scripts/verify-agent.ps1 -Service` en el equipo de prueba: hash del GUI instalado igual al del paquete (o `FALLO` con los dos hashes, que es el resultado que hoy se espera hasta reinstalar).
4. `gh release view v0.1.10`: dos artefactos + `SHA256SUMS.txt` con dos líneas; `sha256sum -c` verde en Linux.
5. `workflow_dispatch` con `tag: v0.1.10` recompila exactamente ese tag y vuelve a subir los artefactos con `--clobber`. La reproducibilidad que se exige es la del **binario** dentro del paquete (mismo SHA para el mismo toolchain), no la del `.zip`/`.tar.gz`, que arrastra metadatos del contenedor.

**Estimación:** 3–5 h. Supuestos: `winresource` compila con las herramientas MSVC del runner sin pasos extra; CI en verde al primer intento. Cifras estimadas, no medidas.

---

## §5 · 0.1.10 — CI sin tags de prueba (`dry_run`)

Andamiaje para probar los instaladores sin crear release: el workflow `installer-windows.yml` no crea tags ni publica, y el `dry_run` del workflow de release permite recompilar sin escribir en Releases.

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Compilar, probar y subir artefactos sin crear release"
        type: boolean
        default: false
      version:
        description: "Versión SemVer sin 'v' (obligatoria si dry_run)"
        type: string
```

- `dry_run=true`: matriz completa, gates, empaquetado y `upload-artifact` con `retention-days: 7`. Sin `gh release create`, sin tag, sin escritura en Releases.
- `dry_run=false` por `workflow_dispatch`: exige `version` y que el tag `v<version>` ya exista; si no existe, falla en el primer paso (no lo crea).
- Job `publish`: `if: github.event_name == 'push' || inputs.dry_run == false`, más `needs: build`. Con `dry_run=true` aparece como *skipped*.

**Verificación:** corrida real con `dry_run=true` sobre `main` → artefactos descargables, `publish` en *skipped*, ninguna release nueva (`gh release list` antes/después). **Costo:** 35–45 min de facturación por corrida (Windows 2×, Ubuntu 1×) con caché de Cargo en caliente.

---

## §6 · 0.1.10 — Windows: NSIS y R13

### 6.1 R13 — el flujo elevado no puede nacer en una ruta escribible

El ZIP se descomprime donde elija el usuario (Descargas, escritorio, `%TEMP%`) y `instalar-sc-sentinel.bat` se auto-eleva desde ahí: toda la lógica que corre con administrador vive en esa carpeta.

| Elemento | Detalle |
|---|---|
| Activo | Integridad del servicio, del binario y del token de ingesta |
| Actor | Cualquier proceso del mismo usuario (malware sin privilegios, otro usuario, una tarea programada) |
| Ventana | Desde que el `.bat` pide UAC hasta que `install-agent.ps1` termina; también cada reinstalación |
| Vía 1 (TOCTOU) | Sustituir `install-agent.ps1` o el `.exe` entre la comprobación y la ejecución elevada |
| Vía 2 (hijack) | Colocar un `powershell.exe`/DLL en la carpeta del paquete o en el directorio de trabajo, porque Windows resuelve primero el directorio actual |
| Vía 3 (permisos) | La carpeta descomprimida hereda escritura del usuario: no hay defensa mientras el origen sea escribible |
| Impacto | Ejecución arbitraria como SYSTEM/Administrador y exfiltración del token que se teclea en ese mismo flujo |

Diseño:

1. El instalador (NSIS) es el único punto de entrada y corre elevado desde el inicio.
2. Antes de elevar, verifica que los scripts que va a ejecutar coinciden con `SHA256SUMS.txt` del paquete; si no coinciden, aborta sin elevar.
3. Copia `install-agent.ps1`, `uninstall-agent.ps1` y los binarios a `C:\Program Files\SC-Sentinel\installer\` con ACL `S-1-5-18:(F)` y `S-1-5-32-544:(RX)`, sin herencia.
4. Ejecuta **solo** desde esa ruta protegida, con `-NoProfile -ExecutionPolicy Bypass -File <ruta protegida>`, y fija el directorio de trabajo a la misma carpeta.
5. El ZIP de alternativa conserva el `.bat`, pero también copia y verifica antes de elevar; si no puede verificar, se niega a continuar.
6. La carpeta `installer\` se elimina al desinstalar; no se deja nada escribible por el usuario en el flujo elevado.

Verificación: `icacls` muestra únicamente `S-1-5-18` y `S-1-5-32-544` sin herencia; prueba negativa en Sandbox con `install-agent.ps1` modificado → aborta antes de UAC; usuario sin privilegios no puede escribir en `installer\`.

**Riesgo residual:** el setup NSIS sigue sin firma (I-3); R13 protege la cadena posterior a su ejecución, no su procedencia.

### 6.2 Actualización con servicio y GUI vivos

1. Parar el servicio (`Stop-Service`) y esperar `sc query` sin `STOP_PENDING`; un solo ciclo de parada por cambio.
2. Detectar `sc-gui.exe` en ejecución y pedir cierre al usuario. No matar el proceso a ciegas ni continuar en silencio: si sigue vivo, el instalador se detiene con un mensaje claro (el archivo estaría bloqueado).
3. Copiar `.bak` del binario actual, verificar su SHA contra el `.sha256` y conservarlo hasta que el servicio arranque y `/status` responda.
4. Sustituir, arrancar y verificar: `capture_status`, `packets_seen` creciente, `sync_confirmed` posterior al arranque, `spool_flushed pending=0`.
5. Borrar `SCS_INGEST_TOKEN` y `SC_INGEST_TOKEN` del proceso (`$env:X = $null`) y del entorno tras usarlos; ningún log, consola ni argv con el token (solo «origen del token» y versión).
6. Desinstalar con `-PurgeData`: advertencia con las rutas que se borran (`ProgramData\SC-Sentinel` completo), confirmación aparte y respaldo previo obligatorio.

`re-enroll-device.ps1` cerro la misma deuda: ya no acepta `-IngestToken`; el token entra por `-IngestTokenFile` o por `SC_ENROLL_TOKEN`, y el helper elevado de la GUI lo pasa solo por entorno. Cerrado en F1 (0.1.10): `install-agent.ps1` ya no acepta `-IngestToken` (B-014); el token entra por `-IngestTokenFile` o por `SCS_INSTALL_TOKEN`, y el `.bat` solo pasa `-DeviceId`. Con NSIS el token se pide en una página enmascarada, viaja por un archivo temporal con ACL `S-1-5-18`/`S-1-5-32-544` y se borra al leerlo. Deuda que queda: el `.bat` sigue pidiendo el token con `set /p` visible; el camino recomendado es el instalador `.exe`.

### 6.3 Página de licencia

No existe EULA; el instalador no debe inventar términos (§12.6 de `AGENTS.md`: no damos asesoría legal).

| Opción | Descripción | Consecuencia |
|---|---|---|
| **(a) Recomendada** | Mostrar `LICENSE` textual en `MUI_LICENSEPAGE` con `MUI_LICENSEPAGE_TEXT_BOTTOM`: «Este texto es la licencia del producto; no es un contrato de instalación» | Cero invención legal; el usuario ve las condiciones reales |
| (b) Omitir la página | El instalador no muestra licencia | Más simple; la licencia sigue aplicando por estar en el paquete |
| (c) Redactar EULA | Texto nuevo con aceptación obligatoria | Requiere abogado y decisión registrada en ADR; **no se hace sin orden** |

Sin decisión del propietario se implementa (a) con el texto literal de `LICENSE` (`:1-3`, «SOFTWARE PROPIO — LICENCIA PROPIETARIA») y **sin** aceptación bloqueante.

---

## §7 · 0.1.10 — Linux: instalador, unit y pruebas systemd

### 7.1 Unit endurecida

```ini
[Unit]
Description=SC-Sentinel Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sc-sentinel
Group=sc-sentinel
EnvironmentFile=-/etc/sc-sentinel/token.env
ExecStart=/usr/local/bin/sc-sentinel-agent --config /etc/sc-sentinel/config.toml --no-capture
Restart=always
RestartSec=10
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallFilter=@system-service
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
UMask=0077
ReadWritePaths=/var/lib/sc-sentinel /var/log/sc-sentinel /etc/sc-sentinel

[Install]
WantedBy=multi-user.target
```

Usuario `--system --no-create-home --shell /usr/sbin/nologin`. Token por `--token-file` (0600, prioridad), luego `read -s`; nunca argv ni log.

**Objetivo medible:** `systemd-analyze security sc-sentinel-agent.service` con **puntuación ≥ 5.0 y ningún hallazgo `UNKNOWN`/`EXPOSED`**. No medida todavía: se registra como línea base al implementar (§4 de `AGENTS.md`: medido ≠ estimado). `MemoryDenyWriteExecute` entra como hipótesis; si el runtime lo necesita, se retira documentando el motivo.

### 7.2 Dónde se prueba systemd

| Opción | Realismo | Costo | Veredicto |
|---|---|---|---|
| **Ejecutor `ubuntu-latest`** | VM con systemd como PID 1: `systemctl enable --now` es real, no simulado | ≈3–5 min de reloj × 1× por corrida | **Elegida** |
| Contenedor con systemd (`--privileged`) | Depende de cgroup v2 del host; frágil y poco representativo | 0 min extra de Actions | Solo local, no gate |
| VM propia | Máximo realismo | Infra y mantenimiento permanentes | Descartada |

El job instala el paquete, arranca el servicio, comprueba `systemctl is-active`, los puertos UDP en escucha y `event="collector_listening"`; luego desinstala y comprueba `--purge` sin residuos. El runner **no** representa una distro de cliente: valida el instalador, no la compatibilidad por distro.

### 7.3 Estado actual del runbook

`docs/runbooks/install-agent-linux.md` §2 `:25`, §3 `:33` y §5 `:91` son heredocs manuales; no existe `.sh` de instalación. El instalador los reemplaza conservando la línea `VER=` que `package-release.ps1:122-127` reescribe.

---

## §8 · 0.1.10 — Secuencia, dependencias y estimación

| Fase | Dependencia |
|---|---|
| A1–A3 (versión, hash del GUI, asset Linux) | ninguna; cerrado en el árbol |
| I-1 Windows (NSIS + R13) | commit en rama → push de la rama → `workflow_dispatch` con `dry_run=false -f version=0.1.10` en verde |
| I-2 Linux (instalador y unit) | runner `ubuntu-latest` |
| Release 0.1.10 + ADR | todo lo anterior en `main` |

**Estimación:** 15–24 h en dos turnos (A1–A3, NSIS + R13 + T1–T18 en runner efímero, `install-agent-linux.sh`, unit y prueba en `ubuntu-latest`, runbooks y ADR 0021). Supuesto: `makensis` y el SDK de Npcap fijados por SHA256 en el runner Windows, y CI verde al primer intento. Estimaciones, no medidas.

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `winresource` rompe el build Windows | 0.1.10 no sale | Build-dep `cfg(windows)` y gate de `VERSIONINFO`; si falla, se revierte solo ese paso |
| Los contenedores de release no son bit a bit reproducibles | Falsa expectativa de reproducibilidad | Se compara el SHA del **binario** dentro del paquete, no el del `.zip` |
| Causa de v0.1.9 sin asset Linux no identificada | Reaparece en 0.1.10 | Gate del job `publish` que exige los dos artefactos antes de crear la release |
| NSIS o Npcap SDK añaden un paso de build | La release 0.1.10 falla por herramienta | NSIS 3.10 y SDK 1.13 fijados por SHA256 en el workflow; gate de `makensis -VERSION` y del binario con captura live |
| Sin firma | SmartScreen bloquea | I-3: `SHA256SUMS.txt` + aviso explícito; B-013 abierto |
| Npcap free (5 instalaciones, sin redistribución) | Legal y operativo | Detectar, no empaquetar, guiar a la web oficial |
| Instalador Linux no probado en distro real | Falsa confianza | El runner valida el flujo, no la compatibilidad; se declara en el runbook |
| `systemd-analyze security` por debajo del objetivo | Endurecimiento incompleto | Medir primero, ajustar directivas, documentar lo que no se pueda subir |

---

## §9 · Auditoría N0 (opcional; no bloquea 0.1.10)

Ya **no** bloquea la release: A1 crea el `VERSIONINFO` que faltaba y A2 detecta la discrepancia por hash. La N0 aporta la causa raíz de B-002 y los datos del equipo que el instalador necesita (ACL, Npcap, servicio, restos). Se ejecuta en un turno aparte, antes del checklist manual en VM/equipo real.

```text
Actuá como auditor N0 de SC-Sentinel. Solo lectura: no instales nada, no escribas
en el repo, no arranques ni detengas servicios, no toques SC-Sentinel-Agent,
C:\ProgramData\SC-Sentinel ni ningún secreto. Si un dato exige administrador,
detenete y pedilo; no eleves nada por iniciativa propia.

Objetivo: cerrar la foto real de este equipo que necesita el diseño del
instalador, sin inferir nada de documentos previos ni de informes anteriores.

Capturá evidencia en tablas, una afirmación por fila, con el comando y la salida
cruda recortada:
1. SO: edición, build y arquitectura (Get-ComputerInfo / winver / $PSVersionTable).
2. Npcap: driver instalado, runtime y wpcap.dll en System32, con versión de cada uno.
3. Servicio: nombre, estado, ImagePath, FailureActions y SOLO LOS NOMBRES de las
   variables de Environment (nunca valores).
4. Hashes SHA256 de sc-sentinel-agent.exe y sc-gui.exe en tres orígenes:
   C:\Program Files\SC-Sentinel, el ZIP v0.1.9 y agent\target\release.
5. ACL reales con icacls mostrando SIDs (no nombres) de Program Files\SC-Sentinel,
   su subcarpeta geolite2 si existe, ProgramData\SC-Sentinel y su carpeta backup.
6. VersionInfo.FileVersion y ProductVersion de ambos .exe, instalados y del ZIP.
7. Contenido de ProgramData\SC-Sentinel: nombres de archivos y tamaños; nunca
   abrir .host-key ni token.env ni imprimir su contenido.
8. Procesos sc-gui vivos y ruta del ejecutable de cada uno.
9. Restos en %TEMP% con prefijo sc-sentinel y su ACL.

Disciplina: cada fila lleva comando y salida; lo que no puedas comprobar se marca
NO VERIFICABLE con el motivo concreto. Cero conclusiones de diseño y cero
recomendaciones: eso ya está en docs/designs/installers.md.

Salida: tablas por bloque, recuento de hallazgos (crítico/alto/medio/bajo),
tabla final hecho / no hecho / bloqueado, y cierre con la lista exacta de datos
que requieren elevación para completarse.
```

---

## §10 · Fuera de alcance

`.deb`/`.rpm`, MSI/GPO, firma Authenticode, EULA redactado, macOS y multi-tenant. No se toca el servicio instalado, `ProgramData`, secretos ni producción. No se modifica `docs/designs/windows-installer.md` ni `scripts/backup-agent-binary.ps1`.

---

## §11 · Hecho / no hecho de esta ronda

| Hecho | Evidencia |
|---|---|
| 0.1.10 reúne A1–A3 y los instaladores | §1, §4–§7 |
| `dry_run` e instaladores unificados en 0.1.10 | §1, §5–§7 |
| A1 sin `build.rs` previo: dependencia validada contra `deny.toml` | §3, §4.1 |
| Precisión sobre B-002: paquete vs. instalado | §4.2 |
| N0 deja de bloquear 0.1.10 | §8, §9 |
| Secuencia y estimaciones en rango | §8 |

| No hecho | Motivo |
|---|---|
| Ningún archivo de código, workflow o unit | Solo documentación, como se pidió |
| `winresource` no añadido en esta ronda documental | Implementado después en 0.1.10 (`agent/crates/*/build.rs`) |
| Gates de `publish` y `verify-agent.ps1` no escritos en esta ronda | Implementados después en 0.1.10 |
| Instaladores NSIS y unit systemd no implementados en esta ronda | NSIS implementado; unit Linux pendiente de F2 |
| Causa de v0.1.9 sin `.tar.gz` no determinada | Falta evidencia de los logs del run; el gate la evita en 0.1.10 |
| Auditoría N0 no ejecutada | Turno aparte |
| Sin commit, tag, push ni release | No autorizado |
| `docs/README.md:82` sin actualizar | El archivo está sin versionar; se actualiza al autorizar el commit |

**No verificado:** puntuación de `systemd-analyze security`, hash instalado del GUI, `FileVersion` (no existe todavía) y ACL reales.
