# Runbook — Instalación del agente en Linux

**Requisitos:** systemd · un usuario dedicado · enrollment desde el dashboard primero (ver `install-agent-windows.md` §0).

> El agente se despliega en **modo colector** (`--no-capture`): no captura paquetes del propio equipo, solo recibe las exportaciones NetFlow v5/v9 e IPFIX que le envía el router o el switch. Por eso **no hace falta libpcap ni `CAP_NET_RAW`**, y el servicio puede correr como usuario sin privilegios.

## 1. Descarga y verificación

```bash
# La línea VER= la reescribe el empaquetador con la versión real del
# artefacto, así que el paquete nunca apunta a una release antigua.
VER=0.1.4
REPO=https://github.com/Juan-Felipe-Palacios/SC-Sentinel

curl -LO "$REPO/releases/download/v${VER}/sc-sentinel-agent-v${VER}-linux-x64.tar.gz"
curl -LO "$REPO/releases/download/v${VER}/SHA256SUMS.txt"

# Verificar la firma del artefacto (el hash del binario va dentro del paquete).
sha256sum --ignore-missing -c SHA256SUMS.txt
tar -xzf "sc-sentinel-agent-v${VER}-linux-x64.tar.gz"
sha256sum --ignore-missing -c SHA256SUMS.txt   # el de dentro del paquete
sudo install -m 0755 sc-sentinel-agent /usr/local/bin/sc-sentinel-agent
```

## 2. Usuario y directorios

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sc-sentinel
sudo install -d -o sc-sentinel -g sc-sentinel -m 0750 \
  /etc/sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel
```

## 3. Configuración

`/etc/sc-sentinel/config.toml` (las claves son las que entiende el agente; el fichero rechaza claves desconocidas):

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
enabled = true
bind_addr = "0.0.0.0"
listeners = [
    { port = 2055, protocol = "auto" },
    { port = 4739, protocol = "auto" },
]
template_cache_capacity = 10000
template_cache_ttl_secs = 3600
```

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

Ambos datos salen del panel web: **Configuración → Enrolar dispositivo**. El token se muestra **una sola vez**; si se pierde, hay que borrar el dispositivo del panel y enrolar uno nuevo (ver `rotate-device-token.md`). El `device_id` y el token tienen que ser del mismo dispositivo: si no, el endpoint de ingesta responde 403.

```bash
sudo install -o root -g root -m 0600 /dev/null /etc/sc-sentinel/token.env
sudo vi /etc/sc-sentinel/token.env
```

## 5. Servicio systemd

```bash
sudo tee /etc/systemd/system/sc-sentinel-agent.service >/dev/null <<'EOF'
[Unit]
Description=SC-Sentinel Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sc-sentinel
Group=sc-sentinel
EnvironmentFile=/etc/sc-sentinel/token.env
ExecStart=/usr/local/bin/sc-sentinel-agent --config /etc/sc-sentinel/config.toml --no-capture
Restart=always
RestartSec=10
# Endurecimiento: el agente no necesita escribir fuera de sus directorios.
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

Si el equipo recibe exportaciones de flujo de otro router, abre los puertos UDP 2055 (NetFlow v5/v9) y 4739 (IPFIX) en el firewall.

## 6. Verificación

```bash
systemctl status sc-sentinel-agent
journalctl -u sc-sentinel-agent -f
sudo ss -ulnp | grep -E '2055|4739'
```

- [ ] Servicio `active (running)` y estable tras 5 min.
- [ ] Puertos UDP 2055 y 4739 en escucha.
- [ ] En el log: `event="collector_started"` y `event="collector_listening"`.
- [ ] Panel web → Configuración: último sync exitoso reciente.

## 7. Desinstalación

```bash
sudo systemctl disable --now sc-sentinel-agent
sudo rm /etc/systemd/system/sc-sentinel-agent.service
sudo systemctl daemon-reload
sudo rm -f /usr/local/bin/sc-sentinel-agent
sudo rm -rf /etc/sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel
```
