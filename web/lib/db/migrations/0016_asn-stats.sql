CREATE TABLE "asn_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"asn" bigint NOT NULL,
	"asn_org" text,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"hosts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "asn_stats_window_idx" ON "asn_stats" USING btree ("window_id");--> statement-breakpoint
CREATE INDEX "asn_stats_window_asn_idx" ON "asn_stats" USING btree ("window_id","asn");