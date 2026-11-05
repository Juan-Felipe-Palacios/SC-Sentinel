-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
-- Migración 0002: columna risk_level en ai_insights (§11.2).
-- Nullable: las filas creadas antes de esta migración (pre-0002) no almacenan el
-- riesgo declarado por el modelo, así que se expone null en el dashboard hasta la
-- próxima re-análisis. Los nuevos insights se escriben con el valor del modelo.

ALTER TABLE "ai_insights" ADD COLUMN "risk_level" text;

COMMENT ON COLUMN "ai_insights"."risk_level" IS
  '§11.2: low | medium | high | critical. NULL solo en filas previas a la migración 0002.';
