<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# `agent/` — Agente Rust de SC-Sentinel

Workspace Cargo del agente headless (daemon). Mapa de crates y jerarquía de dependencias según `docs/adr/0002-rust-agent.md` (DAG estricto, sin ciclos):

```text
sc-core  (tipos de dominio — sin deps de runtime ni de otros crates internos)
sc-capture / sc-collector / sc-geo  (fuentes) → sc-aggregate → sc-detect → sc-sync
sc-config / sc-telemetry  (transversales)
sc-sentinel-agent (bin daemon, M1) · sc-gui (bin iced, M5)
```

| Crate | Rol | Estado |
|-------|-----|--------|
| `sc-core` | Tipos de dominio versionados con los contratos de `docs/contracts/` (`v: 1`) | completo (M0) |
| `sc-capture` | Captura pcap en thread bloqueante puenteado a `tokio mpsc` con backpressure | completo (M1) |
| `sc-collector` | Colector pasivo UDP: NetFlow v5/v9 + IPFIX, integrado en `sc-agent` con config y CLI (M4 fases 1–3) | en curso (M4) |
| `sc-geo` | MaxMind GeoLite2 resuelto en runtime (ISO alpha-2, ADR-0015) | completo (M1) |
| `sc-aggregate` | Agregación por ventanas de 30–60 s → `WindowSnapshot` con HMAC host_mark | completo (M1) |
| `sc-detect` | Motor determinista de `Alert` (blacklist, escaneo de puertos, DNS, volumen y salud) | completo (M3) |
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
   ./target/release/sc-sentinel-agent.exe --list-interfaces
   ```

3. La feature se declara namespaced en `sc-capture`: invocarla como `--features sc-capture/live` (el binario `sc-sentinel-agent` no declara una feature `live` propia).

Sin el SDK configurado, el build falla en el link con `LNK1181: cannot open input file 'wpcap.lib'`. Sin la feature, el crate compila igual y `run_live` devuelve un error orientador en runtime.

Reinicio del agente en Windows (con captura live): recompilar con el comando de arriba y reiniciar el proceso con la interfaz, el token y el **device id** reales. El id no es opcional: por defecto es `dev-001`, y el backend responde 403 cuando el `device.id` del sobre no coincide con el del token.

```powershell
$env:SC_INGEST_TOKEN = (Get-Content .\config\.device-token -Raw).Trim()
.\target\release\sc-sentinel-agent.exe `
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

### Identidad del agente y clave HMAC

- El **device id es obligatorio**: `--device-id dev_<uuid>` o `SC_SENTINEL_DEVICE_ID`. Ya no existe el fallback silencioso `dev-001`, que terminaba en 403 porque el `device.id` del sobre no coincidía con el token. El script de reinicio lo pasa siempre desde `config/.device-id`.
- `hostname` y `boot_id` del sobre se resuelven del sistema (`COMPUTERNAME`/`/etc/hostname`, `/proc/sys/kernel/random/boot_id`); en plataformas sin boot id estable se usa un UUID por proceso.
- `host_mark` usa una clave HMAC que **no** está en el binario. Precedencia: `SC_HMAC_KEY` → `privacy.hmac_key_file` → clave aleatoria generada y persistida en el primer arranque (`config/.host-key`, ignorado por git). Conservá ese archivo: si cambia la clave, los `host_key` nuevos dejan de coincidir con el historial del dashboard. Para mantener continuidad con instalaciones previas, fijá `SC_HMAC_KEY=sc-sentinel-dev-key` hasta hacer la migración.

### Rutas relativas del `config.toml`

Toda ruta relativa del TOML se resuelve **respecto del directorio donde vive el `config.toml`**, no del directorio de trabajo. En el repo el sample vive en `agent/config/`, así que:

| Clave | Valor en `config/sc-agent.toml.sample` | Ruta efectiva |
|---|---|---|
| `[privacy] hmac_key_file` | `"./.host-key"` | `agent/config/.host-key` |
| `[spool] path` | `"../spool/sc-spool.sqlite"` | `agent/spool/sc-spool.sqlite` |
| `[detection] blacklist_file` | `"./blacklist.txt"` | `agent/config/blacklist.txt` |

El instalador de producción (`scripts/install-agent.ps1`) escribe rutas **absolutas** (`C:\ProgramData\SC-Sentinel\...`), que no dependen de esta regla.

### GeoLite2 en runtime (ADR-0015)

La base `GeoLite2-Country.mmdb` **no va incrustada en el binario**: el agente la busca en el sistema de ficheros al arrancar, en este orden:

1. Variable de entorno `SC_GEOIP_DB` (ruta absoluta). Si está definida y el fichero no existe, el arranque **falla** con un error explícito.
2. `<dir del binario>/geolite2/`, `<dir del binario>/resources/geolite2/`, `<dir del binario>/../geolite2/` y los mismos hasta 6 niveles de ancestros (cubre `agent/target/release/` → `agent/resources/geolite2/`).
3. `<cwd>/resources/geolite2/` y `<cwd>/geolite2/`.

Si no encuentra ninguna, el agente **arranca igual** con el fallback `NoLookup` y lo avisa en el log (`GeoIP no disponible: se usa NoLookup`); los snapshots salen con el país vacío. El log también dice qué base se cargó:

```text
GeoIP: base GeoLite2 cargada path=.../geolite2/GeoLite2-Country.mmdb
```

El instalador copia la base a `C:\Program Files\SC-Sentinel\geolite2\` y publica `SC_GEOIP_DB` en el entorno del servicio. Actualizar la base de MaxMind ya no exige recompilar el agente (ver `docs/adr/0015-geolite2-runtime.md`).

### Detección determinista

Cada ventana cerrada pasa por `sc-detect` antes de entrar al spool. El motor
evalúa señales agregadas (nunca paquetes crudos) y escribe `snapshot.alerts` y
`top_hosts[].risk_score`; la IA solo interpreta esos hechos.

Reglas de v1:

- `blacklist_hit`: un peer remoto (saliente o entrante) está en la blacklist
  local. Requiere
  `detection.blacklist_file` (una IP exacta por línea, IPv4 o IPv6; `#`
  comenta). Sin archivo, la regla no se evalúa.
