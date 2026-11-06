# UX — Wireframes del dashboard (M2/M3)

Fuente: spec §18.2. Grupo `(dashboard)` protegido por middleware + cookie admin. Refresco SWR cada 5 s. Los wireframes son descriptivos (texto), no gráficos definitivos.

## Shell común

```text
┌───────────────────────────────────────────────────────┐
│ Sidebar │  ┌── Header: global (rango temporal 1h/6h/24h/7d) ──┐ │
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
| Estado del agente | online / offline / degraded (badge grande) + versión del agente |
| Último snapshot | timestamp del último accepted + latencia de sync |
| Traffic chart | líneas bytes in/out (Recharts), rango temporal global |
| Top 5 hosts | host_key (o IP si no anon), país, bytes, riesgo |
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
