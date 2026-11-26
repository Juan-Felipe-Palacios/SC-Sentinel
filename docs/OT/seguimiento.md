# Seguimiento — M6 OT

Tablero único de avance. El protocolo de uso está en
[`README.md`](README.md); el alcance y los criterios de cada etapa, en
[`plan-implementacion.md`](plan-implementacion.md).

**Regla de cierre:** una etapa pasa a `hecho` **sólo** si la columna `Evidencia`
contiene el comando ejecutado y su resultado. Sin eso queda `en curso` o
`bloqueado`. Un test que falla y luego pasa sin cambios es intermitente: se anota
su nombre y no se da por resuelto (AGENTS.md §4.7).

## Tablero

| Etapa | Alcance (1 línea) | Depende de | Estado | Criterio de hecho | Evidencia | Actualizado |
|---|---|---|---|---|---|---|
| E0 | Aplicar las 10 correcciones al diseño y escribir las secciones OT de `reference/` | — | `hecho` | Diff revisado contra §3 del plan, punto por punto | 10/10 por grep: 0 restos de `cap 4 KB`, `4096 B` y `8×512`; `CREATE TABLE ot_assets` en `:531`; migración en `:606`; `0x2B` y `"v": 1` sin coincidencias | 2026-11-25 · Buffy |
| E1 | ADR-0021 (retención OT), ADR-0022 (invariante pasivo) y runbook de cleanup | — | `hecho` | ADRs con número libre (0021/0022) y runbook nombrando la tabla | `ls docs/adr \| tail -3` → `0021-ot-assets-retention-exception.md`, `0022-passive-invariant.md`; runbook `:13-31` con tabla, poda y baja de dispositivo; índice con 22 ADRs | 2026-11-25 · Buffy |
| E1.5 | Ledger único (`sc_schema_migrations`) y patrón de escritura documentado | — | `hecho` | `drizzle.config.ts` con `out` separado, checker sin drift, runbook y patrón documentados | `node scripts/verify-migration-ledger.mjs --env-file web/.env.local` → `archivos: 17; ledger: 17; drizzle (dato): 13; sin drift` (exit 0); `node --check` exit 0; `tsc --noEmit` exit 0; runbook con «Ledger único y prohibición de `drizzle-kit`»; `node scripts/test-migration-ledger.mjs` → 5/5 | 2026-11-25 · Buffy |
| E2.0 | Spike de firmas: 5 archivos binarios (4 protocolos) y test de offsets | E0 | `hecho` | Los 5 archivos clasifican según la tabla M4 (4 protocolos; DNP3 CRC roto = `reject`) | `cd agent && cargo test -p sc-core ot_signatures` → `test result: ok. 14 passed; 0 failed; 0 ignored` (1 CRC estándar + 4 positivos con offsets + 8 negativos + 1 OtBlock shape); `cargo fmt --check` OK; `cargo clippy -p sc-core --all-targets -- -D warnings` OK (0 warnings). Usuario reportó `cargo test --workspace` OK (no verificado por mí). 12 fixtures en `agent/fixtures/ot/` (4 positivos + 8 negativos: bad-pid, bad-TPKT, bad-CRC, TCP fragmentado, VLAN, GRE, retransmisión, HTTP en puerto OT); test en `agent/crates/sc-core/tests/ot_signatures.rs`. Hex de los 7 archivos de protocolo verificado contra `m6-passive-ot-identification.md:207-251` (Modbus pid 00 00, S7 TPKT+COTP, DNP3 CRC 0x953B LE, IEC-104 start 0x68). OtBlock serializa sin `baseline_instance`/`baseline_state`/`baseline_epoch`. | 2026-11-25 · Buffy |
| E2 | Contrato `ot` en schema + Zod + serde + fixtures (un solo cambio) | E2.0 | `hecho` | `verify-contracts.sh`, `validate-contracts.js` y `test-contracts-zod.mjs` verdes con 4 fixtures | Contrato en `3afabe4`: serde `OtBlock` en `agent/crates/sc-core/src/types.rs:234`, Zod `OtBlockSchema` en `web/lib/schemas/ingest.ts:110`, `ot` en `docs/contracts/window-snapshot.v1.schema.json`. 4 fixtures: `docs/contracts/examples/snapshot-0.1.8-no-ot.json` (sin `ot`), `snapshot-ot-valid.json` (2 eventos / 2 protocolos / 3 endpoints), `snapshot-ot-malformed.json`, `snapshot-ot-oversize.json` (9/7/17, solo fallan los topes). Gate completo: `bash scripts/verify-contracts.sh` → `Contratos OK (Rust + JSON Schema + Zod).`, exit 0; `cd web && pnpm test:contracts` → `# pass 11 / # fail 0`, exit 0, **sin flags** (causa de `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` eliminada: `overrides` movido a `web/pnpm-workspace.yaml`; ver bitácora y CI con pnpm 10). `node scripts/validate-contracts.js` → `OK:` en los dos válidos y rechazos con `13 errores` y `3 errores`, exit 0; Zod → `# tests 11 / # pass 11 / # fail 0`, exit 0; Rust → `test result: ok. 2 passed; 0 failed`. Abierto: el cap de 8192 B no se valida en schema, Zod ni serde; los fixtures cubren los topes estructurales. Checkpoint E2.0/E2 saltado por el propietario el 2026-11-26. | 2026-11-26 · Buffy |
| E3 | Migración `0017_ot-assets.sql` y `web/lib/ot/` (upsert condicional) | E2, E1 | `hecho` | `--dry-run` correcto + tests de retención, conteo y reaplicación | `cd web && node node_modules/vitest/vitest.mjs run lib/ot app/api/devices lib/cleanup` → `Test Files 5 passed (5)`, `Tests 31 passed (31)`; `tsc --noEmit` exit 0; `eslint` exit 0. Migración real contra PGlite (PostgreSQL WASM): 24 columnas, índice `(device_id, last_seen DESC)`, UNIQUE `(device_id, host_key)`, CHECK de `role`/`protocols`/`host_key`/`oui_prefix` (SQLSTATE 23514) y duplicado (23505); reaplicar la misma ventana deja `seen_windows = 1`, la ventana siguiente lo lleva a 2 y conserva `first_seen` (`lib/ot/__tests__/migration.integration.test.ts`, 10 tests). Producción `ep-delicate-rain…`: `node scripts/apply-migrations.mjs --env-file web/.env.production.local` → `aplicadas: 1; fallos: 0`; ledger `archivos: 18; ledger: 18; sin drift`; `--dry-run` → `pendientes: 0`; en la base: 24 columnas, 3 índices, 28 constraints, 0 filas. Retención: `ot_assets` fuera de `RETENTION_DAYS` (test explícito). Extra pedido por el propietario: `GET /api/devices/[id]/ot-assets` (6 tests). Commits `f5a9551` (migración y upsert) y `03d526d` (endpoint, pruebas y runner). | 2026-11-26 · Buffy |
| E4 | Crate `sc-ot`: 4 parsers puros, peek LRU 4096, alineación 0–7 | E2 | `hecho` | Fuzz no-panic + property test de CRC DNP3 | Crate `sc-ot` nuevo (`agent/crates/sc-ot/`): 4 parsers puros, `PeekCache` LRU 4096 por 5-tupla/dirección con 2 intentos y congelamiento tras `Confirmed`, alineación 0–7 en `classify_aligned`. Gate: `cargo fmt --all --check` exit 0; `cargo clippy --workspace --all-targets -- -D warnings` exit 0; `cargo test -p sc-ot` → `37 passed` (unit) + `5 passed` (fixtures) + `6 passed` (properties), 0 failed; `cargo test --workspace` exit 0 con `sc-core ot_signatures` 14/14 intacto. Paridad con los 12 fixtures de E2.0: 4 confirmados con su protocolo y 8 en `Reject`, incluido CRC DNP3 roto. `proptest` 256 casos: bytes arbitrarios de 0–2048 nunca paniquean; DNP3 sólo confirma con CRC válido (property test del criterio). **Fuzz real: deuda medida**, `cargo fuzz` no está instalado y la toolchain es `stable` (decisión del propietario 2026-11-26). | 2026-11-26 · Buffy |
| E5 | `sc-capture`: `forbid(unsafe_code)`, clippy, peek, BPF, degradación | E2 | `pendiente` | Compila con y sin `--features live`; gate detecta un socket de prueba | Dependencia E2 `hecho` el 2026-11-26; tomable con dale | 2026-11-26 · Buffy |
| E6 | `sc-detect`: reglas corregidas, allowlist, anti-storm | E4 | `bloqueado` | Miembro/no miembro de allowlist + anti-storm sin duplicar | — | 2026-11-25 · Buffy |
| E7 | `/api/ingest`: dos pasadas, techo de confianza, upsert, downlink | E2, E3 | `pendiente` | ≤3 statements extra, `EXPLAIN` sin scan nuevo, fixture 0.1.8 en 200 | Dependencias E2 y E3 `hecho` el 2026-11-26; tomable con dale | 2026-11-26 · Buffy |
| E8 | UI: badge de protocolo en la matriz y tab "Activos OT" | E3 | `pendiente` | `typecheck`, `lint` y `build` verdes; la tab no muestra datos sintéticos | Dependencia E3 `hecho` el 2026-11-26; tomable con dale | 2026-11-26 · Buffy |
| E8.1 | Card «Mapa OT observado»: nodos + aristas reales | E7, E8 | `bloqueado` | `metric=topology` con nodos/aristas acotados (≤40 nodos, ≤80 aristas); empty state; distingue «sin datos» de «sin aristas»; sin IP/MAC ni aristas inventadas; build verde | — | 2026-11-25 · Buffy |
| E8.2 | Card «Mapa de exposición IT»: hosts/países/puertos, sin aristas | E8 | `bloqueado` | Top hosts/países/puertos; sin aristas; empty state; build verde | — | 2026-11-25 · Buffy |
| E9 | Demo sintética TEST-NET con las dos cards y los dos disclaimers | E8.1, E8.2 | `bloqueado` | Badge `confirmed` y cards visibles con "Flujo Modbus sintético…" y "Evidencia sintética" | — | 2026-11-25 · Buffy |
| E10 | Empaquetado `linux-x64-sensor` y `verify-passive.sh` en CI | E5, E6 | `bloqueado` | Dry-run del target nuevo y `verify-agent.ps1` con 15 archivos | — | — |

