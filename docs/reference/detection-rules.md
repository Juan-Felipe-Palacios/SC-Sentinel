# Referencia — reglas de detección (`sc-detect`)

**Código:** `agent/crates/sc-detect/src/lib.rs`. **Tests:** `cargo test -p sc-detect`.

## Reglas v1

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