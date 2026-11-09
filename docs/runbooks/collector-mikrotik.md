<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# Runbook — Colector NetFlow/IPFIX con MikroTik y Cisco

**Estado:** esqueleto operativo. Los parsers, el listener y la integración con el aggregator están cubiertos por tests sintéticos; la validación con un exportador real sigue pendiente (M4, ADR-0014 §9). Este runbook es el procedimiento para cerrar esa brecha y dejar evidencia reproducible.

## Alcance

- Configurar un router MikroTik (RouterOS 6.38+ para NetFlow v5/v9; 7.x para IPFIX) para exportar flujos al agente.
- Verificar que el agente abre los puertos UDP, recibe datagramas y atribuye hosts/ventanas en el dashboard.
- Dejar el checklist de aceptación de M4 y el apéndice de Cisco IOS-XE para cuando haya hardware disponible.

No cubre sFlow, IPFIX sobre DTLS/TLS ni exportación desde switches que no hablen NetFlow/IPFIX. Esas limitaciones están en ADR-0014.

## Prerrequisitos

- Agente compilado con captura live (Windows: Npcap + SDK; Linux: `libpcap` y `CAP_NET_RAW`). El colector no reemplaza la captura pcap: el agente sigue midiendo la interfaz local.
- `SC_INGEST_TOKEN` definido en el entorno y un `device_id` (`dev_<uuid>`) ya inscrito en el tenant.
- IP del agente alcanzable desde el router por UDP.
- Relojes sincronizados (NTP) en router y agente. Los timestamps de los flujos se usan para la ventana.
- Puertos UDP elegidos y libres en el agente. Convención usada en este repo:
  - `2055/udp`: NetFlow v5/v9.
  - `4739/udp`: IPFIX (puerto IANA).
  - `9995/udp`, `9996/udp`: alternativos si 2055/4739 están ocupados.

## 1. Configurar el agente

Partir del sample `agent/config/sc-agent-collector.toml.sample` y ajustar solo lo necesario:

```toml
[collector]
enabled = true
bind_addr = "0.0.0.0" # 127.0.0.1 si el router no puede alcanzar al agente
listeners = [
  { port = 2055, protocol = "auto" }, # v5/v9
  { port = 4739, protocol = "auto" }, # IPFIX
]
template_cache_capacity = 10000
template_cache_ttl_secs = 3600
```

Notas:

- `protocol = "auto"` detecta la versión por el primer campo de 16 bits del datagrama. También acepta `"v5"`, `"v9"` o `"ipfix"` para fijar el formato de un socket.
- Cada listener tiene su propia cache de templates. Un reinicio del agente pierde la cache; el router debe reenviar los templates (ver `v9-template-timeout`).
- Los puertos deben ser `>= 1024` y no repetirse.

Alternativas sin editar el archivo:

```bash
SC_COLLECTOR_ENABLED=true SC_COLLECTOR_PORTS=2055,4739 ./sc-sentinel-agent ...
```

```text
--collector                 habilita aunque el archivo lo desactive
--no-collector              desactiva aunque el archivo lo habilite
--collector-port 2055,4739  reemplaza los listeners y habilita el colector
```

Precedencia: archivo < variables `SC_*` < flags de CLI.

### Firewall del agente