Aprobación de M6 **otorgada el 2026-11-25** (`docs/plans/etapa-2-backlog.md:49`):
hito nuevo con F1 OT en allowlist + descubrimiento manual y checkpoint tras
E2.0/E2. La aprobación no autoriza ejecución: E2.0 requiere un "dale" que la
nombre. Gates que siguen abiertos: B-028 y el renombre `ot_ot_in_it_zone`.
Detalle en `plan-implementacion.md` §6.

**2026-11-26 · decisión del propietario:** saltar el checkpoint E2.0/E2 y
ejecutar E3 completo, incluida la aplicación de `0017` a producción (N3). E3 se
cerró sin el bloque `ot` del contrato porque el upsert define su propia entrada
(`OtAssetInput`) y no consume el schema. E2 quedó `hecho` el 2026-11-26 con su
contrato y sus 4 fixtures, así que E4, E5, E7 y E8 vuelven a `pendiente`; E6,
E8.1, E8.2, E9 y E10 siguen bloqueadas por sus propias dependencias.

## Checkpoint E2.0/E2

Se evalúa al cerrar E2.0 y E2; sin esta decisión, E3–E10 (incl. E8.1/E8.2)
siguen bloqueadas.

| Verificación | Comando exacto | Evidencia en el tablero |
|---|---|---|
| Firmas | `cd agent && cargo test -p sc-core ot_signatures` | `test result: ok`; 5/5 archivos, 4/4 protocolos, 0 fallos; salida cruda y exit code |
| Gate de contratos | `bash scripts/verify-contracts.sh` | `Contratos OK (Rust + JSON Schema + Zod).`; exit 0 |
| JSON Schema | `node scripts/validate-contracts.js` | `Contratos OK.`, sin `FAIL:`, exit 0 |
| Zod | `cd web && node --experimental-strip-types ../scripts/test-contracts-zod.mjs` | `# fail 0`; exit 0 |
| Fixture 0.1.8 sin `ot` | incluido en `verify-contracts.sh` | valida y serializa idéntico; nombre del test y resultado |

