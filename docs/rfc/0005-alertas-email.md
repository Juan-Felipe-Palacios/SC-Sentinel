# RFC-0005 — Alertas por email (proveedor externo)

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §9, §12
**ADRs relacionados:** —

## 1. Resumen

Añadir envío de alertas por email (resumen diario, alertas críticas) integrando un proveedor de email transaccional, manteniendo el patrón actual de log + webhook como fallback.

## 2. Motivación

Ruta B v2 implementó alertas como log estructurado + POST opcional a webhook, sin proveedor de email (no hay Resend ni similar). Para v2 se requiere notificación por email a administradores.

## 3. Propuesta

- Proveedor: elegir vía `gravity_index` (Resend, SendGrid, Postmark) según coste/free tier.
- Integración server-side en route handler `/api/alerts/notify` (o cron).
- Plantillas HTML/texto con datos de la alerta.
- Preferencias por usuario (opt-in, frecuencia: inmediato/digest diario).
- Mantener webhook como fallback si no hay API key configurada.

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| Solo webhook (actual) | Sin dependencias | No llega a usuarios no técnicos |
| Proveedor de email (recomendado) | Llegada directa | Coste, gestión de deliverability |
| SMTP propio | Control total | Complejidad operativa alta |

## 5. Impacto

- **Compatibilidad:** non-breaking; opt-in vía env var `EMAIL_API_KEY`.
- **Rendimiento:** envío asíncrono; no bloquea ingest.
- **Operación:** nuevo runbook de configuración del proveedor; gestión de bounces.
- **Testing:** tests con mock del proveedor.

## 6. Plan de implementación

1. Elegir proveedor y documentar env vars.
2. Implementar cliente en `web/lib/notifications/email.ts`.
3. Plantillas + preferencias de usuario.
4. Integrar con el ciclo de vida de alertas (`docs/operations/alert-lifecycle.md`).
5. Actualizar `docs/reference/env-vars.md`.

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Deliverability (spam) | Media | Alto | Usar proveedor reputado; SPF/DKIM |
| Coste por volumen | Media | Medio | Digest diario por defecto; límites por tenant |

## 8. Preguntas abiertas

- ¿Digest por organización (RFC-0001) o por device?

## 9. Referencias

- `docs/operations/alert-lifecycle.md`
- `docs/superpowers/plans/2026-11-08-ruta-b-quick-wins-v2.md` (alertas webhook)