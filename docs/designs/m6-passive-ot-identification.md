# M6 — Identificación Pasiva de Protocolos OT (F1)

**Author:** SC-Sentinel Team
**Status:** Draft — correcciones de E0 aplicadas 2026-11-25; milestone **no aprobado** (`docs/plans/etapa-2-backlog.md:49`)
**Date:** 2026-11-24
**Última corrección:** 2026-11-25 (etapa E0; detalle y motivo en `docs/OT/plan-implementacion.md` §3)
**Source:** concepts_brief.md (Priority 1 intake)

---

## Overview

SC-Sentinel M6 agrega identificación pasiva de protocolos OT/ICS al motor determinista local existente, sin alterar la promesa central de privacidad: **cero paquetes crudos a la nube**. El agente Rust inspecciona localmente los primeros bytes de payload por flujo, clasifica el protocolo con niveles de confianza explícitos (`hint` / `probable` / `confirmed`), y despacha únicamente un bloque aditivo opcional `ot` dentro del `WindowSnapshot` v1 existente. La nube recibe etiquetas derivadas, conteos y metadatos agregados; jamás payloads ni MACs completas.

Alcance F1: **Modbus TCP, S7comm (incl. variante S7comm+), DNP3, IEC 60870-5-104**. El diseño se extiende en cuatro puntos ya previstos para ser extendidos: el contrato de snapshot (patrón aditivo `top_asns` de 0.1.6), el motor `sc-detect` (reglas OT con evidencia y lifecycle existente), la matriz de conexiones (hoy etiquetada por puerto puro), y el pipeline de exports. Se agrega un read model persistente `ot_assets` para inventario, una demo sintética Modbus que ejercita el contrato, y un artefacto sensor Linux con degradación controlada a colector.

La autoridad de detección y de baseline permanece en el agente (D1/B3). El servidor es espejo del estado reportado y autoridad sobre la intención del operador; nunca computa alertas primarias ni transiciones de baseline. El copiloto IA sigue interpretando hechos agregados, sin crear alertas.

**Milestone**: M6 es el sexto milestone del producto (F1 = fase 1 de OT). Milestones anteriores: M1–M5 cubren captura base, agregación, detección IT, sync HTTPS, dashboard y alertas. Roadmap completo en `docs/roadmap.md`.

## The Problem

La matriz de conexiones actual etiqueta servicios por puerto (443→HTTPS, 5432→PostgreSQL). En redes OT esto es insuficiente y engañoso: Modbus circula en puertos no estándar (503, 5020), S7comm y MMS comparten el 102, y los flujos OT son longevos — un agente que reinicia ve conexiones establecidas semanas atrás, con el primer payload a mitad de PDU. Sin identificación estructural, el operador no distingue un PLC de un servidor HTTP, no sabe qué estación maestra escribe a un esclavo, ni detecta una maestra nueva fuera de baseline.

### Constraints (invariantes del producto)

- Agentes 0.1.8 en campo no se auto-actualizan → retrocompat obligatoria (server-first deploy).
- Presupuesto Neon acotado: Launch como piso de producción (~$19/mes baseline always-on), churn de escrituras controlado (≤3 statements extra por ingest).
- Promesa zero-raw-packet innegociable: Clase C (payload) nunca sale del nodo. Clase A (agregados IT) y Clase B (agregados OT con host hasheado) pueden ir a la nube con restricciones.
- Redes OT frágiles: 100% pasivo, cero sondeo activo a PLCs.

## Goals

| ID | Goal | Criterio de aceptación |
|---|---|---|
| G1 | Identificar pasivamente los 4 protocolos F1 con confianza explícita | Tabla normativa M4 (probable/confirmed/reject); DNP3 CRC inválido = reject; S7 vs MMS desambiguado por magic, no por puerto; alineación acotada 0–7 para flujos mid-stream |
| G2 | Contrato aditivo retrocompatible | `ot` opcional en v1, mismo PR schema/Zod/serde; dos pasadas (core → `OtBlock.safeParse`); `discardOtBlock()` + counter; jamás 4xx por `ot`; fixture real 0.1.8 en CI |
| G3 | Inventario persistente como read model | `ot_assets` excluido del cleanup 7/15/30 d; stale derivado >30 d; purge manual + auto opt-in >180 d; upsert ≤3 statements extra, condicional 5 min o cambio semántico |
| G4 | Baseline agent-owned con plano de intención | Agente = única autoridad efectiva; servidor = intención + espejo; reconciliación `(instance, epoch, window_end)`; arming por reloj monotónico + ventanas observadas |
| G5 | Invariante pasivo con enforcement | `forbid(unsafe_code)` en sc-ot/sc-capture; clippy disallowed types/methods; test de grafo + features; BPF default por CIDR de segmento OT; egress solo sc-sync TLS + /status loopback |
| G6 | Privacidad preservada | Vendor enum cerrado; evidence unión discriminada cerrada; sin strings libres ni MAC completa (solo OUI 3 B); Clase C no sale del nodo |
| G7 | Demo sintética demostrable y honesta | Flujo Modbus sintético ejercita el contrato Zod; disclaimers "sintético"; changelog no afirma capacidad de agente antes de embarque |
| G8 | Sensor Linux con degradación controlada | Artefacto nuevo `--features sc-capture/live`; modo `both` se mantiene (M3); sin libpcap → degrada a colector con flag en `/status`; Npcap no se bundlea sin OEM (M7) |
| G9 | Presupuesto de rendimiento | Fuzz no-panic en clasificación y contabilidad; p95 ingest increase ≤ max(10% of baseline p95, 5 ms), medido en branch Neon con EXPLAIN ANALYZE + pg_stat_statements; cap 8 KB (ver §Truncation), events última prioridad de drop |

## Non-Goals

- Protocolos L2 sin IP (GOOSE/SV/PROFINET RT) → F4.
- OPC UA, EtherNet/IP, BACnet, MQTT/Sparkplug → F2 (OQ1 cerrado: MQTT diferido a F2).
- Sondeo activo, fingerprinting activo, inyección de paquetes.
- Reassembly completo de payload; análisis de jitter a milisegundos.
- Fusión cross-device de assets (D4: per-device).
- Detección primaria server-side; transiciones de baseline computadas en servidor.
- Auto-actualización de agentes en campo.
- Fingerprint pasivo de certificados TLS 1.3 (cifrados).