La respuesta HTTP 200 del fixture 0.1.8 se verifica en E7, no en este checkpoint.
Si `pnpm` bloquea `verify-contracts.sh` por el lockfile, se corren los comandos
directos y se registra la limitación; un gate parcial no cierra el checkpoint.

**Registro:** la evidencia va en las celdas de E2.0/E2 y la decisión del propietario
(`aprobado`, `rechazado` o `vuelve a diseño`) en la bitácora. Si 2 o más protocolos
fallan, M6 vuelve a diseño y no se escribe contrato; si falla el contrato, se corrige
dentro de E2. El checkpoint no autoriza E3–E10 en bloque: cada etapa necesita "dale".

## Leyenda de estados

| Estado | Significado |
|---|---|
| `pendiente` | Con dependencias satisfechas y sin empezar. Es tomable. |
| `en curso` | Alguien la tomó: fecha y agente en `Actualizado`. Una sola etapa `en curso` a la vez. |
| `hecho` | Criterio cumplido **y** evidencia registrada (comando + salida). |
| `bloqueado` | No se puede avanzar: gate del propietario, dependencia sin cerrar o fallo reproducido. El motivo va en `Evidencia`. |
| `descartado` | Se decidió no hacerla. El motivo y la decisión van en la bitácora. |

Si una etapa bloqueada se desbloquea, vuelve a `pendiente` con nota de quién
levantó el bloqueo y cuándo.

## Bitácora

### 2026-11-25 · Plan · E2.0 · conteo de fixtures

- **Qué se hizo:** aclarado el conteo de E2.0: son 5 archivos binarios para 4
  protocolos, porque DNP3 lleva dos (CRC válido y CRC roto). Alcance, criterio de
  hecho y evidencia quedaron con el mismo número: «5/5 archivos, 4/4 protocolos».
- **Comando ejecutado:** `grep -n -i "fixture" docs/OT/plan-implementacion.md docs/OT/seguimiento.md`; edición con `str_replace` sobre ambos archivos.
- **Salida:** `plan-implementacion.md:207-216` y la fila E2.0 del tablero dicen 5
  archivos / 4 protocolos; la fila Firmas del checkpoint exige 5/5. La cobertura
  sigue siendo 4 protocolos y el aborto (2 o más fuera de tabla) no cambia.
- **Qué quedó pendiente:** implementar E2.0 (sigue `pendiente`); los 5 `.bin` y el
  test no existen todavía.

### 2026-11-25 · Seguimiento · Buffy

- **Qué se hizo:** corregida la fila de E8.1 del tablero para alinearla con el
  diseño de aristas (`docs/designs/network-edges-contract.md` §8–§9): el alcance
  pasó de «nodos + rutas alertadas» a «nodos + aristas reales» y el criterio de
  `metric=ot_topology` a `metric=topology`, con cota ≤40 nodos/≤80 aristas,
  empty state y distinción «sin datos» vs «sin aristas». El diseño fija `metric=topology`
  con aristas reales, retención de 7 d con `clamped` y tope de render; la fila
  anterior contradecía esa decisión.
- **Comando ejecutado:** `grep -n "E8.1\|ot_topology\|metric=topology" docs/OT/seguimiento.md docs/designs/network-edges-contract.md docs/OT/plan-implementacion.md`; edición con `str_replace` sobre `docs/OT/seguimiento.md`.
- **Salida:** fila E8.1 del tablero y `plan-implementacion.md:331` alineadas en
  `metric=topology`; la inconsistencia de nombre de métrica queda cerrada. La
  sincronización se hizo en el mismo cambio para no dejar dos fuentes divergentes.
- **Qué quedó pendiente:** E8.1 sigue `bloqueado` por el checkpoint E2.0/E2 y por
  los gates del contrato (§12); el alcance de aristas reales vs. rutas alertadas se
  afina cuando se apruebe el contrato (§8–§9 del diseño).

### 2026-11-25 · Plan · cards de red IT/OT

- **Qué se hizo:** análisis de viabilidad y planificación de dos cards: «Mapa OT
  observado» (E8.1) y «Mapa de exposición IT» (E8.2). Se documentó por qué una
  topología real no es posible con el contrato actual: `host_stats` no tiene
  src/dst, `top_ports` no publica pares y `ot_assets.peers` no tiene campo de
  origen; queda como gate de contrato en §8.
- **Comando ejecutado:** revisión de `web/lib/db/migrations/0000_init.sql:45-53`,
  `web/lib/schemas/ingest.ts:76-87`, `web/components/dashboard/OverviewView.tsx`,
  `web/components/dashboard/ConnectionsView.tsx` y
  `docs/ux/dashboard-wireframes.md:28`.
