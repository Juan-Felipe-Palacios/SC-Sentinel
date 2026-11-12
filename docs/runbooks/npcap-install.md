<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# Runbook — Npcap en Windows (runtime y SDK)

**Aplica a:** el agente `sc-sentinel-agent` compilado con la feature `sc-capture/live`
(captura en vivo de paquetes). El modo colector (`--no-capture`, el que usa el
servicio SCM por defecto) **no** necesita Npcap.

> Npcap **no se redistribuye** con SC-Sentinel: ni en el ZIP de la release ni en el
> instalador. La descarga e instalación es del usuario. Ver `docs/legal/npcap-notice.md`.

## Por qué hay dos cosas que instalar

| Elemento | Qué es | Para qué | Dónde se usa |
|---|---|---|---|
| **Npcap runtime** | Driver + `wpcap.dll` | Abrir la interfaz y capturar paquetes en caliente | En el equipo donde corre el agente |
| **Npcap SDK** | Cabeceras + `wpcap.lib` | Que el *linker* resuelva el símbolo al compilar el crate `pcap` | Solo en la máquina donde se compila |

El runtime sin SDK: el agente arranca, pero no puede capturar. El SDK sin runtime:
el binario compila, pero al capturar falla con «Npcap no encontrado».

## 1. Instalar el runtime (en cada equipo con el agente)

1. Descargar el instalador oficial desde <https://npcap.com/#download>.
2. Al instalar, **marcar la opción «WinPcap API-compatible mode»**. El crate
   `pcap` la usa para abrir la interfaz en modo admin-only.
3. Aceptar la instalación del driver (requiere reiniciar si el equipo lo pide).
4. Verificar que la DLL está en sitio:

   ```powershell
   Test-Path C:\Windows\System32\Npcap\wpcap.dll   # → True
   ```

5. Verificar que el agente ve las interfaces:

   ```powershell
   .\sc-sentinel-agent.exe --list-interfaces
   ```

   Debe listar las interfaces de red del equipo. Si imprime
   `runtime: captura live no compilada: recompilar con --features live`, el
   binario se compiló sin la feature: no es un problema de Npcap, hay que
   recompilar (ver §3).

## 2. Instalar el SDK (solo en la máquina de compilación)

El SDK se descarga aparte del runtime (botón **«Download» → «Npcap SDK»** en
<https://npcap.com/#download>) y son **distintas versiones**: el SDK 1.13
corresponde al runtime 1.13 o posterior.

1. Descargar `npcap-sdk-1.13.zip` y descomprimirlo, p. ej. en `C:\npcap-sdk-1.13`.
2. El ZIP se descomprime **plano** (sin carpeta raíz de nivel superior):

   ```text
   C:\npcap-sdk-1.13\Lib\x64\wpcap.lib     ← el .lib que necesita el linker
   C:\npcap-sdk-1.13\Include\...
   ```

3. Comprobar que el `.lib` existe:

   ```powershell
   Test-Path C:\npcap-sdk-1.13\Lib\x64\wpcap.lib   # → True
   ```

## 3. Compilar el agente con captura en vivo

Desde la carpeta `agent/` del repo, en PowerShell:

```powershell
$env:LIBPCAP_VER   = "1.0.0"
$env:LIBPCAP_LIBDIR = "C:\npcap-sdk-1.13\Lib\x64"
cargo build --release -p sc-agent --features sc-capture/live
```

- `LIBPCAP_LIBDIR` (no `LIBPCAP_DIR`): es el directorio que contiene `wpcap.lib`.
- `LIBPCAP_VER=1.0.0`: evita que el *build script* intente cargar `wpcap.dll`
  del propio SDK para detectar la versión. En Windows, `Version::max()` es
  `1.0.0`.
- Sin la feature `live`, `sc-capture` no enlaza con `pcap` y el binario
  arranca en modo solo-colector.

Comprobación rápida del binario resultante:

```powershell
.\target\release\sc-sentinel-agent.exe --version
.\target\release\sc-sentinel-agent.exe --list-interfaces
```

En CI (`.github/workflows/release.yml` y `rust.yml`) el SDK se descarga y
descomprime automáticamente, y el binario se verifica buscando la cadena
`captura live no compilada` en sus bytes: si aparece, el artefacto se rechaza.

## 4. Script auxiliar del repo

`agent\scripts\restart-agent.ps1` automatiza el ciclo completo en Windows:
descarga el SDK a `agent\.tools\npcap-sdk`, fija `LIBPCAP_VER` y
`LIBPCAP_LIBDIR`, compila con `--features sc-capture/live`, regenera
`agent\config\sc-agent.toml` a partir del sample si no existe, y arranca el
agente. Es el camino recomendado para desarrollo local.

## 5. Diagnóstico rápido

| Síntoma | Causa | Acción |
|---|---|---|
| `Npcap no encontrado` | Runtime no instalado, o instalado sin modo WinPcap-compatible | Reinstalar marcando la opción (ver `troubleshoot-pcap.md`) |
| `captura live no compilada` | Binario compilado sin `--features sc-capture/live` | Recompilar (§3) |
| `no such file or directory` al enlazar | `LIBPCAP_LIBDIR` mal apuntado | Debe ser la carpeta que **contiene** `wpcap.lib` (`...\Lib\x64`) |
| `error LNK1181` / `cannot open input file 'wpcap.lib'` | SDK sin descomprimir o descomprimido con carpeta de más nivel | Verificar §2 (`Test-Path`) |
| Compila pero no captura nada | Interfaz equivocada o falta de privilegios | `--list-interfaces`; el servicio debe correr como SYSTEM/Administrador |
| Listado de interfaces vacío | Runtime no instalado en el equipo destino | Instalar Npcap en **cada** equipo, no solo en la máquina de compilación |

## Referencias

- `docs/legal/npcap-notice.md` — política de no redistribución y licencia.
- `docs/runbooks/troubleshoot-pcap.md` — síntomas de captura y drops.
- `docs/runbooks/install-agent-windows.md` — instalación del servicio en Windows.
- `agent/README.md` (§ Captura en vivo) — comandos de build en el repo.
- <https://npcap.com/#download> — descarga oficial (runtime y SDK).