## Open Questions

### Resueltas
- OQ1: MQTT diferido a F2. sc-ot F1 implementa 4 protocolos. Extensión en F1.5 si esfuerzo permite.
- OQ4: Cap 16 endpoints (cubre p95 de plantas Modbus single-master). Configurable via `ot_max_endpoints` (rango 4–64). Si se excede, truncar por bytes desc y set truncated=true. El tope efectivo es el presupuesto de 8 KiB de §Truncation: un valor alto de `ot_max_endpoints` se recorta por bytes, no por conteo. Re-evaluar con capturas reales en F2.
- OQ7: `zone` (Purdue) = texto libre con cap 64 chars en F1 (sin enum). Enum diferido a F3. Validación de longitud en Zod + serde.

### Movidas a roadmap (docs/roadmap.md)
- OQ5: Verificar redistribución de capturas DEFCON ICS CTF. Owner: TBD. Fecha: antes de M6.2.
- OQ6: Declarar plan Launch (~$19/mes) como piso de producción. Owner: TBD. Fecha: antes de M6.3.

## Critical User Journeys (CUJs)

### CUJ 1: Operador descubre inventario OT

- **Given**: Agente en modo sensor sobre segmento OT con Modbus TCP; baseline en learning (día 1).
- **When**: El agente completa 7 días de observación y arma baseline; un operador abre el dashboard.
- **Then**: La tab "Activos OT" lista PLCs (vendor por OUI), estaciones maestras (rol master), esclavos (rol slave), protocolo confirmado, fecha de primera observación. Export CSV disponible.

### CUJ 2: Alerta por nueva maestra

- **Given**: Baseline armado; un dispositivo nuevo emite Modbus fc 3 a un PLC conocido.
- **When**: El agente clasifica el flujo como confirmed, detecta que el client no está en peers del baseline.
- **Then**: Se emite alerta `ot_new_master` (severidad alta) con evidencia (rule, fn_codes, ventana, client/server hasheados). El alerta nace con lifecycle Abierta → Aceptada → Resuelta. El dashboard muestra la alerta en el feed.

### CUJ 3: Escritura fuera de horario

- **Given**: Baseline armado; regla `ot_write_outside_hours` activada (opt-in, horario configurable).
- **When**: Una estación de ingeniería emite Modbus fc 16 fuera del horario laboral configurado.
- **Then**: Alerta `ot_write_outside_hours` (severidad media) con evidencia. El copiloto IA responde "¿quién escribió al PLC?" citando el bloque `ot` del snapshot, sin inventar.

### CUJ 4: Despliegue collector-only

- **Given**: Sensor Linux sin libpcap instalado (modo collector).
- **When**: El agente arranca y no encuentra libpcap en runtime.
- **Then**: Degradación a colector con flag `ot_engine: "port_only"` en `/status`; confianza máxima `hint` (por puerto); badge UI "port-only"; sin crash. El operador ve la nota "confirmed requiere sensor".

### CUJ 5: Despliegue sintético demo

- **Given**: Demo pública con tráfico sintético.
- **When**: Un visitante abre la demo.
- **Then**: La matriz de conexiones muestra "502 · Modbus TCP · confirmed" con disclaimers "Flujo Modbus sintético; no corresponde a tráfico real" y "Evidencia sintética" por alerta. Las 2 alertas OT (nueva maestra, escritura fuera de horario) nacen con lifecycle existente.

## Technical Plan (Architecture)

### Pipeline de datos (agente → nube → dashboard)

```
sc-capture (pcap live | NetFlow/IPFIX collector)
  │
  ├─ Peek acotado 64–256 B por flujo/dirección (máx 2 intentos)
  │   LRU 4096 flujos candidatos (reutilizar patrón TemplateCache:
  │   HashMap + BTreeMap by tick, clock inyectable, TTL, capacidad).
  │   Tras confirmed, no se re-parsea.
  │
  ▼
sc-ot (funciones puras sobre &[u8], cero allocs hot path)
  │  Modbus TCP · S7comm/S7comm+ · DNP3 · IEC-104
  │  → OtProtocol { id, confidence, flows, bytes, clients, servers, fn_codes }
  │  → OtEndpoint { host, port, proto, role, confidence, oui_vendor?, writes }
  │  → OtEvent { rule, severity, proto, client, server, evidence }
  │
  ▼
sc-detect (reglas OT, baseline local SQLite spool)
  │  Per-protocol rule matrix:
  │    Modbus TCP: ot_new_master, ot_write_outside_hours, ot_it_zone_crossing
  │    S7comm:     ot_new_master, ot_write_outside_hours, ot_program_download,
  │                ot_cpu_state_change, ot_it_zone_crossing
  │    DNP3:       ot_new_master, ot_it_zone_crossing (F1; resto en F2)
  │    IEC-104:    ot_new_master, ot_write_outside_hours, ot_it_zone_crossing
  │  Baseline: learning 7d → armed (reloj monotónico + ventanas observadas)
  │  Anti-storm: mismo rule+pair con alerta abierta → collapse
  │
  ▼
sc-aggregate (WindowSnapshot v1 + bloque ot opcional)
  │  Cap 8 KB: events (última prioridad de drop) → protocols → endpoints
  │  truncated: true si algo se drop
  │  OtBlock { engine, capture_mode, baseline_instance?, protocols≤6,
  │            endpoints≤16, events≤8, truncated }
  │
  ▼
sc-sync (gzip, TLS 1.3, rate limit 60/min)
  │  POST /api/ingest (body +8 KB absorbido)
  │
  ▼
/api/ingest (dos pasadas)
  │  1. Core schema (ot: z.unknown().optional()) → siempre pasa
  │  2. OtBlock.safeParse() → si falla: discardOtBlock() + counter
  │     ot_validation_failures_total{reason}
  │  Server-side confidence ceiling: si capture_mode == "collector" y
  │     confidence == "confirmed" → downgrade a "hint",
  │     counter ot_confidence_downgraded_total
  │
  ├─► ot_assets upsert (≤3 statements, condicional 5 min o cambio semántico)
  │     merge en TS: confianza monótona, vendor manual gana,
  │     risk_flags sticky, espejo baseline (instance, epoch, window_end)
  │
  ├─► alertas OT (insert batch con dedup R4)
  │     lifecycle existente: Abierta → Aceptada → Resuelta
  │
  └─► ot_assets.baseline_state espejo (sin transiciones server-side)
  │
  ▼
Dashboard (Next.js + Neon Postgres)
  Tab "Activos OT" · badge protocolo en matriz conexiones · feed alertas
  Export CSV/XLSX · copiloto IA con contexto ot · disclaimers demo
```