- **Salida:** E8.1/E8.2 agregadas al plan y al tablero; E9 pasa a depender de
  ambas; total 15 etapas (3 hechas, 1 pendiente, 11 bloqueadas). No se implementó
  ninguna card.
- **Qué quedó pendiente:** E8.1/E8.2 bloqueadas por el checkpoint y sus
  dependencias; la topología real IT/OT requiere decisión del propietario y
  cambio de contrato (§8).

### 2026-11-25 · M6 · aprobación del propietario

- **Qué se hizo:** aprobado M6 OT como hito nuevo con F1 OT en allowlist +
  descubrimiento manual; baseline automático diferido a F1.5/F2. Checkpoint
  obligatorio tras E2.0/E2, con comandos y evidencia definidos en el tablero.
- **Comando ejecutado:** revisión de `docs/plans/etapa-2-backlog.md:49`, del plan
  §6 y de los scripts de contrato (`scripts/verify-contracts.sh`,
  `scripts/validate-contracts.js`, `scripts/test-contracts-zod.mjs`).
- **Salida:** decisión registrada en backlog y roadmap; E2.0 pasa a `pendiente`;
  E2–E10 siguen bloqueadas por dependencia o por el checkpoint.
- **Qué quedó pendiente:** ejecutar E2.0 (requiere "dale"); checkpoint E2.0/E2;
  B-028, el renombre y la aplicación de `0017` a producción siguen como gates.

### 2026-11-25 · E1.5 · revisión · Buffy

- **Qué se hizo:** revisión del checker con ojos frescos. El host ahora se extrae con
  `URL` en vez de una regex, para no imprimir parte de una contraseña si el DSN trae un
  `@` sin codificar; si falta el directorio de migraciones, falla con un mensaje claro en
  vez de un stack. Se agregó `scripts/test-migration-ledger.mjs`: monta un `web/` temporal
  con un módulo falso de Neon, ejecuta el checker real como proceso hijo y comprueba los
  códigos de salida (sin drift 0; pendiente, huérfana y ledger ilegible 1), además de que
  el host no arrastre userinfo. No abre red ni toca la base.
- **Comando ejecutado:** `node scripts/test-migration-ledger.mjs`; `node --check` sobre
  ambos scripts; `node scripts/verify-migration-ledger.mjs --env-file web/.env.local`;
  `cd web && node node_modules/typescript/bin/tsc --noEmit`.
- **Salida:** `PASS` en los 4 casos de drift y en el control de userinfo (`prueba offline:
  5/5`, `offline_exit=0`); checker real `archivos: 17; ledger: 17; drizzle (dato): 13;
  sin drift` (`ledger_exit=0`); `typecheck_exit=0`.
- **Qué quedó pendiente:** los gates de M6 siguen bloqueando E2.0–E10; nada commiteado.

### 2026-11-25 · E1.5 · Buffy

- **Qué se hizo:** `web/drizzle.config.ts` con `out: './lib/db/drizzle-out'` y comentario
  que separa ese directorio del ledger; `scripts/verify-migration-ledger.mjs` de sólo
  lectura (compara `.sql` contra `sc_schema_migrations`, informa pendientes y huérfanas,
  cuenta Drizzle como dato y sale con 1 ante drift); sección «Ledger único y prohibición
  de `drizzle-kit`» en `docs/runbooks/apply-db-migrations.md` y comando del checker en
  `docs/reference/data-model.md`.
- **Comando ejecutado:** `node --check scripts/verify-migration-ledger.mjs`;
  `node scripts/verify-migration-ledger.mjs --env-file web/.env.local`;
  `cd web && node node_modules/typescript/bin/tsc --noEmit`.
- **Salida:** `node_check_exit=0`; `archivos: 17; ledger: 17; drizzle (dato, no autoridad):
  13; sin drift` con `ledger_exit=0`; `typecheck_exit=0`. `pnpm typecheck` no llegó a
  ejecutarse (`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` por `node_modules` desincronizado con el
  lockfile); no se modificaron dependencias ni configuración de pnpm.
- **Qué quedó pendiente:** E2.0–E10 siguen bloqueadas por la aprobación de M6; el
  `pnpm typecheck` queda como limitación del entorno, cubierta por el `tsc` directo.

### 2026-11-25 · E1 · Buffy

- **Qué se hizo:** ADR-0021 (excepción de retención de `ot_assets`: fuera de
  `RETENTION_DAYS`, frescura derivada a 30 d, poda manual >180 d opt-in) y ADR-0022
  (invariante pasivo: `forbid(unsafe_code)`, clippy de sockets, test de grafo, BPF por
  CIDR, degradación a colector y gate de CI). Runbook de cleanup con la tabla, el SQL de
  poda y la baja de dispositivo. Además se corrigió la incoherencia `ot_assets.role`
  (`master`/`slave` → `client`/`server`/`both`/`unknown`) y el tope de `protocols` del
  DDL (8 → 6), alineados con el contrato y con `OtRole` (Appendix A).
- **Comando ejecutado:** `ls docs/adr | tail -3`; `grep -n "role IN"` y
  `grep -n "jsonb_array_length(protocols)"` sobre diseño y plan; `grep -n "ot_assets"`
  sobre el runbook; `grep -n "adr/\|OT/"` sobre el índice; `git status --short`.
- **Salida:** ADR-0021 y ADR-0022 presentes tras 0020; `role IN
  ('client','server','both','unknown')` en diseño `:539` y plan `:84`; `protocols <= 6`
  en diseño `:542` y plan `:87`; 0 restos de `master','slave'` o `<= 8)`; runbook
  `:11-31`; índice con 22 ADRs (0001–0022) y 2 etapas hechas.
- **Qué quedó pendiente:** E1.5 sin iniciar; la aprobación de M6 mantiene E2.0–E10
  bloqueadas; el renombre `ot_it_zone_crossing`, B-028 y la desambiguación de "F1"
  siguen siendo gates del propietario.

