# Plan de implementación — M6 OT (F1)

## 1. Estado del documento

- **Versión:** 1.0 — 2026-11-25.
- **HEAD de referencia:** `68aac69`.
- **Alcance:** identificación pasiva de Modbus TCP, S7comm (incl. S7comm+), DNP3 e
  IEC 60870-5-104; bloque `ot` aditivo en `WindowSnapshot` v1; read model
  `ot_assets`; demo sintética; artefacto sensor Linux.
- **Autoridad:** este documento manda sobre
  `docs/designs/m6-passive-ot-identification.md` en todo lo que lo contradiga,
  porque las correcciones de §3 están medidas contra el repositorio y la base
  reales, no derivadas del diseño. El diseño sigue siendo la descripción del
  sistema y la fuente de las firmas byte a byte.
- **Estado del milestone:** **aprobado el 2026-11-25** con **F1 OT en allowlist +
  descubrimiento manual**; el baseline automático queda para F1.5/F2
  (`docs/plans/etapa-2-backlog.md:49`). E2.0 está desbloqueada; E2 depende de E2.0
  y E3–E10 (incl. E8.1/E8.2) del checkpoint E2.0/E2. La aprobación no autoriza
  ejecución.
- **Cards de red (solicitud del propietario, 2026-11-25):** dos cards en
  `/dashboard/connections`: «Mapa OT observado» (E8.1) y «Mapa de exposición IT»
  (E8.2). No son topologías completas: el contrato actual no publica aristas; la
  topología real queda en §8 (F1.5/F2) y requiere decisión del propietario.

## 2. Factibilidad medida

Todo lo de esta tabla se comprobó en el repo y en la base el 2026-11-25. Lo que no
se pudo comprobar figura en §7.

| Dimensión | Hecho medido | Evidencia | Veredicto |
|---|---|---|---|
| Toolchain Rust | 1.99.1 instalada y activa dentro de `agent/` | `agent/rust-toolchain.toml`; `cargo --version` → `1.99.1` | sin fricción |
| Crate nuevo | `members = ["crates/*"]`, 11 crates hoy | `agent/Cargo.toml` | `sc-ot` entra sin tocar el workspace |
| `forbid(unsafe_code)` | 0 apariciones de `unsafe` en `sc-capture`; sólo API safe (`Capture::from_device`), sin `sendpacket` | `agent/crates/sc-capture/src/` | aplicable sin refactor |
| Presupuesto de red | 512 KiB descomprimidos / 128 KiB comprimidos por request | `web/lib/ingest/read-body.ts:6-7` | un bloque de 8 KiB ocupa 1,6 % |
| Base | PostgreSQL 18.7 · 17 tablas en `public` · 8,8 MB · 1 device · 36 filas en `host_stats` | consulta de sólo lectura a Neon | migración limpia |
| `ot_assets` | `to_regclass('public.ot_assets')` → `null` | consulta de sólo lectura | sin colisión de nombre |
| Ledger de migraciones | `sc_schema_migrations` 17 filas (0000–0016); `drizzle.__drizzle_migrations` 13 filas, última `1794450000000` | consulta + `web/lib/db/migrations/meta/_journal.json` | ledger único = el del runner (§5) |
| Patrón de escritura | `sql` crudo, ids deterministas, `ON CONFLICT DO NOTHING`, una transacción no interactiva | `web/lib/ingest/persist.ts:1-24, 88-170` | el upsert de OT sigue ese patrón (§5) |
| Validación de ingest | una sola pasada: `IngestEnvelopeSchema.safeParse` | `web/app/api/ingest/route.ts:104` | hay que partirla en dos |
| Aristas de red | `host_stats` es por host (sin src/dst); `top_ports` no publica pares; `ot.events` sólo cubre alertas y `ot_assets.peers` no tiene campo de origen en el contrato | `web/lib/db/migrations/0000_init.sql:45-53`; `web/lib/schemas/ingest.ts:76-87`; `docs/ux/dashboard-wireframes.md:28`; diseño `:309` | topología real fuera de F1 (§8) |
| Baseline p95 | 1 device y 36 filas | consulta | **inmedible**: se sustituye por gate estructural (§4, E7) |

