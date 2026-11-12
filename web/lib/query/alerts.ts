// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getRangeBounds, type RangeBounds } from './range';
import { bigintToNumber, defaultQueryDb, isoOrNull, queryRows, type QueryDb } from './db-rows';
import { findActiveOperatorById } from './operators';
import { alertDeadlines } from '@/lib/alerts/policy';
import type { QueryRange } from '@/lib/schemas/query';

export const ALERTS_LIMIT = 100;
export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'expired'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertActor {
  operatorId: string | null;
  name: string;
  email: string | null;
}

/** Solo para el acceso legado por ADMIN_SECRET; las cuentas nuevas usan operadores. */
export const DEFAULT_ALERT_ACTOR: AlertActor = {
  operatorId: null,
  name: 'Administrador',
  email: null,
};

export interface AlertMutationOptions {
  actor?: AlertActor;
  database?: QueryDb;
}

export interface AlertItem {
  id: string;
  window_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string | null;
  status: AlertStatus;
  assignee: string | null;
  assignee_operator_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  sla_due_at: string | null;
  expires_at: string | null;
  sla_breached: boolean;
  sla_remaining_seconds: number;
  updated_at: string | null;
  notes_count: number;
}

export type AlertExportItem = Pick<
  AlertItem,
  'id' | 'window_id' | 'rule_id' | 'severity' | 'title' | 'description' | 'evidence' | 'created_at'
>;

export interface AlertNoteItem {
  id: string;
  alert_id: string;
  author: string;
  author_operator_id: string | null;
  body: string;
  created_at: string | null;
}

export interface AlertAuditItem {
  id: string;
  alert_id: string;
  action: string;
  actor: string;
  actor_operator_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
}

export interface AlertDetail {
  alert: AlertItem;
  notes: AlertNoteItem[];
  audit: AlertAuditItem[];
}

export interface AlertsResult {
  range: QueryRange;
  alerts: AlertItem[];
  total: number;
}

export type AlertMutationFailureReason = 'not_found' | 'resolved' | 'expired' | 'operator_not_found';

export type AlertMutationResult =
  | { ok: true; alert: AlertItem; changed: boolean }
  | { ok: false; reason: AlertMutationFailureReason };

export type AlertNoteResult =
  | { ok: true; alert: AlertItem; note: AlertNoteItem; changed: true }
  | { ok: false; reason: 'not_found' };

interface AlertRow {
  id: string;
  window_id: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string | null;
  evidence: Record<string, unknown> | string | null;
  created_at: Date | string | null;
  status: string | null;
  assignee: string | null;
  assignee_operator_id: string | null;
  acknowledged_at: Date | string | null;
  resolved_at: Date | string | null;
  sla_due_at: Date | string | null;
  expires_at: Date | string | null;
  sla_breached: boolean | null;
  sla_remaining_seconds: number | string | null;
  updated_at: Date | string | null;
  notes_count: number | string | null;
}

interface AlertNoteRow {
  id: string;
  alert_id: string;
  author: string;
  author_operator_id: string | null;
  body: string;
  created_at: Date | string | null;
}

interface AlertAuditRow {
  id: string;
  alert_id: string;
  action: string;
  actor: string;
  actor_operator_id: string | null;
  details: Record<string, unknown> | string | null;
  created_at: Date | string | null;
}

interface TotalRow {
  total: number | string | null;
}

const ALERT_COLUMNS = sql`a.id,
       a.window_id,
       a.rule_id,
       a.severity,
       a.title,
       a.description,
       a.evidence,
       COALESCE(a.status, 'open') AS status,
       COALESCE(op.name, a.assignee) AS assignee,
       a.assignee_operator_id,
       a.acknowledged_at,
       a.resolved_at,
       a.sla_due_at,
       a.expires_at,
       CASE
         WHEN a.sla_due_at IS NOT NULL
          AND COALESCE(a.resolved_at, now()) > a.sla_due_at THEN true
         ELSE false
       END AS sla_breached,
       CASE
         WHEN a.sla_due_at IS NULL THEN 0
         ELSE GREATEST(0, EXTRACT(EPOCH FROM (a.sla_due_at - now()))::int)
       END AS sla_remaining_seconds,
       a.updated_at,
       fw.start_at AS created_at,
       (SELECT COUNT(*)::int FROM alert_notes n WHERE n.alert_id = a.id) AS notes_count`;

