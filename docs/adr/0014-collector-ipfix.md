# ADR-0014 — Colector pasivo de flujos NetFlow v5/v9 e IPFIX (M4)

**Fecha:** 2026-11-08 · **Estado:** Aceptada · **Deriva del hito:** M4

## Contexto

Hasta M3.5 el agente solo mide el tráfico del equipo donde corre (captura pcap local, M1). M4 lo convierte en un colector capaz de recibir exportaciones de flujos desde routers y switches (MikroTik, Cisco y cualquier equipo que hable NetFlow v5/v9 o IPFIX), de modo que un único agente centralizado pueda monitorear una red completa.

El plan M4 (`docs/superpowers/plans/2026-11-06-m4-collector-netflow-ipfix.md`) define tres protocolos, un listener UDP multipuerto y la integración con el pipeline existente sin tocar `sc-aggregate`, `sc-detect` ni `sc-sync`. El crate `sc-collector` existe desde M0 como esqueleto sin dependencias.

## Decisión

### 1. UDP puro, listeners configurables (ADR-M4-01)

- Los tres protocolos son UDP por especificación; el colector no escucha TCP en M4.
- Puertos por defecto: 2055, 4739, 9995 y 9996, con bind en `0.0.0.0` (todas las interfaces) y posibilidad de puerto efímero (`0`) para tests.
- Cada puerto es un `tokio::net::UdpSocket` independiente; un fallo de bind aborta el arranque con un `CollectorError::Bind` que nombra la dirección.
- El tamaño de datagrama se acota al máximo UDP (65 535 bytes); un datagrama mayor no puede existir.

### 2. Detección automática por campo de versión (ADR-M4-03)

Los tres formatos comparten el primer campo de 16 bits: `5` NetFlow v5, `9` NetFlow v9, `10` IPFIX. `detect_protocol` lo lee y `ProtocolSet` despacha al parser correspondiente, sin configuración por puerto. Una versión desconocida se descarta con `ParseError::UnknownVersion` y se cuenta en las métricas; nunca tumba el listener.

### 3. Crate `sc-collector` con listener, protocolos, normalizador y métricas

```text
sc-collector/src/
├── lib.rs              # API pública y re-exports
├── error.rs            # CollectorError (bind/IO) y ParseError (datagramas)
├── metrics.rs          # Contadores atómicos de salud
├── normalizer.rs       # Campos de flujo → sc_capture::FlowUpdate
├── listener.rs         # Bind UDP, bucle de recepción, backpressure
└── protocol/
    ├── mod.rs          # ProtocolKind, detección y trait ProtocolParser
    ├── netflow_v5.rs   # Parser NetFlow v5 (estructura fija)
    ├── netflow_v9.rs   # Parser NetFlow v9 (templates + options templates)
    ├── ipfix.rs        # Parser IPFIX (templates, PEN, IEs variables)
    ├── record.rs       # Decodificación de IEs compartida por v9 e IPFIX
    └── template.rs     # Cache LRU + TTL por (origen, template ID)
```

- `ProtocolParser` es `&mut self` a propósito: NetFlow v9 e IPFIX necesitan un cache de templates mutable por listener. Cada listener crea su propio `ProtocolSet`, así que no hay estado compartido entre puertos.
- Los parsers validan longitudes antes de cada slice y devuelven `ParseError`; no hay `unwrap()` ni `panic!` en el camino de parseo.

### 4. `sc_capture::FlowUpdate` como contrato interno (desviación del plan §3.2)

El plan preveía un `FlowRecord` nuevo en `sc-core`. El código de M1 ya fija `sc_capture::FlowUpdate` como el tipo que consume `sc-aggregate` (`WindowAggregator::run` recibe `mpsc::Receiver<FlowUpdate>`), y `FlowKey` —la identidad del flujo— ya vive en `sc-core`.

Duplicar el tipo en `sc-core` obligaría a mantener dos definiciones y una conversión extra en cada ventana. En su lugar:

- `sc-collector` depende de `sc-capture` y produce `FlowUpdate` directamente.
- El colector empuja al mismo `FlowProducer`/canal acotado que la captura pcap, con el mismo contador de drops por backpressure. El aggregator no distingue el origen.
- La arista `sc-collector → sc-capture → sc-core` respeta el DAG de ADR-0002 (no hay ciclo; `sc-capture` no conoce al colector).

### 5. Orientación de flujos exportados

