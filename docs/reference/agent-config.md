# Referencia — configuración del agente (`sc-config`)

**Fuente:** `agent/config/sc-agent.toml` + `agent/crates/sc-config/src/lib.rs`.
**Overrides de entorno:** `SC_INGEST_URL`, `SC_SPOOL_PATH`, `SC_SPOOL_MAX_BYTES`, `SC_LOG` pisan el archivo.

## Archivo TOML

```toml
[ingest]
url = "https://sc-sentinel.vercel.app/api/ingest"   # debe ser https:// (http:// solo loopback en dev, H5)
token_env = "SC_INGEST_TOKEN"                        # nombre de la variable de entorno con el Bearer
compression = "gzip"                                 # único valor implementado por el cliente

[spool]
path = "./spool/sc-spool.sqlite"
max_bytes = 524288000                                # 500 MB
max_age_days = 7

[log]
level = "info"                                       # SC_LOG tiene prioridad
```

## Validaciones

- `ingest.url` debe ser `https://` salvo loopback (`localhost`, `127.x`, `[::1]`) en desarrollo (auditoría H5).
- El token se lee de la variable indicada por `token_env`; nunca se escribe en el TOML (ADR-0010).
- `compression` acepta `gzip` (implementado) y `zstd` (cliente envía `Content-Encoding: zstd` si se configura).

## Permisos del archivo de clave

En Unix el archivo de token se crea con `0600`. El spool hereda permisos del directorio (L5 de la auditoría: restringir la carpeta del spool en el instalador).

## Servicio Windows

El token vive en el Environment del servicio (`SC_INGEST_TOKEN` en `HKLM\...\Services\SC-Sentinel-Agent\Environment`). Ver `docs/runbooks/rotate-device-token.md`.