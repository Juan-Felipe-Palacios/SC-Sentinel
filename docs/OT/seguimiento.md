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
| E4 | Crate `sc-ot`: 4 parsers puros, peek LRU 4096, alineación 0–7 | E2 | `hecho` | Fuzz no-panic + property test de CRC DNP3 | Crate `sc-ot` nuevo (`agent/crates/sc-ot/`): 4 parsers puros, `PeekCache` LRU 4096 por 5-tupla/dirección con 2 intentos y congelamiento tras `Confirmed`, alineación 0–7 en `classify_aligned`. Gate: `cargo fmt --all --check` exit 0; `cargo clippy --workspace --all-targets -- -D warnings` exit 0; `cargo test -p sc-ot` → `37 passed` (unit) + `5 passed` (fixtures) + `6 passed` (properties), 0 failed; `cargo test --workspace` exit 0 con `sc-core ot_signatures` 14/14 intacto. Paridad con los 12 fixtures de E2.0: 4 confirmados con su protocolo y 8 en `Reject`, incluido CRC DNP3 roto. `proptest` 256 casos: bytes arbitrarios de 0–2048 nunca paniquean; DNP3 sólo confirma con CRC válido (property test del criterio). **Fuzz real: deuda medida**, `cargo fuzz` no está instalado y la toolchain es `stable` (decisión del propietario 2026-11-26). **CI en verde:** `Rust CI` 45828598517 sobre `cafa7ab`, ambos jobs en success, con `sc_ot` 37, `ot_fixtures` 5 y `properties` 6 en `0 failed` sobre ubuntu y `cargo deny check licenses` → `licenses ok`. El push de `52b98a7` había fallado por dos causas ajenas al alcance: `sc-ot` sin bloque en `agent/deny.toml` y el fixture HTTP normalizado a LF por git; se corrigieron en `cafa7ab` sin cambiar ninguna assertion. | 2026-11-26 · Buffy |
| E5 | `sc-capture`: `forbid(unsafe_code)`, clippy, peek, BPF, degradación | E2 | `pendiente` | Compila con y sin `--features live`; gate detecta un socket de prueba | Dependencia E2 `hecho` el 2026-11-26; tomable con dale | 2026-11-26 · Buffy |
| E6 | `sc-detect`: reglas corregidas, allowlist, anti-storm | E4 | `hecho` | Miembro/no miembro de allowlist + anti-storm sin duplicar | Nuevo `agent/crates/sc-detect/src/ot.rs`: `Allowlist` (`host_key` + protocolo + puerto, tope 64, `from_lines`/`from_path`, versión para evidencia), `OtObservation`, `OtConfig` y `OtDetector::observe(sequence, obs)` con `ot_new_master`, dedup por clave y anti-storm por cooldown de ventanas (120 por defecto, **supuesto**). Evidencia del evento `{fn_codes: CSV, allowlist_version}`, recortada a 128 chars y 8 códigos. Gate: `cargo fmt --all --check` exit 0; `cargo clippy --workspace --all-targets -- -D warnings` exit 0; `cargo test -p sc-detect` → `33 passed; 0 failed` (20 previos + 13 nuevos); `cargo test --workspace` → 33 suites `ok`, 0 fallos. Criterios: miembro/no miembro (también con protocolo o puerto distinto), anti-storm dentro del cooldown y reintento de la misma ventana sin duplicar. Gate del renombre cerrado por el propietario: D7 en `docs/roadmap.md`. **CI de Rust 45835501319 sobre `a6d51ff`: `completed/success`**, `test (ubuntu-latest)` y `test (windows-latest)` en success, con `Running unittests src/lib.rs (sc_detect-…)` → `test result: ok. 33 passed; 0 failed` en ubuntu, `cargo clippy -- -D warnings`, `cargo audit`, `cargo deny check licenses` y el build con captura live en Windows también en verde. | 2026-11-26 · Buffy |
| E7 | `/api/ingest`: dos pasadas, techo de confianza, upsert, downlink | E2, E3 | `hecho` | ≤3 statements extra, `EXPLAIN` sin scan nuevo, fixture 0.1.8 en 200 | Lote OT = **1** statement (test de presupuesto); `EXPLAIN` = `ModifyTable/Insert` + árbitro `ot_assets_device_id_host_key_key` + `Values Scan` (0 `Seq Scan`, medido en PGlite); fixture 0.1.8 → **200** en los tres casos (`pnpm test`: 382 passed); techo de confianza según ADR-0023. | 2026-11-26 · Buffy |
| E8 | UI: badge de protocolo en la matriz y tab "Activos OT" | E3 | `pendiente` | `typecheck`, `lint` y `build` verdes; la tab no muestra datos sintéticos | Dependencia E3 `hecho` el 2026-11-26; tomable con dale | 2026-11-26 · Buffy |
| E8.1 | Card «Mapa OT observado»: nodos + aristas reales | E7, E8 | `hecho` | `metric=topology` con nodos/aristas acotados (≤40 nodos, ≤80 aristas); empty state; distingue «sin datos» de «sin aristas»; sin IP/MAC ni aristas inventadas; build verde | Ruta `app/api/query/__tests__/route.topology.test.ts` (estilo `route.ot.test.ts`, mock de auth/Neon/dedup): 4/4 — device real sin `ot_assets` → payload vacío (nodes=[], edges=[]); device real con activos y alertas → 2 nodos y 1 arista real; demo sintético → nodos y aristas sin tocar la base; rango inválido → 400. `lib/query/__tests__/ot-topology.test.ts`: 4/4 (`deriveOtEdges`). `tsc --noEmit` exit 0; `pnpm lint` exit 0 (5 warnings); `pnpm build` exit 0. Caps en código (`OT_TOPOLOGY_NODE_CAP=40`, `OT_TOPOLOGY_EDGE_CAP=80`, `OT_TOPOLOGY_ACTIVE_DAYS=30`). | 2026-11-26 · Buffy |
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