Un export de router no tiene un extremo local conocido como un paquete capturado en la interfaz. Para que la atribución por host sea determinista, el normalizador emite `Direction::In`, que el accumulator actual resuelve como «el host es `src_ip`». Así el tráfico LAN → Internet se atribuye al cliente que lo origina, que es el caso dominante en una sucursal.

Limitación registrada: el tráfico Internet → servidor interno se atribuye al host remoto hasta que exista una política de redes locales (fase de hardening post-M4). No se inventa dirección a partir de `input`/`output` porque el significado de esos ifindex depende del fabricante.

### 6. Cache de templates por `(IP origen, template ID)` (ADR-M4-02)

NetFlow v9 e IPFIX definen templates dinámicos. Se cachean por origen y ID con LRU acotada (10 000 entradas por listener por defecto, TTL 1 h), para que un exportador no pueda crecer la memoria sin límite. Un Data FlowSet sin template conocido se descarta con `ParseError::TemplateNotFound`; no es un error fatal del listener.

La cache se implementa internamente (HashMap + BTreeMap de ticks de uso) en lugar de usar el crate `lru`: evita una dependencia en el camino crítico, permite inyectar el reloj en los tests (TTL sin dormir) y mantiene la evicción en O(log n).

NetFlow v5 no usa templates: su registro es fijo de 48 bytes. Los options templates de v9/IPFIX se cachean para reconocer su data y descartarla sin error, porque describen metadatos (sampling, interfaces), no flujos.

### 7. Sin TLS en M4 (ADR-M4-05)

El tráfico de exportación viaja dentro de la red gestionada. IPFIX over DTLS/TLS queda para hardening posterior y se documenta como limitación; el listener rechaza cualquier cosa que no sea un datagrama de los tres formatos.

### 8. Robustez y observabilidad

- Cualquier datagrama produce `Ok(Vec<FlowUpdate>)` o `ParseError`; jamás un panic. Los tests incluyen 10 000 datagramas pseudoaleatorios con versión forzada.
- Fuzz formal (T4.2, entregado 2026-11-09): property tests con proptest (bytes arbitrarios, versión forzada, truncamiento y mutación de paquetes válidos) más barridos exhaustivos de prefijos y de mutación un-byte. **El fuzz encontró un panic real** en `ipfix.rs::read_fields`: el mínimo `count * 4` no cubriva los IEs de empresa (8 bytes con PEN) y el cursor indexaba fuera del cuerpo. Corregido con validación por iteración (`cursor + 4 > body.len()` → `Truncated`) y test de regresión `ies_de_empresa_que_exceden_el_cuerpo_son_truncated`.
- Auditoría de panics sin `unwrap`/`panic!`/`expect` en producción (solo bajo `#[cfg(test)]`); el indexado de `read_u16`/`read_u32` está precedido por guardas de longitud verificadas (`HEADER_LEN`, `offset + 4 <= len`, `end > body`, cursores de template) y `record.rs` usa `.get()`.
- Un error de parseo incrementa `parse_errors` y se registra a `debug` (no a `warn`) para que un exportador defectuoso no inunde los logs; un error de socket se registra a `warn` y el bucle continúa con una pausa corta.
- Métricas expuestas en `CollectorMetrics`: `packets_received`, `bytes_received`, `packets_dropped` (backpressure), `parse_errors`, `socket_errors`, `flows_normalized`, `templates_cached`.
- La exposición en `HealthRegistry`, `/api/query?metric=health` y dashboard está entregada en T4.1 (fase 4): 5 campos `Option<u64>` (`collector_packets_received`, `collector_packets_dropped`, `collector_parse_errors`, `collector_templates_cached`, `collector_flows_normalized`) publicados solo cuando el colector está habilitado; el espejo se actualiza cada 1 s desde `start_collector`.

### 9. Fixtures y alcance de la primera entrega

