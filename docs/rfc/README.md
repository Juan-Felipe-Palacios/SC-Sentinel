# RFCs — Request for Comments

**Propósito:** propuestas de cambio o nuevas capacidades antes de convertirse en ADRs o features. Un RFC es un documento de discusión; un ADR es la decisión resultante.

## Ciclo de vida

1. **Borrador** — se abre PR con `docs/rfc/NNNN-titulo-kebab.md` en estado `Borrador`.
2. **Discusión** — revisión por maintainers; comentarios en el PR.
3. **Aceptado / Rechazado** — si se acepta, se crea el ADR correspondiente (numeración siguiente en `docs/adr/`) y el RFC se marca `Aceptado` (no se borra, queda como histórico).
4. **Implementado** — cuando la feature/decisión está en producción, se actualiza el estado.

## Formato

Usar la plantilla [`0000-template.md`](0000-template.md). Numeración: 4 dígitos, correlativa (0001, 0002…). El RFC 0000 es la plantilla y no se usa.

## Índice

| # | Título | Estado | Autor | Fecha |
|---|---|---|---|---|
| 0001 | Multi-tenant v2 (organizaciones y usuarios) | Borrador | SC-Sentinel core | 2026-11-12 |
| 0002 | OpenTelemetry en agente y route handlers | Borrador | SC-Sentinel core | 2026-11-12 |
| 0003 | Rate limiting distribuido en Postgres | Borrador | SC-Sentinel core | 2026-11-12 |
| 0004 | Dominio propio como alias post-v1 | Borrador | SC-Sentinel core | 2026-11-12 |
| 0005 | Alertas por email (proveedor externo) | Borrador | SC-Sentinel core | 2026-11-12 |
| 0006 | Distribución de Npcap en el instalador (OEM) | Borrador | SC-Sentinel core | 2026-11-12 |
| 0007 | Contrato v2 y coexistencia de versiones | Borrador | SC-Sentinel core | 2026-11-12 |

## Reglas

- Un RFC NO cambia código por sí solo; requiere PR separado para implementación.
- Idioma: español internacional profesional (misma voz que ADRs y runbooks).
- Referenciar spec (`docs/superpowers/specs/SC-Sentinel-Spec-Completo-2026-11-03.md`) y ADRs relacionados.
- Si un RFC se acepta, el ADR resultante debe citarlo en "Contexto".

## Relación con otros directorios

- `adr/` — decisiones aceptadas (resultado de RFCs o decisiones directas).
- `superpowers/plans/` — planes de ejecución por hito (M0–M5, Ruta B).
- `superpowers/specs/` — spec v2.2 (fuente de verdad).