## 3. Diez correcciones al diseño

Cada fila cita el diseño original y da el valor correcto. No son preferencias: son contradicciones internas o errores de dato.

> **Nota de vigencia:** las líneas citadas corresponden al diseño **antes** de E0 (588 líneas).
> Con las correcciones aplicadas el archivo mide 658 líneas y el contenido se desplazó; los
> valores de la columna «Corrección» son los vigentes y prevalecen sobre la cita.

| # | Diseño dice | Corrección | Por qué |
|---|---|---|---|
| 1 | Cap del bloque `ot` = 4096 B, y "512 B por evento → 8×512 = 4 KB peor caso" (`:273-274`, `:496`) | Cap **8192 B** con tabla de peor caso (§3.1) | 8 eventos de 512 B ya consumen el total; sumados protocols y endpoints el peor caso es 6800 B |
| 2 | El ítem 7 remite a "schema completo, Appendix A" (`:537-540`), pero Appendix A (`:406`) sólo tiene enums | **Appendix B** con el `CREATE TABLE` de 24 columnas y sus CHECK (§3.2) | sin DDL no hay migración posible |
| 3 | Ruta `web/db/migrations/` (`:537`) | `web/lib/db/migrations/0017_ot-assets.sql` | `web/db/` no existe; la real es `web/lib/db/migrations/` |
| 4 | `identity_kind (ip\|hmac)` (`:294`, `:308`) | se elimina de F1 (24 columnas) | B-029 (`docs/plans/etapa-2-backlog.md:112`) fija `host_key` como HMAC en ambos modos: la columna queda como estado muerto |
| 5 | Modbus TCP con `ot_program_download` y `ot_cpu_state_change` (`:121-122`) | Modbus: `ot_new_master`, `ot_write_outside_hours`, `ot_it_zone_crossing`; S7: las cinco; DNP3: `ot_new_master`, `ot_it_zone_crossing`; IEC-104: `ot_new_master`, `ot_write_outside_hours`, `ot_it_zone_crossing` | Modbus no tiene descarga de programa ni control de CPU (fc 43 es Read Device ID); esos comandos son S7 0x1A/0x1B/0x1C y 0x28/0x29 |
| 6 | U-frame IEC-104 `{0x07, 0x13, 0x2B, 0x0B, 0x43, 0x83}` (`:246`) | `{0x07, 0x0B, 0x13, 0x23, 0x43, 0x83}` | `0x2B` no es un U-frame válido y falta `0x23` (STOPDT con) |
| 7 | El ejemplo del snapshot incluye `"v": 1` (`:169`) | quitarlo | `v` vive en el envelope; el snapshot es `additionalProperties: false` |
| 8 | `OtEvent.evidence` tipada por regla (`:426-428`) sin mapeo a `Alert.evidence` | mapeo explícito: arrays → CSV, números → decimal, máx 32 claves, valor ≤128 chars | `Alert.evidence` es `Record<string,string>` con 1–32 claves (`web/lib/schemas/ingest.ts:36-48`) |
| 9 | "OQ5/OQ6 movidas a `docs/roadmap.md`" | añadirlas al roadmap o corregir la afirmación | `docs/roadmap.md` no contiene OQ5 ni OQ6 |
| 10 | Encabezado: "22 fixes applied from goldfish_review_report.md" | estado real: borrador, con las correcciones de este documento pendientes de aplicar | el reporte citado está sin versionar y sólo 3 de sus 8 puntos eran ediciones válidas |

### 3.1 Presupuesto del bloque `ot` (8192 B)

| Componente | Tope | Bytes máx/unidad | Peor caso |
|---|---|---|---|
| `events` | 8 | 384 | 3072 |
| `protocols` | 6 | 160 | 960 |
| `endpoints` | 16 | 163 | 2608 |
| Envoltorio (`engine`, `capture_mode`, `baseline_instance`, `truncated`) | — | — | 160 |
| **Total** | | | **6800** ≤ 8192 |

