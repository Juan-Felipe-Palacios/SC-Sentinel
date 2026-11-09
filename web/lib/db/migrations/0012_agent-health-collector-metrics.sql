-- web/lib/db/migrations/0012_agent-health-collector-metrics.sql
-- T4.1 (M4): métricas del colector NetFlow/IPFIX en la salud del agente.
ALTER TABLE "agent_health" ADD COLUMN "collector_packets_received" bigint;
--> statement-breakpoint
ALTER TABLE "agent_health" ADD COLUMN "collector_packets_dropped" bigint;
--> statement-breakpoint
ALTER TABLE "agent_health" ADD COLUMN "collector_parse_errors" bigint;
--> statement-breakpoint
ALTER TABLE "agent_health" ADD COLUMN "collector_templates_cached" bigint;
--> statement-breakpoint
ALTER TABLE "agent_health" ADD COLUMN "collector_flows_normalized" bigint;
