# Ciclo de vida de alertas

**Diagrama:** `docs/diagrams/mermaid/alert-lifecycle.mmd` (stateDiagram-v2).

## Estados

- **Open:** emitida por `sc-detect` al detectar una regla (blacklist, port scan, DNS tunneling, volume, salud de captura). Se persiste en `alerts` con `status='open'` y aparece en el snapshot de la ventana.
- **Acknowledged:** un administrador reconoce la alerta desde `/dashboard/alerts` (cookie admin + evento de auditoría).
- **Resolved:** confirmado por el dueño o auto-resolución si la regla deja de disparar. Si la regla vuelve a disparar, se crea una **alerta nueva** con nuevo `alert_id`.

## Reglas operativas

- Una ventana solo lleva alertas nuevas de su propia ventana; una alerta abierta no se re-emite en ventanas posteriores.
- Auditoría: cada transición genera evento en `alert_audit_log`, conservado 90 días.
- Retención de alertas: 30 días (cron cleanup `/api/cron/cleanup`).
- Las notas se borran con la alerta; el log de auditoría se conserva.

## Relación con risk_score

El motor asigna `risk_score` por host solo cuando una regla dispara (bump_score = max). Ver `docs/visuals/risk-score-calculation.md` y `docs/diagrams/mermaid/risk-score-calculation.mmd`. La IA solo interpreta; nunca crea alertas (ADR-0005).