### 2026-11-26 · E4 · CI en verde y dos correcciones ajenas al alcance
**Qué se hizo**
Se empujó E4 (`52b98a7`) y `Rust CI` falló. Diagnóstico y corrección en
`cafa7ab`: `sc-ot` no tenía su bloque `[[licenses.clarify]]` en
`agent/deny.toml`, y git guardaba `neg_http_on_ot_port.bin` con LF, así que el
fixture medía 15 bytes en Linux contra 16 en Windows y
`ot_signatures_neg_http_reject` fallaba sólo en CI. Se agregó el bloque de
licencia y un `.gitattributes` que deja los `.bin` de `agent/fixtures/ot/` sin
conversión de fin de línea; no se cambió ninguna assertion.
**Comando ejecutado**
- `git push origin main`; `gh run watch 45828598517 --exit-status`;
  `cargo deny check licenses`;
  `git cat-file -p :agent/fixtures/ot/neg_http_on_ot_port.bin | wc -c`.
**Salida**
- `Rust CI` 45828598517 sobre `cafa7ab`: `completed/success`, con
  `test (ubuntu-latest)` y `test (windows-latest)` en success.
- En ubuntu: `sc_ot` `37 passed`, `ot_fixtures` `5 passed`, `properties`
  `6 passed`, los tres en `0 failed`.
- `cargo deny check licenses` → `licenses ok`; blob del fixture → `16`.
- Antes del arreglo: `Rust CI` 45826737694 sobre `52b98a7` → failure en los dos
  jobs (`error[unlicensed]: sc-ot` y `left: 15 / right: 16` en
  `sc-core/tests/ot_signatures.rs:338`).
**Qué quedó pendiente**
- El commit de esta entrada queda local hasta que se autorice el push.
- Deuda de fuzz sin cambios; E6 espera su "dale" y la decisión del renombre
  `ot_ot_in_it_zone`.

### 2026-11-26 · E6 · regla `ot_new_master` en `sc-detect`
**Qué se hizo**
Nuevo módulo `agent/crates/sc-detect/src/ot.rs` con la allowlist local
(`host_key` + protocolo + puerto, tope de 64 entradas, versión para la
evidencia), la regla `ot_new_master` y el anti-storm. La allowlist se carga en
memoria o desde archivo y el protocolo se valida contra el enum de `sc-ot`, así
que no hay cadenas libres. `OtDetector::observe(sequence, observaciones)`
deduplica por clave (cliente + servidor + protocolo), recorta la evidencia a los
topes del contrato y suprime la misma clave durante `cooldown_windows`
ventanas, de modo que un reintento de la misma ventana no duplica nada.
**Comando ejecutado**
- `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test -p sc-detect`, `cargo test --workspace`.
**Salida**
- `fmt` exit 0; `clippy` exit 0 (`Finished dev profile`, sin warnings).
- `cargo test -p sc-detect` → `test result: ok. 33 passed; 0 failed` (20 previos
  + 13 nuevos de `ot::tests`).
