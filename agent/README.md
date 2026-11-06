<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# `agent/` — Agente Rust de SC-Sentinel

Workspace Cargo del agente headless (daemon). Mapa de crates y jerarquía de dependencias según `docs/adr/0002-rust-agent.md` (DAG estricto, sin ciclos):

```text
sc-core  (tipos de dominio — sin deps de runtime ni de otros crates internos)
sc-capture / sc-collector / sc-geo  (fuentes) → sc-aggregate → sc-detect → sc-sync
sc-config / sc-telemetry  (transversales)
sc-agent (bin daemon, M1) · sc-gui (bin iced, M5)
```

| Crate | Rol | Estado |
|-------|-----|--------|
| `sc-core` | Tipos de dominio versionados con los contratos de `docs/contracts/` (`v: 1`) | completo (M0) |
| `sc-capture` | Captura pcap en thread bloqueante puenteado a `tokio mpsc` con backpressure | completo (M1) |
| `sc-collector` | Fuentes de flujo (ipfix/NetFlow diferido a M4) | esqueleto (M4) |
| `sc-geo` | MaxMind GeoLite2 embebido con firma de integridad SHA-256 (ISO alpha-2) | completo (M1) |
| `sc-aggregate` | Agregación por ventanas de 30–60 s → `WindowSnapshot` con HMAC host_mark | completo (M1) |
| `sc-detect` | Motor determinista de `Alert` (blacklist/umbrales) | esqueleto (M3) |
| `sc-sync` | Cliente `/api/ingest` con spool SQLite FIFO 500MB, backoff y gzip | completo (M1) |
| `sc-config` | Configuración y secrets (TOML) | completo (M1) |
| `sc-telemetry` | Logging estructurado con redacción de tokens y HealthRegistry | completo (M1) |
| `sc-agent` | Binario daemon headless (pipeline capture->aggregate->sync) | completo (M1) |
| `sc-gui` | Binario GUI iced (M5) — consumidor, nunca dependencia del engine | M5 |

Referencias: `docs/adr/0002-rust-agent.md` (jerarquía), `docs/README.md` (set completo de docs), `docs/contracts/` (schemas normativos v1). Los comentarios y docs van en español internacional; identificadores en inglés.

### Compilación en Windows (captura live)

La feature `live` de `sc-capture` (pcap) necesita las librerías de importación del **Npcap SDK**; tener Npcap instalado (runtime en `System32\Npcap`) es necesario pero no suficiente para compilar.

1. Descargar el [Npcap SDK](https://npcap.com/dist/npcap-sdk-1.13.zip) y extraerlo. En este equipo ya está en `agent\.tools\npcap-sdk` (carpeta ignorada por git; para recrearla: `curl -sSL -o .tools/npcap-sdk.zip https://npcap.com/dist/npcap-sdk-1.13.zip && powershell -NoProfile -Command "Expand-Archive -Force -Path '.tools\npcap-sdk.zip' -DestinationPath '.tools\npcap-sdk'"` desde `agent/`).
2. Antes de compilar/probar con la feature, apuntar `LIBPCAP_LIBDIR` a la carpeta `Lib\x64` del SDK. Comando exacto desde `agent/` (Git Bash):

   ```bash
   LIBPCAP_VER=1.0.0 LIBPCAP_LIBDIR='D:\ProyectosWeb\SC-Sentinel\agent\.tools\npcap-sdk\Lib\x64' \
     cargo build --release -p sc-agent --features sc-capture/live
   ```

   Equivalente en PowerShell:

   ```powershell
   $env:LIBPCAP_VER = "1.0.0"
   $env:LIBPCAP_LIBDIR = "D:\ProyectosWeb\SC-Sentinel\agent\.tools\npcap-sdk\Lib\x64"
   cargo build --release -p sc-agent --features sc-capture/live
   ```

   `LIBPCAP_VER` evita que el build script intente deducir la versión cargando `wpcap.dll` desde `Lib\x64` (el SDK sólo trae los `.lib`; el DLL vive en `C:\Windows\System32\Npcap`).

   Comprobación rápida del binario recién compilado (no captura, sólo enumera):

   ```bash
   ./target/release/sc-agent.exe --list-interfaces
   ```

3. La feature se declara namespaced en `sc-capture`: invocarla como `--features sc-capture/live` (el binario `sc-agent` no declara una feature `live` propia).

Sin el SDK configurado, el build falla en el link con `LNK1181: cannot open input file 'wpcap.lib'`. Sin la feature, el crate compila igual y `run_live` devuelve un error orientador en runtime.

Reinicio del agente en Windows (con captura live): recompilar con el comando de arriba y reiniciar el proceso con la interfaz y el token habituales, p. ej.:

```powershell
$env:SC_INGEST_TOKEN = "<token del device>"
.\target\release\sc-agent.exe --interface '\Device\NPF_{...}' --config config\sc-agent.toml
```

La interfaz exacta se obtiene con `--list-interfaces`; el token se toma de `SC_INGEST_TOKEN` (nunca se escribe en el TOML).
