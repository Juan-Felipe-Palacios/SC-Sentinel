# RFC-0001 — Multi-tenant v2 (organizaciones y usuarios)

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §3, §6, §12
**ADRs relacionados:** ADR-0007 (single-device v1), ADR-0012 (dominio)

## 1. Resumen

Introducir organizaciones y usuarios con roles (owner, admin, viewer) por encima del modelo actual de device único, permitiendo que un mismo despliegue sirva a varios tenants con aislamiento de datos.

## 2. Motivación

v1 asume un agente por nodo y un `device_id` por instalación (ADR-0007). Para escenarios SaaS o MSP, un mismo despliegue de dashboard debe atender a varios clientes sin mezclar datos. El documento `docs/visuals/multi-tenant-future.md` ya reserva este diseño.

## 3. Propuesta

- **Identidad:** tablas `organizations` y `users` (con roles) además de `devices`. Migración aditiva sobre el schema actual (`web/lib/db/schema.ts`).
- **Aislamiento:** todas las consultas filtradas por `organization_id`. Opción A: RLS en Neon. Opción B: filtro en la capa de query (`web/lib/query/*`). Recomendar B primero (menor riesgo), RLS después.
- **Autenticación:** pasar de secreto compartido (`ADMIN_SECRET`) a usuarios individuales con sesiones; mantener token de device como credencial de máquina.
- **Quotas y rate limiting:** por organización, usando el limitador distribuido en Postgres (RFC-0003).
- **Trust Pages:** tokens aislados por tenant con auditoría por organización.
- **IA:** presupuesto y límites por organización; `facts_hash` ya es por device.

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| RLS en Neon desde el inicio | Aislamiento fuerte en DB | Complejidad de migración; debugging más difícil |
| Filtro en capa de query (recomendada) | Incremental, reversible | Riesgo de olvido en un endpoint nuevo |
| DB por tenant | Aislamiento máximo | Coste operativo alto; no viable en free tier |

## 5. Impacto

- **Compatibilidad:** breaking en auth (nuevos endpoints de login de usuario); el token de device sigue válido.
- **Rendimiento:** índices por `organization_id`; coste de queries adicional.
- **Operación:** migraciones aditivas; runbooks de onboarding de tenant.
- **Testing:** pruebas de aislamiento entre tenants (no cross-read).

## 6. Plan de implementación

1. Migración aditiva: `organizations`, `users`, `memberships`.
2. Middleware de resolución de tenant por sesión.
3. Filtro `organization_id` en todas las queries existentes.
4. Endpoints de gestión de usuarios/organizaciones.
5. ADR resultante (`docs/adr/0015-multi-tenant.md`).

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Fuga cross-tenant por endpoint olvidado | Media | Alto | Checklist de revisión + tests de aislamiento en CI |
| Migración larga | Baja | Medio | Migraciones aditivas, sin bloqueo |

## 8. Preguntas abiertas

- ¿Se permite un usuario en varias organizaciones (MSP)?
- ¿Quotas por organización o por device?

## 9. Referencias

- `docs/visuals/multi-tenant-future.md`
- ADR-0007, ADR-0012
- spec §6, §12