### Contrato del bloque `ot` en WindowSnapshot

```jsonc
{
  // `v` viaja en el envelope de ingest, no en el snapshot (additionalProperties:false).
  "window_start": 1764000000,
  "window_end": 1764000030,
  "top_hosts": [],
  "top_ports": [],
  "top_asns": [],
  "ot": {                              // OPCIONAL. Omitir entero si vacío
    "engine": "sc-ot/0.1",             // crate version (independiente de agent version)
    "capture_mode": "live",            // live | collector | both (M5)
    "baseline_instance": "uuid",       // opcional, nivel bloque
    "protocols": [{                    // ≤6
      "id": "modbus_tcp",              // enum cerrado (Appendix A)
      "confidence": "confirmed",        // hint | probable | confirmed
      "flows": 12, "bytes": 48210,
      "clients": 2, "servers": 1,
      "fn_codes": {"3": 480, "16": 4}  // histograma top-8
    }],
    "endpoints": [{                    // ≤16, por bytes desc
      "host": "h_8f4b219e",           // misma derivación que top_hosts
      "port": 502, "proto": "modbus_tcp",
      "role": "server",               // client | server | unknown
      "confidence": "confirmed",
      "oui_vendor": "siemens",        // opcional, solo si MAC visible
      "writes": 4
    }],
    "events": [{                      // ≤8, última prioridad de drop
      "rule": "ot_new_master",
      "severity": "high",
      "proto": "modbus_tcp",
      "client": "h_a1b2c3d4",
      "server": "h_8f4b219e",
      "evidence": { "fn_codes": [3, 16], "baseline_days": 7 }
    }],
    "truncated": false
  }
}
```

### Firmas byte a byte (sc-ot)

**Modbus TCP** (502, hint también 503/5020): MBAP 7 B + PDU.
- offset 0-1: transaction_id (cualquiera)
- offset 2-3: protocol_id == 0x0000
- offset 4-5: length (BE), 2 ≤ L ≤ 254
- offset 6: unit_id (cualquiera)
- offset 7: function_code ∈ whitelist {1-8, 11, 12, 15-17, 20-24, 43} o ≥0x80 (exception)
- offset 8: exception code ∈ 1..=11 (solo si fc ≥ 0x80)
- confirmed: prefijo completo + payload_len ≥ 6 + L
- probable: prefijo coherente pero payload corto (segmentación)
- hint: solo puerto
- Rol: emisor de fc < 0x80 = client/master. Escrituras para reglas: fc ∈ {5, 6, 15, 16, 22, 23}. fc 8 (diagnóstico), fc 43/MEI 14 (Read Device ID → F2, extraer solo vendor normalizado del objeto 0x00, jamás payload).

**S7comm / S7comm+** (102): cadena TPKT → COTP → S7.
- offset 0-1: TPKT == 0x03 0x00
- offset 2-3: TPKT length (BE) ≥ 7, coherente
- offset 4: COTP LI == 0x02 (DT) o 0x06 (CR/CC handshake → probable)
- offset 5: COTP PDU type 0xF0 (DT) o 0xE0 (CR) / 0xD0 (CC)
- offset 6: TPDU nr + EOT == 0x80 (DT)
- offset 7: magic 0x32 → s7comm · 0x72 → s7comm_plus
- Funciones (ROSCTR job = 0x01, parámetro en offset 17): 0x04 read, 0x05 write, 0xF0 setup, 0x1A/1B/1C descarga de programa, 0x28 PLC control, 0x29 PLC stop.
- Desambiguación MMS: TPKT+COTP válidos pero byte 7 ∉ {0x32, 0x72} → iso-tsap-unclassified. Nunca etiquetar S7 por puerto.
- Metadata pasiva: TSAP del CR (params 0xC1/0xC2) → rack/slot → model_hint.

**DNP3** (20000 TCP+UDP): trama de enlace.
- offset 0-1: start == 0x05 0x64
- offset 2: length 5 ≤ L ≤ 255
- offset 3: control, PRM = bit 0x40 → emisor primario (master)
- offset 4-5: dest addr (LE)
- offset 6-7: src addr (LE)
- offset 8-9: CRC-16/DNP sobre bytes 0-7 (poly 0x3D65 reflejado = 0xA6BC, init 0, xorout 0xFFFF)
- CRC inválido → reject (nunca probable). CRC es el validador fuerte.
- F1 confirma capa de enlace; function codes de aplicación (write 0x02, operate 0x04/05, cold/warm restart 0x0D/0E) requieren caminar bloques CRC de 16 B → F2.

**IEC 60870-5-104** (2404): APCI.
- offset 0: start == 0x68
- offset 1: APDU length 4 ≤ L ≤ 253
- offset 2-5: control fields
  - U-frame: L == 4 y byte 2 ∈ {0x07, 0x0B, 0x13, 0x23, 0x43, 0x83}
    (STARTDT act/con, STOPDT act/con, TESTFR act/con)
  - S-frame: byte 2 == 0x01, byte 3 == 0x00
  - I-frame: LSB de byte 2 == 0
- I-frame → ASDU en offset 6: type ID. Comandos: types 45-64 y 100-107 (C_SC, C_SE, C_IC interrogación, C_CS clock…). COT 6 = activación.
- Rol: emisor de STARTDT act / tipos C_* = estación de control (client).

### Tabla normativa de condiciones (M4)