### 2026-11-25 · E0 · Buffy

- **Qué se hizo:** aplicadas las 10 correcciones de `plan-implementacion.md` §3 al diseño M6
  (presupuesto 8 KiB, Appendix B con DDL de 24 columnas, ruta `web/lib/db/migrations/`,
  sin `identity_kind`, matriz de reglas corregida, U-frame IEC-104, ejemplo sin `"v": 1`,
  mapeo de `evidence`, OQ5/OQ6 al roadmap, encabezado honesto); escritas las secciones OT de
  `docs/reference/data-model.md` y `detection-rules.md`; reescrito `goldfish_review_report.md`
  con veredictos corregidos y sin estado «resuelto».
- **Comando ejecutado:** `grep -n` / `grep -c` sobre el diseño y el roadmap (controles de
  cada corrección); `git diff --stat`; `git status --short`.
- **Salida:** 0 coincidencias de `cap 4 KB`, `4096 B`, `8×512`, `0x2B` y `"v": 1`;
  `identity_kind` aparece 2 veces, ambas como negación (no es columna); `ot_ot_in_it_zone`
  sólo en la nota del renombre; `CREATE TABLE ot_assets` en `:531`; `web/lib/db/migrations/`
  en `:606`; roadmap con P11 y P12 en `:323-324`.
- **Qué quedó pendiente:** el renombre `ot_it_zone_crossing` quedó aplicado por defecto y
  pendiente de confirmación del propietario; E1 y E1.5 sin iniciar; E2.0–E10 bloqueadas por
  la aprobación de M6.

### 2026-11-25 · E2.0 · Buffy

- **Qué se hizo:** implementado el spike de firmas E2.0: 12 fixtures binarios en
  `agent/fixtures/ot/` (4 positivos — Modbus, S7comm, DNP3 CRC-ok, IEC-104 — + 8
  negativos: bad-pid, bad-TPKT, bad-CRC, TCP fragmentado, VLAN, GRE,
  retransmisión, HTTP en puerto OT) y el test `agent/crates/sc-core/tests/ot_signatures.rs`
  con 14 tests: 1 CRC estándar (0xEA82), 4 positivos con aserciones de offsets,
  8 negativos y 1 OtBlock shape (Opción C: emisión vía `serde_json::json!` sin
  tipado). Clasificación byte-level de Modbus/S7comm/DNP3/IEC-104 según tabla M4.
  DNP3 con CRC roto devuelve `reject` (nunca `probable`); S7 con TPKT+COTP válidos
  y byte 7 fuera de {0x32,0x72} devuelve `reject` (no `iso-tsap-unclassified` en
  este spike). OtBlock se serializa sin `baseline_instance`/`baseline_state`/
  `baseline_epoch` (recorte F1). Spike emite OtBlock sin tipado para evitar
  dependencia circular con `types.rs` (parte de E2).
- **Comando ejecutado:** `cd agent && cargo test -p sc-core ot_signatures`;
  `cd agent && cargo fmt --check`; `cd agent && cargo clippy -p sc-core --all-targets -- -D warnings`;
  verificación de hex con `xxd -p` sobre los 7 archivos de protocolo.
- **Salida:** `test result: ok. 14 passed; 0 failed; 0 ignored` (exit 0);
  `cargo fmt --check` exit 0 (sin diff); clippy exit 0 (0 warnings). Hex de los 7
  archivos de protocolo coincide con la spec (Modbus pid 00 00, S7 TPKT=0x1F/
  byte7=0x32, DNP3 CRC=0x953B LE, IEC-104 start 0x68 / L=4 / U-frame 0x07).
  Usuario reportó `cargo test --workspace` OK (no verificado por mí en esta sesión).
- **Qué quedó pendiente:** E2.0 cierra la etapa; el checkpoint E2.0/E2 sigue
  pendiente porque E2 (contrato `ot`) no se inició y los gates de contrato
  (`verify-contracts.sh`, `validate-contracts.js`, Zod) no se corrieron. E2 sigue
  `bloqueado` por dependencia. Gates de contrato abiertos: opción A/B de
  persistencia OT, 4→8 aristas tras medir, ADR-0023, numeración 0017 vs 0018.
  No se commiteó aún; commit local pendiente (N1) con este cambio.

### 2026-11-26 · E3 · Buffy

- **Qué se hizo:** cerrada E3 con la migración `0017_ot-assets.sql` (24 columnas,
  índice `(device_id, last_seen DESC)`, UNIQUE `(device_id, host_key)`, CHECK de
  enums y topes) y `web/lib/ot/upsert.ts` (upsert condicional con guarda
  `WHERE ot_assets.last_seen < EXCLUDED.last_seen`). Se agregó el inventario de
  activos OT como `GET /api/devices/[id]/ot-assets` (solo admin, `limit` 1–200,
  404 de dispositivo, `no-store`) con `web/lib/query/ot-assets.ts`. Se corrigió el
  runner: `--dry-run` ignoraba el ledger y listaba las 18 migraciones como
  pendientes; ahora lo lee (solo `SELECT`) y con eso el criterio de E3 es medible.
  La tabla queda fuera de `RETENTION_DAYS` según ADR-0021, con test explícito.
- **Comando ejecutado:** `cd web && node node_modules/vitest/vitest.mjs run lib/ot
  app/api/devices lib/cleanup`; `cd web && node node_modules/typescript/bin/tsc
  --noEmit`; `cd web && node node_modules/eslint/bin/eslint.js "app/api/devices"
  "lib/ot" "lib/query/ot-assets.ts" "lib/cleanup"`; `node --check
  scripts/apply-migrations.mjs`; `node scripts/verify-migration-ledger.mjs
  --env-file web/.env.production.local`; `node scripts/apply-migrations.mjs
  --env-file web/.env.production.local --dry-run`; `node
  scripts/apply-migrations.mjs --env-file web/.env.production.local`.
