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

Reinicio del agente en Windows (con captura live): recompilar con el comando de arriba y reiniciar el proceso con la interfaz, el token y el **device id** reales. El id no es opcional: por defecto es `dev-001`, y el backend responde 403 cuando el `device.id` del sobre no coincide con el del token.

```powershell
$env:SC_INGEST_TOKEN = (Get-Content .\config\.device-token -Raw).Trim()
.\target\release\sc-agent.exe `
  --device-id dev_bee8a7f6-8191-47ef-9dc2-f1ef3a9d7636 `
  --interface '\Device\NPF_{5ED97C9D-575C-401F-A3C9-1397C3BD738A}' `
  --config config\sc-agent.toml
```

- La interfaz exacta se obtiene con `--list-interfaces` (copiar el `\Device\NPF_{GUID}` completo: un `{...}` de ejemplo da `Error: InterfaceNotFound`).
- El token se toma de `SC_INGEST_TOKEN` (nunca se escribe en el TOML); `config/.device-token` está ignorado por git.
- El device id sale de la tabla `devices` del dashboard (`dev_<uuid>`).

### Reinicio automático (script)

`scripts/restart-agent.ps1` hace el ciclo completo: detiene el agente en marcha, asegura el SDK, recompila con `--features sc-capture/live`, detecta la interfaz de la ruta por defecto y arranca el proceso en segundo plano con logs en `logs/`.

```powershell
# desde agent/ ; el device id se guarda en config/.device-id
.\scripts\restart-agent.ps1 -DeviceId dev_bee8a7f6-8191-47ef-9dc2-f1ef3a9d7636

# arranques siguientes (device id y token ya guardados)
.\scripts\restart-agent.ps1

# forzar otro adaptador, no recompilar o vigilar más tiempo
.\scripts\restart-agent.ps1 -InterfaceName 'Ethernet'
.\scripts\restart-agent.ps1 -SkipBuild -WaitSeconds 40
```

- El token se lee de `config/.device-token` y viaja al proceso por `SC_INGEST_TOKEN`; nunca se pasa por parámetro ni se imprime.
- La interfaz se resuelve siguiendo `0.0.0.0/0` hasta el adaptador y su GUID de Npcap; `-Interface '\Device\NPF_{GUID}'` la fuerza.
- Si hay una instancia corriendo con más privilegios que la consola, el script **no arranca otra**: dos agentes sobre el mismo device duplican las ventanas en el dashboard. Cierra esa instancia desde una terminal de administrador.
- Un cierre forzado pierde la ventana en curso (<30 s); lo ya volcado al spool se envía al siguiente arranque.

Los `window_id` se derivan de la secuencia persistida en el spool más una base por época, así que siguen creciendo entre reinicios: un contador en memoria hacía que el backend descartara las primeras ventanas de cada arranque como duplicadas.