Un endpoint llega a 163 B con los campos del Appendix A en su máximo: `host` es la
identidad del host de 32 hex (34 B con comillas), no una IP; `ip_display` es un
campo aparte de `HostStats` (`agent/crates/sc-core/src/types.rs:53-56`) y no existe
en `ot.endpoints`. El orden de llenado y de drop
se mantiene: se llena events → protocols → endpoints, y se descarta en orden
inverso (endpoints primero, events último).

### 3.2 Appendix B — DDL de `ot_assets` (24 columnas)

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
  baseline_state          text NOT NULL DEFAULT 'disabled'
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

Sin `identity_kind` (corrección 4). Sin `updated_at`: la frescura se deriva de
`last_seen`. La tabla queda **fuera** del mapa cerrado `RETENTION_DAYS`
(`web/lib/cleanup/retention.ts:22-32`) y su poda es propia (ADR-0021).

### 3.3 Correcciones posteriores a E0 (2026-11-25)

Detectadas al revisar la coherencia entre el read model, el contrato y el Appendix de
topes. No cambian el presupuesto ni las firmas.

| # | Inconsistencia | Corrección |
|---|---|---|
| 11 | `ot_assets.role` admitía `master`/`slave`, mientras el contrato (`endpoints[].role`) y `OtRole` (Appendix A) usan `client`/`server`/`unknown` | `role IN ('client','server','both','unknown')`; `both` es el agregado por host cuando inicia y responde en la ventana |
| 12 | El DDL de `ot_assets.protocols` aceptaba hasta 8 elementos, pero el bloque `ot` y el Appendix de topes cortan en 6 | `jsonb_array_length(protocols) <= 6`, el mismo tope del contrato |

El read model no puede ser más permisivo que el contrato: si el agente nunca puede
enviar 7 protocolos ni un rol `master`, la tabla no debe poder almacenarlos. La fuente
del enum es `OtRole` del Appendix A; el DDL sólo agrega `both` para el agregado por host.

### 3.4 Cambio de alcance aprobado (2026-11-25): allowlist en F1 OT

La aprobación de M6 fija F1 OT en **allowlist + descubrimiento manual**, no en
baseline automático.

| # | Diseño previo | Alcance F1 aprobado |
|---|---|---|
| 13 | `ot_new_master` contra peers del baseline `armed`, con `baseline_days`/`baseline_epoch` | `ot_new_master` contra la allowlist del dispositivo; evidencia `{ fn_codes, allowlist_version }` |
| 14 | `ot_baseline` SQLite, arming 7 días/≥100 ventanas, intención diferida | Diferido a F1.5/F2; `baseline_*` en `disabled`/null y sin transiciones server-side |

El DDL de §3.2 conserva las columnas `baseline_*` para F2 y el default de
`baseline_state` pasa a `disabled`; F2 lo vuelve a `learning` al iniciar el baseline.
E6 se reduce a la regla de allowlist, la configuración local y el anti-storm.

## 4. Etapas

Convención: cada etapa es un cambio cerrado. `Depende de` se refiere al estado
`hecho` de otras etapas. Todas requieren "dale" explícito que nombre la etapa.

### E0 — Correcciones documentales

- **Alcance:** aplicar las 10 correcciones de §3 al diseño; escribir las secciones
  OT de `docs/reference/data-model.md` y `docs/reference/detection-rules.md` (hoy
  tienen 0 coincidencias con OT: hay que autoras, no consultarlas); reescribir
  `goldfish_review_report.md` sin "resolved" y con 24 columnas.
- **Archivos:** `docs/designs/m6-passive-ot-identification.md`,
  `docs/reference/data-model.md`, `docs/reference/detection-rules.md`,
  `docs/roadmap.md`, `goldfish_review_report.md`.
- **No toca:** `docs/README.md` ni `docs/legal/THIRD_PARTY_NOTICES.md` (ya indexan
  m6 y ya declaran libpcap y el crate `pcap`).
- **Hecho:** diff revisado contra §3, punto por punto.
- **Verificación:** `git diff --stat` + revisión; no hay build.
- **Aborto:** ninguno; es documental.

### E1 — ADRs y retención

- **Alcance:** ADR-0021 (excepción de retención de `ot_assets`) y ADR-0022
  (invariante pasivo); actualizar `docs/runbooks/database-cleanup.md`.