function emptyAlerts(range: QueryRange): AlertsResult {
  return { range, alerts: [], total: 0 };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStatus(value: string | null | undefined): AlertStatus {
  return value === 'acknowledged' || value === 'resolved' || value === 'expired' ? value : 'open';
}

function mapAlertRow(row: AlertRow): AlertItem {
  return {
    id: row.id,
    window_id: row.window_id,
    rule_id: row.rule_id,
    severity: row.severity,
    title: row.title,
    description: row.description,
    evidence: parseJsonObject(row.evidence),
    created_at: isoOrNull(row.created_at),
    status: normalizeStatus(row.status),
    assignee: row.assignee ?? null,
    assignee_operator_id: row.assignee_operator_id ?? null,
    acknowledged_at: isoOrNull(row.acknowledged_at),
    resolved_at: isoOrNull(row.resolved_at),
    sla_due_at: isoOrNull(row.sla_due_at),
    expires_at: isoOrNull(row.expires_at),
    sla_breached: row.sla_breached === true,
    sla_remaining_seconds: bigintToNumber(row.sla_remaining_seconds),
    updated_at: isoOrNull(row.updated_at),
    notes_count: bigintToNumber(row.notes_count),
  };
}

function mapNoteRow(row: AlertNoteRow): AlertNoteItem {
  return {
    id: row.id,
    alert_id: row.alert_id,
    author: row.author,
    author_operator_id: row.author_operator_id ?? null,
    body: row.body,
    created_at: isoOrNull(row.created_at),
  };
}

function mapAuditRow(row: AlertAuditRow): AlertAuditItem {
  return {
    id: row.id,
    alert_id: row.alert_id,
    action: row.action,
    actor: row.actor,
    actor_operator_id: row.actor_operator_id ?? null,
    details: parseJsonObject(row.details),
    created_at: isoOrNull(row.created_at),
  };
}

async function fetchAlertById(
  alertId: string,
  database: QueryDb
): Promise<AlertItem | null> {
  const rows = await queryRows<AlertRow>(
    database,
    sql`SELECT ${ALERT_COLUMNS}
        FROM alerts a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        LEFT JOIN operators op ON op.id = a.assignee_operator_id
        WHERE a.id = ${alertId}
        LIMIT 1`
  );
  return rows[0] ? mapAlertRow(rows[0]) : null;
}

/**
 * alerts no tiene created_at en el schema actual; se expone flow_windows.start_at como timestamp de creación.
 */
export async function queryAlerts(
  range: QueryRange = '24h',
  deviceId?: string | null,
  database: QueryDb = defaultQueryDb,
  now: Date = new Date(),
  severity?: string | null,
  bounds?: RangeBounds
): Promise<AlertsResult> {
  if (!deviceId) return emptyAlerts(range);

  const { start, end } = bounds ?? getRangeBounds(range, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const severityFilter = severity ? sql` AND a.severity = ${severity}` : sql``;

  const [rows, totalRows] = await Promise.all([
    queryRows<AlertRow>(
      database,
      sql`SELECT ${ALERT_COLUMNS}
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          LEFT JOIN operators op ON op.id = a.assignee_operator_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
            ${severityFilter}
          ORDER BY fw.start_at DESC
          LIMIT ${ALERTS_LIMIT}`
    ),
    queryRows<TotalRow>(
      database,
      sql`SELECT COUNT(*)::bigint AS total
          FROM alerts a
          INNER JOIN flow_windows fw ON fw.window_id = a.window_id
          WHERE fw.device_id = ${deviceId}
            AND fw.start_at >= ${startIso}::timestamptz
            AND fw.start_at < ${endIso}::timestamptz
            ${severityFilter}`
    ),
  ]);

  return {
    range,
    alerts: rows.map(mapAlertRow),
    total: bigintToNumber(totalRows[0]?.total),
  };
}

/** Detalle de una alerta con su historial de notas y auditoría (solo admin). */
export async function getAlertDetail(
  alertId: string,
  database: QueryDb = defaultQueryDb
): Promise<AlertDetail | null> {
  const alert = await fetchAlertById(alertId, database);
  if (!alert) return null;

  const [noteRows, auditRows] = await Promise.all([
    queryRows<AlertNoteRow>(
      database,
      sql`SELECT id, alert_id, author, author_operator_id, body, created_at
          FROM alert_notes
          WHERE alert_id = ${alertId}
          ORDER BY created_at ASC, id ASC`
    ),
    queryRows<AlertAuditRow>(
      database,
      sql`SELECT id, alert_id, action, actor, actor_operator_id, details, created_at
          FROM alert_audit_log
          WHERE alert_id = ${alertId}
          ORDER BY created_at ASC, id ASC`
    ),
  ]);

  return {
    alert,
    notes: noteRows.map(mapNoteRow),
    audit: auditRows.map(mapAuditRow),
  };
}

/** Marca una alerta abierta como reconocida. Es idempotente si ya estaba reconocida. */
export async function acknowledgeAlert(
  alertId: string,
  options: AlertMutationOptions = {}
): Promise<AlertMutationResult> {
  const database = options.database ?? defaultQueryDb;
  const actor = options.actor ?? DEFAULT_ALERT_ACTOR;
  const auditId = `audit_${randomUUID()}`;
  const rows = await queryRows<AlertRow>(
    database,
    sql`WITH previous AS (
          SELECT status FROM alerts WHERE id = ${alertId}
        ),
        updated AS (
          UPDATE alerts
          SET status = 'acknowledged',
              acknowledged_at = COALESCE(acknowledged_at, now()),
              updated_at = now()
          WHERE id = ${alertId} AND status = 'open'
          RETURNING *
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT ${auditId}, ${alertId}, 'acknowledge', ${actor.name}, ${actor.operatorId},
                 jsonb_build_object('previous_status', previous.status)
          FROM updated, previous
        )
        SELECT ${ALERT_COLUMNS}
        FROM updated a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        LEFT JOIN operators op ON op.id = a.assignee_operator_id
        WHERE a.id = ${alertId}
        LIMIT 1`
  );

  if (rows[0]) return { ok: true, alert: mapAlertRow(rows[0]), changed: true };

  const existing = await fetchAlertById(alertId, database);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status === 'expired') return { ok: false, reason: 'expired' };
  if (existing.status === 'resolved') return { ok: false, reason: 'resolved' };
  return { ok: true, alert: existing, changed: false };
}

/** Resuelve una alerta abierta o reconocida. Es idempotente si ya estaba resuelta. */
export async function resolveAlert(
  alertId: string,
  options: AlertMutationOptions = {}
): Promise<AlertMutationResult> {
  const database = options.database ?? defaultQueryDb;
  const actor = options.actor ?? DEFAULT_ALERT_ACTOR;
  const auditId = `audit_${randomUUID()}`;
  const rows = await queryRows<AlertRow>(
    database,
    sql`WITH previous AS (
          SELECT status FROM alerts WHERE id = ${alertId}
        ),
        updated AS (
          UPDATE alerts
          SET status = 'resolved',
              resolved_at = now(),
              updated_at = now()
          WHERE id = ${alertId} AND status IN ('open', 'acknowledged')
          RETURNING *
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT ${auditId}, ${alertId}, 'resolve', ${actor.name}, ${actor.operatorId},
                 jsonb_build_object('previous_status', previous.status)
          FROM updated, previous
        )
        SELECT ${ALERT_COLUMNS}
        FROM updated a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        LEFT JOIN operators op ON op.id = a.assignee_operator_id
        WHERE a.id = ${alertId}
        LIMIT 1`
  );

  if (rows[0]) return { ok: true, alert: mapAlertRow(rows[0]), changed: true };

  const existing = await fetchAlertById(alertId, database);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status === 'expired') return { ok: false, reason: 'expired' };
  return { ok: true, alert: existing, changed: false };
}

