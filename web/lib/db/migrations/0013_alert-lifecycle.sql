-- web/lib/db/migrations/0013_alert-lifecycle.sql
-- Ciclo de vida operativo de alertas: acknowledge, resolve, asignación,
-- notas y auditoría. No hay tabla de usuarios: el actor es la sesión admin.
CREATE TABLE "alert_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"author" text DEFAULT 'admin' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "assignee" text;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "acknowledged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_status_check"
  CHECK ("status" IN ('open', 'acknowledged', 'resolved'));
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignee_length_check"
  CHECK ("assignee" IS NULL OR char_length("assignee") <= 120);
--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_alert_id_alerts_id_fk"
  FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_body_length_check"
  CHECK (char_length("body") BETWEEN 1 AND 4000);
--> statement-breakpoint
CREATE INDEX "alert_audit_alert_created_idx" ON "alert_audit_log" USING btree ("alert_id","created_at");
--> statement-breakpoint
CREATE INDEX "alert_notes_alert_created_idx" ON "alert_notes" USING btree ("alert_id","created_at");
--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");
