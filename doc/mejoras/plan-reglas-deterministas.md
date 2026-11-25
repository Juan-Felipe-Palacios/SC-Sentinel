# Plan detallado — Reglas deterministas antes del spool/persistencia/deploy

> Archivo: `doc/mejoras/plan-reglas-deterministas.md`
> Fecha: 2026-11-22

## 1. Resumen ejecutivo

Insertar una **capa de validación síncrona (gate)** que rechace datos inválidos **antes** de:
1. Encolar en el spool del agente.
2. Escribir en disco/persistencia (Neon).
3. Hacer push/despliegue en GitHub.

El plan se divide en **5 fases** con **27 reglas candidatas**, ordenadas por riesgo y dependencias. Cada regla incluye: motivo, archivos, implementación sugerida, tests, criterios de aceptación.

---

## 2. Convenciones y restricciones

- **Autorización**: N2/N3 explícito por acción (AGENTS §3).
- **Contratos**: cambio de contrato = spec + `docs/contracts/*` + Zod/serde + tests (AGENTS §13).
- **Orden de despliegue**: contrato web → despliegue web → agente (AGENTS §7).
- **Privacidad**: clase C nunca sale del nodo (AGENTS §8).
- **Verificación**: cada regla debe tener test; no se excluyen tests para lograr verde.

---

## 3. Fase A — Gate antes del spool (agente Rust) — Prioridad alta

### A1. Validación de contrato del envelope antes de persistir
- **Motivo**: Un payload inválido puede envenenar el spool y consumir ciclos.
- **Archivos**: `agent/crates/sc-agent/src/main.rs`, `agent/crates/sc-sync/src/spool.rs`, `agent/crates/sc-core/src/types.rs`
- **Implementación**: Gate síncrono que valide snapshot contra schema (campos obligatorios, rangos, max arrays) antes de `push_uncompressed`; si falla → dead-letter + log, no persistir.
- **Tests**: `cargo test -p sc-sync` con fixture inválido; `cargo test --workspace`.
- **Criterio**: Payload inválido retorna error y no aparece en spool.

### A2. Coherencia temporal de la ventana
- **Motivo**: Evitar ventanas con `start >= end` o `duration_ms` incoherente.
- **Archivos**: `agent/crates/sc-agent/src/main.rs`, `agent/crates/sc-aggregate/src/window.rs`
- **Implementación**: `start < end`, `duration_ms == end - start` (± 1s), `sequence` monotónica por device.
- **Tests**: proptest en `sc-aggregate`.
- **Criterio**: Ventana incoherente se descarta con log.

### A3. Validación de `host_key`
- **Motivo**: Evitar claves vacías o con PII.
- **Archivos**: `agent/crates/sc-aggregate/src/accumulator.rs`, `agent/crates/sc-agent/src/main.rs`
- **Implementación**: Regex `^[a-zA-Z0-9_-]{8,64}$` (o HMAC hex) antes de persistir.
- **Tests**: Test unitario.
- **Criterio**: Clave inválida se rechaza.

### A4. Top arrays acotados en Rust
- **Motivo**: Los max (50/50/30/30/50) existen en Zod/web pero no en el agente.
- **Archivos**: `agent/crates/sc-aggregate/src/snapshot.rs`, `agent/crates/sc-agent/src/main.rs`
- **Implementación**: Truncar arrays al construir snapshot; rechazar si excede (no silencioso).
- **Tests**: Test + bench de throughput.
- **Criterio**: Arrays truncados y log de truncamiento.

### A5. Límite de spool por número de filas
- **Motivo**: Hoy solo por bytes; runaway posible.
- **Archivos**: `agent/crates/sc-sync/src/spool.rs`
- **Implementación**: `max_pending_batches` (config) además de `max_bytes`; rechazar si se supera.
- **Tests**: Test de retención.
- **Criterio**: Spool rechaza si supera cap.

### A6. Hash de payload antes de spool
- **Motivo**: Integridad end-to-end.
- **Archivos**: `agent/crates/sc-agent/src/main.rs`, `agent/crates/sc-sync/src/envelope.rs`
- **Implementación**: Calcular `payload_hash` (SHA-256) en el agente; verificar en sync.
- **Tests**: Test de idempotencia.
- **Criterio**: Hash coincide en reenvío.

