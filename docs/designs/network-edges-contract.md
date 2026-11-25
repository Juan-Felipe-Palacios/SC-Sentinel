# Diseño — Contrato de aristas IT/OT (F1.5/F2)

**Author:** SC-Sentinel Team
**Status:** Borrador — no aprobado, no implementado
**Date:** 2026-11-25
**Revisión:** r2 (2026-11-25) — corrige identidad, presupuesto y límites tras revisión
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
| JSON Schema | `docs/contracts/window-snapshot.v1.schema.json` | `links`, `links_truncated`, `ot.links`; patrón de identidad en `ot.endpoints[].host` |
| Zod | `web/lib/schemas/ingest.ts:76-87` (`WindowSnapshotSchema`) | espejo exacto, con `.max()` y `.regex()` |
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
      "client": "0123456789abcdef0123456789abcdef",
      "server": "fedcba9876543210fedcba9876543210",
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
| `client` / `server` | string, **exactamente 32 hex minúsculas** | `host_key` = `format!("{u128:032x}")` del HMAC truncado (`agent/crates/sc-aggregate/src/host_mark.rs:33-35`). **Nunca** IP ni MAC; sin prefijo |
| `proto` | enum `tcp`\|`udp`\|`other` | el mismo enum de `top_ports` |
| `port` | integer 1–65535 | puerto del **servidor** (el destino) |
| `bytes` / `packets` | integer ≥ 0 | agregado de la ventana para esa tupla |
| `links` | array | `maxItems: 32`; ordenada por `bytes` desc |
| `links_truncated` | boolean, opcional | `true` si hubo más de 32 candidatos |

El par es **unidireccional** (quien inicia es `client`). Dos flujos al mismo
servidor/puerto con distinto puerto efímero del cliente se colapsan en una arista:
es una decisión explícita para no publicar puertos efímeros, que son cuasi-identificadores
y no aportan a la topología. La UI rotula la arista con el protocolo y el puerto.

En UDP no hay handshake: `client` es quien envió el primer paquete observado de la
ventana. Si la captura empieza a mitad de un flujo y no se vio el inicio, la arista
no se emite (se cuenta en un contador local, no se publica) antes que inventar una
dirección.

### 4.2 OT — `ot.links`