- Fase 1 entregó crate, listener, detección y parser NetFlow v5. Fase 2 agrega NetFlow v9 e IPFIX con cache de templates y fixtures sintéticos construidos en tests (IPv4, IPv6, options templates, IEs de empresa y de longitud variable).
- Los pcaps reales de Wireshark/MikroTik (T4.3) se entregaron como fixtures de regresión locales: capturas reales .pcapng de Nicholas Russo (7 pcaps: v5, v9, v10/IPFIX × IPv4/IPv6/MPLS), 23 payloads UDP extraídos con `scripts/extract-udp-payloads.py` que el parser procesa sin panic (13 Ok → 17 flujos; 10 mid-stream → `TemplateNotFound` controlado). Por la licencia de uso personal de la fuente, los bytes derivados no se commitean: viven en `fixtures/wireshark-extracted/` (gitignored) y se regeneran a partir del zip original; el README de `fixtures/wireshark/` documenta la procedencia y los SHA-256.
- Configuración TOML/CLI (T3.3) e integración con `sc-agent` (T3.2) se entregaron en la fase 3; las métricas en dashboard (T4.1), el fuzz formal con proptest (T4.2) y los fixtures reales (T4.3) se entregaron en la fase 4. Los benchmarks de throughput se midieron en el cierre (bench `collector_throughput`, 2026-11-09): parser solo 5,5–37,5M flows/s; camino UDP completo 714–782k flows/s con 0 drops (Windows x86_64). El objetivo de 50k flows/s queda superado en ambos modos.

### 10. Integración con `sc-agent` (T3.2/T3.3)

El agente no comparte el `Receiver` de la captura: reenvía `capture.rx` a un canal de merge y los listeners del colector publican ahí mismo. `WindowAggregator::run` sigue recibiendo un único `mpsc::Receiver<FlowUpdate>`, así que el contrato del aggregator no cambia y el merge no duplica la lógica de ventanas.

El puente de captura usa `FlowProducer::send().await` (backpressure): si el aggregator se atrasa, el descarte ocurre en el canal de captura, donde ya se contaba. El colector usa `try_push` y cuenta sus propios drops, igual que antes de integrarse.

`config.toml` gana `[collector]` con `enabled`, `bind_addr`, `listeners = [{ port, protocol }]`, `template_cache_capacity` y `template_cache_ttl_secs`; los overrides son `SC_COLLECTOR_ENABLED` y `SC_COLLECTOR_PORTS`, y los flags `--collector`, `--no-collector` y `--collector-port` tienen la última palabra. Los puertos se validan ≥1024 y sin duplicados.

Cada listener conserva su propia cache de templates: compartir una única cache entre puertos mezclaría los namespaces de template de distintos protocolos y agregaría un lock en el camino crítico, sin beneficio para exportadores que envían siempre al mismo puerto. La capacidad y el TTL configurados se aplican por socket.

Un fallo al abrir un puerto no es fatal: se registra, se publica en `last_error` del health y la captura pcap continúa. Al apagar, el handle del colector aborta sus tareas y espera a que liberen los sockets antes de drenar la ventana activa.

## Alternativas consideradas

- **Nuevo `FlowRecord` en `sc-core`**: duplica el contrato interno y agrega una conversión por ventana sin beneficio. Descartada.
- **Un crate por protocolo**: tres crates para parsers pequeños, con más superficie de build y de re-exports. Descartada; módulos internos alcanzan.
- **Parsers con `serde`/`nom`**: los formatos son binarios con templates variables; el parseo manual con slices acotados es más directo y no agrega dependencias al camino crítico. Descartada para M4.
- **sFlow**: protocolo distinto (muestras de paquetes, no flujos agregados); fuera de alcance de M4.
- **TCP/TLS**: no lo usan los exportadores objetivo y agrega estado y handshake. Pospuesto.
- **Escuchar con `SO_REUSEADDR`/multicast**: útil para varias instancias, irrelevante para un agente único; se puede agregar sin cambiar la API.

## Consecuencias

- `sc-collector` deja de ser un esqueleto y pasa a producir flujos reales por el mismo canal que la captura pcap.
- El aggregator, el detector, el spool y el sync no cambian: la integración es de canal, no de contrato.
- NetFlow v9/IPFIX, configuración e integración están implementados; métricas en dashboard, fuzz formal y fixtures reales siguen abiertos, así que el hito M4 **no** se declara cerrado con este ADR.
- La orientación `Direction::In` es una decisión provisional documentada; cambiarla altera la atribución de hosts y requiere actualizar este ADR y los tests del normalizador.
- El throughput objetivo (50k flows/s) no está verificado todavía: requiere los benchmarks de T4.2/T5.2.

## Referencias

- `docs/superpowers/plans/2026-11-06-m4-collector-netflow-ipfix.md`
- RFC 3954 — NetFlow Services Export Version 9
- RFC 7011 — IPFIX Protocol Specification
- RFC 7012 — IPFIX Information Model
- `agent/crates/sc-collector/`
- `agent/crates/sc-capture/src/channel.rs` (canal acotado y drops)
- `docs/adr/0002-rust-agent.md` (DAG de crates)