- `cargo test --workspace` → 33 suites en `test result: ok`, sin `FAILED`.
**Qué quedó pendiente**
- Las demás reglas OT (escrituras fuera de horario, descarga de programa, cambio
  de estado de CPU y `ot_it_zone_crossing`) quedan para F1.5/F2: necesitan PDU
  de aplicación que `sc-ot` todavía no recorre.
- `cooldown_windows = 120` es un supuesto, no una medición; se ajusta con el
  piloto OT.
- El push y el CI de Rust quedan pendientes de autorización.

### 2026-11-26 · E6 · CI de Rust en verde (rebase del push)

- **Qué se hizo:** se empujó E6 con el registro del CI de E4 y el roadmap, tras sacar
  del `main` local dos commits `chore` ajenos (`018bbab`, `5d14466`) que borraban
  `AGENTS.md`, `skills-lock.json`, `opencode.jsonc` y los 99 archivos de skills para
  dejarlos gitignoreados. Motivo: ese push ponía `Skills CI` en rojo, porque
  `scripts/check-skills.ps1:36` declara `.opencode/skills` como fuente `Required` y
  el commit borraba el directorio; además sacaba las reglas del proyecto del
  repositorio sin decisión explícita. Se hizo `git rebase --onto 72a3346 5d14466
  main`, que reescribe sólo historia local (los dos commits nunca se publicaron).
  Los archivos ignorados siguen en disco y volvieron a estar versionados.
- **Comando ejecutado:** `git rebase --onto 72a3346 5d14466 main`; luego
  `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` sobre el árbol rebasado; `git push origin main`;
  `gh run watch 45835501319 --exit-status`.
- **Salida:** `Successfully rebased and updated refs/heads/main`; historia
  `72a3346 → f924395 → a6d51ff`; `git log --all` sin `018bbab`/`5d14466`; árbol
  limpio (0 líneas) y `AGENTS.md`, `opencode.jsonc`, `skills-lock.json` otra vez
  tracked (99 archivos de skills). `fmt` exit 0, `clippy` exit 0, `cargo test
  --workspace` exit 0 sin `FAILED`. Push `cafa7ab..a6d51ff`; `Rust CI`
  45835501319 → `completed/success` en ambos jobs, `sc_detect` 33 passed.
- **Qué quedó pendiente:** `Skills CI` no se corrió en este push (los paths que lo
  disparan no cambiaron), así que queda como **no verificado**; el backup de los
  archivos ignorados en `/tmp/sc-ignored-backup` (103 archivos) no se borró.

### 2026-11-26 · E7 · arranque (dos pasadas + upsert de `ot_assets`)

- **Qué se hizo:** se marcó la fila E7 `en curso` antes de tocar código y se
  implementó la parte de persistencia del ingest pasivo OT: (a) dos pasadas, con
  `WindowSnapshotSchema` aceptando `ot` como `unknown` y `OtBlockSchema` validando
  aparte en `web/app/api/ingest/route.ts`, de modo que un bloque `ot` malformado se
  descarta con el evento estructurado `ot_block_discarded` y la ventana sigue
  (nunca 4xx por OT); (b) `web/lib/ot/from-snapshot.ts` traduce `ot.events` a
  alertas con `client`/`server` dentro de `evidence` (se escriben primero para que
  el tope de 32 claves no los recorte; arrays → CSV y valores ≤128 chars) y agrega
  endpoints/eventos en un activo por `host_key`; (c) `buildOtAssetsUpsertStatement`
  emite un único `INSERT ... VALUES (...),(...) ON CONFLICT (device_id, host_key)
  DO UPDATE ... WHERE ot_assets.last_seen < EXCLUDED.last_seen`, que preserva la
  guarda de `seen_windows` por fila; (d) `buildPersistStatements` acepta `otAssets`
  y no agrega statement cuando no hay activos. Se actualizó
  `scripts/test-contracts-zod.mjs` al contrato de dos pasadas (el fixture malformado
  ya no debe fallar en el core) y se sumó `web/lib/ot/__tests__/from-snapshot.test.ts`.
