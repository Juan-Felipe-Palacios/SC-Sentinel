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
| E2.0 | Spike de firmas: 4 fixtures binarios y test de offsets | Aprobación M6, E0 | `bloqueado` | Los 4 protocolos clasifican según la tabla normativa M4 | — | — |
| E2 | Contrato `ot` en schema + Zod + serde + fixtures (un solo cambio) | E2.0 | `bloqueado` | `verify-contracts.sh`, `validate-contracts.js` y `test-contracts-zod.mjs` verdes | — | — |
| E3 | Migración `0017_ot-assets.sql` y `web/lib/ot/` (upsert condicional) | E2, E1 | `bloqueado` | `--dry-run` correcto + tests de retención, conteo y reaplicación | — | — |
| E4 | Crate `sc-ot`: 4 parsers puros, peek LRU 4096, alineación 0–7 | E2 | `bloqueado` | Fuzz no-panic + property test de CRC DNP3 | — | — |
| E5 | `sc-capture`: `forbid(unsafe_code)`, clippy, peek, BPF, degradación | E2 | `bloqueado` | Compila con y sin `--features live`; gate detecta un socket de prueba | — | — |
| E6 | `sc-detect`: reglas corregidas, baseline SQLite, arming, anti-storm | E4 | `bloqueado` | Reinicio a mitad de aprendizaje conserva `observed_windows` | — | — |
| E7 | `/api/ingest`: dos pasadas, techo de confianza, upsert, downlink | E2, E3 | `bloqueado` | ≤3 statements extra, `EXPLAIN` sin scan nuevo, fixture 0.1.8 en 200 | — | — |
| E8 | UI: badge de protocolo en la matriz y tab "Activos OT" | E3 | `bloqueado` | `typecheck`, `lint` y `build` verdes; la tab no muestra datos sintéticos | — | — |
| E9 | Demo sintética TEST-NET con los dos disclaimers | E8 | `bloqueado` | Badge `confirmed` visible con "Flujo Modbus sintético…" y "Evidencia sintética" | — | — |
| E10 | Empaquetado `linux-x64-sensor` y `verify-passive.sh` en CI | E5, E6 | `bloqueado` | Dry-run del target nuevo y `verify-agent.ps1` con 15 archivos | — | — |

Bloqueos por gate del propietario (no se resuelven por cuenta propia):
aprobación de M6 (`docs/plans/etapa-2-backlog.md:49`), aplicación de `0017` a
producción (N3), B-028 y el renombre de `ot_ot_in_it_zone`. Detalle en
`plan-implementacion.md` §6.

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

Formato fijo de cada entrada (no borrar los encabezados; una entrada por etapa
cerrada o por bloqueo nuevo):

```markdown
### AAAA-MM-DD · ETAPA · agente

- **Qué se hizo:** …
- **Comando ejecutado:** `…`
- **Salida:** …
- **Qué quedó pendiente:** … (o «nada comprobado», nunca «resuelto» si algo quedó abierto)
```