- **Archivos:** `docs/adr/0021-ot-assets-retention-exception.md`,
  `docs/adr/0022-passive-invariant.md`, `docs/runbooks/database-cleanup.md`.
- **Depende de:** —
- **Hecho:** ADRs con número libre (0021 y 0022; el último existente es 0020) y el
  runbook nombrando la tabla y su poda propia.
- **Verificación:** `ls docs/adr | tail -3` y revisión del diff.
- **Aborto:** si el propietario rechaza la excepción de retención, `ot_assets` entra
  en `RETENTION_DAYS` y el ADR no se escribe: se registra la decisión en el
  roadmap.

### E1.5 — Ledger único y patrón de escritura

Resuelve las dos ambigüedades detectadas en la base y en el código. Detalle en §5.

- **Archivos:** `web/drizzle.config.ts`, `scripts/verify-migration-ledger.mjs`
  (nuevo), `docs/runbooks/apply-db-migrations.md`, `docs/reference/data-model.md`.
- **Depende de:** —
- **Hecho:** `drizzle.config.ts` con `out` fuera del directorio del runner;
  checker que falla con drift; runbook con el ledger único y la prohibición de
  `drizzle-kit`; patrón `persist.ts` documentado con la excepción de contadores.
- **Verificación:** §5.4.
- **Aborto:** ninguno; no toca datos.

### E2.0 — Spike de firmas (pendiente; aprobación ya otorgada)

- **Alcance:** 4 fixtures binarios mínimos (Modbus, S7comm, DNP3 con CRC válido e
  inválido, IEC-104) y un test que verifica los offsets de las firmas corregidas.
- **Archivos:** `agent/crates/sc-core/tests/ot_signatures.rs` (o el módulo que
  corresponda) + fixtures.
- **Depende de:** E0 (firmas corregidas escritas); aprobación de M6 **otorgada el
  2026-11-25** con F1 OT en allowlist.
- **Hecho:** los 4 protocolos clasifican según la tabla normativa M4 del diseño;
  el resultado alimenta el checkpoint E2.0/E2.
- **Verificación:** `cd agent && cargo test -p sc-core ot_signatures`.
- **Aborto:** si 2 o más protocolos no alcanzan la tabla, M6 vuelve a diseño y **no**
  se escribe contrato. Se registra en la bitácora.

### E2 — Contrato `ot` en un solo cambio (bloqueado por E2.0)

- **Alcance:** bloque `ot` opcional en el JSON Schema, Zod y serde, más fixtures;
  evidencia de allowlist (`allowlist_version`) en lugar de baseline.
  `evidence` va **plano** en el schema (`rule` + claves opcionales) con la unión
  estricta validada en Zod/serde, porque el validador de CI
  (`scripts/validate-contracts.js`) no implementa `oneOf`.
- **Archivos:** `docs/contracts/window-snapshot.v1.schema.json`,
  `web/lib/schemas/ingest.ts`, `agent/crates/sc-core/src/types.rs:193-201`,
  `docs/contracts/examples/` (hoy `examples/` está vacío: el golden 0.1.8 hay que
  generarlo, no existe).
- **Depende de:** E2.0.
- **Hecho:** `scripts/verify-contracts.sh`, `scripts/validate-contracts.js` y
  `scripts/test-contracts-zod.mjs` en verde con 4 fixtures: 0.1.8 sin `ot`, válido,
  malformado y oversize.
- **Verificación:** `bash scripts/verify-contracts.sh`;
  `node scripts/validate-contracts.js`;
  `cd web && node --experimental-strip-types ../scripts/test-contracts-zod.mjs`;
  `cd web && pnpm test`.
- **Aborto:** si el schema no puede expresarse sin `oneOf`, se mantiene plano y la
  unión se valida sólo en Zod/serde (decisión ya prevista).

### E3 — Migración 0017 y upsert (bloqueado)

- **Alcance:** `web/lib/db/migrations/0017_ot-assets.sql` (DDL de §3.2) y
  `web/lib/ot/` con `upsertOtAssets` + `shouldUpsert` puro.
