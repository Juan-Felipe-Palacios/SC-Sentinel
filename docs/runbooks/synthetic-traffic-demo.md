# Tráfico sintético para demos y verificación de la web

La web mostraba ceros porque **no había tráfico observado**: el servicio corría
en modo collector-only (`--no-capture`) y ningún exportador enviaba flujos a
2056/4739. Este runbook levanta una instancia de demostración con datos
sintéticos, sin tocar el device de producción.

## Política del device demo

- Device fijo: **`dev_demo_synth`** (nombre «Demo sintetico»).
- Vive en la misma base que producción para que la web lo pueda seleccionar.
- **Nunca** se envían datos sintéticos bajo el device de producción
  (`dev_fe4b1eb6-…`): contaminaría las métricas reales y los insights de IA.
- Política de purga: se conserva como demo. Para eliminarlo, borrar sus filas y
  el device:

```sql
DELETE FROM host_stats WHERE window_id IN (SELECT window_id FROM flow_windows WHERE device_id = 'dev_demo_synth');
DELETE FROM alerts     WHERE window_id IN (SELECT window_id FROM flow_windows WHERE device_id = 'dev_demo_synth');
DELETE FROM flow_windows  WHERE device_id = 'dev_demo_synth';
DELETE FROM ingest_batches WHERE device_id = 'dev_demo_synth';
DELETE FROM agent_health   WHERE device_id = 'dev_demo_synth';
DELETE FROM devices        WHERE id = 'dev_demo_synth';
```

## 1. Alta del device

```bash
curl -X POST https://sc-sentinel.vercel.app/api/devices/enroll \
  -H "x-sc-admin-secret: $ADMIN_SECRET" -H 'content-type: application/json' \
  -d '{"name":"Demo sintetico"}'
```

El id lo genera el backend (`dev_<uuid>`). Para que el agente use un id legible,
renombrarlo **antes del primer envío** (sin filas hijas todavía):

```sql
UPDATE devices SET id = 'dev_demo_synth' WHERE id = 'dev_<uuid>';
```

## 2. Instancia temporal (no es el servicio)

Puertos **2066/4740** (deja libres 2056/4739 del servicio) y estado local en
**8388** (`SC_STATUS_ADDR`), porque el servicio ya ocupa 8387.

`%TEMP%\sc-synth\config.toml`:

```toml
[ingest]
url = "https://sc-sentinel.vercel.app/api/ingest"
token_env = "SC_INGEST_TOKEN"

[privacy]
anonymize_hosts = false
hmac_key_file = "C:/Users/<usuario>/AppData/Local/Temp/sc-synth/host-key"

[spool]
path = "C:/Users/<usuario>/AppData/Local/Temp/sc-synth/spool/spool.db"

[log]
level = "info"
file = "C:/Users/<usuario>/AppData/Local/Temp/sc-synth/agent.log"

[collector]
enabled = true
bind_addr = "127.0.0.1"
listeners = [{ port = 2066, protocol = "auto" }, { port = 4740, protocol = "auto" }]
```

Arranque (CLI, sin SCM, con la base GeoLite2 del repo):

```bash
SC_INGEST_TOKEN=<token> \
SC_GEOIP_DB=agent/resources/geolite2/GeoLite2-Country.mmdb \
SC_STATUS_ADDR=127.0.0.1:8388 \
sc-sentinel-agent.exe --config %TEMP%/sc-synth/config.toml \
  --device-id dev_demo_synth --no-capture
```

`spool.path` es un **fichero** SQLite, no un directorio: apuntar a la carpeta
falla con `unable to open database file`.

## 3. Enviar tráfico

```bash
cargo run -p sc-collector --bin sc-collector-testsend -- \
  --duration-secs 150 --records 12 --interval-ms 200
```

Manda NetFlow v5 + v9 a `127.0.0.1:2066` e IPFIX a `127.0.0.1:4740`, con IPs
públicas (8.8.8.8, 1.1.1.1, 151.101.1.69…) para que GeoLite2 resuelva país, y
puertos 443/80/53/22.

Verificación:

```bash
curl -s http://127.0.0.1:8388/status   # collector_packets_received > 0, last_sync_at avanzando
```

```bash
curl -s "https://sc-sentinel.vercel.app/api/query?metric=overview&range=1h&device_id=dev_demo_synth" \
  -H "x-sc-admin-secret: $ADMIN_SECRET"
```

La respuesta debe traer `totals.bytes_in > 0`, `hosts_count > 0` y la serie.

## 4. Cleanup

1. Parar la instancia temporal (Ctrl+C / matar el proceso `sc-sentinel-agent.exe`
   cuya línea de comandos tenga `--config …sc-synth…`; **no** el servicio).
2. Borrar `%TEMP%\sc-synth\`.
3. Dejar el device demo si se va a repetir la demo; si no, purgarlo con el SQL
   de arriba.

## Trampa conocida: acumulado envenenado

El acumulador de la instancia es **de proceso**: si se envía un datagrama
malformado (p. ej. un campo IPFIX declarado de 4 bytes y escrito con 8), los
registros se desalinean y esos hosts basura —con bytes absurdos— quedan por
encima del tráfico bueno en `top_hosts`. Reiniciar la instancia y repetir el
envío es lo único que limpia ese estado en memoria. En la base, purgar las
filas del device demo antes de volver a medir.
