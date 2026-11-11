# Cálculo de `risk_score` por host

**Diagrama:** `docs/diagrams/mermaid/risk-score-calculation.mmd`.

## Determinista (agente, `sc-detect`)

`risk_score` ∈ [0.0, 1.0] es opcional y **determinista** (nunca salida de IA). Se asigna por host solo cuando una regla dispara; `bump_score` toma el máximo entre el score actual y el nuevo:

| Regla | Severidad | Score |
|---|---|---|
| `blacklist_hit` | Critical | 0.98 |
| `port_scan` (≥200 puertos) | Critical | 0.90 |
| `port_scan` (≥100) | High | 0.80 |
| `port_scan` (<100) | Medium | 0.65 |
| `inbound_port_scan` (≥200) | Critical | 0.90 |
| `inbound_port_scan` (≥100) | High | 0.80 |
| `inbound_port_scan` (<100) | Medium | 0.70 |
| `dns_tunneling` | High | 0.80 |
| `volume_anomaly` (×5 umbral) | High | 0.60 |
| `volume_anomaly` (umbral) | Medium | 0.45 |

Las reglas operativas (captura en error/degradada, drops, parse errors) generan alertas pero **no** asignan `risk_score` al host.

## Heurística cloud (respaldo, ADR-0005)

`web/lib/risk/heuristic.ts`. Solo actúa cuando el agente envía `risk_score: null` **y** `alerts: []`. Evalúa señales deterministas del payload (severidad de alertas, salud de captura, puertos de riesgo, ratio de paquetes caídos) y rellena `host_stats.risk_score` con un piso de banda baja. Agrega una alerta `cloud_heuristic` (dedup 1 h) solo si la ventana llega a banda media/alta y el agente no emitió alertas propias. **El valor del agente siempre tiene prioridad.**

## Bandas visuales

`web/lib/format.ts` → `riskTone`: `<0.4` bajo, `0.4–0.7` medio, `≥0.7` alto. Usadas en `RiskBadge`, `RiskSummary`, `TopHostsTable` y el heatmap del dashboard. Hosts sin score se muestran como “sin score”.