# Runbook — Instalación del agente en Linux

**Requisitos:** systemd · libpcap (o capacidad `CAP_NET_RAW`) · usuario dedicado recomendado · enrollment desde el dashboard primero (ver `install-agent-windows.md` §0).

## 1. Instalación

```bash
# 1. Descargar binario
wget https://github.com/<org>/SC-Sentinel/releases/download/v0.1.0/sc-sentinel-agent-v0.1.0-linux-x64.tar.gz
tar -xzf sc-sentinel-agent-v0.1.0-linux-x64.tar.gz -C /usr/local/bin/

# 2. Usuario dedicado
useradd -r -s /bin/false sc-sentinel

# 3. Directorios
mkdir -p /etc/sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel
chown -R sc-sentinel:sc-sentinel /var/lib/sc-sentinel /var/log/sc-sentinel

# 4. Config
cp config.example.toml /etc/sc-sentinel/config.toml
chown sc-sentinel:sc-sentinel /etc/sc-sentinel/config.toml
chmod 600 /etc/sc-sentinel/config.toml
```

Config mínimo relevante:

```toml
[agent]
endpoint = "https://sc-sentinel.vercel.app/api/ingest"
window_seconds = 30
compression = "gzip"
```

## 2. Servicio systemd

```bash
cat > /etc/systemd/system/sc-sentinel-agent.service <<EOF
[Unit]
Description=SC-Sentinel Agent
After=network.target

[Service]
Type=simple
User=sc-sentinel
ExecStart=/usr/local/bin/sc-sentinel-agent --config /etc/sc-sentinel/config.toml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sc-sentinel-agent
systemctl start sc-sentinel-agent
```

## 3. Capacidades (en lugar de root)

Opción recomendada: restringir con capabilities en lugar de User=root:

```bash
systemctl edit sc-sentinel-agent
# [Service]
# AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN
# CapabilityBoundingSet=CAP_NET_RAW CAP_NET_ADMIN
# NoNewPrivileges=yes
# ProtectSystem=strict
```

## 4. Token

`SC_INGEST_TOKEN` vía EnvironmentFile systemd (`/etc/sc-sentinel/token.env`, `chmod 600`, referenciado con `EnvironmentFile=`); nunca en config.toml en producción.

## 5. Verificación

```bash
systemctl status sc-sentinel-agent
journalctl -u sc-sentinel-agent -f
```

- [ ] Activo (running) y estable tras 5 min.
- [ ] `capture_status: ok` en logs; `packets_seen` crece.
- [ ] Dashboard → Settings: último sync exitoso reciente.
- [ ] Permit opening port si el nodo también receb IPFIX en M4 (firewall).
