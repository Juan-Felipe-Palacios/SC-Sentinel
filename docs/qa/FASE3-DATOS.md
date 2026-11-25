# Fase 3 — Fidelidad de los datos reales (borrador, sin commitear)

> **Nota ronda 2 (2026-11-21):** este documento conserva los conteos de la ventana de 24 h y de la tabla completa en el momento de la corrida. La lectura posterior de producción dio **219.757 filas de `host_stats`**, **219.757 con `ip_display` no nulo**, **0 `host_key` con forma IPv4** y **4.607 hosts distintos**; `anonymize_hosts` está desactivado (default `false`, config sin la clave). Ver `REVISION-2026-11-21-RONDA2.md` §4. Los 26.610 de §2.4 son la rebanada de 24 h, no el total de la tabla.

Fecha: 2026-11-21. Dispositivo: `dev_bee8a7f6` (prefijo, 12 caracteres). Dispositivo con captura en línea, servicio `running`, `agent_version 0.1.9`, uptime 58 833 s.

## Nivel 1 — Agente local (`GET http://127.0.0.1:8387/status`)

- `capture_status=ok`, `packets_seen=884538`, `packets_dropped=0`, `parse_errors=0`, `queue_depth=0`, `spool_bytes=0`, `last_error` vacío, `geo_loaded/geo_country_loaded/geo_asn_loaded=true`, `mode=service`, `service_state=running`.
- `windows`: 60 ventanas de 30 s, de `2026-11-21T14:07:30.000Z` a `2026-11-21T14:37:00.000Z` (UTC, con `Z`).
- **Las ventanas son CONTINUAS**: 60 × 30 s = 1800 s; de 14:07:30 a 14:37:00 hay 59 intervalos de 30 s → sin huecos en el rango observado.
- `windows[].packets_seen` es **acumulativo** (no por ventana): 873 978 → 879 753 → 884 538. El valor del nivel superior (`packets_seen`) es igual al de la última ventana.
- `packets_dropped=0` y `parse_errors=0` en todas las ventanas del rango.

## Nivel 2 — Base de datos (ejecución 2 de 3; script en `%TEMP%\qa-db-1.mjs`)

### 2.1 Ventanas del agente vs BD (mismo rango de las 60 ventanas)

- 60/60 ventanas presentes en `flow_windows` para el device, **todas con datos** (`db_bytes > 0`).
- `sequence` correlativo 1795230645…1795230704 (30 s por paso).
- Ejemplos: 14:35:00 → 863 pkt / 429 725 B / 15 hosts / 7 ASN / 0 alertas; 14:37:00 → 4737 pkt / 4 188 848 B / 28 hosts / 8 ASN / 2 alertas.

### 2.2 Reconciliación de paquetes agente ↔ BD (59 ventanas comparables)

| Magnitud | Valor |
|---|---|
| Ventanas comparables | 59 |
| Coincidencias exactas | **0** |
| Agente > BD | 58 |
| Agente < BD | 1 |
| Δ mínima / máxima | −5 / +1105 paquetes |
| Σ delta agente | 65 377 |
| Σ paquetes BD (`SUM(host_stats.packets)`) | 60 150 |
| Diferencia absoluta | **+5 227 (+8,69 %)** |

Ejemplos: 14:08:00 agente 260 vs BD 210 (+23,8 %); 14:13:30 704 vs 340 (+107 %); 14:24:30 7049 vs 5944 (+18,6 %); 14:25:00 17 494 vs 17 264 (+1,3 %).

**Causa confirmada en el código (no es corrupción):** `packets_seen` se incrementa en el hilo de captura por **cada paquete recibido de Npcap**, antes de la disección y de la atribución a un flujo: `agent/crates/sc-capture/src/live.rs:87` y `agent/crates/sc-capture/src/driver.rs:65` (`thread_packets_seen.fetch_add(1, …)`), expuesto en `sc-telemetry/src/lib.rs:14`. En cambio, el dashboard suma `host_stats.packets`, que solo contiene los paquetes **atribuidos a hosts/flujo** (`web/lib/query/overview.ts`). Los paquetes no atribuibles (no IP, malformados, descartados antes de la atribución) cuentan en el agente y no en la BD.
**Veredicto:** *diferencia explicada* (contadores con distinto alcance), **no** un defecto de datos. Sí es un problema de **etiquetado**: el dashboard dice "PAQUETES TOTALES" cuando es el total atribuido, no el capturado.

### 2.3 Totales (1 h)

