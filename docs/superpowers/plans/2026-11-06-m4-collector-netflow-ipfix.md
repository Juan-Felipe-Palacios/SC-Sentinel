Estado: 📋 Planificado (pendiente de kickoff)
Creado: 2026-11-06
Autor: Equipo SC-Sentinel
Dependencias previas: M1 ✅ (100%, verificado 2026-11-07), M2 ✅, M3 ✅
Dependencias externas: M5 (Servicio Windows) — puede arrancar en paralelo
Estimación total: 8–10 días de trabajo enfocado (1 dev + asistencia)
Objetivo de madurez: Llevar el agente de "monitoreo de un endpoint" a "monitoreo de red completa"
1. Resumen ejecutivo
El Hito M4 añade al agente Rust la capacidad de recibir flujos de red desde routers y switches (MikroTik, Cisco, y cualquier equipo que exporte IPFIX/NetFlow v5/v9). Esto transforma SC-Sentinel de una solución de monitoreo puntual (un PC con Npcap) a una solución de monitoreo de red completa, capaz de agregar tráfico de decenas o cientos de dispositivos desde un único agente central.
Entregable principal: Un crate sc-collector completo, integrado en el pipeline existente (capture → aggregate → detect → sync), con parsers para los tres protocolos más usados en el mercado enterprise/SOHO, y un listener UDP robusto capaz de manejar miles de flows por segundo.
Valor de negocio:
Un único agente puede reemplazar múltiples soluciones de monitoreo distribuido.
Habilita el caso de uso de "monitoreo de sucursal" (un agente por sede, centralizado en la nube).
Diferenciación competitiva vs. herramientas que solo hacen captura local.
2. Objetivos del hito
2.1 Objetivos funcionales (qué debe hacer)
F1: Escuchar tráfico UDP en puertos configurables (2055, 4739, 9995, 9996).
F2: Parsear NetFlow v5 (Cisco legacy, aún muy usado en SOHO).
F3: Parsear NetFlow v9 (Cisco moderno, templates dinámicos).
F4: Parsear IPFIX (RFC 7011, estándar IETF, templates dinámicos + Information Elements enterprise).
F5: Normalizar los tres protocolos a un FlowRecord común del crate sc-core.
F6: Integrar el collector con sc-aggregate (mismo canal mpsc<FlowUpdate> que sc-capture).
F7: Soportar múltiples listeners simultáneos (varios puertos, varios protocolos).
F8: Manejar templates dinámicos con cache por (source IP, template ID).
F9: Rechazar paquetes malformados sin caer (defensa en profundidad).
F10: Exponer métricas de salud: paquetes recibidos, descartados, errores de parseo, templates cacheados.
2.2 Objetivos no funcionales (cómo debe comportarse)
NF1: Throughput: sostener 50k flows/seg en hardware modesto (4 cores, 8 GB RAM).
NF2: Latencia: < 5 ms desde recepción UDP hasta entrega al aggregator.
NF3: Memoria: cache de templates acotada (máx. 10k templates por source, LRU).
NF4: Tolerancia a fallos: un paquete malformado no debe tumbar el listener.
NF5: Seguridad: validación estricta de longitudes, sin unwrap() en camino crítico.
NF6: Observabilidad: logs estructurados con tracing, métricas en HealthRegistry.
NF7: Configuración: vía config.toml + overrides SC_* (mismo patrón que M1).
NF8: Portabilidad: compilar en Linux (producción) y Windows (desarrollo).
2.3 Fuera de alcance (explícitamente NO entra en M4)
❌ Exportación de flows (solo recepción).
❌ Soporte para sFlow (protocolo diferente, queda para M6+).
❌ Soporte para IPFIX over TLS/DTLS (queda para hardening post-M4).
❌ GUI específica para configuración de collectors (se usa config.toml).
❌ Integración con firewalls/IPS (solo lectura pasiva).
❌ Parseo de opciones MPLS, VLAN tags complejos (solo IPv4/IPv6 básico).
3. Arquitectura
3.1 Posición en el DAG de crates



