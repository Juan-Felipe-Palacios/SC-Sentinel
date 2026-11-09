-- web/lib/db/migrations/0009_ai-evals-metrics.sql
-- Métricas de la llamada IA que generó cada insight (null en filas viejas).
ALTER TABLE "ai_insights" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "cost_usd" numeric(12,6) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD COLUMN "status_code" smallint;
--> statement-breakpoint
CREATE INDEX "ai_insights_created_idx" ON "ai_insights" ("created_at");