| Protocolo | Min bytes | probable | confirmed | reject |
|---|---|---|---|---|
| Modbus TCP | 6 | pid==0 + L∈[2,254] + payload < 6+L (segmentado, fc no visible) | MBAP completo + fc whitelist + coherencia de length | pid≠0 o fc inválido |
| S7comm | 6 | TPKT válido + COTP CR/CC (E0/D0) sin magic; o DT válido con payload < 8 | byte7 ∈ {0x32, 0x72} con cadena TPKT+COTP completa | TPKT inválido |
| DNP3 | 3 | start 05 64 + L plausible + payload < 10 (CRC no computable) | CRC válido sobre bytes 0-7 | CRC inválido → reject, nunca probable |
| IEC-104 | 2 | byte0 0x68 + L∈[4,253] + payload < L+2 | APCI completo + formato U/S/I válido | start≠0x68 o L fuera de rango |

DNP3 es el caso clave: CRC inválido no degrada a probable, descarta. El CRC es el validador fuerte.

### Peek policy (idéntica para los 4 protocolos)

- Primer paquete con payload por flujo y dirección, máx 256 B, máx 2 intentos por dirección (tolerar segmentación TCP), nunca reassembly.
- Veredicto cacheado por flow-key (5-tupla), LRU de 4096 flujos candidatos (reutilizar patrón TemplateCache: HashMap + BTreeMap by tick, clock inyectable, TTL, capacidad).
- Tras confirmed, no se vuelve a parsear.
- UDP (DNP3): un datagrama = un intento.

### Truncation (M1)

El presupuesto del bloque es **8192 B**. El peor caso se calcula con los topes, no con
un valor por evento aislado:

| Componente | Tope | Bytes máx/unidad | Peor caso |
|---|---|---|---|
| `events` | 8 | 384 | 3072 |
| `protocols` | 6 | 160 | 960 |
| `endpoints` | 16 | 200 | 3200 |
| Envoltorio (`engine`, `capture_mode`, `baseline_instance`, `truncated`) | — | — | 160 |
| **Total** | | | **7392** ≤ 8192 |

Un endpoint llega a 200 B porque `host` puede ser una IPv6 en claro (45 caracteres)
cuando `anonymize_hosts=false`; con HMAC son 16 hex.

- Events tienen la mayor prioridad de drop (últimos en caer); máximo 8 retenidos por ventana. Overflow incrementa `ot_events_overflow_total` y setea `truncated: true`.
- Cap por evento: 384 B (techo del validador; el presupuesto se consume por bytes medidos, no por 8×tope).
- Orden de llenado: events → protocols (bytes desc) → endpoints (bytes desc) hasta 8192 B.
- `truncated: true` si algo se drop.
- Drop order (least important first): endpoints, then protocols, then events.

### Pasivo-only enforcement (B4)

- `#![forbid(unsafe_code)]` en sc-ot (obligatorio) y sc-capture (verificado: sc-capture usa solo API safe de pcap, Capture::next_packet, sin sendpacket). Si una versión futura de pcap requiere unsafe, se necesita ADR antes de mergear.
- Clippy `disallowed-types`: `std::net::TcpStream`, `UdpSocket`, `socket2::Socket`.
- Clippy `disallowed-methods`: `TcpStream::connect`, `UdpSocket::send_to`, `pcap::Capture::sendpacket`, `libc::send/sendto/sendmsg/connect`.
- Test de grafo de dependencias: sc-capture/sc-ot no dependen de socket2, reqwest/hyper/ureq/axum, ni sc-sync (directa ni transitiva, incluyendo features).
- rg de respaldo: excluir `#[cfg(test)]` y `tests/`.
- Allowlist auditada: `ci/passive-allowlist.txt`.
- Egress permitido: sc-sync TLS 1.3 al endpoint cloud; /status en loopback. Todo lo demás prohibido.
- Seccomp por hilo: hardening F3+, trackeado en roadmap con milestone fechado.
- Riesgo residual: libpcap tiene capacidad de envío (`pcap_sendpacket`), inalcanzable por construcción (forbid unsafe + clippy + CI gate).

### Read model `ot_assets` (Spec 2)

Tabla persistente, excluida del cleanup 7/15/30 d. Stale derivado >30 d (sin UPDATE diario). Purge manual + auto opt-in >180 d.

Columnas (24): id, device_id (FK), host_key, first_seen, last_seen, seen_windows, role (client|server|both|unknown: agregado de `OtRole` —Appendix A—; `both` si el host inicia y responde), protocols (JSONB cap 6, el mismo tope del bloque `ot`), vendor (enum cerrado, Appendix A), vendor_source (oui|s7_tsap|manual; modbus_devid en F2), oui_prefix (3 B), model_hint, zone (texto libre, cap 64 chars), label, baseline_state (learning|armed|disabled), baseline_instance (UUID), baseline_epoch (u32), baseline_since (TIMESTAMPTZ), desired_baseline_state, desired_at, desired_by, intent_applied_at, peers (JSONB cap 64), risk_flags (JSONB). UNIQUE(device_id, host_key). Index solo (device_id, last_seen DESC). fillfactor=80.

Upsert (M6): 1 SELECT + 1 upsert multi-row + 1 insert batch alertas = ≤3 statements. Merge en TS: confianza monótona (max), unión de puertos, vendor manual gana, risk_flags sticky, espejo baseline por (instance, epoch, window_end) lexicográfico. Condición de apply: window_end_clamped − last_seen ≥ 300 s o cambio semántico {role, protocols/confianza/puertos, vendor, risk_flags, baseline_state/epoch}. first_seen = LEAST(window_end, server_now+120s) (clamp M1). seen_windows +1 solo en apply.

Stale: predicado `now() - last_seen > interval '30 days'`, computado en el SELECT (no persistido, sin cron UPDATE). UI filtra con `WHERE last_seen > now() - interval '30 days'` para vista activa.

### Baseline authority (B3)

Agente = única autoridad efectiva. Servidor = intención del operador + espejo. Reconciliación por (instance, epoch, window_end). Arming por reloj monotónico + ventanas observadas (no wall-clock). Persistencia: tabla `ot_baseline` en SQLite del agente con columnas (device_id, host_key, state, epoch, observed_windows INTEGER, armed_at, learning_started_at). observed_windows incrementa por ventana donde el host aparece. Arming threshold = 7 días AND ≥ N ventanas observadas (configurable, default 100). Reboot preserva contadores via SQLite. Reinstalación (baseline_instance mismatch) → reset a learning con audit log.

Intención diferida: dashboard PATCH → desired_baseline_state → downlink en respuesta de ingest → agente aplica → reporta estado efectivo → servidor marca intent_applied_at. SLA: ≤ intervalo sync + 30 s; offline → pending indefinido.

