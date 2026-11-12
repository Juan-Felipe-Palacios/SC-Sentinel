CREATE TABLE "operators" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "operators_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alert_audit_log" ADD COLUMN "actor_operator_id" text;--> statement-breakpoint
ALTER TABLE "alert_notes" ADD COLUMN "author_operator_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "assignee_operator_id" text;--> statement-breakpoint
CREATE INDEX "operators_status_idx" ON "operators" USING btree ("status");--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_author_operator_id_operators_id_fk" FOREIGN KEY ("author_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignee_operator_id_operators_id_fk" FOREIGN KEY ("assignee_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_assignee_operator_idx" ON "alerts" USING btree ("assignee_operator_id");