| Métrica | Valor |
|---|---|
| ventanas | 119 (con host_stats: 119; con asn_stats: 119) |
| paquetes (`SUM(host_stats.packets)`) | 130 923 |
| bytes_in / bytes_out | 72 131 026 / 25 467 912 (total 97 598 938) |
| filas de host (suma por ventana) | 1 917 |
| hosts únicos (`COUNT(DISTINCT host_key)`) | **196** |
| máximo de hosts en una ventana | 33 |
| países distintos (excl. LAN/null) | 9 |
| ASN distintos | 21 |
| bytes ASN | 96 704 257 |
| suma de `asn.hosts` / máximo | 1 650 / 17 |
| bytes de `snapshot_json.top_ports` | 97 598 938 (**igual** al total de host_stats) |
| conexiones de `top_ports` | 7 088 |
| alertas | 32 |
| filas `agent_health` | 120 |
| primera/última ventana | 13:55:30 / 14:54:30 |

**Diferencias de agregación observadas:**
- `SUM(host bytes) = 97 598 938` = `SUM(snapshot top_ports bytes)` → consistente.
- `SUM(asn.bytes) = 96 704 257` → **894 681 B (0,92 %) menos** que el total: los hosts sin ASN (LAN/privados) no entran en `asn_stats`.
- `hosts` tiene tres valores posibles y todos son correctos con su semántica: **196 únicos** en el rango, **1 917** suma de hosts por ventana (con repetición), **33** máximo por ventana. Cualquier UI que muestre "hosts" debe decir cuál usa.

### 2.4 Totales (24 h)

| Métrica | Valor |
|---|---|
| ventanas | 1 623 (con host_stats 1 586; con asn_stats 1 580) |
| paquetes | 1 880 082 |
| bytes_in / bytes_out | 1 360 285 995 / 226 123 139 (total 1 586 409 134) |
| filas de host | 26 610 |
| hosts únicos | 695 (máx. por ventana 50) |
| países distintos | 19 |
| ASN distintos | 44 |
| bytes ASN | 1 567 319 068 (**19 090 066 B / 1,2 % menos** que el total) |
| alertas | 424 |
| primera/última ventana | 2026-11-20 14:55:30 / 2026-11-21 14:54:30 |

### 2.5 Huecos, duplicados y ventanas vacías (24 h)

| Comprobación | Resultado |
|---|---|
| Huecos > 60 s | **1** — de **37 710 s (10 h 28 min)** |
| Ventanas sin bytes | **37** de 1 623 (2,28 %) — coinciden con las 37 ventanas **sin ninguna fila** en `host_stats` |
| Duplicados `(device_id, window_id)` | **0** |
| Duplicados globales de `window_id` | **0** |

- El hueco de 10,5 h es un paro real del agente (o de la máquina) dentro de las últimas 24 h: legítimo, pero es el mayor problema de continuidad.
- Las 37 ventanas "sin bytes" no tienen filas en `host_stats` (no es que tengan bytes en 0): o estuvieron dentro del hueco, o el agente envió la ventana sin atribución.

### 2.6 Integridad (huérfanos)

| Consulta | Resultado |
|---|---|
| `host_stats` sin `flow_windows` correspondiente | **14** |
| `asn_stats` huérfanos | 0 |
| `alerts` huérfanos | 0 |
| `alert_notes` / `alert_audit_log` huérfanos | 0 / 0 |
| `ingest_batches` sin ventanas | 0 |
| `flow_windows` sin batch | 0 |
| `ai_insights` sin device | 0 |

**Causa raíz estructural:** en `web/lib/db/schema.ts` las columnas `window_id` de `host_stats` (línea 42), `asn_stats` (línea 57) y `alerts` (línea 84) son `text` **sin `.references()`** a `flow_windows`; solo hay un índice (`host_stats_window_idx`, línea 52). No hay integridad referencial entre las tablas de métricas y las ventanas. Los 14 huérfanos lo confirman en datos.

### 2.7 Retención (mínimos / máximos / conteos)

| Tabla | min | max | filas |
|---|---|---|---|
| flow_windows | 2026-11-14 20:39:00 | 2026-11-21 14:54:30 | 17 704 |
| host_stats | 2026-11-14 22:16:00 | 2026-11-21 14:54:30 | 206 557 |
| asn_stats | 2026-11-14 22:16:00 | 2026-11-21 14:54:30 | 67 361 |
| agent_health | 2026-11-14 20:48:33 | 2026-11-21 14:55:02 | 17 705 |
| alerts | 2026-11-14 22:20:30 | 2026-11-21 14:53:30 | 5 406 |
| ingest_batches | 2026-11-14 20:48:33 | 2026-11-21 14:55:02 | 17 704 |
| ai_insights | 2026-11-17 04:30:32 | 2026-11-21 14:46:19 | 187 |
| devices | 2026-11-12 22:24:50 | 2026-11-14 20:47:04 | 2 |
| export_logs / chat_messages / trust_pages | — | — | **0 / 0 / 0** |