- **Archivos:** migración, `web/lib/ot/upsert.ts`, tests.
- **Depende de:** E2, E1.
- **Hecho:** `--dry-run` lista 0017 como pendiente y 0 después de aplicarla en base
  local; `retention.test.ts` afirma que `ot_assets` **no** está en `RETENTION_DAYS`;
  test de conteo de statements (patrón `persist.test.ts`); test de que reaplicar la
  misma ventana no incrementa `seen_windows`.
- **Verificación:** `node scripts/apply-migrations.mjs --env-file web/.env.local --dry-run`
  y `cd web && pnpm test`.
- **Aborto:** si el DDL no pasa en PostgreSQL 18.7 local, se corrige antes de tocar
  cualquier base remota.

### E4 — Crate `sc-ot` (bloqueado)

- **Alcance:** 4 parsers puros sobre `&[u8]`, peek LRU 4096, alineación 0–7.
- **Archivos:** `agent/crates/sc-ot/` (nuevo; `crates/*` lo toma solo).
- **Depende de:** E2.
- **Hecho:** fuzz no-panic y property test "DNP3 `confirmed` exige CRC válido".
- **Verificación:** `cargo fmt --check --all`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace`, `cargo fuzz` sobre los targets nuevos.
- **Aborto:** si el hot path asigna memoria, se rediseña antes de integrar.

### E5 — `sc-capture` (bloqueado)

- **Alcance:** `#![forbid(unsafe_code)]`, clippy `disallowed-types`/`disallowed-methods`,
  peek 256 B con 2 intentos, BPF por `ot_segment_cidrs`, degradación a colector con
  `ot_engine: "port_only"`.
- **Archivos:** `agent/crates/sc-capture/src/lib.rs`, `live.rs`, `.clippy.toml` o
  atributos equivalentes.
- **Depende de:** E2.
- **Hecho:** compila con `--features live` y sin ella; el gate de clippy detecta un
  `TcpStream::connect` introducido a propósito en un test de control.
- **Verificación:** `cargo clippy --workspace --all-targets --features sc-capture/live -- -D warnings`
  y `cargo test -p sc-capture`.
- **Aborto:** si `pcap` exige `unsafe` en una versión futura, ADR previo antes de
  mergear (el diseño ya lo exige).

### E6 — `sc-detect` (bloqueado)

- **Alcance:** reglas de §3 corrección 5; `ot_new_master` contra la allowlist local
  del agente (`host_key` + `proto` + puerto), anti-storm y dedup. Sin `ot_baseline`,
  sin arming y sin transiciones de baseline en F1 (F1.5/F2).
- **Archivos:** `agent/crates/sc-detect/`, configuración local de allowlist.
- **Depende de:** E4.
- **Hecho:** test de miembro/no miembro de allowlist, anti-storm y reintento sin
  duplicar alertas; no hay contador de aprendizaje que preservar.
- **Verificación:** `cargo test -p sc-detect`.
- **Aborto:** si la allowlist no se puede representar sin strings libres, se acota a
  `host_key` + `proto` + `port` (máximo 64 entradas) antes de integrar.

### E7 — `/api/ingest` (bloqueado)

- **Alcance:** dos pasadas (core + `OtBlock.safeParse`), techo de confianza
  server-side, upsert condicional, downlink de intents; conservar `client` y
  `server` del evento OT en `Alert.evidence` (sólo `host_key`) para E8.1.
- **Archivos:** `web/app/api/ingest/route.ts`, `web/lib/ingest/persist.ts`.
- **Depende de:** E2, E3.
- **Hecho:** ≤3 statements extra y `EXPLAIN` sin scan nuevo; fixture 0.1.8 sin `ot`
  sigue devolviendo 200; una alerta OT conserva `client`/`server` en `evidence`.
- **Verificación:** `cd web && pnpm test`, `pnpm typecheck`, `pnpm lint`.
- **Aborto:** el gate p95 no se aplica (inmedible con 1 device / 36 filas); se
  mantiene el criterio estructural y se registra como deuda medida.

### E8 — UI (bloqueado)

- **Alcance:** badge de protocolo en la matriz de conexiones y tab "Activos OT".
  Las cards de red se detallan en E8.1/E8.2.
