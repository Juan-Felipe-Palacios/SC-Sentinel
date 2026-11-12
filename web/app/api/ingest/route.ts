// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Normative ingest endpoint: docs/contracts/ingest-api.v1.md + ADR-0008 + ADR-0009 + ADR-0011

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { neon } from '@neondatabase/serverless';
import { authenticateDeviceToken } from '@/lib/auth/device';
import { checkRateLimit } from '@/lib/rate-limit/ingest';
import { readIngestBody } from '@/lib/ingest/read-body';
import { logServerError } from '@/lib/logging/error';
import { IngestEnvelopeSchema } from '@/lib/schemas/ingest';
import { buildPersistStatements, type SqlTag } from '@/lib/ingest/persist';
import { db, flowWindows, alerts } from '@/lib/db';
import { eq, and, gte } from 'drizzle-orm';
import {
  CLOUD_HEURISTIC_RULE_ID,
  HEURISTIC_ALERT_DEDUP_MS,
  evaluateCloudRisk,
  resolveHostRiskScore,
} from '@/lib/risk/heuristic';

/**
 * Dedup de la alerta heurística: si el device ya tiene un cloud_heuristic en
 * la última hora no se inserta otra (evita spamear el feed con ventanas de 30 s).
 */
async function hasRecentHeuristicAlert(deviceId: string): Promise<boolean> {
  const since = new Date(Date.now() - HEURISTIC_ALERT_DEDUP_MS);
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .innerJoin(flowWindows, eq(flowWindows.windowId, alerts.windowId))
    .where(
      and(
        eq(flowWindows.deviceId, deviceId),
        eq(alerts.ruleId, CLOUD_HEURISTIC_RULE_ID),
        gte(flowWindows.startAt, since)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function POST(request: NextRequest) {
  // 1. IP rate limit check (anti-abuse for non-authenticated callers)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const ipLimit = checkRateLimit(`ip_${clientIp}`, 20, 20);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests from this IP' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds ?? 60) } }
    );
  }

  // 2. Authentication check
  const authHeader = request.headers.get('authorization');
  const auth = await authenticateDeviceToken(authHeader);
  if (!auth.valid) {
    if (auth.error === 'forbidden') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Device is inactive or token revoked' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid or missing bearer token' },
      { status: 401 }
    );
  }

  const authenticatedDeviceId = auth.deviceId!;

  // 3. Device Rate Limit (ADR-0011: 60 req/min, burst 30 for spool drain)
  const deviceLimit = checkRateLimit(`dev_${authenticatedDeviceId}`, 60, 30);
  if (!deviceLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Device rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(deviceLimit.retryAfterSeconds ?? 30) } }
    );
  }

  // 4. Read, decompress and size-gate the payload before parsing it.
  const parsedBody = await readIngestBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error, message: parsedBody.message },
      { status: parsedBody.status }
    );
  }
  const rawBody = parsedBody.body;

  // 5. Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // 6. Validate with Zod (exact schema matching docs/contracts/)
  const parsed = IngestEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const pathStr = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'root';
    return NextResponse.json(
      {
        error: 'validation_failed',
        path: pathStr,
        message: firstIssue.message,
      },
      {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      }
    );
  }

  const envelope = parsed.data;

  // Verify that the payload device.id matches the authenticated token device (unless dev fallback)
  if (authenticatedDeviceId !== 'dev_local_development' && envelope.device.id !== authenticatedDeviceId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Device ID in payload does not match authenticated token' },
      { status: 403 }
    );
  }

  // 7. Calculate payload hash for ledger audit
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');

  // 8. Persistencia transaccional (ADR-0008 + ADR-0015).
  // Batch, ventana, host_stats, alerts, agent_health y devices viajan en una
  // única transacción no interactiva: o se guardan todas o ninguna. Los ids
  // son deterministas, así que el reintento del agente repara lo que falte en
  // lugar de dejar la ventana huérfana y responder "duplicate".
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    try {
      // Heurística de respaldo (ADR-0005): sc-detect aún no emite risk_score
      // ni alerts; la nube evalúa las señales del payload para que la tarjeta
      // "Riesgo del sistema" no quede en 0. El snapshot_json se guarda crudo
      // (verdad del agente); el enriquecimiento vive en host_stats/alerts.
      const cloudRisk = evaluateCloudRisk(envelope.snapshot);
      const alertRows = [...envelope.snapshot.alerts];
      if (cloudRisk.alert && !(await hasRecentHeuristicAlert(envelope.device.id))) {
        alertRows.push(cloudRisk.alert);
      }

      const health = envelope.snapshot.health;
      const statements = buildPersistStatements(sql as unknown as SqlTag, {
        deviceId: envelope.device.id,
        windowId: envelope.window.id,
        payloadHash,
        start: new Date(envelope.window.start),
        end: new Date(envelope.window.end),
        sequence: envelope.window.sequence,
        snapshot: envelope.snapshot,
        hostStats: envelope.snapshot.top_hosts.map((h) => ({
          hostKey: h.host_key,
          // IP legible solo cuando el agente envía anonymize_hosts=false.
          ipDisplay: h.ip_display ?? null,
          bytesIn: h.bytes_in,
          bytesOut: h.bytes_out,
          packets: h.packets,
          country: h.country ?? null,
          // Score del agente si existe; si no, el de la ventana (heurística).
          riskScore: resolveHostRiskScore(h.risk_score, cloudRisk.score),
        })),
        alerts: alertRows.map((a) => ({
          ruleId: a.rule_id,
          severity: a.severity,
          title: a.title,
          description: a.description ?? '',
          evidence: a.evidence ?? null,
        })),
        health: {
          captureStatus: health.capture_status,
          packetsSeen: health.packets_seen,
          packetsDropped: health.packets_dropped,
          parseErrors: health.parse_errors,
          queueDepth: health.queue_depth ?? null,
          spoolBytes: health.spool_bytes ?? null,
          collectorPacketsReceived: health.collector_packets_received ?? null,
          collectorPacketsDropped: health.collector_packets_dropped ?? null,
          collectorParseErrors: health.collector_parse_errors ?? null,
          collectorTemplatesCached: health.collector_templates_cached ?? null,
          collectorFlowsNormalized: health.collector_flows_normalized ?? null,
          lastError: health.last_error ?? null,
        },
        // Primer ingest exitoso promueve enrolled_pending → active (ADR-0010).
        promoteToActive: auth.deviceStatus === 'enrolled_pending',
      });

      // `sql.transaction` del driver HTTP envía el lote como una sola
      // transacción de Postgres; el tipado genérico del lote se estrecha aquí.
      const runTransaction = sql.transaction as unknown as (
        queries: unknown[]
      ) => Promise<unknown[][]>;
      const results = await runTransaction(statements);

      // La primera sentencia devuelve la fila del batch solo si era nueva:
      // si viene vacía, la ventana ya estaba persistida (reintento).
      const batchInserted = Array.isArray(results?.[0]) && results[0].length > 0;
      return NextResponse.json(
        { status: batchInserted ? 'processed' : 'duplicate' },
        { status: 200 }
      );
    } catch (err) {
      // Con el mensaje incluido: sin él solo veíamos `error: "Error"` y el
      // drift de esquema (42703) pasó inadvertido durante días.
      logServerError('ingest_db_failed', err, { includeMessage: true });
      return NextResponse.json(
        { error: 'server_error', message: 'Failed to persist ingest batch' },
        { status: 500 }
      );
    }
  }

  // Development environment without DATABASE_URL
  return NextResponse.json({ status: 'processed' }, { status: 200 });
}