sc-core (tipos de dominio)
    ↑
    ├── sc-capture (pcap local) ──┐
    ├── sc-collector (IPFIX/NF) ──┼──→ sc-aggregate → sc-detect → sc-sync
    └── sc-geo (lookup) ──────────┘
sc-collector es hermano de sc-capture: ambos producen FlowUpdate que sc-aggregate consume indistintamente. Esto es clave: el aggregator no sabe ni le importa de dónde vino el flow.
3.2 Dependencias del crate sc-collector
toml



[dependencies]
sc-core = { path = "../sc-core" }
sc-telemetry = { path = "../sc-telemetry" }
tokio = { version = "1", features = ["net", "sync", "time", "rt"] }
tracing = "0.1"
thiserror = "1"
bytes = "1"
lru = "0.12"           # Cache de templates
chrono = "0.4"
bitflags = "2"

[dev-dependencies]
tokio-test = "0.4"
hex-literal = "0.4"    # Fixtures en hex
3.3 Módulos internos



sc-collector/src/
├── lib.rs              # Re-exports y trait Collector
├── listener.rs         # UDP listener genérico (tokio)
├── protocol/
│   ├── mod.rs          # Trait ProtocolParser + detección automática
│   ├── netflow_v5.rs   # Parser NetFlow v5 (fijo, 48 bytes/header)
│   ├── netflow_v9.rs   # Parser NetFlow v9 (templates dinámicos)
│   ├── ipfix.rs        # Parser IPFIX (RFC 7011)
│   └── template_cache.rs  # Cache LRU de templates por (source, id)
├── normalizer.rs       # FlowRecord → sc_core::FlowUpdate
├── error.rs            # Errores tipados
└── metrics.rs          # Contadores de salud
3.4 Flujo de datos



┌─────────────┐    UDP     ┌──────────────┐
│ Router/Switch├───────────→│  UDP Listener │
│ (MikroTik,  │  :2055/4739│  (tokio)      │
│  Cisco...)  │            └──────┬───────┘
└─────────────┘                   │
                                  ▼
                    ┌─────────────────────────┐
                    │  Protocol Detector      │
                    │  (lee version field)    │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │ NetFlow v5   │  │ NetFlow v9   │  │ IPFIX        │
      │ Parser       │  │ Parser       │  │ Parser       │
      └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                    ┌─────────────────────────┐
                    │  Normalizer             │
                    │  (→ sc_core::FlowUpdate)│
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  sc-aggregate           │
                    │  (mismo canal que pcap) │
                    └─────────────────────────┘
3.5 Decisiones de diseño (ADRs a redactar)
ID
Decisión
Justificación
ADR-M4-01
UDP puro, sin TCP
IPFIX/NetFlow son UDP por spec. TCP añade complejidad innecesaria.
ADR-M4-02
Cache LRU por (source IP, template ID)
Los templates son estables por router; LRU evita memory leak.
ADR-M4-03
Detección automática por version field
El primer campo de los 3 protocolos es la versión; no requiere config.
ADR-M4-04
Normalización a FlowRecord común
Permite reutilizar aggregator/detect/sync sin cambios.
ADR-M4-05
Sin TLS en M4
El tráfico de flows es interno a la red; TLS queda para hardening.
ADR-M4-06
Fixtures con pcaps reales de Wireshark
Garantiza compatibilidad con implementaciones reales.
4. Especificación técnica de protocolos
4.1 NetFlow v5 (RFC-legacy, Cisco)
Header fijo (24 bytes):



 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Version (5)             |            Count              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           sys_uptime                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           unix_secs                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           unix_nsecs                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        flow_sequence                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|    engine_type    |    engine_id    |      sampling_interval      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
Record fijo (48 bytes cada uno):
src_addr (4), dst_addr (4), next_hop (4)
input (2), output (2)
packets (4), bytes (4)
first (4), last (4)
src_port (2), dst_port (2)
pad (1), tcp_flags (1), prot (1), tos (1)
src_as (2), dst_as (2)
src_mask (1), dst_mask (1)
Características clave:
Todo en network byte order (big-endian).
Solo IPv4 (sin IPv6).
Sin templates (estructura fija).
Fácil de parsear, ideal como primer parser.
4.2 NetFlow v9 (Cisco moderno)
Header (20 bytes):



 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Version (9)             |            Count              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           sys_uptime                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           unix_secs                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        flow_sequence                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        source_id                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
