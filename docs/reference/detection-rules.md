# Referencia — reglas de detección (`sc-detect`)

**Código:** `agent/crates/sc-detect/src/lib.rs`. **Tests:** `cargo test -p sc-detect`.

## Reglas v1 (IT)

| rule_id | Alcance | Condición (resumen) | Severidad |
|---|---|---|---|
| `blacklist_hit` | peer remoto | destino en blacklist local | Critical |
| `port_scan` | host local | ≥20 puertos dst distintos, ≥20 conexiones salientes, ≤3 intentos/puerto | Medium/High/Critical |
| `inbound_port_scan` | peer remoto | ≥20 puertos locales distintos tocados, ≥20 conexiones entrantes, ≤3 intentos/puerto | Medium/High/Critical |
| `dns_tunneling` | host local | ≥100 consultas DNS, ≥64 KB, promedio ≥100 bytes/consulta | High |
| `volume_anomaly` | peer remoto | ≥100 MB totales en la ventana (×5 → High) | Medium/High |
| `capture_error` | health | `capture_status == Error` | Critical |
| `capture_degraded` | health | `capture_status == Degraded` | High |
| `packet_drops` | health | drops ≥100 y ratio ≥5% | High |
| `parse_errors` | health | parse_errors ≥10 | Medium |

## Umbrales por defecto (`DetectorConfig::default`)

`port_scan_min_ports=20`, `port_scan_min_connections=20`, `port_scan_max_connections_per_port=3`; `dns_min_queries=100`, `dns_min_bytes=64KiB`, `dns_min_avg_bytes=100`; `volume_min_bytes=100MiB`; `drop_ratio_percent=5.0`, `min_drops=100`, `min_parse_errors=10`; `max_alerts=50`.

## Propiedades

- **Determinista y explicable:** sin estado entre ventanas; umbrales absolutos; la IA nunca produce alertas (ADR-0005).
- **Orden y tope:** alertas ordenadas por severidad, rule_id y host; truncadas a `max_alerts`.
- **Privacidad:** con `anonymize_hosts=true` el destino y la etiqueta de blacklist se redactan.
- **Risk score:** `bump_score = max` por host; solo hosts con regla disparada. Ver `docs/visuals/risk-score-calculation.md`.

## Reglas OT (M6 — pendientes de implementación)

> **Estado: no implementadas.** `agent/crates/sc-detect/src/lib.rs` no contiene reglas OT
> todavía: esta sección fija el contrato que debe implementar la etapa E6 de
> `docs/OT/seguimiento.md`. Las firmas de protocolo y la política de peek viven en
> `docs/designs/m6-passive-ot-identification.md` (Appendix B incluido).

| rule_id | Protocolos F1 | Condición (resumen) | Severidad |
|---|---|---|---|
| `ot_new_master` | los cuatro | client/master con confianza `confirmed` fuera de los peers del baseline `armed` | High |
| `ot_write_outside_hours` | Modbus (fc 5/6/15/16/22/23), S7comm (0x05 write), IEC-104 (C_SC/C_SE) | escritura fuera del horario laboral configurado (opt-in) | Medium |
| `ot_program_download` | S7comm (0x1A/0x1B/0x1C) | descarga de bloque o función al PLC | High |
| `ot_cpu_state_change` | S7comm (0x28 PLC control, 0x29 PLC stop) | cambio de estado de la CPU | High |
| `ot_it_zone_crossing` | los cuatro | par cliente/servidor con `zone` (Purdue) distinta | Medium |

Notas de alcance:

- **Modbus TCP no tiene** `ot_program_download` ni `ot_cpu_state_change`: fc 43 es Read
  Device ID y el protocolo no expone control de CPU. Atribuírselos produce reglas que
  nunca pueden dispararse.
- **DNP3 en F1** emite sólo `ot_new_master` y `ot_it_zone_crossing`. Los function codes de
  aplicación (write 0x02, operate 0x04/05, restart 0x0D/0x0E) exigen caminar bloques CRC
  de 16 B → F2.
- `ot_it_zone_crossing` se llamaba `ot_ot_in_it_zone` (prefijo duplicado). El renombre se
  aplica antes de que el id entre en `alerts`; queda pendiente de confirmación del
  propietario.

### Evidencia (mapeo al contrato de alertas)

`Alert.evidence` es `Record<string,string>` con 1–32 claves y valor ≤128 caracteres:
arrays → lista separada por comas (`"3,16"`), números → decimal. La unión por regla se
valida en Zod y serde; el JSON Schema la declara plana (`rule` + claves opcionales) porque
`scripts/validate-contracts.js` no implementa `oneOf`.

### Baseline y umbrales (M6)

- Aprendizaje **7 días y ≥100 ventanas observadas** (configurable) → `armed`.
- Autoridad: el **agente** (SQLite `ot_baseline` con `observed_windows`); el servidor es
  espejo del estado reportado y autoridad sólo sobre la intención del operador.
- **Anti-storm:** mismo `rule_id` + par cliente/servidor con alerta abierta → collapse.
- Todo evento lleva `proto`, `client`, `server` y evidencia cerrada; nunca payload,
  valores de registro ni MAC completa.