- **Comando ejecutado:** `cd web && pnpm test`; `node node_modules/typescript/bin/tsc
  --noEmit`; `pnpm lint`; `bash scripts/verify-contracts.sh`.
- **Salida:** `pnpm test` → 66 archivos / 373 tests passed (43 en `lib/ot` +
  `lib/ingest`, incluido el presupuesto de statements: el lote OT agrega **1**
  statement, criterio ≤3); `tsc --noEmit` exit 0; `pnpm lint` exit 0 con 5 warnings
  previos en `lib/query/__tests__/*`; contratos `# pass 11 # fail 0` → "Contratos OK
  (Rust + JSON Schema + Zod)". El lint local no arrancaba por un `node_modules`
  desincronizado (faltaba `@next/eslint-plugin-next` resoluble desde `web/`); se
  reparó con `pnpm install --force --frozen-lockfile` (exit 0, lockfile intacto).
- **Qué quedó pendiente:** el **techo de confianza** sigue bloqueado: el diseño
  (`docs/designs/m6-passive-ot-identification.md:144`) pide degradar `confirmed →
  hint` cuando `capture_mode == "collector"`, pero el contrato usa `confidence`
  numérico (`agent/crates/sc-core/src/types.rs:208`) y `capture_mode` sólo admite
  `live|offline`, así que la regla no es representable sin cambiar el contrato.
  También quedan sin medir el `EXPLAIN` del insert y una prueba HTTP real de
  `/api/ingest` con el fixture 0.1.8 (los tests cubren las funciones puras y el
  builder, no la ruta contra la base). No se commiteó ni se empujó nada de E7.

### 2026-11-26 · E7 · cierre (techo de confianza, EXPLAIN y ruta)

- **Qué se hizo:** se resolvió el bloqueo del techo de confianza con la opción (a):
  `applyConfidenceCeiling` degrada a 0.7 los eventos con `confidence >= 0.9` cuando
  `capture_mode == "offline"`, deja `evidence.confidence_ceiling = "hint:offline:0.7"`
  y registra `ot_confidence_downgraded`; `live` pasa intacto. La regla literal del
  diseño (`collector` → `hint`) queda para F2 porque `capture_mode` no admite
  `collector` ni `confidence` es un enum: se documentó en **ADR-0023** y se anotó
  en el diagrama del diseño. Se sumó la medición que faltaba: (1) `EXPLAIN (FORMAT
  JSON)` del lote contra PostgreSQL real (PGlite): `ModifyTable`/`Insert` sobre
  `ot_assets`, `Conflict Arbiter Indexes = [ot_assets_device_id_host_key_key]`,
  `Conflict Filter = (ot_assets.last_seen < excluded.last_seen)` y un `Values Scan`;
  (2) prueba de la ruta real `POST /api/ingest` con los tres fixtures 0.1.8
  (sin OT, válido, malformado), sustituyendo solo auth, Neon y la consulta de dedup.
- **Comando ejecutado:** `cd web && pnpm test`; `pnpm typecheck`; `pnpm lint`;
  `bash scripts/verify-contracts.sh`.
- **Salida:** `pnpm test` → 67 archivos / **382 tests passed**, incluidos: malformado
  → **200** con `ot_block_discarded` y sin `INSERT INTO ot_assets`; válido → **200**,
  un solo `INSERT INTO ot_assets` y dos alertas con `client`/`server` en `evidence`;
  sin OT → **200** sin statement de activos. `typecheck` exit 0; `lint` exit 0 (5
  warnings previos de `lib/query/__tests__/*`); contratos `# pass 11 # fail 0`.
  Presupuesto de statements extra de OT: 1 activos + 2 alertas = **3**, el tope del
  criterio.
- **Qué quedó pendiente:** el techo y sus umbrales (0.9 / 0.7) son **supuestos**, no
  mediciones: se ajustan con el piloto OT y se registran en el roadmap (ADR-0023).
  El push de esta etapa no se hizo: `main` despliega producción web (AGENTS §3, N2),
  así que requiere un "dale" explícito para ese SHA.