FlowSets (después del header):
Template FlowSet (type = 0): define la estructura de los records.
Options Template FlowSet (type = 1): metadata (sampling, etc.).
Data FlowSet (type ≥ 256): los flows reales, referenciando un template.
Template record:



+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Template ID (≥256)     |         Field Count           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Field Type (1)         |         Field Length (1)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Field Type (2)         |         Field Length (2)      |
...
Information Elements comunes (RFC 3954):
ID
Nombre
Longitud
1
IN_BYTES
4 u 8
2
IN_PKTS
4 u 8
4
PROTOCOL
1
7
SRC_PORT
2
8
IPV4_SRC_ADDR
4
11
DST_PORT
2
12
IPV4_DST_ADDR
4
21
ICMP_TYPE
2
27
IPV6_SRC_ADDR
16
28
IPV6_DST_ADDR
16
Características clave:
Templates dinámicos: el router puede cambiar la estructura en cualquier momento.
Cache de templates por (source IP, template ID).
Si llega un Data FlowSet sin template conocido → descartar con log warning.
Soporta IPv4, IPv6, MPLS, VLAN.
4.3 IPFIX (RFC 7011, estándar IETF)
Header (16 bytes):



 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Version (10)            |          Length               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           Export Time                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Sequence Number                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Observation Domain ID                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
Diferencias con NetFlow v9:
Versión = 10 (no 9).
Header incluye Length total del paquete (v9 no).
Export Time reemplaza sys_uptime.
Observation Domain ID reemplaza source_id.
Information Elements con PEN (Private Enterprise Number) para vendors.
Set IDs:
2 = Template Set
3 = Options Template Set
≥ 256 = Data Set
Estrategia de implementación:
Reutilizar ~80% del código de NetFlow v9 (estructura de templates idéntica).
Añadir soporte para PEN (enterprise IEs de MikroTik, Cisco, etc.).
Soportar longitudes variables (enterprise IEs pueden ser de tamaño no estándar).
5. Plan de tareas (WBS — Work Breakdown Structure)
Fase 1: Fundaciones (Días 1–2)
T1.1 — ADR y diseño del crate ⏱️ 4h
Redactar docs/adr/000N-collector-ipfix.md con las decisiones de §3.5.
Crear el crate sc-collector con Cargo.toml y estructura de módulos.
Definir el trait ProtocolParser y la interfaz pública.
Integrar en el workspace de agent/.
Entregable: Crate vacío que compila, ADR mergeado.
Tests: cargo check --workspace verde.
T1.2 — UDP Listener genérico ⏱️ 6h
Implementar listener.rs con tokio::net::UdpSocket.
Soporte para múltiples listeners (vec de sockets).
Canal mpsc para enviar paquetes crudos a los parsers.
Métricas: paquetes recibidos, bytes, errores de recv.
Entregable: Listener que recibe UDP y lo envía al canal.
Tests:
Unit: mock de socket que inyecta paquetes.
Integration: enviar UDP real desde un test y verificar recepción.
Criterio de aceptación: Recibir 10k paquetes UDP sin pérdida en test local.
T1.3 — Trait ProtocolParser y detección automática ⏱️ 4h
Definir trait ProtocolParser:
rust



