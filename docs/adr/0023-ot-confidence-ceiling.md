# ADR-0023 — Techo de confianza OT en el ingest

- **Estado**: aceptado (implementado en E7)
- **Fecha**: 2026-11-26
- **Relacionadas**: ADR-0018 (ingest transaccional), ADR-0021 (retención de
  `ot_assets`), ADR-0022 (invariante pasivo)
- **Contexto de código**: `web/lib/ot/from-snapshot.ts`,
  `web/app/api/ingest/route.ts`, `agent/crates/sc-core/src/types.rs`,
  `web/lib/schemas/ingest.ts`

## Contexto

El diseño de M6 (`docs/designs/m6-passive-ot-identification.md:144`) pide que el
servidor aplique un techo de confianza: si `capture_mode == "collector"` y la
confianza del evento es `confirmed`, se degrada a `hint`. La intención es que una
fuente menos autoritativa (un colector que no ve el segmento completo) no pueda
producir alertas con la confianza máxima.

El contrato implementado no hace esa regla representable tal cual:

- `OtEvent.confidence` es un `f64` 0.0–1.0 (`agent/crates/sc-core/src/types.rs:208`),
  no un enum `confirmed|hint`.
- `capture_mode` sólo admite `live|offline` (`web/lib/schemas/ingest.ts:112`), no
  `collector`.

Cambiar cualquiera de los dos es un cambio de contrato (spec + `contracts/*` +
Zod + serde + fixtures) fuera del alcance de E7, y `capture_mode: "collector"` es
justamente el caso que aún no existe en el agente.

## Decisión

Se implementa un **techo numérico**, documentado como supuesto y no como medición:

| Regla | Valor |
|---|---|
| Umbral "confirmed" | `confidence >= 0.9` |
| Techo "hint" | `confidence = 0.7` |
| Alcance | bloques con `capture_mode == "offline"` |
| Alcances excluidos | `capture_mode == "live"` (pasa intacto) |
| Rastro | `evidence.confidence_ceiling = "hint:offline:0.7"` en cada evento degradado |
| Contador | línea de log `ot_confidence_downgraded` con `count` y `capture_mode` |

Razones:

1. **Sin cambio de contrato.** No toca spec, `contracts/*`, Zod, serde ni
   fixtures: sólo transforma un bloque ya validado antes de derivar alertas y
   activos.
2. **La fuente menos autoritativa es representable hoy.** `offline` es el spool o
   el replay: el dato pudo generarse fuera de la ventana observada. `live` ve el
   segmento en el momento, y degradarlo ocultaría justo la señal que F1 quiere
   mostrar.
3. **Es reversible y visible.** El techo se aplica en una sola función pura
   (`applyConfidenceCeiling`), con el motivo escrito en la evidencia de la alerta;
   quitar el techo o cambiar el umbral es una constante y un test.

## Lo que este ADR no decide

- **No** introduce `capture_mode: "collector"` ni un enum de confianza. Cuando el
  agente tenga ese modo (F2), la regla puede pasar a ser literal: `collector` →
  techo, `live` → sin techo. Ese cambio sí necesita ADR propio por ser cambio de
  contrato.
- **No** mide la tasa de degradaciones. El umbral 0.9 y el techo 0.7 son
  **supuestos** hasta el piloto OT, igual que `cooldown_windows = 120` de E6; se
  ajustan con datos y se registran en el roadmap.
- **No** decide si una alerta degradada debe ocultarse del feed. Hoy se emite
  igual, con `confidence` 0.7 y el motivo en la evidencia.
