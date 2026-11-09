// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Normative ingest endpoint: docs/contracts/ingest-api.v1.md + ADR-0008 + ADR-0009 + ADR-0011

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { authenticateDeviceToken } from '@/lib/auth/device';
import { checkRateLimit } from '@/lib/rate-limit/ingest';
import { readIngestBody } from '@/lib/ingest/read-body';
import { IngestEnvelopeSchema } from '@/lib/schemas/ingest';
import { db, ingestBatches, flowWindows, hostStats, alerts, agentHealth, devices } from '@/lib/db';
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

  // 8. Idempotent Database Insert
  if (process.env.DATABASE_URL) {
    try {
      // Check if this window was already processed for this device (ADR-0008)
      const existingBatch = await db
        .select({ id: ingestBatches.id })
        .from(ingestBatches)
        .where(
          and(
            eq(ingestBatches.deviceId, envelope.device.id),
            eq(ingestBatches.windowId, envelope.window.id)
          )
        )
        .limit(1);

      if (existingBatch.length > 0) {
        // Idempotent duplicate: 200 { status: "duplicate" }
        return NextResponse.json({ status: 'duplicate' }, { status: 200 });
      }

      const batchId = `bat_${randomUUID()}`;
      const flowWindowDbId = `win_${randomUUID()}`;

      // Ingest Batch
      await db.insert(ingestBatches).values({
        id: batchId,
        deviceId: envelope.device.id,
        windowId: envelope.window.id,
        payloadHash,
        status: 'processed',
      });

      // Flow Window. UNIQUE(device_id, start_at): un segundo agente reportando el mismo
      // intervalo con otro window_id no crea una ventana nueva (evita métricas dobles).
      const insertedWindows = await db
        .insert(flowWindows)
        .values({
          id: flowWindowDbId,
          batchId,
          deviceId: envelope.device.id,
          windowId: envelope.window.id,
          startAt: new Date(envelope.window.start),
          endAt: new Date(envelope.window.end),
          sequence: envelope.window.sequence,
          snapshotJson: envelope.snapshot,
        })
        // Sin target: cubre tanto (device_id, window_id) como (device_id, start_at).
        .onConflictDoNothing()
        .returning({ id: flowWindows.id });

      if (insertedWindows.length === 0) {
        // El intervalo ya estaba registrado para este device (otro window_id):
        // se ignora el resto del batch y el agente lo descarta del spool.
        await db
          .update(ingestBatches)
          .set({ status: 'duplicate' })
          .where(eq(ingestBatches.id, batchId));
        return NextResponse.json({ status: 'duplicate' }, { status: 200 });
      }

      // Heurística de respaldo (ADR-0005): sc-detect aún no emite risk_score
      // ni alerts; la nube evalúa las señales del payload para que la tarjeta
      // "Riesgo del sistema" no quede en 0. El snapshot_json se guarda crudo
      // (verdad del agente); el enriquecimiento vive en host_stats/alerts.
      const cloudRisk = evaluateCloudRisk(envelope.snapshot);

      // Host Stats
      if (envelope.snapshot.top_hosts.length > 0) {
        const hostRows = envelope.snapshot.top_hosts.map((h) => ({
          id: `hst_${randomUUID()}`,
          windowId: envelope.window.id,
          hostKey: h.host_key,
          // IP legible solo cuando el agente envía anonymize_hosts=false.
          ipDisplay: h.ip_display ?? null,
          bytesIn: h.bytes_in,
          bytesOut: h.bytes_out,
          packets: h.packets,
          country: h.country ?? null,
          // Score del agente si existe; si no, el de la ventana (heurística).
          riskScore: String(resolveHostRiskScore(h.risk_score, cloudRisk.score)),
        }));
        await db.insert(hostStats).values(hostRows);
      }

      // Alerts (agente + heurística de la nube cuando el agente no emitió)
      const alertRows = [...envelope.snapshot.alerts];
      if (cloudRisk.alert && !(await hasRecentHeuristicAlert(envelope.device.id))) {
        alertRows.push(cloudRisk.alert);
      }
      if (alertRows.length > 0) {
        const rows = alertRows.map((a) => ({
          id: `alt_${randomUUID()}`,
          windowId: envelope.window.id,
          ruleId: a.rule_id,
          severity: a.severity,
          title: a.title,
          description: a.description ?? '',
          evidence: a.evidence ?? null,
        }));
        await db.insert(alerts).values(rows);
      }

      // Agent Health
      const h = envelope.snapshot.health;
      await db.insert(agentHealth).values({
        id: `hlt_${randomUUID()}`,
        deviceId: envelope.device.id,
        captureStatus: h.capture_status,
        packetsSeen: h.packets_seen,
        packetsDropped: h.packets_dropped,
        parseErrors: h.parse_errors,
        queueDepth: h.queue_depth ?? null,
        spoolBytes: h.spool_bytes ?? null,
        collectorPacketsReceived: h.collector_packets_received ?? null,
        collectorPacketsDropped: h.collector_packets_dropped ?? null,
        collectorParseErrors: h.collector_parse_errors ?? null,
        collectorTemplatesCached: h.collector_templates_cached ?? null,
        collectorFlowsNormalized: h.collector_flows_normalized ?? null,
        lastError: h.last_error ?? null,
      });

      // Primer ingest exitoso promueve enrolled_pending → active (ADR-0010).
      const devicePatch: { lastSeenAt: Date; status?: string } = { lastSeenAt: new Date() };
      if (auth.deviceStatus === 'enrolled_pending') devicePatch.status = 'active';
      await db
        .update(devices)
        .set(devicePatch)
        .where(eq(devices.id, envelope.device.id));

      return NextResponse.json({ status: 'processed' }, { status: 200 });
    } catch (err) {
      console.error('Ingest database insertion error:', err);
      return NextResponse.json(
        { error: 'server_error', message: 'Failed to persist ingest batch' },
        { status: 500 }
      );
    }
  }

  // Development environment without DATABASE_URL
  return NextResponse.json({ status: 'processed' }, { status: 200 });
}