- **Salida:** `Test Files 5 passed (5)` / `Tests 31 passed (31)` (17 de `lib/ot`,
  6 de la ruta nueva, 5 de retención, 3 de devices); `tsc_exit=0`; `eslint_exit=0`;
  `check_exit=0`. Antes: `archivos: 18; ledger: 17; pendientes (1):
  0017_ot-assets.sql`, `dry-run → pendientes: 1`. Después del apply:
  `[1/2] OK CREATE TABLE "ot_assets"`, `[2/2] OK CREATE INDEX
  "ot_assets_device_last_seen_idx"`, `aplicadas: 1; fallos: 0`;
  `archivos: 18; ledger: 18; sin drift`; `pendientes: 0`. Consulta de solo
  lectura a producción: `{"columns":24,"indexes":["ot_assets_pkey",
  "ot_assets_device_id_host_key_key","ot_assets_device_last_seen_idx"],
  "constraints":28,"rows":0,"ledger":["0017_ot-assets.sql"]}`. Contra PGlite, el
  DDL rechaza `role='master'`, 7 protocolos, `host_key` corto y `oui_prefix` de
  2 bytes con SQLSTATE 23514, y el duplicado con 23505.
- **Qué quedó pendiente:** el endpoint no está desplegado (requiere push, N2);
  `ot_assets` tiene 0 filas porque el ingest todavía no escribe el bloque `ot`
  (E7, bloqueada por E2); E2 sigue `en curso` (contrato en `3afabe4`, sin los 4
  fixtures del criterio) y el checkpoint E2.0/E2 quedó saltado por decisión del
  propietario. Reversión si hiciera falta: `DROP TABLE
  ot_assets;` y `DELETE FROM sc_schema_migrations WHERE name =
  '0017_ot-assets.sql';`. Nota: `web/lib/db/migrations/meta/_journal.json` sigue
  sin 0017, así que `drizzle` no la conoce; el ledger del runner es la autoridad
  (E1.5).

### 2026-11-26 · E2 · Buffy

- **Qué se hizo:** cerrados los 4 fixtures del criterio de E2 en
  `docs/contracts/examples/`: `snapshot-0.1.8-no-ot.json` (compatibilidad, sin
  `ot`), `snapshot-ot-valid.json` (bloque completo dentro de topes),
  `snapshot-ot-malformed.json` (enum, tipos, rangos, faltantes y propiedad
  adicional) y `snapshot-ot-oversize.json` (9 eventos / 7 protocolos / 17
  endpoints, generado para que solo fallen los topes). `scripts/validate-contracts.js`
  ahora valida `minItems`/`maxItems`/`minProperties`/`maxProperties` (antes
  ignoraba los topes de array) y corre los 4 casos. `scripts/verify-contracts.sh`
  ya no se corta en pnpm: pasa `--config.verify-deps-before-run=false` y solo cae
  a `node --experimental-strip-types` si pnpm no llegó a ejecutar el test, así que
  un fallo real de las pruebas sigue poniendo el gate en rojo. No se tocó el
  contrato (schema, Zod, serde) ni las dependencias.
- **Comando ejecutado:** `bash scripts/verify-contracts.sh`;
  `node scripts/validate-contracts.js`;
  `cd web && node --experimental-strip-types ../scripts/test-contracts-zod.mjs`;
  `cd agent && cargo test -p sc-core ejemplo_del_contrato`; `pnpm --version`.
- **Salida:** `Contratos OK (Rust + JSON Schema + Zod).`, `gate_exit=0`;
  `OK: snapshot-0.1.8-no-ot`, `OK: snapshot-ot-valid`,
  `OK: snapshot-ot-malformed rechazado correctamente (13 errores detectados)`,
  `OK: snapshot-ot-oversize rechazado correctamente (3 errores detectados)`,
  `Contratos OK.`, exit 0; Zod `# tests 11 / # pass 11 / # fail 0`, exit 0;
  Rust `test result: ok. 2 passed; 0 failed`; `pnpm` local `12.23.0` (el CI fija
  pnpm 9 y no usaba este script).
- **Qué quedó pendiente:** el cap de 8192 B del bloque `ot` no se valida en JSON
  Schema, Zod ni serde; no hay comprobación de bytes en ninguna capa, así que el
  fixture `oversize` prueba los topes estructurales 8/6/16 y no ese presupuesto.
  Abiertos también B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · pnpm sin flag

- **Qué se hizo:** eliminada la causa de `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` en vez
  del parche. El campo `pnpm.overrides` de `web/package.json` se movió a
  `web/pnpm-workspace.yaml` (`packages: ['.']` + `overrides: postcss: '>=8.5.23'`,
  mismo valor) y `scripts/verify-contracts.sh` volvió a `pnpm test:contracts` a
  secas, sin `--config.verify-deps-before-run=false` ni fallback a node. El
  lockfile necesitó una sola reparación: la entrada de `xlsx` (tarball de
  cdn.sheetjs.com) no tenía `integrity`, y pnpm ≥11 se niega a instalarla sin
  hash. Se calculó el SHA-512 del tarball fijado y se agregó a esa `resolution`
  (sin cambiar ninguna versión ni el override). Además el CI pasa de pnpm 9 a
  10: con 9 el mismo lockfile falla con `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`
  porque 9 no lee `overrides` del workspace (medido).
- **Comando ejecutado:** `cd web && pnpm test:contracts`;
  `bash scripts/verify-contracts.sh`; `pnpm install --frozen-lockfile`;
  `npx pnpm@9.15.9 install --frozen-lockfile --lockfile-only` y
  `npx pnpm@10 install --frozen-lockfile --lockfile-only` sobre una copia en
  `/tmp/p9check`; `node` para calcular el SHA-512 del tarball; `pnpm --version`.
