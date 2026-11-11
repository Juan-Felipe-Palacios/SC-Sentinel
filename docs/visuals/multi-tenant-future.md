# Multi-tenant — visión futura (no implementado en v1)

**Estado:** fuera de alcance de v1 (ADR-0007: single-device por instalación). Este documento es una reserva de diseño para v2.

## Modelo actual (v1)

Un agente por nodo, un `device_id` por instalación, datos aislados por `device_id` en Neon. La autenticación es por token de device (SHA-256) + cookie de administración. No hay concepto de organización ni de usuario final.

## Cambios necesarios para multi-tenant

1. **Identidad:** introducir `organizations` y `users` (con roles: owner, admin, viewer) además de `devices`. Migración aditiva sobre el schema actual.
2. **Aislamiento de datos:** todas las consultas por `organization_id` (RLS en Neon o filtro en la capa de query). Verificar que ningún endpoint filtre entre tenants.
3. **Autenticación:** pasar de secreto compartido (`ADMIN_SECRET`) a usuarios con sesiones individuales; mantener el token de device como credencial de máquina.
4. **Quotas y rate limiting:** por organización (M4 distribuido en Postgres).
5. **Trust Pages:** por tenant, con tokens aislados y auditoría por organización.
6. **IA:** presupuesto y límites por organización; facts_hash ya es por device.

## Diagramas futuros

Cuando se implemente, añadir `docs/diagrams/mermaid/multi-tenant-context.mmd` (C4 L1 con organización) y un ADR nuevo (`docs/adr/0015-multi-tenant.md`). Hasta entonces, este archivo es la única referencia.