/** Asigna o limpia el operador responsable de una alerta. */
export async function assignAlert(
  alertId: string,
  assigneeOperatorId: string | null,
  options: AlertMutationOptions = {}
): Promise<AlertMutationResult> {
  const database = options.database ?? defaultQueryDb;
  const actor = options.actor ?? DEFAULT_ALERT_ACTOR;
  const target = assigneeOperatorId
    ? await findActiveOperatorById(assigneeOperatorId, database)
    : null;
  if (assigneeOperatorId && !target) return { ok: false, reason: 'operator_not_found' };

  const assignee = target?.name ?? null;
  const assigneeId = target?.id ?? null;
  const auditId = `audit_${randomUUID()}`;
  const rows = await queryRows<AlertRow>(
    database,
    sql`WITH previous AS (
          SELECT assignee, assignee_operator_id FROM alerts WHERE id = ${alertId}
        ),
        updated AS (
          UPDATE alerts
          SET assignee = ${assignee}::text,
              assignee_operator_id = ${assigneeId}::text,
              updated_at = now()
          WHERE id = ${alertId}
            AND (
              assignee IS DISTINCT FROM ${assignee}::text
              OR assignee_operator_id IS DISTINCT FROM ${assigneeId}::text
            )
          RETURNING *
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT ${auditId}, ${alertId}, 'assign', ${actor.name}, ${actor.operatorId},
                 jsonb_build_object(
                   'from', previous.assignee,
                   'from_operator_id', previous.assignee_operator_id,
                   'to', ${assignee}::text,
                   'to_operator_id', ${assigneeId}::text
                 )
          FROM updated, previous
        )
        SELECT ${ALERT_COLUMNS}
        FROM updated a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        LEFT JOIN operators op ON op.id = a.assignee_operator_id
        WHERE a.id = ${alertId}
        LIMIT 1`
  );

  if (rows[0]) return { ok: true, alert: mapAlertRow(rows[0]), changed: true };

  const existing = await fetchAlertById(alertId, database);
  if (!existing) return { ok: false, reason: 'not_found' };
  return { ok: true, alert: existing, changed: false };
}