### Host identity (hashing)

host_key = primeros 16 hex chars de HMAC-SHA256(device_key, ip) **siempre**, en ambos modos de `anonymize_hosts` (B-029, `docs/plans/etapa-2-backlog.md:65`). No hay columna `identity_kind`: con B-029 sería estado muerto. `ip_display` es un campo aparte, poblado sólo cuando `anonymize_hosts` está inactivo y con retención de 7 días. Derivación idéntica en agente y almacenada verbatim por servidor; sin re-derivación server-side. Rotación de clave HMAC → nuevas identidades, sin reconciliación (D10). oui_prefix = primeros 3 bytes del OUI de la MAC (cuando visible en el segmento), nunca la MAC completa.

### Licencias (M7)

- libpcap (sensor Linux): BSD-3-Clause → notices.
- pcap crate (Rust): MIT/Apache-2.0 → notices.
- Npcap (Windows): proprietary, redistribución comercial requiere OEM → NO bundlear. Instalador detecta ausencia → prompt instalación user-provided.
- WinPcap: BSD-style, abandonado → no recomendado.

### Demo sintética (Spec 3 + M8)

Topología TEST-NET: 192.0.2.201 (PLC slave, fc3, vendor example-vendor con OUI sintético 00:00:00), 192.0.2.202 (SCADA master, fc3 polling), 192.0.2.203 (eng ws, fc16 burst → alerta ot_write_outside_hours), 192.0.2.204 (rogue master → alerta ot_new_master). Disclaimers: "Flujo Modbus sintético; no corresponde a tráfico real" + "Evidencia sintética" por alerta. Card changelog: "demo sintética del contrato OT". Badge tooltip: "confirmed requiere el artefacto sensor Linux; despliegues collector son port-only".

### Sensor Linux (Spec 4 + M3/M7)

Artefacto nuevo `...-linux-x64-sensor` (--features sc-capture/live). Modo `both` se mantiene (capacidad embarcada desde 0.1.0). Sin libpcap → degrada a colector con flag `ot_engine: "port_only"`. BPF default: config key `ot_segment_cidrs: list[string]` (CIDR). Default vacío = captura en todas las interfaces sin filtro BPF (con warning en /status). Validación: rechazar CIDRs inválidos al cargar config. systemd hardening: CAP_NET_RAW, NoNewPrivileges, ProtectSystem. Npcap no se bundlea sin OEM.

Config:
```toml
[capture]
mode = "collector"  # collector | live | both
bpf = "tcp port 502 or 102 or 2404 or 20000 or udp port 20000"

[capture.ot]
enabled = true
peek_bytes = 256
max_flows = 4096
ot_segment_cidrs = []  # vacío = todas las interfaces
```

### Alternatives Considered

#### Alternative A: nDPI vía FFI para identificación OT

- **Pros**: cobertura amplia de protocolos.
- **Cons**: LGPL-3 incómodo para modelo propietario; unsafe FFI en hot path; licencia incompatible con distribución.
- **Reason for Rejection**: parsers propios por protocolo (cabeceras pequeñas, encaje con header propietario sin fricción). nDPI queda como oráculo de validación en CI/lab si se desea.

#### Alternative B: Suricata parsers embebidos

- **Pros**: parsers Modbus/DNP3/ENIP/MQTT en Rust ya probados.
- **Cons**: GPL-2, no embebible en producto propietario.
- **Reason for Rejection**: excelente como oráculo de validación en CI/lab — comparar clasificación contra EVE log sobre mismos pcaps. No embebible.

#### Alternative C: "both" mode eliminado (YAGNI)

- **Pros**: reduce superficie de testeo.
- **Cons**: elimina capacidad embarcada desde 0.1.0 (PCAP + NetFlow concurrentes), rompe retrocompat con despliegues existentes.
- **Reason for Rejection**: se mantiene. El techo de confianza R5 es per-device solo para collector-only; el techo per-flow lo aplica el agente.

#### Alternative D: Baseline server-owned

- **Pros**: servidor computa desde first_seen/seen_windows, más simple server-side.
- **Cons**: agente offline 3 días con spool no sabe si está armed; contradice D1; mete cómputo por ingest.
- **Reason for Rejection**: agente es dueño (B3, opción A + plano de intención).

#### Alternative E: Baseline híbrido con validación

- **Pros**: flexibilidad.
- **Cons**: dos autoridades sobre la misma variable; grietas de consistencia (armed→learning con eventos ya emitidos).
- **Reason for Rejection**: viola "una sola autoridad" del brief. B3 cerrado con A.

## Non-Functional Requirements

- **Security & Privacy**: Clase C (payload) nunca sale del nodo. Vendor enum cerrado. Evidence unión discriminada cerrada. Sin strings libres ni MAC completa. SSRF: zone con cap 64 chars, model_hint con cap, label con cap. Parameterized queries (Drizzle).
- **Performance**: p95 ingest increase ≤ max(10% of baseline p95, 5 ms), medido en branch Neon con EXPLAIN ANALYZE + pg_stat_statements, baseline = mediana de 5 runs sobre código sin modificar. Cap 8 KB. Events última prioridad de drop. Fuzz no-panic. CPU ≤ 5% de un core en hot path. Watchdog de CPU/memoria.
- **Rollout & Rollback**: Server-first deploy (Zod/schema antes de agentes). Rollback = redeploy Zod anterior + `ot` sigue opcional. Feature flag del agente apagado por default hasta confirmar. Golden fixture 0.1.8 sin `ot` como test de regresión permanente.
- **Observability**: Counter `ot_validation_failures_total{reason}`. CU-h watchdog al 80% del budget mensual. `/status` con `ot_engine` (confirmed|port_only). Drop counters existentes.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Mid-stream misclassification (flujos longevos, primer payload a mitad de PDU) | Medium | High | Alineación acotada 0-7; golden pcaps con flujos mid-stream; property tests | sc-ot implementer |
| Neon CU-hour overrun | Medium | High | Conditional upsert (5 min o cambio semántico); ≤3 statements; CU-h watchdog 80% | web implementer |
| Baseline never arming (reboot mid-learning) | Low | High | Persisted counter in SQLite; arming threshold configurable; test scenario | sc-detect implementer |
| Passive invariant breach (accidental active probe) | Low | Critical | forbid(unsafe_code) + clippy disallowed + CI gate + dependency graph test | sc-capture implementer |
| Demo data leakage (synthetic shown as real) | Medium | Medium | Disclaimers + synthetic vendor label + badge tooltip | web implementer |
| modbus_devid enum dead state | Low | Low | Removed from F1 enum; added in F2 migration | sc-core implementer |