### 2026-11-26 · E8.1 · Buffy

- **Qué se hizo:** cerrada E8.1 con prueba de la ruta real `GET /api/query?metric=topology` al estilo de `route.ot.test.ts` (mock de auth, Neon y dedup; read model real): device real sin `ot_assets` → payload vacío; device real con activos y alertas → nodos y arista real; demo sintético → nodos y aristas sin tocar la base; rango inválido → 400. Más la prueba unitaria de `deriveOtEdges`. La card «Mapa OT observado» queda con nodos de `ot_assets` activos (≤30 d), aristas sólo de pares client/server presentes en alertas OT, topes 40/80, sin IP/MAC ni aristas inventadas.
- **Comando ejecutado:** `cd web && node node_modules/vitest/vitest.mjs run app/api/query`; `cd web && node node_modules/vitest/vitest.mjs run lib/query/__tests__/ot-topology.test.ts`; `cd web && node node_modules/typescript/bin/tsc --noEmit`; `cd web && pnpm lint`; `cd web && pnpm build`.
- **Salida:** ruta → `Test Files 1 passed (1)`, `Tests 4 passed (4)` (vacío, nodos+arista, sintético, 400); `deriveOtEdges` → `Test Files 1 passed (1)`, `Tests 4 passed (4)`; `tsc` exit 0; `lint` exit 0 (5 warnings previos); `build` exit 0.
- **Qué quedó pendiente:** la verificación manual del empty state en la UI (card sin datos vs. sin aristas) no se hizo en esta sesión; el techo numérico de confianza (0.9/0.7) sigue siendo supuesto (ADR-0023). Commit `ea42c85` (E8.1) sigue sin empujarse: requiere "dale" explícito (N2).

### 2026-11-27 · E8.1 · Buffy

- **Qué se hizo:** se intentó aplicar las migraciones pendientes a la base de `web/.env.local` para habilitar el smoke HTTP de `GET /api/query?metric=topology` y se verificó el camino HTTP con la sesión de demo (guest), que no toca la base. La base configurada **no es local**: es un proyecto Neon alojado (`ep-snowy-mode-bddrm1u4-pooler.c-8.us-east-2.aws.neon.tech`) que responde **HTTP 402 «exceeded the quota»** a cualquier consulta, incluido `SELECT 1`; por eso no se pudo leer el ledger ni aplicar nada. Se endureció `scripts/apply-migrations.mjs`: antes, cualquier fallo al leer `sc_schema_migrations` se interpretaba como «no hay ledger» y reportaba las 18 migraciones como pendientes (habría lanzado DDL no idempotente); ahora sólo `42P01` significa base sin ledger y cualquier otro error aborta con código 1. También se eliminó un `case 'topology'` duplicado en `syntheticResponse` (`web/app/api/query/route.ts`).
- **Comando ejecutado:** `node scripts/apply-migrations.mjs --dry-run --env-file web/.env.local`; `node /tmp/probe-db.mjs`; `cd web && pnpm dev -H 127.0.0.1 -p 3123` + `curl 'http://127.0.0.1:3123/demo?next=/dashboard/overview' -c cookies` y `curl -b cookies 'http://127.0.0.1:3123/api/query?metric=topology&range=1h'`; `cd web && pnpm exec eslint app/api/query/route.ts`; `cd web && node node_modules/typescript/bin/tsc --noEmit`.
- **Salida:** `SELECT 1` → `NeonDbError: Server error (HTTP status 402): Your account or project has exceeded the quota`; runner (tras el endurecimiento) → `no se pudo leer sc_schema_migrations: … 402 …` con `EXIT=1`; `GET /demo` → 307 con cookie `sc_guest`; `GET /api/query?metric=topology&range=1h` → **200**, `application/json`, claves `range,period,nodes,edges,truncated`, **5 nodos / 2 aristas** sintéticas (`demo_edge_ar_01`, `demo_db_ar_04`), sin IP ni MAC en el cuerpo; `eslint` exit 0; `tsc` exit 0. No se aplicó ninguna migración: **0 pendientes resueltos**.
- **Qué quedó pendiente:** las migraciones siguen sin aplicarse porque la cuota del proyecto Neon bloquea la base (hace falta ampliar el plan o apuntar `DATABASE_URL` a una base accesible). Con la base inaccesible no se puede saber si el ledger `sc_schema_migrations` existe ni qué migraciones faltan; si la base se creó antes del runner, habrá que sembrar el ledger como indica `docs/runbooks/apply-db-migrations.md` antes de aplicar. El camino de device real de `metric=topology` sigue **no verificado por HTTP**; sólo el sintético. Sigue pendiente el empty state manual en la UI y el push de `ea42c85` (N2).

