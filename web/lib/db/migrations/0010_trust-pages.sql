-- web/lib/db/migrations/0010_trust-pages.sql
CREATE TABLE "trust_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "label" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "expires_at" timestamptz,
  "last_rotated_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trust_pages_token_hash_idx" ON "trust_pages" ("token_hash");
--> statement-breakpoint
CREATE INDEX "trust_pages_device_idx" ON "trust_pages" ("device_id");
