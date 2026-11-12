-- Ciclo de vida: reapertura, vencimiento y SLA.
-- Las alertas existentes heredan los plazos desde el inicio de su ventana.
ALTER TABLE "alerts" ADD COLUMN "sla_due_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "alerts" AS a
SET
  "sla_due_at" = fw.start_at + (
    CASE lower(a.severity)
      WHEN 'critical' THEN interval '60 minutes'
      WHEN 'high' THEN interval '240 minutes'
      WHEN 'medium' THEN interval '1440 minutes'
      WHEN 'low' THEN interval '4320 minutes'
      ELSE interval '4320 minutes'
    END
  ),
  "expires_at" = fw.start_at + interval '168 hours'
FROM "flow_windows" AS fw
WHERE fw.window_id = a.window_id;
--> statement-breakpoint
UPDATE "alerts"
SET
  "sla_due_at" = now(),
  "expires_at" = now() + interval '168 hours'
WHERE "sla_due_at" IS NULL OR "expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "sla_due_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_status_check";
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_status_check"
  CHECK ("status" IN ('open', 'acknowledged', 'resolved', 'expired'));
--> statement-breakpoint
CREATE INDEX "alerts_expires_at_idx" ON "alerts" USING btree ("expires_at");