/** Añade una nota operativa y registra su creación en la auditoría. */
export async function addAlertNote(
  alertId: string,
  body: string,
  options: AlertMutationOptions = {}
): Promise<AlertNoteResult> {
  const database = options.database ?? defaultQueryDb;
  const actor = options.actor ?? DEFAULT_ALERT_ACTOR;
  const noteId = `note_${randomUUID()}`;
  const auditId = `audit_${randomUUID()}`;
  const rows = await queryRows<AlertNoteRow>(
    database,
    sql`WITH inserted AS (
          INSERT INTO alert_notes (id, alert_id, author, author_operator_id, body)
          SELECT ${noteId}, a.id, ${actor.name}, ${actor.operatorId}, ${body}
          FROM alerts a
          WHERE a.id = ${alertId}
          RETURNING id, alert_id, author, author_operator_id, body, created_at
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT ${auditId}, ${alertId}, 'note_added', ${actor.name}, ${actor.operatorId},
                 jsonb_build_object('note_id', ${noteId}::text)
          FROM inserted
        )
        SELECT id, alert_id, author, author_operator_id, body, created_at FROM inserted`
  );

  if (!rows[0]) return { ok: false, reason: 'not_found' };

  const alert = await fetchAlertById(alertId, database);
  if (!alert) return { ok: false, reason: 'not_found' };

  return { ok: true, alert, note: mapNoteRow(rows[0]), changed: true };
}

/** Reabre una alerta resuelta o vencida e inicia un nuevo ciclo de SLA. */
export async function reopenAlert(
  alertId: string,
  options: AlertMutationOptions = {}
): Promise<AlertMutationResult> {
  const database = options.database ?? defaultQueryDb;
  const actor = options.actor ?? DEFAULT_ALERT_ACTOR;
  const existing = await fetchAlertById(alertId, database);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'resolved' && existing.status !== 'expired') {
    return { ok: true, alert: existing, changed: false };
  }

  const deadlines = alertDeadlines(existing.severity);
  const auditId = `audit_${randomUUID()}`;
  const rows = await queryRows<AlertRow>(
    database,
    sql`WITH previous AS (
          SELECT status FROM alerts WHERE id = ${alertId}
        ),
        updated AS (
          UPDATE alerts
          SET status = 'open',
              acknowledged_at = NULL,
              resolved_at = NULL,
              sla_due_at = ${deadlines.slaDueAt}::timestamptz,
              expires_at = ${deadlines.expiresAt}::timestamptz,
              updated_at = now()
          WHERE id = ${alertId} AND status IN ('resolved', 'expired')
          RETURNING *
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT ${auditId}, ${alertId}, 'reopen', ${actor.name}, ${actor.operatorId},
                 jsonb_build_object('previous_status', previous.status)
          FROM updated, previous
        )
        SELECT ${ALERT_COLUMNS}
        FROM updated a
        INNER JOIN flow_windows fw ON fw.window_id = a.window_id
        LEFT JOIN operators op ON op.id = a.assignee_operator_id
        WHERE a.id = ${alertId}
        LIMIT 1`
  );

  if (rows[0]) return { ok: true, alert: mapAlertRow(rows[0]), changed: true };
  const current = await fetchAlertById(alertId, database);
  return current ? { ok: true, alert: current, changed: false } : { ok: false, reason: 'not_found' };
}

/** Marca como vencidas las alertas activas cuyo expires_at ya pasó. */
export async function expireAlerts(
  now: Date = new Date(),
  database: QueryDb = defaultQueryDb
): Promise<number> {
  const rows = await queryRows<{ expired: number | string | null }>(
    database,
    sql`WITH expired AS (
          UPDATE alerts
          SET status = 'expired', updated_at = ${now}::timestamptz
          WHERE status IN ('open', 'acknowledged')
            AND expires_at <= ${now}::timestamptz
          RETURNING id, expires_at
        ),
        audit AS (
          INSERT INTO alert_audit_log (id, alert_id, action, actor, actor_operator_id, details)
          SELECT 'audit_' || id, id, 'expire', 'Sistema', NULL,
                 jsonb_build_object('expires_at', expires_at)
          FROM expired
        )
        SELECT COUNT(*)::int AS expired FROM expired`
  );
  return bigintToNumber(rows[0]?.expired);
}
