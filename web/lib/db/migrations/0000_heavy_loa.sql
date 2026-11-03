CREATE TABLE "agent_health" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"capture_status" text NOT NULL,
	"packets_seen" bigint DEFAULT 0 NOT NULL,
	"packets_dropped" bigint DEFAULT 0 NOT NULL,
	"parse_errors" bigint DEFAULT 0 NOT NULL,
	"queue_depth" bigint,
	"spool_bytes" bigint,
	"last_error" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"name" text,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "flow_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text,
	"device_id" text NOT NULL,
	"window_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"sequence" bigint NOT NULL,
	"snapshot_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"window_id" text NOT NULL,
	"host_key" text NOT NULL,
	"bytes_in" bigint DEFAULT 0 NOT NULL,
	"bytes_out" bigint DEFAULT 0 NOT NULL,
	"packets" bigint DEFAULT 0 NOT NULL,
	"country" text,
	"risk_score" text
);
--> statement-breakpoint
CREATE TABLE "ingest_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"window_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_health" ADD CONSTRAINT "agent_health_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_window_id_flow_windows_window_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."flow_windows"("window_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_windows" ADD CONSTRAINT "flow_windows_batch_id_ingest_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingest_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_windows" ADD CONSTRAINT "flow_windows_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_stats" ADD CONSTRAINT "host_stats_window_id_flow_windows_window_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."flow_windows"("window_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_batches" ADD CONSTRAINT "ingest_batches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_health_device_idx" ON "agent_health" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "agent_health_recorded_at_idx" ON "agent_health" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "alerts_window_idx" ON "alerts" USING btree ("window_id");--> statement-breakpoint
CREATE INDEX "flow_windows_device_window_idx" ON "flow_windows" USING btree ("device_id","window_id");--> statement-breakpoint
CREATE INDEX "flow_windows_start_at_idx" ON "flow_windows" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "host_stats_window_idx" ON "host_stats" USING btree ("window_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_batches_device_window_idx" ON "ingest_batches" USING btree ("device_id","window_id");