```json
{
  "ot": {
    "links": [
      {
        "client": "0123456789abcdef0123456789abcdef",
        "server": "fedcba9876543210fedcba9876543210",
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
| `client` / `server` | string, **exactamente 32 hex minúsculas** | la misma identidad que `ot.endpoints[].host` y `ot_assets.host_key` (§4.4) |
| `proto` | enum cerrado de los 5 ids | `modbus_tcp`\|`s7comm`\|`s7comm_plus`\|`dnp3`\|`iec104` (`docs/designs/m6-passive-ot-identification.md:432`) |
| `port` | integer 1–65535 | puerto del servidor del flujo |
| `bytes` | integer ≥ 0 | agregado de la ventana |
| `links` | array | `maxItems: 4` (ver §5.2), ordenada por `bytes` desc |

El enum incluye `s7comm_plus`: F1 reconoce S7 y S7+ con ids distintos, y colapsarlos
en el contrato obligaría al agente a mentir sobre el protocolo. Un enlace con un id
fuera del enum no existe por construcción.

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

### 4.4 Identidad: cómo unen las aristas con `ot_assets`

Esta sección resuelve el punto que la r1 dejaba mal afirmado («mismo espacio de
identidad que `endpoints`» sin demostrarlo).

**Hecho verificado en el código.** El agente emite la identidad de host como 32 hex
minúsculas: `format!("{key:032x}")` sobre 16 bytes de HMAC-SHA256
(`agent/crates/sc-aggregate/src/host_mark.rs:33-35`), con test que exige longitud 32
(`host_mark.rs:66`, `agent/crates/sc-aggregate/src/accumulator.rs:583`). `HostStats`
lleva `host_key` y `ip_display` como campos separados, y `ip_display` es `None`
cuando `anonymize_hosts = true` (`agent/crates/sc-core/src/types.rs:49-56`).

**La unión.** `ot.endpoints[].host` es ese mismo valor —el ejemplo de M6 dice
«misma derivación que `top_hosts`» (`docs/designs/m6-passive-ot-identification.md:186`)—,
y `ot_assets.host_key` es la misma cadena (`UNIQUE (device_id, host_key)`,
`docs/OT/plan-implementacion.md:574`). Entonces:

```
ot.links.client/server  ==  ot.endpoints[].host  ==  ot_assets.host_key  ==  host_stats.host_key
```

No hace falta un campo nuevo en `endpoints` ni una tabla de mapeo. El join es
igualdad de string, y es la única opción posible sin re-derivar: la clave HMAC vive
sólo en el nodo, así que el servidor **no puede** recalcular `host_key` a partir de
una IP (`host_mark.rs:21-30`).

**Garantía que se agrega en el mismo cambio de contrato.** `ot.endpoints[].host` y
las aristas OT llevan `pattern: "^[0-9a-f]{32}$"`. Sin ese patrón, un agente podría
publicar una IP en `host` y el join pasaría a depender de un valor de clase C.

**Defecto de M6 que hay que corregir de paso (documental, no de contrato):**

| # | Dónde | Dice | Realidad |
|---|---|---|---|
| 15 | `docs/designs/m6-passive-ot-identification.md:186` | `"host": "h_8f4b219e"` (10 chars, con prefijo) | 32 hex sin prefijo (`host_mark.rs:33-35`) |
| 16 | `docs/designs/m6-passive-ot-identification.md:331` | «primeros 16 hex chars» de HMAC | 32 hex: 16 bytes de tag (`host_mark.rs:5-11`) |
| 17 | `docs/OT/plan-implementacion.md:284` | endpoint 200 B porque `host` puede ser IPv6 en claro | `host` es la identidad (≤34 B con comillas); la IP va en `ip_display`, campo aparte |

El punto 17 no es cosmético: sobrestima el peor caso de `endpoints` en ~37 B por
unidad y es la razón por la que la r1 concluyó que 8 aristas OT no entraban (§5.3).

## 5. Presupuesto de tamaño

### 5.1 Costo exacto por arista

Con identidad de 32 hex y los máximos de cada tipo (`u64` = 20 dígitos, `u32` = 10,
puerto = 5, protocolo más largo = `s7comm_plus`):

| Campo | Cálculo | Bytes | IT | OT |
|---|---|---|---|---|
| `"client":"<32 hex>"` | 9 + 34 + 1 (coma) | 44 | ✓ | ✓ |
| `"server":"<32 hex>"` | 9 + 34 + 1 (coma) | 44 | ✓ | ✓ |
| `"proto":"tcp"` / `"s7comm_plus"` | 8 + 5 + 1 / 8 + 14 + 1 | 14 / 23 | 14 | 23 |
| `"port":65535` | 7 + 5 + 1 | 13 | ✓ | ✓ |
| `"bytes":<20 dígitos>` | 8 + 20 + coma | 28 IT / 28 OT | 29 | 28 |
| `"packets":4294967295` | 10 + 10 | 20 | 20 | — |
| Llaves `{}` | — | 2 | ✓ | ✓ |
| **Total por arista** | | | **166 B** | **154 B** |

El campo final no lleva coma: de ahí que `bytes` cueste 28 en OT (último) y 29 en IT.

Costo del array completo, incluido `"links":` (8 B) y las comas entre elementos:

| Conjunto | Cálculo | Bytes |
|---|---|---|
| `links` IT, 32 aristas | 2 + 32×166 + 31 + 8 = 5 353; + `"links_truncated":false,` (26) | **5 379** |
| `ot.links`, 4 aristas | 2 + 4×154 + 3 + 8 | **629** |
| `ot.links`, 8 aristas | 2 + 8×154 + 7 + 8 | **1 249** |

- **IT:** ≈5,3 KB sobre un techo de snapshot de 512 KB: sin riesgo. El cap 32 es de
  legibilidad y costo de agregación en el agente, no de payload.
- **OT:** 629 B para 4 aristas y 1 249 B para 8.

### 5.2 Escenario conservador: peor caso de `ot` según el plan (7 392 B)

El peor caso documentado del bloque `ot` es 7 392 B (`docs/OT/plan-implementacion.md`
§3.1: events 3 072 + protocols 960 + endpoints 3 200 + envoltorio 160):

| Escenario | Cálculo | Resultado |
|---|---|---|
| `ot.links` = 4 | 7 392 + 629 = 8 021 | **≤ 8 192** (margen 171 B) |
| `ot.links` = 6 | 7 392 + 2 + 6×154 + 5 + 8 = 8 331 | **excede** |
| `ot.links` = 8 | 7 392 + 1 249 = 8 641 | **excede** |

**Decisión del diseño:** `ot.links` se fija en **4** mientras rija la estimación
conservadora de 200 B/endpoint. Con ese supuesto, 4 es el mayor valor seguro: 5
aristas darían 8 176 B, un margen de 16 B que no resiste ninguna variación.

La estimación de §8 del plan (600–800 B para 8 links) queda corregida: con identidad
de 32 hex son 1 249 B, no 984.

### 5.3 Escenario con el tamaño real de endpoint: 8 aristas sí entran

`host` de endpoint es la identidad de 32 hex, no una IPv6 (§4.4). Su peor caso real:

| Campo del endpoint | Bytes |
|---|---|
| `"host":"<32 hex>"` + comas | 42 |
| `"port":65535` | 13 |
| `"proto":"s7comm_plus"` | 23 |
| `"role":"server"` | 16 |
| `"confidence":"confirmed"` | 25 |
| `"oui_vendor":"siemens"` | 23 |
| `"writes":4294967295` | 19 |
| Llaves `{}` | 2 |
| **Total** | **163** |

Con 16 endpoints a 163 B, el peor caso del bloque baja a 6 800 B (3 072 + 960 +
2 608 + 160). Entonces `ot.links` = 8 da **8 049 B ≤ 8 192** (margen 143 B) y 4 da
7 429 B.

**Corrige el informe anterior:** la r1 afirmó que «8 aristas OT no entran en el cap
de 8192 B». Eso vale sólo bajo la estimación de 200 B/endpoint, que el código
desmiente. Con el tamaño real, 8 caben con 143 B de margen, y 10 no (8 049 + 310 = 8 359). La decisión entre 4 y 8 es del propietario y se toma **después** de
medir en el paso 3 del rollout (§10), no por este cálculo.

### 5.4 Cota de memoria del agente

La tabla de aristas por ventana es estado nuevo en la ruta caliente: el acumulador
debe fijar `MAX_EDGES_TRACKED` (propuesta: 512 tuplas por ventana, desalojo por menor
`bytes`) antes de activar el flag. Sin esa cota, el presupuesto de CPU y memoria del
que habla AGENTS.md §10.2 no está medido ni acotado, y el cap de 32 aristas del
contrato no limita lo que el agente retiene en memoria.

## 6. Privacidad

- Las aristas usan **sólo `host_key`** (32 hex del HMAC, §4.4), incluso con
  `anonymize_hosts=false`. No se agrega una segunda vía de exposición de IP.
- El patrón `^[0-9a-f]{32}$` en `ot.endpoints[].host` y en las aristas cierra la
  puerta a que un agente publique una IP en el campo de identidad.
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
  client_key    text NOT NULL CHECK (client_key ~ '^[0-9a-f]{32}$'),
  server_key    text NOT NULL CHECK (server_key ~ '^[0-9a-f]{32}$'),
  proto         text NOT NULL CHECK (proto IN ('tcp','udp','other')),
  port          integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  bytes         bigint NOT NULL CHECK (bytes >= 0),
  packets       bigint NOT NULL CHECK (packets >= 0)
);
CREATE INDEX network_edges_window_idx ON network_edges (window_id);
```