- `port_scan`: el extremo local toca al menos 20 puertos remotos distintos con
  pocos intentos por puerto en la ventana.
- `inbound_port_scan`: un peer remoto toca al menos 20 puertos locales distintos
  con pocos intentos por puerto. Detecta escaneos dirigidos al equipo.
- `dns_tunneling`: al menos 100 consultas DNS salientes, 64 KB y 100 bytes de
  media por consulta.
- `volume_anomaly`: un host remoto supera 100 MB agregados en la ventana.
- `capture_error`, `capture_degraded`, `packet_drops` y `parse_errors`: salud
  del agente y backpressure.

Todos los umbrales se configuran en `[detection]` y se validan al cargar el
TOML (deben ser mayores que 0; el ratio de drops, entre 0 y 100):

```toml
[detection]
enabled = true
port_scan_min_ports = 20
port_scan_min_connections = 20
port_scan_max_connections_per_port = 3
inbound_scan_enabled = true
inbound_scan_min_ports = 20
inbound_scan_min_connections = 20
inbound_scan_max_connections_per_port = 3
dns_min_queries = 100
dns_min_bytes = 65536
dns_min_avg_bytes = 100
volume_min_bytes = 104857600
drop_ratio_percent = 5.0
min_drops = 100
min_parse_errors = 10
```

La lista de IPs se resuelve relativa al `config.toml`; si el archivo
configurado falta, el agente falla al arrancar.

### Colector de flujos (NetFlow/IPFIX)

El agente puede recibir exportaciones UDP de routers y switches y sumarlas a la captura pcap en la misma ventana de 30 s. Se configura en `config.toml`:

```toml
[collector]
enabled = true
bind_addr = "0.0.0.0"          # 127.0.0.1 para aceptar solo exportadores locales
listeners = [
    { port = 2055, protocol = "auto" },  # detecta v5/v9/IPFIX por datagrama
    { port = 4739, protocol = "ipfix" }, # fija el formato del socket
]
template_cache_capacity = 10000
template_cache_ttl_secs = 3600
```

Flags equivalentes (pisan al archivo y a `SC_*`):

- `--collector` habilita el colector aunque el archivo lo desactive.
- `--no-collector` lo desactiva aunque el archivo lo habilite.
- `--collector-port 2055,4739` reemplaza los listeners y habilita el colector.

Un ejemplo completo listo para copiar es `config/sc-agent-collector.toml.sample`.

#### Variables de entorno

```bash
SC_COLLECTOR_ENABLED=true
SC_COLLECTOR_PORTS=2055,4739,9995
```

`SC_COLLECTOR_PORTS` reemplaza la lista de listeners (todos en `auto`) y `SC_COLLECTOR_ENABLED` habilita o deshabilita el colector. Los flags de CLI siguen teniendo prioridad sobre el archivo y el entorno.

#### Requisitos

- Puertos UDP libres (no usados por otro servicio del equipo).
- Firewall del equipo permitiendo tráfico UDP entrante en esos puertos.
- Routers o switches configurados para exportar NetFlow v5/v9 o IPFIX hacia la IP del agente.

Los puertos deben ser ≥1024 y no repetirse; `protocol` acepta `auto`, `v5`, `v9` o `ipfix`.

Cada listener tiene su propia cache de templates. Si un puerto no se puede abrir, el agente registra el error, lo publica en `last_error` del health y sigue con la captura pcap: no se cae el monitoreo local. Las métricas del colector (`packets_received`, `flows_normalized`, `parse_errors`, `templates_cached`, etc.) viajan en `snapshot.health`, se persisten en `agent_health` y se muestran en la tarjeta de salud del dashboard (T4.1).
