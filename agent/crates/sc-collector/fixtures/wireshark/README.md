# Fixtures Wireshark reales (T4.3)

Esta carpeta contiene la **procedencia** de los fixtures generados, pero no
los bytes de las capturas.

## Fuente

Colección "NetFlow Packet Captures" de Nicholas Russo (njrusmc.net),
distribuida como `netflow_pcap.zip` (7 pcaps `.pcapng`: NetFlow v5 IPv4;
v9 IPv4/IPv6/MPLS; v10 = IPFIX IPv4/IPv6/MPLS, direcciones de laboratorio).

La licencia del zip indica uso personal y prohíbe la redistribución. Por
ello, los payloads derivados **no se commitean**: viven en
`fixtures/wireshark-extracted/` (ignorado por git) y se regeneran a partir
del documento original.

## Verificación de integridad

| Fichero | Tamaño | SHA-256 |
|---|---|---|
| `netflow_pcap.zip` (snapshot 2023-01-22) | 7558 bytes | `afe43876d34d17b3e99f6f99261c7c6ccbca8300daaec05bf6fe7e349fb4e45f` |

Los SHA-256 de cada pcap y payload extractan en el manifiesto que emite el
extractor (stdout). La copia archivada usada fue la del snapshot de
Wayback Machine del 2023-01-22 (`https://web.archive.org/web/20230122043437id_/http://njrusmc.net/jobaid/netflow_pcap.zip`).

## Regeneración

```bash
curl -L "https://web.archive.org/web/20230122043437id_/http://njrusmc.net/jobaid/netflow_pcap.zip" -o netflow_pcap.zip
# verificar sha256 antes de continuar
Expand-Archive netflow_pcap.zip netflow_pcap_dir
python scripts/extract-udp-payloads.py netflow_pcap_dir/netflow_pcap/*.pcapng
# → escribe 23 .bin en agent/crates/sc-collector/fixtures/wireshark-extracted/
```

## Uso en tests

Los tests de regresión viven en `tests/wireshark_fixtures.rs` y son
`#[ignore]` (requieren los payloads locales ignorados por git):

```bash
cargo test -p sc-collector --test wireshark_fixtures -- --ignored
```

Resultado verificado al entregar T4.3: **23/23 payloads sin panic**;
13 parsean Ok con **17 flujos normalizados** (v5: 2+1; v9 IPv4/IPv6:
1+1+1+2+1+1; IPFIX: 1+2+1+2+1) y 10 datagramas de MPLS (exportador
`10.0.0.4`) devuelven `TemplateNotFound(256/257)` controlado: la captura
arranca *mid-stream* (el template nunca se vio en los 6 datagramas
capturados). Ese es el comportamiento correcto — en un router real el
template llega en un datagrama previo al primero de datos. Los SHA-256 de
los 7 pcaps origen constan en el manifiesto del extractor.