trait ProtocolParser {
    fn try_parse(&self, source: SocketAddr, data: &[u8]) -> Result<Vec<FlowRecord>, ParseError>;
}
Implementar detect_protocol(data: &[u8]) -> Option<ProtocolKind>:
Lee los primeros 2 bytes (version field).
5 → NetFlow v5
9 → NetFlow v9
10 → IPFIX
Otro → Unknown (descartar con log).
Entregable: Detector funcional.
Tests: Unit con bytes crudos de cada versión.
Fase 2: Parsers (Días 3–5)
T2.1 — Parser NetFlow v5 ⏱️ 8h
Implementar netflow_v5.rs con parser del header (24 bytes).
Parsear N records de 48 bytes cada uno.
Validar longitudes (packet length = 24 + 48*count).
Convertir a FlowRecord de sc-core.
Entregable: Parser completo de NetFlow v5.
Tests:
Unit: fixture de NetFlow v5 real (extraído de Wireshark).
Unit: paquete malformado (longitud incorrecta) → error, no panic.
Unit: paquete con 0 records → Ok(vec![]).
Integration: enviar 100 paquetes NFv5 y verificar conteo.
Criterio de aceptación: 100% de los fixtures de Wireshark NFv5 parseados correctamente.
T2.2 — Cache de templates ⏱️ 6h
Implementar template_cache.rs con LRU (lru crate).
Clave: (source_ip: IpAddr, template_id: u16).
Valor: Template { fields: Vec<FieldSpec> }.
TTL: 1 hora (configurable).
Evicción LRU cuando se supere el límite (10k por defecto).
Entregable: Cache funcional con tests de evicción.
Tests:
Unit: insertar, obtener, evicción LRU.
Unit: TTL expirado → miss.
Unit: límite de 10k → evicción del menos usado.
Stress: 100k templates → memoria acotada.
T2.3 — Parser NetFlow v9 ⏱️ 12h
Implementar netflow_v9.rs.
Parsear header (20 bytes).
Iterar FlowSets:
Type 0 → Template FlowSet → actualizar cache.
Type 1 → Options Template → metadata (sampling).
Type ≥ 256 → Data FlowSet → buscar template en cache.
Si template no está en cache → log warning + descartar.
Parsear fields según template (tipos: 1, 2, 4, 8 bytes).
Soportar IPv4 e IPv6.
Entregable: Parser completo de NetFlow v9.
Tests:
Unit: fixture con Template + Data FlowSet.
Unit: Data FlowSet sin template → error controlado.
Unit: Template con IPv6 (16 bytes).
Integration: enviar template, luego data → parseo correcto.
Integration: enviar data sin template → descartado con log.
Criterio de aceptación: Fixtures reales de MikroTik y Cisco NFv9 parseados.
T2.4 — Parser IPFIX ⏱️ 10h
Implementar ipfix.rs (reutiliza ~80% de NFv9).
Diferencias:
Header de 16 bytes (con Length y Export Time).
Set ID 2 = Template, 3 = Options, ≥256 = Data.
Soporte para PEN (Private Enterprise Number).
Implementar diccionario de IEs estándar (RFC 3954 + RFC 7012).
Soporte para IEs enterprise (MikroTik PEN 14988, Cisco PEN 9).
Entregable: Parser completo de IPFIX.
Tests:
Unit: fixture IPFIX real (Wireshark).
Unit: IPFIX con enterprise IE → parseo correcto.
Unit: IPFIX con longitud variable → manejo correcto.
Criterio de aceptación: Fixtures de MikroTik IPFIX parseados.
Fase 3: Integración (Días 6–7)
T3.1 — Normalizador a FlowRecord ⏱️ 6h
Implementar normalizer.rs.
Mapear campos de cada protocolo a sc_core::FlowRecord:
rust



pub struct FlowRecord {
    pub src_ip: IpAddr,
    pub dst_ip: IpAddr,
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: u8,
    pub bytes: u64,
    pub packets: u64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub tcp_flags: u8,
    pub direction: FlowDirection,
}
Campos no disponibles (ej. VLAN en NFv5) → default o None.
Entregable: Normalizador funcional.
Tests:
Unit: NFv5 → FlowRecord.
Unit: NFv9 con IPv6 → FlowRecord.
Unit: IPFIX con enterprise IE → FlowRecord.
Property: para cualquier FlowRecord, los campos obligatorios están presentes.
T3.2 — Integración con sc-aggregate ⏱️ 8h
Modificar sc-agent/src/main.rs para instanciar el collector.
Añadir flag --collector-port (o leer de config.toml).
El collector envía FlowUpdate al mismo canal que sc-capture.
Verificar que el aggregator no distingue el origen.
Entregable: Agente que recibe flows de red y los agrega.
Tests:
Integration: enviar flows NFv9 por UDP → verificar que aparecen en el dashboard.
Integration: enviar flows IPFIX → verificar que aparecen en el dashboard.
Integration: enviar flows NFv5 + NFv9 simultáneamente → ambos se agregan.
Criterio de aceptación: E2E: router (simulado) → agente → Vercel → dashboard.
T3.3 — Configuración y CLI ⏱️ 4h
Extender sc-config con sección [collector]:
toml



