import { pgTable, text, timestamp, integer, bigint, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  status: text('status').default('active').notNull(),
});

export const ingestBatches = pgTable('ingest_batches', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id),
  windowId: text('window_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull(),
}, (table) => ({
  deviceWindowIdx: uniqueIndex('ingest_batches_device_window_idx').on(table.deviceId, table.windowId),
}));

export const flowWindows = pgTable('flow_windows', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => ingestBatches.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
  windowId: text('window_id').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  sequence: bigint('sequence', { mode: 'number' }).notNull(),
  snapshotJson: jsonb('snapshot_json').notNull(),
}, (table) => ({
  deviceWindowIdx: index('flow_windows_device_window_idx').on(table.deviceId, table.windowId),
  startAtIdx: index('flow_windows_start_at_idx').on(table.startAt),
}));

export const hostStats = pgTable('host_stats', {
  id: text('id').primaryKey(),
  windowId: text('window_id').notNull().references(() => flowWindows.windowId),
  hostKey: text('host_key').notNull(),
  bytesIn: bigint('bytes_in', { mode: 'number' }).default(0).notNull(),
  bytesOut: bigint('bytes_out', { mode: 'number' }).default(0).notNull(),
  packets: bigint('packets', { mode: 'number' }).default(0).notNull(),
  country: text('country'),
  riskScore: text('risk_score'),
}, (table) => ({
  windowIdx: index('host_stats_window_idx').on(table.windowId),
}));

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey(),
  windowId: text('window_id').notNull().references(() => flowWindows.windowId),
  ruleId: text('rule_id').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  evidence: jsonb('evidence'),
}, (table) => ({
  windowIdx: index('alerts_window_idx').on(table.windowId),
}));

export const agentHealth = pgTable('agent_health', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id),
  captureStatus: text('capture_status').notNull(),
  packetsSeen: bigint('packets_seen', { mode: 'number' }).default(0).notNull(),
  packetsDropped: bigint('packets_dropped', { mode: 'number' }).default(0).notNull(),
  parseErrors: bigint('parse_errors', { mode: 'number' }).default(0).notNull(),
  queueDepth: bigint('queue_depth', { mode: 'number' }),
  spoolBytes: bigint('spool_bytes', { mode: 'number' }),
  lastError: text('last_error'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index('agent_health_device_idx').on(table.deviceId),
  recordedAtIdx: index('agent_health_recorded_at_idx').on(table.recordedAt),
}));