- `id` determinista (`device_id:window_id:client:server:proto:port`), `ON CONFLICT
  DO NOTHING`: reenvío idempotente sin doble conteo, igual que `host_stats`.
- El CHECK de identidad replica el patrón del contrato: el read model no puede ser
  más permisivo que el contrato (`docs/OT/plan-implementacion.md` §3.3).
- Sin FK a `flow_windows`: la retención borra por `window_id` con el mismo criterio
  que `host_stats` (evita el costo de FK y mantiene el orden hoja → padre).
- Índice sólo por `window_id`; la consulta de topología agrega por `server_key` en el
  rango pedido. Medir `EXPLAIN` con datos reales antes de agregar un segundo índice.

### 7.2 OT: `ot_edges` o `ot_assets.peers`

| Opción | Ventaja | Costo |
|---|---|---|
| A. `ot_edges` por ventana, igual que `network_edges` | simetría, retención de 7 días, historia por ventana | segunda tabla casi idéntica y crecimiento proporcional a ventanas × aristas |
| B. Poblar `ot_assets.peers` desde `ot.links` | una tabla menos; `peers` ya existe y se retiene con el activo; la card necesita el grafo vigente, no su historia | hay que fijar la forma del JSONB antes de la primera escritura |

**Recomendación: B**, escrita en la fila de **cada extremo** para no perder la
dirección:

```json
{ "host_key": "0123456789abcdef0123456789abcdef",
  "proto": "modbus_tcp", "port": 502,
  "direction": "out", "last_seen": "2026-11-25T12:00:00Z" }
```

`direction` es `out` en la fila del cliente y `in` en la del servidor; el tope de 64
por fila ya existe en el CHECK (`docs/OT/plan-implementacion.md:115-116`). Desalojo
por `last_seen` ascendente cuando se supera el tope.

**Corrige el informe anterior:** la r1 justificó la opción B diciendo que cambiar la
forma de `peers` «exige ADR y migración de datos». Es falso: `0017_ot-assets.sql` no
existe (`ls web/lib/db/migrations | grep 0017` sin salida) y `web/lib/ot` tampoco, así
que la tabla nunca se creó y su forma se define desde cero sin migración. Lo que
requiere ADR es la retención de `network_edges` (0023), no un reshape.

## 8. Retención y limpieza

- `network_edges`: **7 días**, los mismos que `host_stats`, porque deriva de la misma
  ventana. Entra en `RETENTION_DAYS` (`web/lib/cleanup/retention.ts:22-32`) y en el
  runbook `docs/runbooks/database-cleanup.md`.
- Borrado antes de `flow_windows` (tabla hoja), en el mismo orden secuencial actual.
- Si se elige la opción B de §7.2, `peers` sigue la retención de `ot_assets`
  (ADR-0021), no la de la ventana.
- Un ADR nuevo (0023 al escribir esto) documenta tabla, días y motivo; sin ADR no se
  aplica la migración.
- **Rango mayor que la retención.** `QueryParamsSchema` acepta hasta `30d`
  (`web/lib/schemas/query.ts:9`) y la tabla guarda 7 días: pedir 30 d devolvería 23
  días vacíos sin aviso. `metric=topology` recorta el rango a la retención y responde
  `retention_days: 7` y `clamped: true`; la card rotula «últimos 7 días (retención)».
  Nunca 400 por rango: un rango amplio no es un error del cliente.

## 9. Lectura y UI

- Nuevo `metric=topology` en `web/lib/schemas/query.ts:6` y `web/app/api/query/route.ts`,
  con `device_id` + `range`; devuelve `{ nodes: [...], links: [...], truncated,
  retention_days, clamped }`.
- **Tope de nodos: 40**, el mismo de E8.1. `links` ≤32 puede producir hasta 64 hosts
  distintos, así que el read model ordena nodos por bytes desc, corta en 40 y descarta
  las aristas cuyos dos extremos no estén incluidos (`truncated: true`). Sin esto la
  card no tiene cota de render.
- `nodes` IT reutiliza `host_stats` (`host_key`, `ip_display`, `country`,
  `agent/crates/sc-core/src/types.rs:53-56`); `nodes` OT usa `ot_assets` (`label`,
  `zone`, `vendor`, `role`). No se agrega una fuente de nombres nueva.
- E8.1 reemplaza «rutas alertadas» por aristas reales; E8.2 reemplaza «exposición»
  por topología IT. Ambas mantienen el empty state y el aviso de truncado.
- La card debe seguir distinguiendo «sin datos» de «sin aristas»: un rango vacío no
  es una red sin enlaces.

## 10. Compatibilidad y rollout

