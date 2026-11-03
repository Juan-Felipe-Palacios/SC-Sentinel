# ADR-0007 — Single-device como alcance de v1

**Fecha:** 2026-11-03 · **Estado:** Aceptada · **Deriva del spec:** §1, §21

## Contexto

Decisión previa de producto: el dashboard v1 es de uso propio/interno (single-device, sin multi-tenant). El sizing, auth y UX dependen de este alcance.

## Decisión

- v1 soporta exactamente **1 dispositivo** enrolado: un solo `device_id`, un token.
- El esquema ya modela `devices` como tabla (no como singleton): multi-device post-v1 no exige migración destructiva, pero los cap y retman del free tier dimensionan para 1 agente.
- Auth dashboard: una única cookie admin firmada (no usuarios, no RBAC).
- Multi-device queda en "Fuera de alcance v1" (reevaluar post-M3 si hay demanda).

## Alternativas consideradas

- **Multi-device desde v1**: triplica complejidad de enrollment, rate limits, sizing y UX para uso de 1 persona. Descartado.
- **Tabla devices eliminada / config hardcodeada**: bloquearía post-v1 innecesariamente; y la rotación de token necesita registro server-side. Descartado.

## Consecuencias

- Settings del dashboard administra un único device token (crear/rotar/revocar).
- Cualquier métrica agregada puede omitir agrupación por device (pero el schema mantiene `device_id` en todas las filas para evolución).