## Additional Resources

- `concepts_brief.md` (Priority 1 intake)
- `docs/contracts/window-snapshot.v1.schema.json` (normativo)
- `docs/contracts/ingest-api.v1.md` (§1.1)
- `sc-core/src/types.rs` (WindowSnapshot, top_asns precedent)
- `docs/adr/` (ADR-0021 ot-retention-exception, ADR-0022 passive-invariant — verificar next free number)
- `THIRD_PARTY_NOTICES.md` (libpcap, pcap crate)
- `docs/roadmap.md` (OQ5, OQ6 movidas aquí)

## Future Improvements

- **F1.5**: Promover MQTT/Sparkplug B si esfuerzo permite (barato de parsear, IIoT creciente).
- **F2**: OPC UA, EtherNet/IP, BACnet, MQTT/Sparkplug; OUI + fingerprint pasivo; inventario completo; modbus_devid vendor source; enum Purdue (zone).
- **F3**: Baseline de conversaciones + reglas OT con lifecycle + ATT&CK for ICS mapping; seccomp por hilo.
- **F4**: L2 (GOOSE/SV/PROFINET), JA4 para OPC UA/MQTT sobre TLS, long tail (GE SRTP, Omron FINS, MELSEC, HART-IP, EtherCAT, POWERLINK, CC-Link IE).
- **Hardening futuro**: seccomp por hilo denegando send*/connect en hilo de captura.

## Appendix A — Closed enums and references

### OtProtoId
`modbus_tcp`, `s7comm`, `s7comm_plus`, `dnp3`, `iec104`

### OtConfidence
`hint`, `probable`, `confirmed`

### OtRole
`client`, `server`, `unknown`

### Vendor (enum cerrado)
`siemens`, `rockwell`, `schneider`, `abb`, `moxa`, `unknown`

### VendorSource (F1)
`oui`, `s7_tsap`, `manual` (modbus_devid en F2)

### Evidence shapes (por regla)
- `ot_new_master`: `{ fn_codes: number[], baseline_days: number, baseline_epoch: number }`
- `ot_write_outside_hours`: `{ fn_codes: number[], hour: number, schedule: string }`
- `ot_program_download`: `{ function: number, block: string }` (F2 para DNP3)
- `ot_cpu_state_change`: `{ command: number }` (F2 para DNP3)
- `ot_it_zone_crossing`: `{ src_zone: string, dst_zone: string }`
  (antes `ot_ot_in_it_zone`; renombre por defecto pendiente de confirmación del propietario)

**Mapeo al contrato de alertas.** `Alert.evidence` es `Record<string,string>` con 1–32
claves y valor ≤128 caracteres: arrays → lista separada por comas (`"3,16"`), números →
decimal, strings sin recortes. La unión por regla se valida en Zod (`OtEvidence`) y serde;
el JSON Schema la declara plana (`rule` + claves opcionales) porque
`scripts/validate-contracts.js` no implementa `oneOf`.

### Markers & references

| Marker | Meaning | Source |
|---|---|---|
| M1 | Truncation priority (events last to drop) | concepts_brief.md Spec 1 §1.1 |
| M3 | "both" capture mode decision (maintained) | concepts_brief.md Spec 4, M3 |
| M4 | Probable conditions table (per protocol) | concepts_brief.md Spec 1 §1.3 |
| M7 | Pcap licensing matrix | concepts_brief.md Spec 4, M7 |
| M8 | Demo disclaimers (synthetic) | concepts_brief.md Spec 3, M8 |
| M9 | SSRF/injection surface (zone cap, model_hint cap) | concepts_brief.md Spec 2 |
| B1 | Retrocompat contract (schema + Zod + serde) | concepts_brief.md C1 R1-R6 |
| B2 | Retention exception (ot_assets not in cleanup) | concepts_brief.md C1 R2, ADR-0021 |
| B3 | Baseline authority (agent-owned) | concepts_brief.md C1 R3, D1 |
| B4 | Passive invariant enforcement | concepts_brief.md C1 R4, D9, ADR-0022 |
| D1 | Detection locality (agent-side) | concepts_brief.md D1 |
| D4 | Per-device assets (no cross-device fusion) | concepts_brief.md D4 |
| R4 | Idempotent replay (dedup ot.events) | concepts_brief.md C1 R4 |
| R5 | Server-side confidence ceiling | concepts_brief.md C1 R5 |
| C2 | Neon budget (Launch floor, <1 CU-h/mes marginal) | concepts_brief.md C2 |
| Spec 1-4 | Specs (contract, assets, demo, sensor) | concepts_brief.md Specs 1-4 |
| ADR-0021 | OT retention exception | docs/adr/ (verify next free number) |
| ADR-0022 | Passive invariant | docs/adr/ (verify next free number) |

### Acronym expansions

| Acronym | Expansion |
|---|---|
| OT | Operational Technology |
| ICS | Industrial Control Systems |
| PLC | Programmable Logic Controller |
| SCADA | Supervisory Control and Data Acquisition |
| MBAP | Modbus Application Protocol |
| TPKT | Transport Protocol (RFC 1006) |
| COTP | Connection-Oriented Transport Protocol (ISO 8073) |
| APCI | Application Protocol Control Information (IEC 60870-5-104) |
| ASDU | Application Service Data Unit (IEC 60870-5-104) |
| COT | Cause of Transmission (IEC 60870-5-104) |
| OUI | Organizationally Unique Identifier (IEEE 802) |
| BPF | Berkeley Packet Filter |
| LRU | Least Recently Used |
| CU-h | Compute Unit-hours (Neon billing metric) |
| SPAN | Switched Port Analyzer (port mirroring) |
| TAP | Test Access Point (network tap) |
| TSAP | Transport Service Access Point (S7) |
| CRC | Cyclic Redundancy Check |
| HMAC | Hash-based Message Authentication Code |
| Purdue | Purdue Enterprise Reference Architecture (IEC 62443 zones) |
| JA4 | TLS fingerprinting (passive) |
| F1/F2/F3/F4 | Phase 1/2/3/4 of M6 OT roadmap |

