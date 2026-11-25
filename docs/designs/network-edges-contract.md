# Diseño — Contrato de aristas IT/OT (F1.5/F2)

**Author:** SC-Sentinel Team
**Status:** Borrador — no aprobado, no implementado
**Date:** 2026-11-25
**Source:** `docs/OT/plan-implementacion.md` §8; gate del propietario

> Documento de diseño. **No** modifica contratos, esquemas, migraciones ni código.
> Todo cambio descrito acá requiere un "dale" explícito que nombre la etapa, un ADR
> de retención y el cambio de contrato en un solo PR (ADR-0001, AGENTS.md §3.2).

## 1. Objetivo y no-objetivos

**Objetivo.** Definir el cambio de contrato mínimo que permite dibujar una topología
real —no inferida— de enlaces IT y OT, y el read model que la sirve al dashboard,
reemplazando las cards honestas E8.1/E8.2 por mapas con aristas observadas.

**No-objetivos.**

- No implementar captura, parsing, persistencia ni UI en este documento.
- No exportar flujos individuales ni PCAP (D3 sigue vigente).
- No exponer IP, MAC ni payload en las aristas.
- No reemplazar `top_hosts`, `top_ports`, `top_countries` ni el bloque `ot` de F1.
- No habilitar retención mayor que la de la ventana que originó la arista.

## 2. Por qué hace falta un contrato nuevo

El contrato v1 es agregado por host y no publica pares origen–destino:

| Pieza | Qué publica | Qué falta | Evidencia |
|---|---|---|---|
| `host_stats` | bytes/packets/país/riesgo **por host** | `src → dst` | `web/lib/db/migrations/0000_init.sql:45-53` |
| `top_ports` | puerto + protocolo + bytes + conexiones | quién habla con quién | `docs/contracts/window-snapshot.v1.schema.json` (`top_ports`) |
| `ot.endpoints` | hosts OT con rol y protocolos | enlaces entre ellos | diseño M6 Appendix B |
| `ot.events` | sólo pares que dispararon una regla | pares que no alertaron | `docs/designs/m6-passive-ot-identification.md` (evidence por regla) |
| `ot_assets.peers` | JSONB cap 64 en el read model | campo de origen en el contrato que lo pueble | diseño M6 (`ot_assets`) |

La referencia UX ya lo declara: «No hay conexiones individuales en el esquema»
(`docs/ux/dashboard-wireframes.md:28`). Cualquier arista dibujada hoy con estos datos
sería inventada, y eso es lo que E8.1/E8.2 evitan deliberadamente.

## 3. Piezas afectadas (todas en un solo cambio)

| Pieza | Ubicación | Cambio |
|---|---|---|
| JSON Schema | `docs/contracts/window-snapshot.v1.schema.json` | `links`, `links_truncated`, `ot.links` |
| Zod | `web/lib/schemas/ingest.ts:76-87` (`WindowSnapshotSchema`) | espejo exacto, con `.max()` |
| serde | `agent/crates/sc-core/src/types.rs:193-201` (`WindowSnapshot`) | `Vec<Link>` + `Option<Link>` en `OtBlock` |
| Rutas de contrato | `docs/contracts/ingest-api.v1.md` §1.3 | topes nuevos |
| Agregación | `agent/crates/sc-agent` (ventana) | contadores por 5-tupla reducida |
| Ingest | `web/app/api/ingest/route.ts`, `web/lib/ingest/persist.ts` | validación y upsert |
| Migración | `web/lib/db/migrations/0018_network-edges.sql` (provisional; 0017 es `ot-assets`) | tabla nueva |
| Retención | `web/lib/cleanup/retention.ts:22-32`, `docs/runbooks/database-cleanup.md` | tabla y días |
| Privacidad | `docs/legal/privacy-policy-draft.md` | mención de la tabla |
| Viñetas | `docs/ux/dashboard-wireframes.md:28` | reemplazo del «no hay conexiones» |
| Fixtures | `docs/contracts/examples/`, `scripts/test-contracts-zod.mjs` | válido, truncado, con `ot.links` |

