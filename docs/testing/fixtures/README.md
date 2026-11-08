# Fixtures del colector NetFlow/IPFIX (M4)

Datagramas de red **saneados** para regresión del colector sin hardware real.
Estos archivos son la evidencia reproducible del camino *detect → parse →
normalizar*; la validación con un exportador real (MikroTik/Cisco) se hace con
`docs/runbooks/collector-mikrotik.md` y queda fuera de este directorio.

## Contenido

| Archivo | Qué contiene |
| --- | --- |
| `netflow-v5.bin` | Un datagrama NetFlow v5 con 3 registros (cabecera 24 B + 48 B/registro) |
| `netflow-v9-template.bin` | Un datagrama NetFlow v9 solo con template (flowset 300) |
| `netflow-v9-data.bin` | Un datagrama NetFlow v9 con 3 flujos que usan el template 300 |
| `ipfix-template.bin` | Un datagrama IPFIX solo con template (flowset 400) |
| `ipfix-data.bin` | Un datagrama IPFIX con 3 flujos que usan el template 400 |
| `exporter-sample.pcap` | Las 5 tramas anteriores encapsuladas Ethernet/IPv4/UDP (2055 y 4739) |

## Origen y regeneración

Se generan con el ejemplo `synthetic_exporter` (std only, sin dependencias):

```bash
# desde agent/
cargo run -p sc-collector --example synthetic_exporter -- --dump ../docs/testing/fixtures
```

Regenerar **solo** si cambia el formato de trama del ejemplo; el test de
regresión fallará si los binarios desaparecen o dejan de parsearse.

## Reglas de sanitización (docs/testing/fixtures.md)

- **Sin IPs reales ni de pruebas anteriores.** Solo rangos de documentación
  RFC 5737: router `192.0.2.1`, agente `192.0.2.10`, clientes
  `198.51.100.11–13` (TEST-NET-2), servidores `203.0.113.20/53/80`
  (TEST-NET-3). El test `fixtures_libres_de_ips_internas_de_prueba` prohibe
  `192.168.1.41` y `8.8.8.8` en los 6 archivos.
- **Sin PII, tokens ni payloads de capturas reales.**
- **Timestamps fijos** (determinismo): `unix_secs = 1_700_000_000`
  (2023-11-14T22:13:20Z), IPFIX IE152 = `1_700_000_000_500` ms.
- **MACs administradas localmente** `02:00:00:00:00:01/02`.
- Puerto origen por flujo: `49152 + (i * 7) % 16384` → 49152, 49159, 49166.

## Consumidores

- `agent/crates/sc-collector/tests/fixtures_from_disk.rs` — parsea los `.bin`
  con `ProtocolSet`, valida los 3 flujos por protocolo, el orden
  template→data, la extracción de payloads del pcap y la sanitización.
- Los mismos datagramas sirven de referencia para `--skip-template`
  (observar `TemplateNotFound`) y para capturas de ejemplo del runbook.

> Nunca adjuntar payloads crudos ni tokens a este directorio (runbook §7).