[collector]
enabled = true
listeners = [
    { port = 2055, protocol = "auto" },
    { port = 4739, protocol = "auto" },
]
template_cache_size = 10000
template_ttl_secs = 3600
Overrides SC_COLLECTOR_ENABLED, SC_COLLECTOR_PORTS.
Flags CLI: --collector-port 2055,4739.
Entregable: Configuración funcional.
Tests:
Unit: config con listeners múltiples.
Unit: override de entorno.
Unit: config inválida (puerto < 1024) → error claro.
Fase 4: Robustez (Días 8–9)
T4.1 — Métricas y salud ⏱️ 6h
Extender HealthRegistry con métricas del collector:
collector_packets_received
collector_packets_dropped
collector_parse_errors
collector_templates_cached
collector_flows_normalized
Exponer en /api/query?metric=health.
Mostrar en el dashboard (sección "Agente de captura").
Entregable: Métricas visibles en el dashboard.
Tests:
Integration: enviar 1000 flows → verificar contadores.
Unit: parse error → contador incrementa, no panic.
T4.2 — Manejo de errores y fuzzing ⏱️ 8h
Revisar todos los parsers: sin unwrap(), sin panic!.
Validar longitudes antes de cada slice.
Manejar paquetes truncados, malformados, vacíos.
Fuzzing básico con cargo fuzz (opcional, 4h):
Generar paquetes aleatorios → verificar que no hay panics.
Entregable: Parsers robustos.
Tests:
Property: cualquier &[u8] → Ok o Err, nunca panic.
Fuzz: 10k paquetes aleatorios → 0 panics.
T4.3 — Fixtures reales ⏱️ 6h
Descargar pcaps reales de Wireshark:
NetFlow v5: wireshark.org/samplecaptures/NetFlow-v5.pcap
NetFlow v9: wireshark.org/samplecaptures/NetFlow-v9.pcap
IPFIX: wireshark.org/samplecaptures/IPFIX.pcap
Extraer los paquetes UDP y guardarlos como fixtures en agent/crates/sc-collector/fixtures/.
Tests de regresión con estos fixtures.
Entregable: Suite de fixtures reales.
Tests: Todos los fixtures parseados correctamente.
Fase 5: Documentación y cierre (Día 10)
T5.1 — Documentación técnica ⏱️ 6h
README de sc-collector con:
Descripción de protocolos soportados.
Ejemplos de configuración.
Métricas expuestas.
Limitaciones conocidas.
Actualizar agent/README.md con sección de collector.
Runbook: "Cómo configurar MikroTik para exportar NetFlow/IPFIX".
Runbook: "Cómo configurar Cisco para exportar NetFlow v9".
Entregable: Docs completas.
T5.2 — Smoke test E2E ⏱️ 8h
Simular router con nfcapd o softflowd (Linux) o script Python.
Enviar flows NFv5, NFv9, IPFIX al agente.
Verificar en el dashboard:
Métricas de tráfico aparecen.
Top hosts se actualizan.
Alertas se disparan si corresponde.
IA analiza los flows (si hay datos suficientes).
Entregable: E2E verificado.
Criterio de aceptación: Video/screenshot del dashboard con datos reales de flows.
T5.3 — Commit de cierre ⏱️ 2h
Commit atómico: feat(collector): IPFIX/NetFlow v5/v9 collector completo.
Actualizar docs/release/changelog.md.
Actualizar docs/testing/acceptance-criteria.md (marcar M4 como completo).
Push a main.
Deploy a Vercel (si aplica).
Entregable: M4 cerrado y mergeado.
6. Criterios de aceptación del hito
6.1 Criterios funcionales
CA1: El agente escucha en los puertos configurados (2055, 4739, 9995, 9996).
CA2: Parsea NetFlow v5 correctamente (fixtures reales).
CA3: Parsea NetFlow v9 correctamente (fixtures reales, con templates dinámicos).
CA4: Parsea IPFIX correctamente (fixtures reales, con enterprise IEs).
CA5: Los flows se normalizan a FlowRecord y llegan al aggregator.
CA6: El dashboard muestra métricas de tráfico provenientes de flows.
CA7: La IA analiza los flows (si hay datos suficientes).
6.2 Criterios no funcionales
CA8: Throughput ≥ 50k flows/seg en hardware modesto.
CA9: Latencia < 5 ms desde recepción hasta aggregator.
CA10: Memoria acotada (cache LRU, sin leaks).
CA11: 0 panics en fuzzing con 10k paquetes aleatorios.
CA12: Métricas de salud visibles en el dashboard.
6.3 Criterios de calidad
CA13: cargo fmt --check verde.
CA14: cargo clippy -- -D warnings verde.
CA15: cargo test --workspace verde (≥ 50 tests nuevos en sc-collector).
CA16: cargo deny check licenses verde.
CA17: Documentación completa (README, ADR, runbooks).
CA18: Fixtures reales de Wireshark incluidos.
7. Estrategia de testing
7.1 Pirámide de tests



         ┌─────────────┐
         │  E2E (10%)  │  ← Smoke test con router simulado
        ┌┴─────────────┴┐
        │ Integration   │  ← Listener + parser + aggregator
       ┌┴───────────────┴┐
       │  Unit (70%)     │  ← Parsers, cache, normalizer
      └───────────────────┘
