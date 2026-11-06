ALTER TABLE "ai_insights" ADD COLUMN "language" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "host_stats" ADD COLUMN "ip_display" text;