El orden es obligatorio porque `additionalProperties: false` hace que un servidor
viejo **rechace** un agente nuevo:

1. Desplegar servidor con `links`/`links_truncated`/`ot.links` aceptados (N3, gate).
2. Publicar agente con la agregación detrás de flag local, default **off**.
3. Activar en un device de laboratorio; medir bytes reales por ventana, el tamaño de
   un endpoint y el costo de CPU de `MAX_EDGES_TRACKED` (§5.4); comparar con §5.1.
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
| L5 | `ot.links` con 4 aristas | 200; `ot_assets.peers` actualizado en ambos extremos con `direction` |
| L6 | `ot.links` con 5 aristas | bloque `ot` descartado + contador; HTTP 200 |
| L7 | Reenvío de la misma ventana | 200 `duplicate`; sin filas dobles |
| L8 | Cleanup a 8 días | `network_edges` borradas; `flow_windows` intactas |
| L9 | `metric=topology` con dos devices | sin mezcla de aristas entre devices |
| L10 | Rango sin datos | `links: []` + empty state, no «red vacía» |
| L11 | Arista con `client` de 16 o 31 hex | 400 en IT; bloque `ot` descartado en OT |
| L12 | `metric=topology&range=30d` | `clamped: true`, `retention_days: 7`, sin 400 |
| L13 | Topología con 60 hosts distintos | 40 nodos, `truncated: true`, sin aristas huérfanas |
| L14 | `ot.endpoints[].host` con una IP | bloque `ot` descartado (patrón de identidad) |
| L15 | `ot.links` con `proto: s7comm_plus` | 200; no se descarta el bloque |

## 12. Gates y decisiones abiertas

| # | Decisión | Dueño | Default propuesto |
|---|---|---|---|
| 1 | Aprobar el contrato de aristas (IT ≤32, OT ≤4, identidad 32 hex) | propietario | sí, en F1.5/F2 |
| 2 | Opción A o B de §7.2 para OT | propietario | B (`peers` con `direction` y `last_seen`) |
| 3 | Subir `ot.links` de 4 a 8 tras medir el endpoint real (§5.3) | propietario + ADR | no antes de medir |
| 4 | Retención de `network_edges` = 7 días | propietario + ADR-0023 | sí |
| 5 | Nombre definitivo del `metric` (`topology` vs `links`) | agente | `topology` |
| 6 | Numeración de la migración (0018 provisional) | agente al implementar | 0018 |
| 7 | Corregir los tres defectos de M6 de §4.4 (#15, #16, #17) | propietario (es su documento aprobado) | sí, mismo PR de contrato |

Ninguna se resuelve por cuenta del agente (AGENTS.md §13.7). La aprobación del
contrato no autoriza implementar: cada etapa necesita un "dale" que la nombre.

## 13. Cambios de esta revisión (r2)

| Sección | r1 | r2 |
|---|---|---|
| §4.1, §4.2 | identidad 8–64 | exactamente 32 hex, con `pattern` y espejo en Zod/serde |
| §4.2 | enum de 4 protocolos | 5 ids, incluido `s7comm_plus` |
| §4.4 | «mismo espacio de identidad que `endpoints`» sin prueba | join demostrado contra `host_mark.rs`, con patrón y defectos de M6 |
| §5 | 135/123 B por arista, endpoint 200 B | 166/154 B, arrays exactos, escenario con endpoint 163 B |
| §5.2 | 4 aristas por margen de 308 B | 4 aristas por margen de 171 B bajo la estimación conservadora |
| §5.4 | sin cota de memoria | `MAX_EDGES_TRACKED` |
| §7.2 | justificación de B con migración inexistente | corregida; B con `direction` por extremo |
| §8 | sin tratamiento del rango | clamp a retención con `clamped`/`retention_days` |
| §9 | sin tope de nodos | 40 nodos, aristas filtradas |
| §11 | 10 pruebas | 15, con identidad, rango, nodos y `s7comm_plus` |

## 14. PARADA

Borrador de diseño. No implementa captura, contrato, migración ni UI. Requiere
aprobación del propietario, ADR de retención y un cambio de contrato en un solo PR
para pasar a ejecución.