- Antigüedad mínima ≈ **6,78 días** → la retención vigente es de **7 días** y el cron de limpieza **sí está borrando** lo vencido (`flow_windows` no arrastra datos de antes del 14/11).
- Inconsistencia menor: `host_stats`/`asn_stats`/`alerts` empiezan 1 h 37 min DESPUÉS que `flow_windows` (20:39 vs 22:16) → las primeras ventanas existen sin métricas asociadas.

### 2.8 Tamaño por tabla (`pg_total_relation_size`)

| Tabla | bytes |
|---|---|
| host_stats | 50 003 968 |
| flow_windows | 44 072 960 |
| asn_stats | 17 735 680 |
| ingest_batches | 7 888 896 |
| agent_health | 5 505 024 |
| alerts | 3 342 336 |
| ai_insights | 671 744 |
| devices | 81 920 |
| chat_conversations / chat_messages | 49 152 / 49 152 |
| operators / sc_schema_migrations / trust_page_access_logs / export_logs / trust_pages | 32 768 c/u |
| alert_notes / alert_audit_log | 24 576 c/u |
| **Total aproximado** | **≈ 129,7 MB** |

`export_logs`, `chat_messages` y `trust_pages` están **vacías** (0 filas) pese a existir la funcionalidad → nadie exportó, nadie chateó y no hay Trust Pages creadas.

### 2.9 Ledger de migraciones vs archivos

- Tabla `sc_schema_migrations (name, applied_at)`.
- **17 entradas en el ledger = 17 archivos en `web/lib/db/migrations/`** (0000_init.sql … 0016_asn-stats.sql) → **coinciden exactamente**.
- `0000`…`0015` aplicadas el 2026-11-12 20:46:48–20:47:07; `0016_asn-stats.sql` el 2026-11-14 21:54:14.

### 2.10 Alertas (24 h)

| severidad | estado | n |
|---|---|---|
| critical | open | 11 |
| high | open | 31 |
| medium | open | 382 |
| **total** | | **424** |

**Todas en `open`**: ni un solo `acknowledged` ni `resolved` en 24 h → no hay triage en producción. Tampoco hay severidades `low`/`info` en el rango.

### 2.11 `ai_insights` (conteos)

- Total **187**; `no_traffic` **19** (10,16 %), todas con `model=deterministic-fallback` y todas el 2026-11-17 (04:30–13:00); después de ese día no hubo más `no_traffic`.
- Última corrida: **2026-11-21 14:46:19**; último período: 14:44:30 → 14:45:00.
- **12 modelos distintos** usados; concentración: `openai/gpt-oss-120b` 129 (69 %), `gemini-3.6-flash` 16, `gemini-3.5-flash` 7, `dots-studio/dots-3-note-preview:free` 5, y 8 modelos `:free` de OpenRouter con 1–3 corridas cada uno (rotación/pruebas).
- `status` solo toma `ok` y `no_traffic`: **no hay filas con estado de error** (los errores no se persisten como estado).
- **Ronda 2:** la lectura posterior da 198 filas; Gemini acumula 24 `ok` (17 de `gemini-3.6-flash` + 7 de `gemini-3.5-flash`), última 2026-11-21 20:15Z. El chat, en cambio, responde con Groq porque `resolveProvider()` prioriza `GROQ_API_KEY`. Ver `REVISION-2026-11-21-RONDA2.md` §3.
- Coste total 0 USD en todas; latencia media: `gpt-oss-120b` 2 658 ms; `gemini-3.6-flash` 11 080 ms; `gemini-3.5-flash` 10 071 ms; modelos `:free` de OpenRouter 10 815–22 690 ms.
- Tokens: `gpt-oss-120b` 149 610 in / 136 427 out.

## Niveles 3 y 4 (API e interfaz) — PENDIENTES

Requieren sesión de administrador (propietario). Quedan pendientes:
- `/api/query` con admin para los mismos rangos y comparación exacta contra estos SQL.
- Extracción de valores de gráficos/tablas vía DOM y comparación contra la API (3 rangos × 2 vistas por métrica).