7.2 Tests unitarios (≥ 50 tests)
Parsers
NetFlow v5: header válido, 0 records, 10 records, longitud incorrecta, versión incorrecta.
NetFlow v9: template + data, data sin template, template actualizado, IPv6, options template.
IPFIX: header válido, template + data, enterprise IE, longitud variable, observation domain ID.
Cache de templates
Insertar, obtener, evicción LRU, TTL expirado, límite de 10k.
Normalizador
NFv5 → FlowRecord, NFv9 IPv6 → FlowRecord, IPFIX → FlowRecord.
Campos faltantes → default.
Listener
Recibir paquete, múltiples listeners, puerto ocupado → error claro.
7.3 Tests de integración (≥ 10 tests)
Listener + parser NFv5 → FlowRecord.
Listener + parser NFv9 → FlowRecord.
Listener + parser IPFIX → FlowRecord.
Parser + normalizer + aggregator → WindowSnapshot.
Múltiples protocolos simultáneos → todos se agregan.
Paquete malformado → error, no panic, contador incrementa.
7.4 Tests E2E (≥ 2 tests)
Router simulado → agente → Vercel → dashboard (NFv9).
Router simulado → agente → Vercel → dashboard (IPFIX).
7.5 Fuzzing
cargo fuzz run parser_fuzz con 10k iteraciones → 0 panics.
cargo fuzz run template_fuzz con 10k iteraciones → 0 panics.
7.6 Benchmarks
cargo bench para parsers:
NFv5: 100k packets → medir throughput.
NFv9: 100k packets → medir throughput.
IPFIX: 100k packets → medir throughput.
Objetivo: ≥ 50k flows/seg.
8. Documentación entregable
8.1 Documentos técnicos
docs/adr/000N-collector-ipfix.md — ADR con decisiones de diseño.
agent/crates/sc-collector/README.md — Documentación del crate.
docs/runbooks/collector-mikrotik.md — Configuración de MikroTik.
docs/runbooks/collector-cisco.md — Configuración de Cisco.
docs/runbooks/collector-troubleshooting.md — Diagnóstico de problemas.
8.2 Actualizaciones de docs existentes
agent/README.md — Añadir sección de collector.
docs/README.md — Listar nuevos documentos.
docs/release/changelog.md — Entrada de M4.
docs/testing/acceptance-criteria.md — Marcar M4 como completo.
8.3 Ejemplos de configuración
agent/config/sc-agent-collector.toml.sample — Ejemplo con collector habilitado.
9. Riesgos y mitigaciones
#
Riesgo
Probabilidad
Impacto
Mitigación
R1
Fixtures reales no disponibles
Baja
Alto
Usar generadores sintéticos (nfcapd, softflowd) + pcaps de Wireshark.
R2
Templates dinámicos muy complejos
Media
Medio
Implementar solo IEs comunes (RFC 3954); enterprise IEs quedan para hardening.
R3
Throughput insuficiente
Baja
Alto
Optimizar con bytes crate, zero-copy parsing, benchmark temprano.
R4
Memory leak en cache de templates
Media
Alto
LRU con límite estricto, tests de stress, monitoreo de memoria.
R5
Incompatibilidad con routers reales
Media
Medio
Probar con MikroTik hEX y Cisco Catalyst 2960 (si están disponibles).
R6
IPFIX over TLS requerido
Baja
Bajo
Dejar para hardening post-M4; documentar limitación.
R7
NetFlow v9 obsoleto
Baja
Bajo
Soportar IPFIX como alternativa moderna; NFv9 solo para legacy.
10. Timeline estimado
Día
Fase
Tareas
Horas
Entregable
1
Fundaciones
T1.1, T1.2
10h
Crate vacío, listener funcional
2
Fundaciones
T1.3
8h
Detector de protocolos
3
Parsers
T2.1
8h
Parser NFv5 completo
4
Parsers
T2.2, T2.3 (inicio)
8h
Cache + NFv9 en progreso
5
Parsers
T2.3 (fin), T2.4 (inicio)
8h
NFv9 completo, IPFIX en progreso
6
Parsers
T2.4 (fin)
8h
IPFIX completo
7
Integración
T3.1, T3.2
8h
Normalizador + integración con aggregator
8
Integración
T3.3, T4.1
8h
Configuración + métricas
9
Robustez
T4.2, T4.3
8h
Fuzzing + fixtures reales
10
Cierre
T5.1, T5.2, T5.3
8h
Docs + E2E + commit de cierre
Total: 80h (10 días × 8h)
11. Checklist de seguimiento
Pre-kickoff
Plan revisado y aprobado.
Fixtures reales descargados de Wireshark.
Entorno de desarrollo listo (Rust, tokio, Wireshark).
Router de prueba disponible (MikroTik o Cisco) o simulador (nfcapd).
Fase 1: Fundaciones
T1.1 completada: ADR redactado, crate creado.
T1.2 completada: Listener UDP funcional.
T1.3 completada: Detector de protocolos funcional.
Fase 2: Parsers
T2.1 completada: Parser NFv5 + tests.
T2.2 completada: Cache de templates + tests.
T2.3 completada: Parser NFv9 + tests.
T2.4 completada: Parser IPFIX + tests.
Fase 3: Integración
T3.1 completada: Normalizador + tests.
T3.2 completada: Integración con aggregator + tests E2E.
T3.3 completada: Configuración + tests.
Fase 4: Robustez
T4.1 completada: Métricas en dashboard.
T4.2 completada: Fuzzing sin panics.
T4.3 completada: Fixtures reales + tests de regresión.
Fase 5: Cierre
T5.1 completada: Documentación completa.
T5.2 completada: Smoke test E2E verificado.
T5.3 completada: Commit de cierre mergeado.
Post-M4
M4 marcado como 100% en docs/testing/acceptance-criteria.md.
Changelog actualizado.
Demo grabada (video/screenshot del dashboard con flows reales).
Anuncio al equipo: "M4 completo, listo para M5".
12. Anexos
12.1 Referencias de protocolos
RFC 3954 — Cisco Systems NetFlow Services Export Version 9
RFC 7011 — IP Flow Information Export (IPFIX)
RFC 7012 — Information Model for IP Flow Information Export (IPFIX)
NetFlow v5 — Cisco legacy (documentación no oficial)
12.2 Herramientas de prueba
Wireshark — Análisis de pcaps.
nfcapd — Colector de NetFlow/IPFIX (Linux).
softflowd — Generador de flows (Linux).
MikroTik RouterOS — Router real para pruebas.
Cisco Packet Tracer — Simulador de Cisco.
12.3 Fixtures reales
Wireshark Sample Captures — Pcaps de NetFlow/IPFIX.
NetFlow v5 pcap
NetFlow v9 pcap
IPFIX pcap
12.4 Glosario