### 2026-11-27 · E8.1 (base de dev local con PGlite) · Buffy

- **Qué se hizo:** como la cuota de Neon sigue en HTTP 402 y no hay Docker ni `psql` en la máquina, se agregó una base de desarrollo local con PGlite (PostgreSQL 17 en WASM, ya como `devDependency`) detrás del flag `SC_DEV_DB=pglite`, inerte fuera de desarrollo. `web/lib/db/index.ts` elige el driver según el flag y `web/lib/db/local-pglite.ts` carga PGlite con `require` en runtime y specifiers en variables para no meterlo en el bundle. `web/scripts/seed-local-dev-db.mjs` (`pnpm dev:seed`) aplica las migraciones reales (0000–0016 con el migrator de Drizzle y `0017_ot-assets.sql` a mano) y siembra un device **no demo** (`dev_local_ot`) con 3 activos OT, 1 ventana y 3 alertas OT. Receta en `docs/runbooks/local-development.md` §9.
- **Comando ejecutado:** `cd web && pnpm dev:seed`; `SC_DEV_DB=pglite SC_DEV_AUTH=1 pnpm dev -H 127.0.0.1 -p 3123`; `curl 'http://127.0.0.1:3123/api/query?metric=topology&range=24h&device_id=dev_local_ot'`; `tsc --noEmit`; `pnpm lint`; `vitest run lib/db/__tests__/local-pglite.test.ts app/api/query lib/query/__tests__/ot-topology.test.ts`; `pnpm build`.
- **Salida:** siembra → `nodes: 3`, `otAlerts: 3`, `migrationsApplied: 17`; `GET` → **200**, 3 nodos reales de `ot_assets` (client modbus, server s7comm y uno sin alertas) y **1 arista** `a1b2c3d4e5f60718 → 18f60718a1b2c3d4` con `count: 2`; la alerta `ot_unexpected_peer` (extremo `ffffffffffffffff`, que no es nodo) **no** produjo arista; sin IP ni MAC en el cuerpo. Flag: 5/5 tests. Gates: `tsc` exit 0, `lint` exit 0 (5 warnings previos), ruta+read model 17/17, `build` exit 0. Bundle de producción sin rastro de PGlite: `grep -rli 'electric-sql' .next/server .next/static` → **0** archivos (antes, con el specifier literal, webpack metía un chunk de 911 671 bytes con el runtime de PGlite en todas las rutas).
- **Qué quedó pendiente:** el camino sigue sin verificar contra Neon real (cuota 402), así que no se pudieron aplicar migraciones ni probar el device de producción; PGlite no ejercita pooling ni el protocolo HTTP de Neon. El empty state de la card se verificó después en la UI (ver entrada «empty state de «Mapa OT observado»»).

### 2026-11-27 · E8.1 (0017 en el journal + chequeo de integridad) · Buffy

- **Qué se hizo:** `0017_ot-assets.sql` entró al journal de Drizzle
  (`web/lib/db/migrations/meta/_journal.json`, `idx: 17`, `when` = mtime del
  archivo), así que `migrate()` la aplica como cualquier otra: se eliminó el
  paso manual en `web/scripts/seed-local-dev-db.mjs` y el fallback
  `applyMigration()` de `web/lib/ot/__tests__/migration.integration.test.ts`. Nuevo
  `scripts/check-migrations-journal.mjs` (sólo lectura) que compara el conjunto
  y el orden de los `.sql` contra el journal (índices, tags, duplicados) y sale 1
  ante cualquier divergencia. `scripts/apply-migrations.mjs` lo ejecuta antes de
  leer `DATABASE_URL` y toma la lista de migraciones del journal (no de
  `readdir`); `pnpm test` del web lo suma a su gate (`web/package.json`). Prueba
  offline: `scripts/test-migrations-journal.mjs` (6 casos).