- **Salida:** local (pnpm `12.23.0`): `pnpm test:contracts` → `# tests 11 /
  # pass 11 / # fail 0`, `test_exit=0`; gate → `Contratos OK (Rust + JSON Schema
  + Zod).`, `gate_exit=0`; `pnpm install --frozen-lockfile` restaura 30 entradas
  en `node_modules` (zod y vitest presentes). Lockfile: `1 file changed, 1
  insertion(+), 1 deletion(-)`. pnpm 9.15.9 → `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`
  (`p9_exit=1`); pnpm 10.34.9 → `Done in 2.3s using pnpm v10.34.9`,
  `p10_exit=0`.
- **Qué quedó pendiente:** con pnpm 12 local, `pnpm install` termina con
  `ERR_PNPM_IGNORED_BUILDS` (`@google/genai`, `esbuild` 3 versiones,
  `protobufjs`) porque `strictDepBuilds` es `true` en 12; en pnpm 10 es `false`
  por defecto, así que el CI advierte y no falla. Aprobar o rechazar esos build
  scripts (`allowBuilds`/`onlyBuiltDependencies`) es una decisión de cadena de
  suministro del propietario y no se tomó acá. Sigue abierto el cap de 8192 B y
  los gates B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · script `test` sin salto a pnpm

- **Qué se hizo:** `web/package.json` dejó de invocar el gestor de paquetes
  dentro de `test`: de `vitest run && pnpm test:contracts` a
  `vitest run && node --experimental-strip-types ../scripts/test-contracts-zod.mjs`,
  la misma orden que ya ejecuta `test:contracts`. Causa: en Windows `cmd.exe`
  resuelve el `pnpm` del shim que generó npm (`"%dp0%\node_modules\pnpm\pnpm" %*`)
  y pnpm 12 declara `bin: {pnpm: "pnpm"}` sin extensión, así que el shim no
  puede lanzarlo (medido antes en esta sesión: `sh -c "pnpm --version"` →
  `12.23.0`; `cmd /c pnpm --version` → «no se reconoce como un comando»). El
  script no necesitaba pnpm: lo usaba sólo como intermediario para ejecutar
  `node`.
- **Comando ejecutado:** `cd web && pnpm test`; `pnpm --version`.
- **Salida:** pnpm `12.23.0`; `pnpm test` → suite de vitest completa y luego
  `# tests 11 / # pass 11 / # fail 0`, `exit 0`. Es la primera vez que el tramo
  de contratos se alcanza dentro de `pnpm test` en este host.
- **Qué quedó pendiente:** los build scripts sin aprobar de `esbuild`,
  `protobufjs` y `@google/genai`; se tratan en la entrada siguiente del mismo
  día. Siguen abiertos el cap de 8192 B, B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · builds de esbuild aprobados

- **Qué se hizo:** con pnpm 12 `strictDepBuilds` vale `true`, así que cualquier
  build script sin revisar hace fallar `pnpm install` con
  `ERR_PNPM_IGNORED_BUILDS` (exit 1). Se revisaron los cinco paquetes implicados
  y se aprobó **sólo `esbuild`** (`allowBuilds: esbuild: true`): es el único que
  necesita su postinstall para bajar el binario nativo de la plataforma. Con eso
  aprobado el error seguía nombrando `@google/genai` y `protobufjs`, que quedaron
  con `false` explícito: no aportan binario y ya funcionaban sin su postinstall
  en los gates previos. El mapa vive en `web/pnpm-workspace.yaml` junto a
  `overrides`, con un comentario que explica la decisión.
- **Comando ejecutado:** `cd web && pnpm approve-builds esbuild`;
  `pnpm approve-builds '!@google/genai' '!protobufjs'`;
  `pnpm install --frozen-lockfile`; `node node_modules/vitest/vitest.mjs run
  lib/ot`; `npm view pnpm@10 version`.
- **Salida:** `approve-builds` → `esbuild@0.18.20`, `0.25.12` y `0.28.2`
  `postinstall: Done`, exit 0. `pnpm install --frozen-lockfile` → `Done in 1.5s
  using pnpm v12.23.0`, **exit 0** (antes: `Error: ERR_PNPM_IGNORED_BUILDS`,
  `install_exit=1`). esbuild resuelve `0.25.12` y transforma; `vitest run lib/ot`
  → `Test Files 2 passed (2)`, `Tests 17 passed (17)`, exit 0.
- **Clave y CI:** pnpm 12 escribe `allowBuilds`, que existe desde **10.26.0**. El
  CI no usa 10.5 (ese número es el mínimo que lee `overrides` del workspace):
  `pnpm/action-setup@v4` con `version: 10` resuelve el último 10.x, medido como
  `10.34.9` con `npm view pnpm@10 version`. Si algún día se fijara 10.5 literal,
  la clave se ignoraría sin romper el install, porque en 10.x `strictDepBuilds`
  es `false` por defecto.
- **Qué quedó pendiente:** ninguna medición de lo tratado acá: el
  `pnpm install --frozen-lockfile` con pnpm **10.34.9** se midió después sobre
  una copia de `package.json`, `pnpm-lock.yaml` y `pnpm-workspace.yaml` en un
  temporal con store propio → `Done in 1m 46s using pnpm v10.34.9`, exit 0,
  lockfile sin cambios (`cmp`) y 30 entradas en `node_modules`. El gate completo
  (typecheck/lint/tests/build) sigue sin correrse con 10.34.9. pnpm 12 usa
  `D:\.pnpm-store\v11` porque el store de `C:\Users\Juan\AppData\Local\pnpm\store\v11`
  no se puede hard-linkear a otra unidad; queda un store fuera del repo. Siguen
  abiertos el cap de 8192 B, B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · Web CI en pnpm 10