## 4. Contrato propuesto

### 4.1 IT — `snapshot.links`

```json
{
  "links": [
    {
      "client": "0123456789abcdef",
      "server": "fedcba9876543210",
      "proto": "tcp",
      "port": 443,
      "bytes": 18446744073709551615,
      "packets": 4294967295
    }
  ],
  "links_truncated": false
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `client` / `server` | string 8–64 | `host_key` (HMAC truncado). **Nunca** IP ni MAC |
| `proto` | enum `tcp`\|`udp`\|`other` | el mismo enum de `top_ports` |
| `port` | integer 1–65535 | puerto del **servidor** (el destino) |
| `bytes` / `packets` | integer ≥ 0 | agregado de la ventana para esa tupla |
| `links` | array | `maxItems: 32`; ordenada por `bytes` desc |
| `links_truncated` | boolean, opcional | `true` si hubo más de 32 candidatos |

El par es **unidireccional** (quien inicia es `client`). Dos flujos al mismo
servidor/puerto con distinto puerto efímero del cliente se colapsan en una arista:
es una decisión explícita para no publicar puertos efímeros, que son cuasi-identificadores
y no aportan a la topología. La UI rotula la arista con el protocolo y el puerto.

### 4.2 OT — `ot.links`

```json
{
  "ot": {
    "links": [
      {
        "client": "0123456789abcdef",
        "server": "fedcba9876543210",
        "proto": "modbus_tcp",
        "port": 502,
        "bytes": 1048576
      }
    ]
  }
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `client` / `server` | string 8–64 | `host_key`; mismo espacio de identidad que `endpoints` |
| `proto` | enum de los 4 F1 | `modbus_tcp`\|`s7comm`\|`dnp3`\|`iec104` |
| `port` | integer 1–65535 | puerto del servidor del flujo |
| `bytes` | integer ≥ 0 | agregado de la ventana |
| `links` | array | `maxItems: 4` (ver §5.2), ordenada por `bytes` desc |

Sin `packets`: el bloque `ot` ya está al límite de su presupuesto y las aristas OT
se usan para forma del grafo, no para volumen. El recorte usa el `truncated` que el
bloque ya tiene.

### 4.3 Reglas comunes

- **`additionalProperties: false`** en cada objeto de arista: el validador de CI lo
  soporta (`scripts/validate-contracts.js:28`).
- **Topes efectivos en Zod y serde**, no en el JSON Schema: el validador de CI no
  implementa `maxItems` (`scripts/validate-contracts.js:4-5`), igual que hoy con
  `top_hosts ≤ 50`. El `maxItems` del schema es documentación y espejo del límite.
- **Sin `oneOf`/`anyOf`**: el validador no los soporta; por eso IT y OT usan campos
  separados con enums distintos en lugar de una unión discriminada.
- **Arista OT inválida ⇒ se descarta el bloque `ot` completo** con
  `discardOtBlock()` y su contador; nunca 4xx por `ot` (invariante del diseño M6).
- **Arista IT inválida o `links` > 32 ⇒ 400** como cualquier violación del core,
  con `path` en `snapshot.links[i]` y sin eco del payload.
- `links` y `links_truncated` son **opcionales**: un agente 0.1.x que no los envía
  sigue validando (compatibilidad aditiva en v1).

## 5. Presupuesto de tamaño

### 5.1 Costo por arista (estimado por anchos de campo, no medido)

| Campo | Bytes máx | IT | OT |
|---|---|---|---|
| `"client":"<16 hex>"` | 28 | ✓ | ✓ |
| `"server":"<16 hex>"` | 28 | ✓ | ✓ |
| `"proto":"<valor>"` | 23 (`modbus_tcp`) / 14 (`tcp`) | 14 | 23 |
| `"port":65535` | 13 | ✓ | ✓ |
| `"bytes":<20 dígitos>` | 29 | ✓ | ✓ |
| `"packets":<10 dígitos>` | 21 | ✓ | — |
| Llaves `{}` | 2 | ✓ | ✓ |
| **Total** | | **135 B** | **123 B** |

- **IT:** 32 × 135 = 4 320 B (≈4,2 KB) sobre un techo de snapshot de 512 KB: sin
  riesgo. El cap 32 es de legibilidad y costo de agregación en el agente, no de payload.
- **OT:** 4 × 123 = 492 B; 8 × 123 = 984 B.

### 5.2 Hallazgo: 8 aristas OT no entran en el cap de 8192 B

El peor caso del bloque `ot` ya es 7 392 B (`docs/OT/plan-implementacion.md` §3.1:
events 3 072 + protocols 960 + endpoints 3 200 + envoltorio 160). Entonces:

| Escenario | Cálculo | Resultado |
|---|---|---|
| `ot.links` = 4 | 7 392 + 492 = 7 884 | **≤ 8 192** (margen 308 B) |
| `ot.links` = 8 | 7 392 + 984 = 8 376 | **excede 8 192** |

**Decisión del diseño:** `ot.links` se fija en **4** dentro del cap vigente. Si la
operación demuestra que 4 aristas por ventana no alcanzan, la salida es subir el cap
del bloque `ot` con un ADR y un cambio de contrato medido —no recortar `events`, que
es lo que alimenta las alertas—. La estimación de §8 del plan (600–800 B para 8 links)
queda corregida por este cálculo: 984 B.

## 6. Privacidad

- Las aristas usan **sólo `host_key`**, incluso con `anonymize_hosts=false`. No se
  agrega una segunda vía de exposición de IP: el mapa resuelve etiquetas con el mismo
  camino que la matriz de conexiones.
- Sin puertos efímeros del cliente (§4.1), sin MAC, sin payload, sin valores de registro.
- `bytes`/`packets` son agregados de ventana; no permiten reconstruir un flujo individual.
- La tabla nueva entra en `/legal/privacy` y en la limpieza (AGENTS.md §8.4).

## 7. Persistencia

### 7.1 Tabla `network_edges`

Espejo del patrón de `host_stats` (`web/lib/db/migrations/0000_init.sql:45-53`):

```sql
CREATE TABLE network_edges (
  id            text PRIMARY KEY,
  window_id     text NOT NULL,
  client_key    text NOT NULL,
  server_key    text NOT NULL,
  proto         text NOT NULL CHECK (proto IN ('tcp','udp','other')),
  port          integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  bytes         bigint NOT NULL CHECK (bytes >= 0),
  packets       bigint NOT NULL CHECK (packets >= 0)
);
CREATE INDEX network_edges_window_idx ON network_edges (window_id);
```

- `id` determinista (`device_id:window_id:client:server:proto:port`), `ON CONFLICT
  DO NOTHING`: reenvío idempotente sin doble conteo, igual que `host_stats`.
- Sin FK a `flow_windows`: la retención borra por `window_id` con el mismo criterio
  que `host_stats` (evita el costo de FK y mantiene el orden hoja → padre).
- Índice sólo por `window_id`; la consulta de topología agrega por `server_key` en el
  rango pedido. Medir `EXPLAIN` con datos reales antes de agregar un segundo índice.

### 7.2 OT: `ot_edges` o `ot_assets.peers`

Dos opciones; hay que elegir una en la etapa de implementación:

| Opción | Ventaja | Costo |
|---|---|---|
| A. `ot_edges` por ventana, igual que `network_edges` | simetría, retención de 7 días | segunda tabla casi idéntica |
| B. Poblar `ot_assets.peers` desde `ot.links` | una tabla menos; `peers` ya existe y se retiene con el activo | cambia la forma del JSONB: `{host_key, proto, port, last_seen}` |

**Recomendación: B**, con `peers` acotado a 64 y `last_seen` por par, porque la card
OT necesita el grafo vigente, no su historia por ventana. Cambiar la forma de una
columna existente exige ADR y migración de datos, así que la decisión es del
propietario, no del agente.

## 8. Retención y limpieza

- `network_edges`: **7 días**, los mismos que `host_stats`, porque deriva de la misma
  ventana. Entra en `RETENTION_DAYS` (`web/lib/cleanup/retention.ts:22-32`) y en el
  runbook `docs/runbooks/database-cleanup.md`.
- Borrado antes de `flow_windows` (tabla hoja), en el mismo orden secuencial actual.
- Si se elige la opción B de §7.2, `peers` sigue la retención de `ot_assets`
  (ADR-0021), no la de la ventana.
- Un ADR nuevo (0023 al escribir esto) documenta tabla, días y motivo; sin ADR no se
  aplica la migración.

## 9. Lectura y UI

- Nuevo `metric=topology` en `web/lib/schemas/query.ts:6` y `web/app/api/query/route.ts`,
  con `device_id` + `range`; devuelve `{ nodes: [...], links: [...], truncated }`
  agregando `network_edges` por par en el rango.
- `nodes` reutiliza la identidad y etiquetas que ya usa la matriz de conexiones; no
  se agrega una fuente de nombres nueva.
- E8.1 reemplaza «rutas alertadas» por aristas reales; E8.2 reemplaza «exposición»
  por topología IT. Ambas mantienen el empty state y el aviso de truncado.
- La card debe seguir distinguiendo «sin datos» de «sin aristas»: un rango vacío no
  es una red sin enlaces.

## 10. Compatibilidad y rollout

El orden es obligatorio porque `additionalProperties: false` hace que un servidor
viejo **rechace** un agente nuevo:

1. Desplegar servidor con `links`/`links_truncated`/`ot.links` aceptados (N3, gate).
2. Publicar agente con la agregación detrás de flag local, default **off**.
3. Activar en un device de laboratorio; medir bytes reales por ventana y comparar
   con §5.1.
4. Recién entonces activar por defecto y encender las cards.
5. Revertir = apagar el flag del agente; el servidor ignora `links` ausentes.

Un agente viejo contra servidor nuevo sigue funcionando: los campos son opcionales.

## 11. Plan de pruebas

| ID | Escenario | Criterio |
|---|---|---|
| L1 | Snapshot sin `links` (fixture 0.1.8) | valida y serializa idéntico; 200 |
| L2 | `links` con 32 aristas | 200; 32 filas en `network_edges` |
| L3 | `links` con 33 aristas | 400 con `path: snapshot.links` |
| L4 | Arista con `ip_display` o campo extra | 400 (`additionalProperties`) |
| L5 | `ot.links` con 4 aristas | 200; `ot_assets.peers` actualizado |
| L6 | `ot.links` con 5 aristas | bloque `ot` descartado + contador; HTTP 200 |
| L7 | Reenvío de la misma ventana | 200 `duplicate`; sin filas dobles |
| L8 | Cleanup a 8 días | `network_edges` borradas; `flow_windows` intactas |
| L9 | `metric=topology` con dos devices | sin mezcla de aristas entre devices |
| L10 | Rango sin datos | `links: []` + empty state, no «red vacía» |

## 12. Gates y decisiones abiertas

| # | Decisión | Dueño | Default propuesto |
|---|---|---|---|
| 1 | Aprobar el contrato de aristas (IT ≤32, OT ≤4) | propietario | sí, en F1.5/F2 |
| 2 | Opción A o B de §7.2 para OT | propietario | B (`peers` con `last_seen`) |
| 3 | Subir el cap `ot` si 4 aristas no alcanzan | propietario + ADR | no; primero medir |
| 4 | Retención de `network_edges` = 7 días | propietario + ADR-0023 | sí |
| 5 | Nombre definitivo del `metric` (`topology` vs `links`) | agente | `topology` |
| 6 | Numeración de la migración (0018 provisional) | agente al implementar | 0018 |

Ninguna se resuelve por cuenta del agente (AGENTS.md §13.7). La aprobación del
contrato no autoriza implementar: cada etapa necesita un "dale" que la nombre.

## 13. PARADA

Borrador de diseño. No implementa captura, contrato, migración ni UI. Requiere
aprobación del propietario, ADR de retención y un cambio de contrato en un solo PR
para pasar a ejecución.
