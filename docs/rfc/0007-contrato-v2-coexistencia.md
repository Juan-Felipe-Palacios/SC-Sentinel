# RFC-0007 — Contrato v2 y coexistencia de versiones

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §5, §6
**ADRs relacionados:** ADR-0008 (idempotencia), ADR-0009 (compresión)

## 1. Resumen

Definir la estrategia de coexistencia y migración para una futura versión 2 del contrato de ingest (`/api/ingest` v2), manteniendo v1 operativo durante el periodo de transición.

## 2. Motivación

`docs/release/versioning.md` establece que el versionado del contrato es independiente del SemVer de la app y que un cambio de contrato implica nueva versión de schema coexistente o PR conjunto. Hoy solo existe v1 congelado.

## 3. Propuesta

- Introducir `schema_version: 2` en el payload; el servidor acepta v1 y v2 simultáneamente.
- Detección de versión por campo `v` en el body (ya presente como `v: 1`).
- Ruta de migración: agente actualizado envía v2; agentes antiguos siguen en v1 hasta actualizar.
- Spool del agente: batches v1 se reenvían como v1 (no se re-codifican).
- Deprecación de v1 con ventana de 2 releases minor; aviso en changelog.

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| Breaking change (solo v2) | Código más simple | Rompe agentes no actualizados |
| Coexistencia v1+v2 (recomendado) | Migración gradual | Doble código de parseo |
| Negociación por header | Flexible | Complejidad de cliente |

## 5. Impacto

- **Compatibilidad:** non-breaking para clientes v1.
- **Rendimiento:** parseo adicional por versión.
- **Operación:** documentar matriz de compatibilidad (ya en `docs/reference/compatibility-matrix.md`).
- **Testing:** fixtures v1 y v2; tests de coexistencia.

## 6. Plan de implementación

1. Definir schema `ingest-api.v2` (contracts/).
2. Actualizar zod (web) y serde (agent) para aceptar ambas versiones.
3. Añadir tests de coexistencia.
4. Actualizar `compatibility-matrix.md` y `versioning.md`.
5. Plan de deprecación de v1.

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Divergencia v1/v2 | Media | Alto | Tests de equivalencia de comportamiento |
| Agentes atascados en v1 | Media | Medio | Telemetría de versión en uso |

## 8. Preguntas abiertas

- ¿Qué cambios justifican v2 (nuevos campos, nuevo formato de compresión, etc.)?

## 9. Referencias

- `docs/contracts/ingest-api.v1.md`
- `docs/release/versioning.md`
- `docs/reference/compatibility-matrix.md`