### A7. Dedup de ventanas solapadas
- **Motivo**: Evitar duplicados por reloj desalineado.
- **Archivos**: `agent/crates/sc-sync/src/spool.rs`
- **Implementación**: Rechazar si `start` cae dentro de una ventana ya en spool.
- **Tests**: Test de integración.
- **Criterio**: Ventana solapada se rechaza.

---

## 4. Fase B — Gate antes de persistencia (web/backend) — Prioridad alta

### B1. Validación de `device.id` vs token en persist
- **Motivo**: Defensa en profundidad.
- **Archivos**: `web/lib/ingest/persist.ts`, `web/app/api/ingest/route.ts`
- **Implementación**: `buildPersistStatements` verifica que `deviceId` coincida con token autenticado; si no → 403.
- **Tests**: Test unitario en persist.
- **Criterio**: Mismatch retorna 403.

### B2. Idempotencia por `payload_hash`
- **Motivo**: Auditoría de reenvíos.
- **Archivos**: `web/lib/ingest/persist.ts`, `web/app/api/ingest/route.ts`
- **Implementación**: Si `existingBatch` y `payload_hash` difiere → 409 (no 200 duplicate).
- **Tests**: Test de integración.
- **Criterio**: Reenvío con hash distinto retorna 409.

### B3. Límite de `top_hosts` por `host_key` único
- **Motivo**: Evitar duplicados dentro de la misma ventana.
- **Archivos**: `web/lib/ingest/persist.ts`
- **Implementación**: Dedup por `host_key` antes de insertar.
- **Tests**: Test unitario.
- **Criterio**: Duplicados eliminados.

### B4. Validación de `risk_score` por host
- **Motivo**: Asegurar rango 0-1.
- **Archivos**: `web/lib/schemas/ingest.ts`, `web/lib/ingest/persist.ts`
- **Implementación**: Zod ya valida; agregar check en persist (defensa).
- **Tests**: Test.
- **Criterio**: Score fuera de rango rechazado.

### B5. Sanitización de `last_error`
- **Motivo**: Clase C nunca sale del nodo.
- **Archivos**: `web/lib/ingest/persist.ts`, `web/lib/risk/heuristic.ts`
- **Implementación**: Truncar a 500 y eliminar IPs reales (regex) antes de persistir.
- **Tests**: Test de redacción.
- **Criterio**: IPs reales redactadas.

### B6. Transacción atómica con rollback explícito
- **Motivo**: Hoy no interactiva; si falla una sentencia, no se revierte parcialmente.
- **Archivos**: `web/lib/ingest/persist.ts`
- **Implementación**: Envolver en transacción con rollback si alguna sentencia falla.
- **Tests**: Test de integración con fallo simulado.
- **Criterio**: Fallo parcial revierte todo.

---

## 5. Fase C — Gate antes de push/despliegue (CI/GitHub) — Prioridad media

### C1. Git hooks (pre-commit/pre-push)
- **Motivo**: No hay hooks activos.
- **Archivos**: Nuevo `.husky/` o `scripts/pre-commit.sh`, `web/package.json`
- **Implementación**: Lint + typecheck + tests rápidos antes de push.
- **Tests**: Ejecutar en local.
- **Criterio**: Hook bloquea push si falla.

### C2. Secret scan en CI
- **Motivo**: Evitar commits con secretos.
- **Archivos**: `.github/workflows/*.yml`, nuevo script
- **Implementación**: gitleaks o trufflehog en PR/push.
- **Tests**: CI verde.
- **Criterio**: Secret detectado falla CI.

### C3. Branch protection / rulesets
- **Motivo**: Configuración remota no verificable.
- **Archivos**: Documentar en `docs/runbooks/` o `.github/`
- **Implementación**: Require PR, status checks, no force-push.
- **Tests**: Checklist manual + captura.
- **Criterio**: Documentado y verificado.

### C4. Validación de migrations antes de deploy
- **Motivo**: Detectar drift de esquema.
- **Archivos**: `.github/workflows/contracts.yml` o nuevo workflow
- **Implementación**: `apply-migrations.mjs --dry-run` en CI.
- **Tests**: CI verde.
- **Criterio**: Drift detectado falla CI.

### C5. Verificación de artefacto publicado
- **Motivo**: SHA256SUMS automático.
- **Archivos**: `.github/workflows/release.yml`
- **Implementación**: Verificar SHA256SUMS en workflow post-release.
- **Tests**: CI verde.
- **Criterio**: Mismatch falla CI.

