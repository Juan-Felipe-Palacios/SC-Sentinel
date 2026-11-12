import { pgTable, text, timestamp, bigint, jsonb, uniqueIndex, index, integer, smallint, numeric } from 'drizzle-orm/pg-core';

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
  deviceWindowIdx: uniqueIndex('flow_windows_device_window_idx').on(table.deviceId, table.windowId),
  // Un solo intervalo de 30 s por device: un segundo agente con otra base de secuencia
  // genera otro window_id para el mismo start_at y duplicaba los totales del dashboard.
  deviceStartIdx: uniqueIndex('flow_windows_device_start_idx').on(table.deviceId, table.startAt),
  startAtIdx: index('flow_windows_start_at_idx').on(table.startAt),
}));

export const hostStats = pgTable('host_stats', {
  id: text('id').primaryKey(),
  windowId: text('window_id').notNull(),
  hostKey: text('host_key').notNull(),
  // IP legible del host cuando el agente envía anonymize_hosts=false (null si está anonimizado).
  ipDisplay: text('ip_display'),
  bytesIn: bigint('bytes_in', { mode: 'number' }).default(0).notNull(),
  bytesOut: bigint('bytes_out', { mode: 'number' }).default(0).notNull(),
  packets: bigint('packets', { mode: 'number' }).default(0).notNull(),
  country: text('country'),
  riskScore: text('risk_score'),
}, (table) => ({
  windowIdx: index('host_stats_window_idx').on(table.windowId),
}));

export const operators = pgTable('operators', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (table) => ({
  statusIdx: index('operators_status_idx').on(table.status),
}));

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey(),
  windowId: text('window_id').notNull(),
  ruleId: text('rule_id').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  evidence: jsonb('evidence'),
  // Ciclo de vida operativo: open → acknowledged → resolved → reopen/expired.
  status: text('status').default('open').notNull(),
  // Responsable textual (snapshot legible) y referencia estable a la cuenta.
  assignee: text('assignee'),
  assigneeOperatorId: text('assignee_operator_id').references(() => operators.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  // SLA y vencimiento se calculan al crear la alerta desde la ventana de origen.
  slaDueAt: timestamp('sla_due_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  windowIdx: index('alerts_window_idx').on(table.windowId),
  statusIdx: index('alerts_status_idx').on(table.status),
  assigneeOperatorIdx: index('alerts_assignee_operator_idx').on(table.assigneeOperatorId),
  expiresAtIdx: index('alerts_expires_at_idx').on(table.expiresAt),
}));

export const alertNotes = pgTable('alert_notes', {
  id: text('id').primaryKey(),
  alertId: text('alert_id')
    .notNull()
    .references(() => alerts.id, { onDelete: 'cascade' }),
  author: text('author').default('admin').notNull(),
  authorOperatorId: text('author_operator_id').references(() => operators.id, {
    onDelete: 'set null',
  }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  alertCreatedIdx: index('alert_notes_alert_created_idx').on(table.alertId, table.createdAt),
}));

// Sin FK a alerts: la auditoría sobrevive al borrado por retención.
export const alertAuditLog = pgTable('alert_audit_log', {
  id: text('id').primaryKey(),
  alertId: text('alert_id').notNull(),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  // Sin FK: la auditoría sobrevive al borrado de la cuenta y conserva el ID estable.
  actorOperatorId: text('actor_operator_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  alertCreatedIdx: index('alert_audit_alert_created_idx').on(table.alertId, table.createdAt),
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
  // T4.1 (M4): métricas del colector NetFlow/IPFIX; null si el colector está apagado.
  collectorPacketsReceived: bigint('collector_packets_received', { mode: 'number' }),
  collectorPacketsDropped: bigint('collector_packets_dropped', { mode: 'number' }),
  collectorParseErrors: bigint('collector_parse_errors', { mode: 'number' }),
  collectorTemplatesCached: bigint('collector_templates_cached', { mode: 'number' }),
  collectorFlowsNormalized: bigint('collector_flows_normalized', { mode: 'number' }),
  lastError: text('last_error'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index('agent_health_device_idx').on(table.deviceId),
  recordedAtIdx: index('agent_health_recorded_at_idx').on(table.recordedAt),
}));

export const chatConversations = pgTable('chat_conversations', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceUpdatedIdx: index('chat_conversations_device_updated_idx').on(table.deviceId, table.updatedAt),
}));

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokensUsed: bigint('tokens_used', { mode: 'number' }).default(0).notNull(),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  conversationCreatedIdx: index('chat_messages_conversation_created_idx').on(
    table.conversationId,
    table.createdAt
  ),
}));

export const aiInsights = pgTable('ai_insights', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  model: text('model').notNull(),
  status: text('status').notNull(),
  // Idioma del texto generado: 'es' (por defecto) o 'en'.
  language: text('language').default('es').notNull(),
  // §11.2: riesgo del análisis. Nullable: filas anteriores a 0002 no lo almacenan.
  riskLevel: text('risk_level'),
  summary: text('summary').notNull(),
  recommendationsJson: jsonb('recommendations_json').notNull(),
  factsHash: text('facts_hash').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).default('0').notNull(),
  latencyMs: integer('latency_ms'),
  statusCode: smallint('status_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceTimeIdx: index('ai_insights_device_time').on(table.deviceId, table.createdAt),
}));

export const exportLogs = pgTable('export_logs', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  deviceId: text('device_id'),
  metric: text('metric').notNull(),
  range: text('range').notNull(),
  format: text('format').notNull(),
  rowCount: bigint('row_count', { mode: 'number' }).default(0).notNull(),
  bytes: bigint('bytes', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdIdx: index('export_logs_created_idx').on(table.createdAt),
  roleIdx: index('export_logs_role_idx').on(table.role),
}));

export const trustPages = pgTable('trust_pages', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
}, (table) => ({
  deviceIdx: index('trust_pages_device_idx').on(table.deviceId),
}));

export const trustPageAccessLogs = pgTable('trust_page_access_logs', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  ipAnon: text('ip_anon').notNull(),
  userAgentHash: text('user_agent_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index('trust_access_token_idx').on(table.tokenHash),
  createdIdx: index('trust_access_created_idx').on(table.createdAt),
}));
