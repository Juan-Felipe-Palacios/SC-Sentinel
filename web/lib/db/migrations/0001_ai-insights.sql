CREATE TABLE "ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"recommendations_json" jsonb NOT NULL,
	"facts_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insights_device_time" ON "ai_insights" USING btree ("device_id","created_at");