- **Comando ejecutado:** `node scripts/check-migrations-journal.mjs`;
  `node scripts/test-migrations-journal.mjs`; `cd web && pnpm dev:seed -- --reset`;
  `pnpm exec vitest run lib/ot/__tests__/migration.integration.test.ts`;
  `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`.
- **Salida:** checker → `journal: 18 entradas; archivos .sql: 18`, `ok: journal y
  directorio coinciden (18 migraciones)`, exit 0. Self-test → `6/6`, exit 0. Siembra
  → `nodes: 3`, `otAlerts: 3`, `migrationsApplied: 18` (sin reset: falla con
  `relation "ot_assets" already exists`, comportamiento esperado para directorios
  previos al cambio). Vitest → 11/11. Lint → 0 errores (5 warnings previos).
  Typecheck → 0. `pnpm test` → exit 0 (incluye el checker). Build → exit 0.
- **Qué quedó pendiente:** directorios `.local-db` creados antes del cambio
  requieren un `pnpm dev:seed -- --reset` único (documentado en el runbook
  local §9.2). El empty state de la card se verificó después en la UI (ver entrada «empty state de «Mapa OT observado»»).

### 2026-11-27 · E8.1 (empty state de «Mapa OT observado») · Buffy

- **Qué se hizo:** se verificó en la UI real los tres estados de la card con la
  base PGlite sembrada: device sin activos (`DEFAULT_DEVICE_ID=dev_sin_ot`),
  `dev_local_ot` en ventana `1h` (activos sin aristas) y en `24h` (activos +
  arista). Como no hay jsdom ni `@testing-library` en el proyecto (el include de
  vitest sólo toma `*.test.ts`, así que los componentes se prueban por SSR con
  `renderToStaticMarkup`, igual que `AsnDistribution`), se agregó
  `web/components/dashboard/__tests__/OtNetworkMap.test.ts` con 4 casos: activos
  sin aristas, arista cliente/servidor, par con extremo inexistente y fallback de
  etiqueta a `host_key`. El caso del par inexistente destapó que el mapa no
  dibujaba la arista pero tampoco mostraba el aviso de vacío (card muda):
  `OtNetworkMap` ahora calcula `drawn` (pares con ambos extremos entre los nodos)
  y usa esa cuenta tanto para las `<line>` como para el mensaje.
- **Comando ejecutado:** `cd web && pnpm dev:seed`;
  `SC_DEV_DB=pglite SC_DEV_AUTH=1 ADMIN_SECRET= DEFAULT_DEVICE_ID=dev_sin_ot pnpm dev -H 127.0.0.1 -p 3123`
  (login local «Admin», sin tocar secretos reales: `SC_DEV_AUTH` sólo cubre las
  APIs, `/dashboard/*` exige cookie de sesión); `pnpm exec vitest run components/dashboard/__tests__/OtNetworkMap.test.ts`;
  `pnpm typecheck`; `pnpm lint`.
- **Salida:** sin activos → «Sin activos OT observados en el período.»;
  `dev_local_ot` con `?range=1h` → 3 nodos, **0** `<line>` y «Sin aristas
  observadas: solo se muestran los activos OT.»; con `?range=24h` → 3 nodos,
  **1** `<line>` y sin aviso. Test 4/4, typecheck exit 0, lint exit 0 (5 warnings
  previos).
- **Qué quedó pendiente:** la card no distingue «el device no reportó activos» de
  «no hubo activos en esta ventana» (mismo texto para ambos casos); si se quiere
  esa distinción hace falta cambiar el contrato de `/api/query?metric=topology`.
  Neon sigue en HTTP 402, así que nada de esto se probó contra la base real.

 Formato fijo de cada entrada (no borrar los encabezados; una entrada por etapa
cerrada o por bloqueo nuevo):

```markdown
### AAAA-MM-DD · ETAPA · agente

- **Qué se hizo:** …
- **Comando ejecutado:** `…`
- **Salida:** …
- **Qué quedó pendiente:** … (o «nada comprobado», nunca «resuelto» si algo quedó abierto)
```