### C6. CSP enforce en producción
- **Motivo**: Hoy report-only por defecto.
- **Archivos**: `web/lib/security/headers.ts`, `web/middleware.ts`
- **Implementación**: Gate que falle si `CSP_ENFORCE != 1` en prod (decisión del propietario).
- **Tests**: Test + checklist.
- **Criterio**: Enforce activo en prod.

### C7. Contratos en web CI
- **Motivo**: `verify-contracts.sh` no está en web.yml.
- **Archivos**: `.github/workflows/web.yml`
- **Implementación**: Agregar `verify-contracts.sh` (o subset) a web CI.
- **Tests**: CI verde.
- **Criterio**: Contratos validados en CI.

---

## 6. Fase D — Datos/privacidad (clase A/B/C) — Prioridad alta

### D1. Validación de IPs reales en ingest
- **Motivo**: Clase C nunca sale del nodo.
- **Archivos**: `web/app/api/ingest/route.ts`, `web/lib/schemas/ingest.ts`
- **Implementación**: Rechazar payloads con `ip_display` en formato IP real cuando host es remoto (solo LAN permitido).
- **Tests**: Test.
- **Criterio**: IP real rechazada.

### D2. Hash HMAC de `host_key`
- **Motivo**: Verificar que sea HMAC con clave derivada específica.
- **Archivos**: `web/app/api/ingest/route.ts`
- **Implementación**: Validar formato hex + longitud antes de aceptar.
- **Tests**: Test.
- **Criterio**: Clave inválida rechazada.

### D3. Retención de tablas nuevas
- **Motivo**: Toda tabla nueva debe entrar en limpieza.
- **Archivos**: `web/lib/cleanup/*`, `web/app/api/cron/cleanup/route.ts`
- **Implementación**: Check en CI que falle si hay tabla sin política de retención.
- **Tests**: CI verde.
- **Criterio**: Todas las tablas tienen retención.

### D4. Auditoría de costos Neon
- **Motivo**: Medir CU-horas antes/después.
- **Archivos**: `docs/runbooks/`, scripts
- **Implementación**: Documentar medición; no código.
- **Tests**: Manual.
- **Criterio**: Documentado.

---

## 7. Fase E — Detección IA — Prioridad media

### E1. Validación de salida estructurada del LLM
- **Motivo**: Asegurar alertas válidas.
- **Archivos**: `web/lib/ai/*`, `web/lib/chat/validator.ts`
- **Implementación**: Validar contra schema antes de persistir.
- **Tests**: Test.
- **Criterio**: Salida inválida rechazada.

### E2. Presupuesto de IA
- **Motivo**: Si no hay respuesta, alertas igual se emiten.
- **Archivos**: `agent/crates/sc-detect/src/lib.rs`, `web/lib/risk/heuristic.ts`
- **Implementación**: Fallback determinista siempre activo.
- **Tests**: Test.
- **Criterio**: Fallback funciona.

### E3. Congelación de línea base con alertas abiertas
- **Motivo**: No recalcular normalidad con alertas abiertas.
- **Archivos**: `agent/crates/sc-detect/*` (normalidad local)
- **Implementación**: Congelar si hay alertas sin cerrar.
- **Tests**: Test.
- **Criterio**: Congelación efectiva.

---

## 8. Orden de ejecución sugerido

1. **Fase A** (agente) — gates antes del spool.
2. **Fase B** (web) — gates antes de persistencia.
3. **Fase D** (privacidad) — en paralelo con A/B.
4. **Fase C** (CI/GitHub) — después de A/B estables.
5. **Fase E** (IA) — última.

---

## 9. Verificación global

| Cambio | Verificación |
|---|---|
| Rust | `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace` |
| TypeScript | `pnpm typecheck`, `lint`, `test` (con conteo), `build` |
| Contratos | `scripts/verify-contracts.sh` y tests del web |
| Scripts PowerShell | Parseo sin errores, `-DryRun` y pruebas Pester si existen |
| Artefacto del agente | `verify-agent.ps1` sobre el ZIP, SHA contra el manifiesto |
| Documentación | `docs/README.md` consistente; versiones con `check-doc-versions.ps1` |

---

## 10. Lo no verificado

- No se ejecutaron tests ni builds.
- No se verificó la existencia de git hooks ni rulesets remotos.
- Las líneas citadas son del árbol actual; revalidar si cambia.

---

## 11. Autorización

- N2/N3 requeridos para ejecutar cualquier cambio.
- "dale" explícito por acción (AGENTS §3).