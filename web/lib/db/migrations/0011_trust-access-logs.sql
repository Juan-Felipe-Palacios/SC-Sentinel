-- web/lib/db/migrations/0011_trust-access-logs.sql
CREATE TABLE "trust_page_access_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "ip_anon" text NOT NULL,
  "user_agent_hash" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trust_access_token_idx" ON "trust_page_access_logs" ("token_hash");
--> statement-breakpoint
CREATE INDEX "trust_access_created_idx" ON "trust_page_access_logs" ("created_at");