Windows (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "SC-Sentinel collector UDP" `
  -Direction Inbound -Protocol UDP -LocalPort 2055,4739 -Action Allow
```

Linux (ufw):

```bash
sudo ufw allow 2055/udp
sudo ufw allow 4739/udp
```

Si el agente corre en un contenedor o detrás de NAT, publicar los mismos puertos UDP y verificar que el router apunte a la IP correcta.

## 2. Configurar MikroTik RouterOS

Conectar por SSH/WinBox y ejecutar desde el CLI. Reemplazar `<AGENT_IP>` y `<ROUTER_IP>` por las IP reales.

### 2.1 IPFIX (recomendado para RouterOS 7.x)

```routeros
/ip traffic-flow set enabled=yes interfaces=all \
  cache-entries=64k active-flow-timeout=1m inactive-flow-timeout=15s

/ip traffic-flow target add dst-address=<AGENT_IP> port=4739 version=ipfix \
  src-address=<ROUTER_IP> v9-template-refresh=20 v9-template-timeout=1m

/ip traffic-flow print
/ip traffic-flow target print
```

### 2.2 NetFlow v9

```routeros
/ip traffic-flow target add dst-address=<AGENT_IP> port=2055 version=9 \
  src-address=<ROUTER_IP> v9-template-refresh=20 v9-template-timeout=1m
```

### 2.3 NetFlow v5 (solo si el colector lo requiere)

```routeros
/ip traffic-flow target add dst-address=<AGENT_IP> port=2055 version=5
```

Criterios de configuración:

- `interfaces=all` captura todo el tráfico ruteado. Si solo interesa una WAN, listar esa interfaz. El tráfico switched o con offload de hardware puede no pasar por el CPU y no se exporta.
- `active-flow-timeout=1m` hace visibles las descargas largas; el default de 30m retrasa la primera exportación. `inactive-flow-timeout=15s` es el default y expira flujos ociosos.
- `v9-template-refresh=20` reenvía el template cada 20 paquetes de exportación; `v9-template-timeout=1m` lo reenvía aunque no haya tráfico. Sin template, el agente descarta los Data FlowSets con `TemplateNotFound`.
- `src-address` fija el origen de los datagramas. Si la versión de RouterOS no lo acepta en `target`, omitirlo: el router usará la IP de la interfaz de salida.
- Para IPFIX, RouterOS exporta todos los campos por defecto. Si se recortó la lista en `/ip traffic-flow ipfix`, mantener al menos: `src-address`, `dst-address`, `src-port`, `dst-port`, `protocol`, `bytes`, `packets`, `in-interface`, `out-interface`.

## 3. Verificar punta a punta

### 3.1 Arranque del agente

Desde `agent/` (Windows: `sc-sentinel-agent.exe`):

```bash
./target/release/sc-sentinel-agent \
  --config config/sc-agent-collector.toml \
  --interface "<interfaz>" \
  --device-id dev_<uuid>
```

En el log deben aparecer los eventos:

```text
collector_starting bind_addr=0.0.0.0 listeners=[(2055, "auto"), (4739, "auto")]
collector_started listeners=[0.0.0.0:2055, 0.0.0.0:4739]
```

Si aparece `collector_start_failed`, el agente sigue con la captura pcap pero no escucha flujos. Revisar el puerto y el firewall antes de continuar.

### 3.2 Puertos y datagramas

Linux:

```bash
ss -lunp | grep -E ':(2055|4739)\b'
sudo tcpdump -ni any udp port 4739
```

Windows:

```powershell
netstat -ano | findstr ":4739"
```

En Wireshark: filtro `udp.port == 4739` (o `2055`). Deben verse datagramas desde `<ROUTER_IP>` hacia `<AGENT_IP>`, con tamaño variable.

### 3.3 Evidencia en el dashboard

- Esperar al menos dos ventanas de agregación (30–60 s) después del primer export.
- Confirmar que aparecen los hosts y el tráfico atribuido a la interfaz monitoreada.
- Revisar Settings → Salud del agente para confirmar que el sync y el spool siguen sanos.

Las métricas internas del colector (`packets_received`, `flows_normalized`, `parse_errors`, `templates_cached`, etc.) **sí** se publican en health/dashboard desde T4.1: aparecen en la fila "Colector NetFlow / IPFIX" de Settings → Salud del agente solo cuando `collector.enabled = true` (si el colector está apagado, los campos se omiten para no parecer "colector en cero"). Para el acceptance sigue siendo útil el log, `tcpdump`/Wireshark y la evidencia de hosts/ventanas.

### 3.4 Tests locales

Antes de culpar al router, correr los tests del crate:

```bash
cargo test -p sc-collector
cargo test -p sc-capture
```

Los tests cubren NetFlow v5, v9, IPFIX, templates, IPv4/IPv6, options templates y loopback UDP. Si pasan, el problema está en la configuración de red/exportador, no en el parser.

## 4. Checklist de aceptación M4

Marcar solo con evidencia adjunta en el PR o en el plan M4.

- [ ] Un router MikroTik real exporta IPFIX o NetFlow v9 al agente y el log muestra `collector_started`.
  - _Pendiente (hardware)._ Parcial 2026-11-08: con el exportador sintético `synthetic_exporter` el log sí muestra `collector_started listeners=[0.0.0.0:2055, 0.0.0.0:4739]`; falta repetir con un MikroTik real.
- [ ] `tcpdump`/Wireshark confirma datagramas UDP desde la IP del router al puerto configurado.
  - _Pendiente (hardware)._ Parcial 2026-11-08: recepción UDP verificada en el propio host (listener activo + datagramas desde 127.0.0.1), no desde la IP de un router.
- [x] Los hosts y el tráfico aparecen en el dashboard dentro de dos ventanas de agregación.
  - Evidencia 2026-11-08: `/api/query?metric=hosts&range=1h` → exactamente 3 hosts `198.51.100.11/.12/.13`, `bytes_in` 2371200 → 2508000 tras el burst final (suma exacta: 120 flujos/host × 1140 B); `overview` con ventanas de 30 s correctas.
- [x] Reinicio del agente: tras perder la cache, los flujos vuelven dentro de `v9-template-timeout` (o del `v9-template-refresh` con tráfico).
  - Evidencia 2026-11-08: agente reiniciado; `--skip-template` no produce flujos (cache vacía → `TemplateNotFound`); con el template reenviado, los flujos aparecen en la ventana siguiente.
- [x] Se probó al menos un puerto IPFIX y uno NetFlow v9; v5 solo si hay un exportador que lo requiera.
  - Evidencia 2026-11-08: IPFIX → 4739, NetFlow v9 → 2055 y NetFlow v5 → 2055 con `synthetic_exporter`.
- [x] Topología actualizada en `diagrams/drawio/network-topology-ipfix.drawio`.
  - Evidencia 2026-11-08: dibujo refleja la implementación real (bind `0.0.0.0` auto, template cache, merge de canales, flush event-driven, limitaciones).
- [x] Fixture/pcap de muestra saneado (sin payloads ni IPs sensibles) y guardado en `docs/testing/fixtures/`.
  - Evidencia 2026-11-08: 5 datagramas binarios + `exporter-sample.pcap`, IPs RFC 5737, timestamps fijos, README de regeneración y test `fixtures_from_disk` (6 tests).
- [x] Documentadas las diferencias pcap vs flow: sampling, `active-flow-timeout`, `inactive-flow-timeout`, bytes por paquete y dirección atribuida → `docs/testing/pcap-vs-flow.md` (2026-11-08).
- [ ] La agregación por ventanas conserva la calidad de la captura: mismos hosts, sin duplicar tráfico cuando pcap y flow ven el mismo segmento.
  - Parcial 2026-11-08: con pcap (loopback) y flow activos a la vez no hubo hosts duplicados ni sumas infladas; las ventanas flow tienen la misma estructura/calidad que las de captura. **Falta** el caso real pcap+flow sobre el mismo segmento LAN: el dedup queda como P1 (`docs/testing/pcap-vs-flow.md` §7).
- [ ] Soak de 24 h sin panic, sin crecimiento anómalo del spool y con sync continuo.
  - _Pendiente._ La validación sintética corrió minutos, no horas; el flush event-driven (§6 de `pcap-vs-flow.md`) obliga a apagado limpio para no perder la última ventana.
- [x] Limitaciones registradas: sin TLS/DTLS, `Direction::In` provisional y throughput de 50k flows/s no verificado.
  - Evidencia: ADR-0014 §7 y §7 de este runbook (2026-11-08).

> Evidencia sintética 2026-11-08 (agente real + `synthetic_exporter` + dashboard Vercel). **M4 sigue abierto**: los items 1, 2, 9 y 10 requieren hardware MikroTik, captura desde el router, el caso de dedup en LAN y el soak de 24 h.

## 5. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `collector_disabled` en el log | `[collector] enabled = false` y ningún flag lo habilita | `--collector`, `SC_COLLECTOR_ENABLED=true` o `enabled = true` |
| `collector_start_failed` con "address in use" | Otro proceso ocupa el UDP | `ss -lunp`/`netstat -ano`, cambiar puerto o detener el proceso |
| `collector_started` pero no llegan datagramas | Firewall, NAT, IP equivocada o router sin target | `tcpdump`, revisar `/ip traffic-flow target print`, permitir UDP entrante |
| Llegan datagramas pero no aparecen hosts | Template perdido, versión no soportada o puerto con `protocol` fijado mal | Esperar `v9-template-timeout`; usar `auto`; revisar `parse_errors` en log debug |
| `TemplateNotFound` repetido | El agente reinició y el router no reenvió el template | Bajar `v9-template-timeout` a `1m`; generar tráfico; reiniciar el target |
| Hosts atribuidos a IP remota | `Direction::In` atribuye el host a `src_ip` (ADR-0014 §5) | Es esperado para tráfico entrante; documentar la limitación, no "corregir" el parser |
| `packets_dropped`/backpressure | Aggregator atrasado o demasiados exportadores | Revisar CPU, reducir sampling/exportadores, monitorear ventanas |
| Conteo duplicado | pcap y flow miden el mismo segmento | Usar una sola fuente por segmento o documentar la superposición |
| IPv6 no aparece | Template IPFIX recortado o exportador sin IPv6 | Revisar `/ip traffic-flow ipfix` y el soporte IPv6 del router |

Regla de reporting: nunca adjuntar payloads crudos ni tokens. Adjuntar versión del agente, configuración sin secretos, eventos del log y capturas de dashboard saneadas.

## 6. Apéndice — Cisco IOS-XE (pendiente de hardware)

Esqueleto para cuando haya un equipo Cisco disponible. Ajustar nombres de interfaz y versión de IOS-XE; **no validado** en este repo.

```cisco
flow record SC-SENTINEL
 match ipv4 protocol
 match ipv4 source address
 match ipv4 destination address
 match transport source-port
 match transport destination-port
 collect counter bytes long
 collect counter packets long
 collect timestamp absolute first
 collect timestamp absolute last

flow exporter SC-SENTINEL
 destination <AGENT_IP>
 source <SOURCE_INTERFACE>
 transport udp 4739
 export-protocol ipfix
 template data timeout 60

flow monitor SC-SENTINEL
 record SC-SENTINEL
 exporter SC-SENTINEL
 cache timeout active 60

interface <WAN_INTERFACE>
 ip flow monitor SC-SENTINEL input
```

Para NetFlow v9, cambiar `export-protocol ipfix` por `export-protocol netflow-v9` y el puerto a `2055`. Verificar con `show flow exporter SC-SENTINEL statistics` y `show flow monitor SC-SENTINEL cache format table`.

## 7. Límites conocidos

- Sin TLS/DTLS: el export viaja en claro dentro de la red gestionada (ADR-0014 §7).
- `Direction::In` es provisional; el tráfico entrante puede atribuirse al host remoto (ADR-0014 §5).
- La cache de templates es por listener y se pierde al reiniciar; el router debe refrescar.
- ~~Las métricas del colector no están en el dashboard todavía (T4.1).~~ Entregado en T4.1: fila "Colector NetFlow / IPFIX" en Settings → Salud (visibles solo con el colector habilitado).
- El objetivo de 50k flows/s no está verificado; requiere benchmarks (T4.2/T5.2).

## Referencias

- `docs/adr/0014-collector-ipfix.md`
- `docs/testing/acceptance-criteria.md` (M4)
- `docs/testing/pcap-vs-flow.md` (diferencias captura pcap vs flujo)
- `docs/testing/fixtures/README.md` (fixtures saneados del colector)
- `agent/README.md` (§ Colector de flujos)
- `agent/config/sc-agent-collector.toml.sample`
- [RouterOS Traffic Flow](https://manual.mikrotik.com/docs/7.24/diagnostics-monitoring-and-troubleshooting/traffic-flow/)
- [RouterOS `/ip/traffic-flow/target`](https://manual.mikrotik.com/docs/cli-reference/ip/traffic-flow/target/)
- RFC 3954 — NetFlow Services Export Version 9
- RFC 7011 — IPFIX Protocol Specification