- **Depende de:** E3.
- **Hecho:** build verde y la tab lista lo que hay en `ot_assets` sin datos
  sintéticos.
- **Verificación:** `cd web && pnpm typecheck && pnpm lint && pnpm build`.
- **Aborto:** —

### E8.1 — Card «Mapa OT observado» (bloqueado)

- **Alcance:** card en `/dashboard/connections` con nodos de `ot_assets` activos
  (≤30 d) y aristas **sólo** de pares cliente/servidor que aparecen en alertas OT
  (`alerts.evidence.client/server`, persistidos en E7). Si no hay aristas, muestra
  nodos y el aviso «sin aristas observadas»; no inventa enlaces. Layout SVG
  determinista por rol (clientes a la izquierda, servidores a la derecha), sin
  dependencia nueva; nodos ≤40 y aristas ≤80, sólo entre nodos incluidos; etiqueta
  `label` o `host_key`, nunca IP ni MAC.
- **Archivos:** `web/components/dashboard/NetworkMapCard.tsx` (nuevo),
  `web/components/dashboard/OtNetworkMap.tsx` (nuevo), `web/lib/query/ot-topology.ts`
  (nuevo), `web/app/api/query/route.ts`, `web/lib/schemas/query.ts`,
  `web/lib/api-types.ts`, `web/lib/demo/synthetic.ts`, tests.
- **Depende de:** E7 (evidencia client/server), E8 (tab y estilos).
- **Hecho:** `metric=ot_topology` responde con nodos/aristas acotados; un device sin
  `ot_assets` muestra empty state; no hay IP/MAC ni aristas inventadas; build verde.
- **Verificación:** `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build`;
  prueba con un device sin OT y con el fixture sintético.
- **Aborto:** si `alerts.evidence` no conserva client/server, la card se limita a
  inventario (nodos) y se registra; no se agrega telemetría en esta etapa.

### E8.2 — Card «Mapa de exposición IT» (bloqueado)

- **Alcance:** card en `/dashboard/connections` con los top hosts del período
  agrupados por país y sus puertos principales. **No dibuja aristas**: el contrato
  actual no publica pares origen-destino; se rotula «exposición», no «topología».
  Reusa `metric=overview` (`top_hosts`, `top_countries`, `top_ports`); sin API nueva.
  Nodos ≤12, países ≤6; sin identificadores nuevos.
- **Archivos:** `web/components/dashboard/NetworkMapCard.tsx` (compartido),
  `web/components/dashboard/ItExposureMap.tsx` (nuevo),
  `web/components/dashboard/ConnectionsView.tsx`, tests de la función pura de layout.
- **Depende de:** E8 (estilos de la sección).
- **Hecho:** con datos reales muestra hosts/países/puertos; con `hosts=[]` muestra
  empty state; no hay aristas inventadas; build verde.
