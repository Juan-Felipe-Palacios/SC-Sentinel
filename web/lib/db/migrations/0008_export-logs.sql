-- web/lib/db/migrations/0008_export-logs.sql
-- Auditoría de exportaciones (sin user_id: el repo no tiene tabla de usuarios;
-- se guarda rol + device).
CREATE TABLE "export_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "device_id" text,
  "metric" text NOT NULL,
  "range" text NOT NULL,
  "format" text NOT NULL,
  "row_count" integer NOT NULL,
  "bytes" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "export_logs_created_idx" ON "export_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX "export_logs_role_idx" ON "export_logs" ("role");