### Sizing rationale

| Constant | Value | Rationale | Source |
|---|---|---|---|
| ot block cap | 8 KB | top_asns precedent + gzip budget; peor caso calculado 7392 B; absorbible by /api/ingest body limit (512 KiB) | concepts_brief.md Spec 1 + E0 |
| LRU flow cache | 4096 | TemplateCache capacity precedent; covers p99 of single-segment flows | sc-collector TemplateCache |
| Peek bytes | 64–256 B | MBAP (7) + PDU (max 254) fits in 256; 64 for S7/IEC-104 headers | Spec 1 §1.2 |
| Peek attempts | 2 per direction | Tolerate TCP segmentation (1 full + 1 partial) | Spec 1 §1.2 |
| Inventory freshness | 5 min (300 s) | Assets change slowly; balances Neon write churn vs. visibility | concepts_brief.md C2 |
| Stale threshold | 30 days | OT assets are long-lived; stale = no traffic in 30 d | Spec 2 |
| Auto-purge | 180 days (opt-in) | Compliance retention; manual default for safety | Spec 2 |
| Learning period | 7 days | Baseline convergence for weekly OT cycles | concepts_brief.md D3 |
| Arming threshold | 100 observed windows | Prevents arming on sparse data | This doc (Issue 1 fix) |
| Endpoint cap | 16 | Covers p95 single-master Modbus plants; configurable 4–64, acotado por el presupuesto de 8 KiB | OQ4 |
| Protocol cap | 6 | Single plant rarely exceeds 3-4 protocols | Spec 1 |
| Event cap | 8 | Last-to-drop priority; overflow counted | Issue 8 fix |
| Event size cap | 384 B | Evidence cerrada; 8×384 = 3072 B, deja 8192 − 7392 = 800 B de margen | M1 + E0 |
| OUI prefix | 3 bytes | IEEE 802 OUI; never full MAC | G6 |
| Peers cap | 64 | Single master's slave list; bounded | Spec 2 |
| fillfactor | 80 | Reduce non-HOT updates on last_seen | M6 |
| CU-h watchdog | 80% | Alert before monthly budget exhaustion | C2 |
| CPU target | ≤5% one core | Hot-path budget for capture + peek + aggregation | D9 |

## Appendix B — DDL de `ot_assets`

Sin `identity_kind` (B-029): 24 columnas. La tabla queda **fuera** del mapa cerrado
`RETENTION_DAYS` (`web/lib/cleanup/retention.ts`) y su poda es propia (ADR-0021).

```sql
CREATE TABLE ot_assets (
  id                      text PRIMARY KEY,
  device_id               text NOT NULL REFERENCES devices(id),
  host_key                text NOT NULL CHECK (char_length(host_key) BETWEEN 8 AND 64),
  first_seen              timestamptz NOT NULL,
  last_seen               timestamptz NOT NULL,
  seen_windows            bigint NOT NULL DEFAULT 0,
  role                    text NOT NULL DEFAULT 'unknown'
                          CHECK (role IN ('client','server','both','unknown')),
  protocols               jsonb NOT NULL DEFAULT '[]'::jsonb
                          CHECK (jsonb_typeof(protocols) = 'array'
                                 AND jsonb_array_length(protocols) <= 6),
  vendor                  text NOT NULL DEFAULT 'unknown'
                          CHECK (vendor IN ('siemens','rockwell','schneider','abb','moxa','unknown')),
  vendor_source           text NOT NULL DEFAULT 'manual'
                          CHECK (vendor_source IN ('oui','s7_tsap','manual')),
  oui_prefix              bytea CHECK (oui_prefix IS NULL OR octet_length(oui_prefix) = 3),
  model_hint              text CHECK (model_hint IS NULL OR char_length(model_hint) <= 64),
  zone                    text CHECK (zone IS NULL OR char_length(zone) <= 64),
  label                   text CHECK (label IS NULL OR char_length(label) <= 64),
  baseline_state          text NOT NULL DEFAULT 'learning'
                          CHECK (baseline_state IN ('learning','armed','disabled')),
  baseline_instance       uuid,
  baseline_epoch          integer,
  baseline_since          timestamptz,
  desired_baseline_state  text
                          CHECK (desired_baseline_state IS NULL
                                 OR desired_baseline_state IN ('learning','armed','disabled')),
  desired_at              timestamptz,
  desired_by              text,
  intent_applied_at       timestamptz,
  peers                   jsonb NOT NULL DEFAULT '[]'::jsonb
                          CHECK (jsonb_typeof(peers) = 'array'
                                 AND jsonb_array_length(peers) <= 64),
  risk_flags              jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (device_id, host_key)
) WITH (fillfactor = 80);

CREATE INDEX ot_assets_device_last_seen_idx ON ot_assets (device_id, last_seen DESC);
```

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `agent/crates/sc-ot/` (Create — nuevo crate o módulo en sc-core)

- **Type / Scope**: Rust, parsers puros sobre `&[u8]`.
- **Proposed Changes**: Funciones de clasificación por protocolo (Modbus, S7, DNP3, IEC-104). Peek policy, LRU cache (reutilizar patrón TemplateCache), alineación acotada 0-7. Fuzz targets (`cargo-fuzz`) + property tests. Consumido por sc-aggregate (agregación) y sc-detect (evidencia reglas). Justificación: aislamiento de fuzz, hot path sin allocs. Re-evaluar crate split en F2 cuando se agreguen OPC UA/EtherNet/IP. Si solo hay un consumidor en F1, considerar módulo en sc-core.

#### 2. `agent/crates/sc-core/src/types.rs` (Modify)

- **Type / Scope**: Rust struct `WindowSnapshot`.
- **Proposed Changes**: Agregar `#[serde(skip_serializing_if = "Option::is_none")] pub ot: Option<OtBlock>`. Definir structs `OtBlock` (con `capture_mode`), `OtProtocol`, `OtEndpoint`, `OtEvent`. Sin `deny_unknown_fields` en struct que lee spool (tolerar downgrade).

