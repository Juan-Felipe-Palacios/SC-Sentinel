# Runbook — Instalación del sensor pasivo en Linux

**Requisitos:** systemd · `libpcap` · un usuario dedicado · enrollment desde el
dashboard primero (ver `install-agent-windows.md` §0).

> Este artefacto **sí captura** el tráfico que llega a la interfaz: es el sensor
> pasivo de M6 (Modbus TCP, S7comm, DNP3, IEC 60870-5-104). Observa por SPAN o
> TAP y **nunca** responde, hace handshake ni escanea (AGENTS.md §10.1). Necesita
> `libpcap` y permiso de captura (`CAP_NET_RAW`).
>
> Si el equipo sólo recibe exportaciones NetFlow v5/v9 e IPFIX, usá el artefacto
> `linux-x64` (modo colector, sin libpcap ni privilegios de captura).

## 1. Descarga y verificación

```bash
# La línea VER= la reescribe el empaquetador con la versión real del
# artefacto, así que el paquete nunca apunta a una release antigua.
VER=0.1.10
REPO=https://github.com/Juan-Felipe-Palacios/SC-Sentinel

curl -LO "$REPO/releases/download/v${VER}/sc-sentinel-agent-v${VER}-linux-x64-sensor.tar.gz"
curl -LO "$REPO/releases/download/v${VER}/SHA256SUMS.txt"

sha256sum --ignore-missing -c SHA256SUMS.txt
tar -xzf "sc-sentinel-agent-v${VER}-linux-x64-sensor.tar.gz"
sha256sum --ignore-missing -c SHA256SUMS.txt   # el de dentro del paquete
sudo install -m 0755 sc-sentinel-agent /usr/local/bin/sc-sentinel-agent
```

## 2. libpcap, usuario y directorios

```bash
# Debian/Ubuntu: libpcap0.8. RHEL/Fedora: libpcap.
sudo apt-get install -y libpcap0.8

sudo useradd --system --no-create-home --shell /usr/sbin/nologin sc-sentinel
sudo install -d -o sc-sentinel -g sc-sentinel -m 0750 \
  /etc/sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel
```

## 3. Configuración

`/etc/sc-sentinel/config.toml`:

```toml
[ingest]
url = "https://sc-sentinel.vercel.app/api/ingest"
token_env = "SC_INGEST_TOKEN"
compression = "gzip"

[privacy]
anonymize_hosts = false
hmac_key_env = "SC_HMAC_KEY"
hmac_key_file = "/etc/sc-sentinel/.host-key"

[spool]
path = "/var/lib/sc-sentinel/sc-spool.sqlite"
max_bytes = 524288000
max_age_days = 7

[log]
level = "info"
file = "/var/log/sc-sentinel/agent.log"

[collector]
enabled = false
```

El sensor escucha por la interfaz que se indica en la línea de comando
(`--interface`); no hay sección `[capture]` en `config.toml`.

```bash
sudo install -o sc-sentinel -g sc-sentinel -m 0640 /dev/null /etc/sc-sentinel/config.toml
sudo vi /etc/sc-sentinel/config.toml
```

El token **no** va en el fichero: se inyecta por variable de entorno (ver §4).

## 4. Token y device id

`/etc/sc-sentinel/token.env`, con permisos `0600` y propiedad `root:root`:

```
SC_INGEST_TOKEN=sc_dev_...
SC_SENTINEL_DEVICE_ID=dev_...
```

Ambos datos salen del panel web: **Configuración → Enrolar dispositivo**. El
token se muestra **una sola vez**; si se pierde, hay que borrar el dispositivo
del panel y enrolar uno nuevo (ver `rotate-device-token.md`).

```bash
sudo install -o root -g root -m 0600 /dev/null /etc/sc-sentinel/token.env
sudo vi /etc/sc-sentinel/token.env
```

## 5. Servicio systemd

Antes de instalarlo, listá las interfaces capturables:

```bash
sudo /usr/local/bin/sc-sentinel-agent --list-interfaces
```

Reemplazá `eth0` por la interfaz del puerto SPAN/TAP.

```bash
sudo tee /etc/systemd/system/sc-sentinel-agent.service >/dev/null <<'EOF'
[Unit]
Description=SC-Sentinel Passive Sensor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sc-sentinel
Group=sc-sentinel
EnvironmentFile=/etc/sc-sentinel/token.env
ExecStart=/usr/local/bin/sc-sentinel-agent --config /etc/sc-sentinel/config.toml --interface eth0
Restart=always
RestartSec=10
# Sólo el permiso mínimo para abrir la captura; el resto queda sin privilegios.
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/sc-sentinel /var/log/sc-sentinel /etc/sc-sentinel

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sc-sentinel-agent
sudo systemctl start sc-sentinel-agent
```

Si `--list-interfaces` responde que la captura live no está compilada, el
paquete es el colector (`linux-x64`), no el sensor.

## 6. Verificación

```bash
systemctl status sc-sentinel-agent
journalctl -u sc-sentinel-agent -f
curl -s http://127.0.0.1:8387/status
```

- [ ] Servicio `active (running)` y estable tras 5 min.
- [ ] En el log: `event="captura live"` con la interfaz configurada.
- [ ] `/status` responde en loopback (el único otro egress es el sync TLS).
- [ ] Panel web → Configuración: último sync exitoso reciente.
- [ ] En **Conexiones → Activos OT** aparecen los activos observados.

## 7. Desinstalación

```bash
sudo systemctl disable --now sc-sentinel-agent
sudo rm /etc/systemd/system/sc-sentinel-agent.service
sudo systemctl daemon-reload
sudo rm -f /usr/local/bin/sc-sentinel-agent
sudo rm -rf /etc/sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel
```