- **Verificación:** `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- **Aborto:** si el resultado se confunde con topología, se renombra a «Exposición
  IT» o se retira la card; no se agregan aristas sin §8.

### E9 — Demo sintética (bloqueado)

- **Alcance:** topología TEST-NET con 4 hosts, las dos cards (OT/IT) con datos
  sintéticos y los disclaimers "Flujo Modbus sintético; no corresponde a tráfico
  real" y "Evidencia sintética"; el changelog no afirma capacidad de agente antes
  del embarque.
- **Depende de:** E8.1, E8.2.
- **Hecho:** la demo muestra el badge `confirmed`, las dos cards y los dos
  disclaimers visibles.
- **Verificación:** `pnpm build` + revisión del texto.
- **Aborto:** si la demo toca el dispositivo de producción o datos OT, se detiene
  (AGENTS.md §8.5).

### E10 — Empaquetado y CI (bloqueado)

- **Alcance:** `scripts/verify-passive.sh` + job en CI; artefacto
  `linux-x64-sensor` en `package-release.ps1` (hoy `ValidateSet('windows-x64','linux-x64')`,
  línea 23); `verify-agent.ps1` 14→15 archivos.
- **Depende de:** E5, E6.
- **Hecho:** dry-run de `package-release.ps1` con el target nuevo y `verify-agent.ps1`
  con el conteo actualizado.
- **Verificación:** `pwsh -File scripts/package-release.ps1 -Version <x> -Target linux-x64-sensor -OutDir <tmp>`
  en dry-run y `pwsh -File scripts/verify-agent.ps1`.
- **Aborto:** si el artefacto no arranca sin libpcap, falta la degradación de E5.

## 5. Ledger único y patrón de escritura (E1.5)

### 5.1 Hechos

| Hecho | Evidencia |
|---|---|
| `sc_schema_migrations` tiene 17 filas (`0000_init.sql` … `0016_asn-stats.sql`) | consulta a Neon |
| `drizzle.__drizzle_migrations` tiene 13 filas; la última es anterior a 0014/0015/0016 | consulta + `meta/_journal.json` |
| **Causa raíz:** `web/drizzle.config.ts` apunta `out: './lib/db/migrations'`, el mismo directorio que consume el runner manual | `web/drizzle.config.ts` |
| Ningún script npm invoca `drizzle-kit` (sólo está como devDependency) | `web/package.json` |
| El camino de ingesta es `sql` crudo + ids deterministas + `ON CONFLICT DO NOTHING` en una transacción | `web/lib/ingest/persist.ts:1-24, 88-170` |

### 5.2 Resolución del ledger

1. `web/drizzle.config.ts`: `out` pasa a `./lib/db/drizzle-out`, con comentario que
   explica que ese directorio no es el ledger. Así un `drizzle-kit generate`
   accidental deja de escribir en `web/lib/db/migrations/`.
2. `scripts/verify-migration-ledger.mjs` (nuevo, sólo lectura): compara los `.sql`
   del directorio contra `sc_schema_migrations`, falla con código 1 ante drift,
   informa filas huérfanas del ledger y el conteo de Drizzle **como dato, no como
   autoridad**. Sin rutas absolutas, con `--env-file` igual que
   `apply-migrations.mjs`, e imprime sólo el host del DSN.
3. `docs/runbooks/apply-db-migrations.md`: `sc_schema_migrations` es el único
   ledger; `drizzle.__drizzle_migrations` está congelado en 13 filas y no se usa,
   no se migra y no se borra sin autorización N4; `drizzle-kit generate|migrate|push`
   está prohibido.

**No se hace:** no se escribe en `drizzle.__drizzle_migrations`, no se borra la
tabla, no se aplica 0017. Queda como peso muerto documentado.

### 5.3 Patrón de escritura (para que `ot_assets` no rompa la idempotencia)

- Toda escritura de `/api/ingest` viaja en **una** transacción no interactiva
  (`sql.transaction`): o todo o nada, y un reintento repara lo que faltara
  (ADR-0008, ADR-0015).
- Ids deterministas con `stableId(prefix, …)` (sha256 → 24 hex) +
  `ON CONFLICT DO NOTHING` = reenvío idempotente.
- No se usa el query builder de Drizzle en el camino de ingesta; sí `sql` con
  parámetros enlazados.
- **Excepción para contadores** (`seen_windows`): `ON CONFLICT (device_id, host_key)
  DO UPDATE … WHERE` con `last_seen = window_end` fijado en el mismo statement. Sin
  esa guarda, cada reintento incrementa el contador.

### 5.4 Verificación de E1.5

1. `node scripts/apply-migrations.mjs --dry-run` → `pendientes: 0`.
2. `node scripts/verify-migration-ledger.mjs --env-file web/.env.local` → drift 0,
   17/17.
3. `cd web && pnpm typecheck && pnpm lint` (el cambio de `drizzle.config.ts` es
   TypeScript).
4. Revisión del diff de los dos documentos.

## 6. Gates que no cierra un agente

| Gate | Dónde | Quién decide |
|---|---|---|
| Checkpoint E2.0/E2 (4 protocolos + 3 gates de contrato) | §4, E2.0/E2 | propietario |
| Topología real IT/OT (contrato de aristas, §8) | §8 | propietario (default: no en F1) |
| Aplicar 0017 a la Neon de producción | N3 | propietario |
| B-028 (rotación de `SC_HMAC_KEY`: discontinuidad vs. versionado) | `docs/plans/etapa-2-backlog.md:111` | propietario |
| Renombrar `ot_ot_in_it_zone` → `ot_it_zone_crossing` | §3 corrección 5 | propietario (default: sí, antes de que el id entre en `alerts`) |
| "F1" sobrecargado (DPI+blacklists en el backlog vs. fase 1 OT en el diseño) | `docs/plans/etapa-2-backlog.md` vs. diseño | propietario (default: nota, sin renombrar el roadmap) |

La aprobación de M6 se otorgó el 2026-11-25 (`docs/plans/etapa-2-backlog.md:49`);
el gate vigente es el checkpoint E2.0/E2. Ninguno de estos gates se resuelve por
cuenta propia (AGENTS.md §13.7).

## 7. Límites de verificación

**No verificable en esta máquina:**

- **Artefacto `linux-x64-sensor`**: requiere libpcap de Linux; lo cubre el CI de
  release. No se puede afirmar que arranca hasta que exista el run del release.
- **p95 de ingesta**: con 1 device y 36 filas no hay baseline representativo. Se
  sustituye por el gate estructural de E7 y queda como deuda medida.
- **pcaps reales**: la licencia de los datasets públicos (4SICS, Netresec) está sin
  resolver (OQ5). Sólo fixtures sintéticos propios.
- **Baseline automático**: no verificable en F1. Requiere un piloto OT real y ≥7
  días/100 ventanas; queda diferido a F1.5/F2.
- **Captura Windows**: verificable con Npcap (`scripts/enable-live-capture.ps1`,
  `docs/runbooks/npcap-install.md`), pero no forma parte de F1.

**Medido vs. estimado:** lo de §2 es medido; el peor caso de §3.1 es estimado con
supuestos explícitos (endpoint IPv6 en claro, `fn_codes` top-8, sin compressión);
el costo en CU-horas no se estima aquí porque el tráfico actual no es
representativo.

## 8. Topología real IT/OT (F1.5/F2, fuera de F1)

Las cards de E8.1/E8.2 son honestas pero **no son topologías completas**. El
contrato actual no tiene aristas:

- **IT:** `host_stats` agrega por host (bytes, país, riesgo) y `top_ports` por
  puerto; ningún campo publica `src → dst`. La propia referencia UX lo dice: «No
  hay conexiones individuales en el esquema» (`docs/ux/dashboard-wireframes.md:28`).
- **OT:** `ot.endpoints` lista hosts y `ot.events` sólo los pares que dispararon
  una regla; `ot_assets.peers` existe en el DDL, pero **no hay campo de origen en
  el contrato** que lo pueble con tráfico que no alertó. Un mapa de todos los
  enlaces sería inventado.

Para una topología real se necesita un cambio de contrato aparte:

| Pieza | IT | OT |
|---|---|---|
| Campo | `links` opcional ≤32: `{client, server, proto, port, bytes, packets}` | `ot.links` opcional ≤4 (8 tras medir): `{client, server, proto, port, bytes}` |
| Persistencia | tabla `network_edges` por ventana, con retención y poda | `ot_edges` o `ot_assets.peers` poblado desde `ot.links` |
| Privacidad | sólo `host_key`; nunca IP, MAC ni payload | ídem; sin valores de registro |
| Límites | 32 aristas ≈5,3 KB; top N por bytes con `truncated` explícito | `host_key` de 32 hex: 629 B para 4 links y 1 249 B para 8; con el endpoint real (163 B) 8 caben (8 049 B), pero el cap por defecto se queda en 4 hasta medir |
| UI | aristas reales; reemplaza el mapa de exposición | aristas reales; reemplaza «rutas alertadas» |

**Gate:** decisión del propietario, ADR de retención y contrato nuevo (schema,
Zod, serde y fixtures en el mismo cambio). No se implementa en F1 ni se simula con
aristas no observadas. La tabla nueva, si se crea, entra en la limpieza de
retención y en `/legal/privacy` (AGENTS §8.4). El diseño detallado —campos, topes,
presupuesto medido, persistencia, retención y gates— está en
`docs/designs/network-edges-contract.md`.