**Qué se hizo**
`web.yml` pasó de `version: 9` a `version: 10` en `pnpm/action-setup@v4`, igual
que `contracts.yml`. Con pnpm 9 el `overrides` de `web/pnpm-workspace.yaml` no se
lee, así que el `pnpm install --frozen-lockfile` del workflow moría con
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` antes de instalar. Nada más cambió.
**Comando ejecutado**
- `git push origin main` (`d15dd1a..d15057c`).
**Salida**
- Antes: run `45814700703` (Web CI sobre `d15dd1a`) → `failure` en 12 s con
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
- Después: run `45817011206` (Web CI sobre `d15057c`) → `success`; los diez pasos
  en verde, incluidos `pnpm install --frozen-lockfile`,
  `pnpm audit --prod --audit-level=high`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test` y `pnpm build`.
- Vercel marcó éxito sobre `d15057c`; producción respondió `/` → 200 y
  `/api/devices` → 401.
**Qué quedó pendiente**
- Siguen abiertos el cap de 8192 B, B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · pnpm fijado en los workflows
**Qué se hizo**
`web.yml` y `contracts.yml` fijan `version: 10.34.9` en `pnpm/action-setup@v4`
en lugar de `10`. Con `10`, cada corrida resolvía el mayor 10.x del momento, así
que un release de pnpm podía cambiar el instalador sin tocar el repo.
**Comando ejecutado**
- `git push origin main` (`7913fd7..6304deb`).
**Salida**
- Run `45818945016` (Validate Contracts) → `completed/success`.
- Run `45818945018` (Web CI) → `completed/success`; el log registra
  `+ pnpm 10.34.9 (12.23.0 is available)` y `Done in 2.9s using pnpm v10.34.9`.
**Qué quedó pendiente**
- Siguen abiertos el cap de 8192 B, B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E2 · requisitos de pnpm 10 en la documentación
**Qué se hizo**
Se revisaron y commitearon las ediciones pendientes en `README.md`,
`docs/diagrams/README.md`, `docs/runbooks/local-development.md` y
`docs/tutorials/quickstart-dashboard.md`: requisito de pnpm 9 → 10+, nuevos
directorios en el mapa del README, M6 y `v0.1.10`, atlas de 283 a 306 páginas.
También se actualizó el comentario de `web/pnpm-workspace.yaml` que describía
una resolución por major del CI.
**Comando ejecutado**
- `pnpm install --frozen-lockfile` en `web` y
  `pwsh -NoProfile -File scripts/check-doc-versions.ps1`.
**Salida**
- `Done in 601ms using pnpm v12.23.0`, exit 0: un comentario no cambia el hash de
  configuración del lockfile.
- `==> Version esperada: 0.1.10` / `OK: ninguna guia apunta a otra version`,
  exit 0.
- Coherencia comprobada: existen `scripts/`, `installer/`, `doc/`,
  `.github/workflows/`, el tag `v0.1.10` (2026-11-24), los ADRs 0021–0022,
  `web/lib/db/migrations/0017_ot-assets.sql` y el atlas tiene `/Count 306`.
**Qué quedó pendiente**
- `web/README.md:18` sigue diciendo "pnpm 9+"; no formaba parte de este lote.
  Siguen abiertos el cap de 8192 B, B-028 y el renombre `ot_ot_in_it_zone`.

### 2026-11-26 · E4 · crate `sc-ot`
**Qué se hizo**
Se creó `agent/crates/sc-ot/` con los cuatro parsers pasivos (Modbus/TCP, S7comm,
DNP3, IEC-104), el `PeekCache` LRU de 4096 flujos con dos intentos por dirección
y congelamiento tras `Confirmed`, y la alineación acotada 0–7 de
`classify_aligned`. El no-panic se cubre con `proptest`; el `cargo fuzz` real
queda como deuda medida por decisión del propietario.
**Comando ejecutado**
- `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test -p sc-ot`, `cargo test --workspace`.
**Salida**
- `fmt` exit 0; `clippy` exit 0, `Finished dev profile` sin warnings.
- `cargo test -p sc-ot`: `37 passed` (unit) + `5 passed` (`ot_fixtures`) +
  `6 passed` (`properties`), `0 failed`.
- `cargo test --workspace`: exit 0; `sc-core` `ot_signatures` sigue en
  `14 passed` y el resto de los crates sin cambios en su conteo.
- Paridad E2.0: los 12 fixtures de `agent/fixtures/ot/` clasifican igual que el
  spike (4 confirmados, 8 `Reject`); el CRC DNP3 roto nunca degrada a
  `Probable`.
- Diferencia deliberada con el spike: IEC-104 ahora exige formato U/S/I válido
  (un byte de control impar que no sea S ni una U conocida es `Reject`); los
  fixtures no cubren ese caso y S7 suma `Probable` para COTP CR/CC, como pide
  la tabla M4.
**Qué quedó pendiente**
- Fuzz real (`cargo-fuzz` + nightly): deuda medida, anotada en la fila E4.
- E6, que depende de esta etapa, sigue `bloqueado` hasta que se tome con "dale";
  el renombre `ot_ot_in_it_zone` hay que decidirlo antes de que ese id entre en
  `alerts`.

Formato fijo de cada entrada (no borrar los encabezados; una entrada por etapa
cerrada o por bloqueo nuevo):

```markdown
### AAAA-MM-DD · ETAPA · agente

- **Qué se hizo:** …
- **Comando ejecutado:** `…`
- **Salida:** …
- **Qué quedó pendiente:** … (o «nada comprobado», nunca «resuelto» si algo quedó abierto)
```
