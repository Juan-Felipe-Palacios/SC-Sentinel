# RFC-0004 — Dominio propio como alias post-v1

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §12
**ADRs relacionados:** ADR-0012 (dominio oficial)

## 1. Resumen

Permitir configurar un dominio propio (p. ej. `app.cliente.com`) como alias del dominio oficial `sc-sentinel.vercel.app` sin cambiar la fuente de verdad del dominio.

## 2. Motivación

ADR-0012 fija `sc-sentinel.vercel.app` como dominio oficial. El cambio futuro de dominio se describe como un alias de Vercel + cambio en `endpoint` del config del agente (costo bajo). Este RFC formaliza ese proceso.

## 3. Propuesta

- Alias de Vercel apuntando al dominio propio (CNAME).
- Certificado gestionado por Vercel (Let's Encrypt).
- El agente sigue usando el dominio oficial como fallback; el `endpoint` del config es configurable.
- Cookies de sesión: `Domain` configurable o host-only (recomendado host-only para evitar fugas).
- CORS/origins: allowlist dinámica basada en el dominio configurado.

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| Cambiar el dominio oficial | URL "propia" | Rompe agentes ya desplegados; alto coste de migración |
| Alias (recomendado) | Backward compatible; reversible | Dos URLs activas |

## 5. Impacto

- **Compatibilidad:** non-breaking; agentes existentes siguen funcionando.
- **Rendimiento:** sin cambio.
- **Operación:** runbook de alta de dominio + verificación DNS.
- **Testing:** smoke test de login en el nuevo dominio.

## 6. Plan de implementación

1. Documentar proceso en runbook (`docs/runbooks/custom-domain.md`).
2. Hacer `endpoint` del agente configurable (ya lo es en `sc-config`).
3. Actualizar allowlist de origins en web.
4. Verificar cookies y CORS.

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Cookies compartidas entre dominios | Baja | Alto | Host-only cookies por defecto |
| DNS mal configurado | Media | Medio | Checklist de verificación |

## 8. Preguntas abiertas

- ¿Soportar múltiples alias por tenant (RFC-0001)?

## 9. Referencias

- ADR-0012
- `docs/release/deployment.md`