#### 3. `docs/contracts/window-snapshot.v1.schema.json` (Modify)

- **Type / Scope**: JSON Schema normativo.
- **Proposed Changes**: Agregar propiedad `ot` (type: object, additionalProperties: false) con subesquemas OtProtocol, OtEndpoint, OtEvent. `ot` no en `required`. maxItems en arrays. Enum cerrado OtProtoId (Appendix A). Evidence como unión discriminada cerrada por rule. `capture_mode` en OtBlock.

#### 4. `web/lib/schemas/` (Modify — Zod)

- **Type / Scope**: TypeScript Zod schemas.
- **Proposed Changes**: `OtConfidence`, `OtProtoId`, `OtProtocol`, `OtEndpoint`, `OtEvent`, `OtBlock` (con `capture_mode`) Zod objects. Core schema con `ot: z.unknown().optional()`. `OtBlock.safeParse()` separado. `discardOtBlock()` helper + counter `ot_validation_failures_total{reason}`.

#### 5. `web/app/api/ingest/route.ts` (Modify)

- **Type / Scope**: API route.
- **Proposed Changes**: Dos pasadas de validación. Server-side confidence ceiling (capture_mode == "collector" → downgrade confirmed to hint). Upsert condicional `ot_assets`. Insert batch alertas con dedup R4. Downlink de intents en respuesta. Body-limit verificación +8 KB.

#### 6. `web/lib/ot/` (Create — nuevo módulo)

- **Type / Scope**: TypeScript module.
- **Proposed Changes**: `upsertOtAssets(deviceId, windowEnd, assets[])`. Pure `shouldUpsert(existing, incoming, windowEnd)` predicate con unit tests. Merge en TS. fillfactor=80 en migración.

#### 7. `web/lib/db/migrations/0017_ot-assets.sql` (Create — migración ot_assets)

- **Type / Scope**: migración SQL del runner `scripts/apply-migrations.mjs` (no `drizzle-kit`).
- **Proposed Changes**: `CREATE TABLE ot_assets` (DDL completo en **Appendix B**). Index (device_id, last_seen DESC). fillfactor=80. Exclusión del cron de cleanup (comentario en la migración). ADR-0021 referenciado.

#### 8. `agent/crates/sc-capture/` (Modify)

- **Type / Scope**: Rust crate.
- **Proposed Changes**: `#![forbid(unsafe_code)]` (verificado: solo API safe de pcap). Clippy disallowed types/methods. Peek policy implementada. BPF default por CIDR de segmento OT (config key ot_segment_cidrs). Modo `live|collector|both` (M3, se mantiene). Graceful degradation sin libpcap.

#### 9. `agent/crates/sc-detect/` (Modify)

- **Type / Scope**: Rust crate.
- **Proposed Changes**: Reglas OT per-protocol (matriz en Technical Plan). Baseline SQLite (tabla ot_baseline con observed_windows, sobrevive reinicios y compaction). Anti-storm collapse. Horario configurable en config.toml. Arming threshold configurable (default 100 ventanas + 7 días).

#### 10. `web/` — Demo sintética (Modify)

- **Type / Scope**: Next.js demo.
- **Proposed Changes**: Flujo Modbus sintético (4 hosts TEST-NET, vendor example-vendor con OUI sintético). Disclaimers "sintético" + "Evidencia sintética". Badge protocolo en matriz conexiones con tooltip. Tab "Activos OT" en Hosts. Contexto ot en RAG.

#### 11. `scripts/` — Packaging (Modify)

- **Type / Scope**: PowerShell scripts.
- **Proposed Changes**: Tercer artefacto Linux sensor en package-release.ps1 + SHA256SUMS.txt. verify-agent.ps1 actualizado (14→15 archivos). INSTALACION-LINUX-SENSOR.md via check-doc-versions.ps1. CI: verify-passive.sh (clippy + rg + grafo). Dry-run de package-release.ps1 y verify-agent.ps1 en verification plan.

#### 12. `docs/adr/` (Create — ADR-0021, ADR-0022)

- **Type / Scope**: ADR documents.
- **Proposed Changes**: ADR-0021: ot-retention-exception (B2). ADR-0022: passive-invariant (B4). Verificar next free number en docs/adr/ antes de crear.

#### 13. `docs/README.md` (Modify — registro)

- **Type / Scope**: Index.
- **Proposed Changes**: Registrar m6-passive-ot-identification.md en docs/README.md (map + status table) con link, fecha, autor, componentes, descripción.

### Verification Plan

- **Compilation/Build**: `cargo build --workspace`, `pnpm build` (web).
- **Unit Tests**: `cargo test --workspace`, `pnpm test` (web, Vitest).
- **Static Analysis & Linting**: `cargo fmt --check`, `cargo clippy -D warnings` (sc-capture, sc-ot con disallowed types/methods), `pnpm lint`, `pnpm typecheck`.
- **Contract Tests**: `scripts/verify-contracts.sh` (matriz de fixtures: 0.1.8 sin ot, ot válido, malformed → discard, oversize, evidence libre, collector→confirmed downgrade).
- **Passive Gate**: `verify-passive.sh` (clippy semántico + rg respaldo + grafo de deps/features).
- **Fuzz**: `cargo fuzz` en sc-ot (clasificación + contabilidad, no-panic).
- **Property Tests**: bytes aleatorios jamás producen DNP3 confirmed sin CRC válido.
- **Golden Pcaps**: sintéticos preferidos para CI (verificar licencia de 4SICS/Netresec antes de usar).
- **Performance**: p95 ingest increase ≤ max(10% of baseline p95, 5 ms), medido en branch Neon con EXPLAIN ANALYZE + pg_stat_statements.
- **CU-h Watchdog**: alerta al 80% del budget mensual.
- **Demo**: disclaimers verificados; changelog no afirma capacidad de agente.
- **Packaging**: dry-run de package-release.ps1 y verify-agent.ps1 sobre nuevo artefacto Linux sensor.

---

*Borrador con EGM. Correcciones de E0 aplicadas 2026-11-25; el detalle, el motivo y el estado de
cada una están en `docs/OT/plan-implementacion.md` §3 y el avance en `docs/OT/seguimiento.md`.*