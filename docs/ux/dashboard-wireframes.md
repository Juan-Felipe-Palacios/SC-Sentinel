# UX — Wireframes del dashboard (M2/M3)

Fuente: spec §18.2. Grupo `(dashboard)` protegido por middleware + cookie admin. Refresco SWR cada 5 s. Los wireframes son descriptivos (texto), no gráficos definitivos.

## Shell común

```text
┌───────────────────────────────────────────────────────┐
│ Sidebar │  ┌── Header: global (rango temporal 15m/1h/6h/24h/7d/30d) ──┐ │
│ overview│  │                                                     │
│ hosts   │  │  contenido de la vista                              │
│ conns   │  └─────────────────────────────────────────────────────┘ │
│ alerts  │                                                        │
│ ai      │                                                        │
│ settings│                                                        │
└───────────────────────────────────────────────────────┘
```

## 1. Overview

| Zona | Contenido |
|---|---|
| Estado del agente | online / offline / degraded (badge grande) + los seis campos de `agent_health`: paquetes capturados, descartados, tasa de descarte, errores de parseo, cola y spool, más último error |
| Último snapshot | timestamp del último accepted + latencia de sync |
| KPIs consolidados | bytes totales (con reparto in/out), paquetes totales, alertas con desglose por severidad, hosts únicos + países observados |
| Traffic chart | selector de seis vistas sobre los mismos datos, rango temporal global: línea bytes in/out (default), stream graph apilado, Sankey host → dirección → país, mapa geoespacial con arcos, radar de puertos y protocolos, velocímetro radial de throughput |
| Top 10 hosts | hostname (DNS inverso) > IP > `host_key`; país, paquetes, bytes y banda de riesgo (alto ≥0.7 / medio ≥0.4 / bajo) |
| Puertos y protocolos | top 10 puertos por bytes con servicio conocido, protocolo, conexiones + distribución TCP/UDP/otros |
| Tráfico por país | top 5 países por bytes con hosts y % del total; la API agrega desde `host_stats` (el `snapshot_json` no siempre trae `top_countries`) |
| Riesgo del sistema | nivel global (alto/medio/bajo), score promedio, hosts por banda; sin tendencia hasta tener comparación de períodos |
| Alertas recientes | últimas 5 con severity chip |
| Estado de IA | ok / degraded + fecha del último insight |

## 2. Hosts

- Tabla (TanStack Table) disponible con filtros: búsqueda por host/IP, país, riesgo (min).
- Columnas: IP/`host_key` · país · bytes in · bytes out · paquetes · riesgo · última actividad.
- Sortable por cualquier columna.
- `anonymize_hosts=true` ⇒ columna IP muestra `host_key` (regla de contrato).

## 3. Connections

- Nota editorial: NO hay flujos individuales en la DB (solo agregados).
- Top conexiones por puerto/protocolo (tabla + barras).
- Distribución por país (Recharts pie/bar, `top_countries` de snapshots 5 s).

## 4. Alerts

- Tabla con filtros: severity, rule_id, estado (open/acknowledged/resolved).
- Columnas: fecha · severity · regla · título · estado.
- Detalle al click: descripción + `evidence` expandible (valores seguros, escape React obligatorio).
- Acciones: acknowledge, resolve (asociadas al ciclo de vida `alert-lifecycle.mmd`).

## 5. AI

- Último análisis: summary + risk_level + findings list + recommendations list.
- Meta: modelo usado · estado (ok/degraded) · período del lote.
- "Hechos usados" expandible (el mismo JSON de hechos agregados que ingirió el modelo).
- Botón "Analizar ahora" → POST `/api/ai/analyze` (respuesta `{cached:true}` si hace < 5 min).

## 6. Settings

- Device token: oculto con botón mostrar; **plaintext visible una sola vez** al crear (ADR-0010).
- Eliminación permanente del device (revoca su token y borra sus datos) con confirmación en 2 pasos.
- `anonymize_hosts` (estado actual, editable solo si el agente lo permite; campo sincronizado con config del agente).
- Retención configurada (solo lectura en v1 — proviene de la política §12.1).
- Estado de sync: último éxito, backoff actual, estado (idle/sending/backoff/needs_enrollment/dead_letter).
- Salud del agente: métricas detalladas del último health snapshot.
