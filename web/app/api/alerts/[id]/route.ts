// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// GET /api/alerts/[id] — detalle con notas y auditoría (solo admin).
// PATCH /api/alerts/[id] — acknowledge, resolve, asignación o nota (solo admin).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth/resolve';
import type { SessionPrincipal } from '@/lib/auth/session';
import {
  acknowledgeAlert,
  addAlertNote,
  assignAlert,
  getAlertDetail,
  reopenAlert,
  resolveAlert,
  type AlertActor,
  type AlertMutationResult,
} from '@/lib/query/alerts';
import { logServerError } from '@/lib/logging/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

const AlertActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('acknowledge') }).strict(),
  z.object({ action: z.literal('resolve') }).strict(),
  z.object({ action: z.literal('reopen') }).strict(),
  z
    .object({
      action: z.literal('assign'),
      assignee_operator_id: z.string().trim().min(1).max(128).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('note'),
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
]);

function badRequest(message: string) {
  return NextResponse.json({ error: 'bad_request', message }, { status: 400, headers: noStoreHeaders });
}

function notFound() {
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStoreHeaders });
}

function mutationFailure(result: Extract<AlertMutationResult, { ok: false }>) {
  if (result.reason === 'expired') {
    return NextResponse.json(
      { error: 'alert_expired', message: 'Reabrí la alerta vencida antes de operarla.' },
      { status: 409, headers: noStoreHeaders }
    );
  }
  if (result.reason === 'resolved') {
    return NextResponse.json(
      { error: 'alert_resolved', message: 'Una alerta resuelta no se puede reconocer.' },
      { status: 409, headers: noStoreHeaders }
    );
  }
  if (result.reason === 'operator_not_found') {
    return NextResponse.json(
      { error: 'operator_not_found', message: 'El operador no existe o está inactivo.' },
      { status: 400, headers: noStoreHeaders }
    );
  }
  return notFound();
}

function actorFor(principal?: SessionPrincipal): AlertActor {
  return principal
    ? { operatorId: principal.operatorId, name: principal.name, email: principal.email }
    : { operatorId: null, name: 'Administrador', email: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const { id } = await params;
  if (!id || id.length > 128) return badRequest('id inválido.');

  try {
    const detail = await getAlertDetail(id);
    if (!detail) return notFound();
    return NextResponse.json(detail, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    logServerError('alert_detail_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await authorize(request, { allowGuest: false });
  if (!check.ok) return check.response;

  const { id } = await params;
  if (!id || id.length > 128) return badRequest('id inválido.');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('El cuerpo debe ser JSON válido.');
  }

  const parsed = AlertActionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Acción inválida.');
  }

  const actor = actorFor('principal' in check.auth ? check.auth.principal : undefined);

  try {
    switch (parsed.data.action) {
      case 'acknowledge': {
        const result = await acknowledgeAlert(id, { actor });
        if (!result.ok) return mutationFailure(result);
        return NextResponse.json(
          { alert: result.alert, changed: result.changed },
          { status: 200, headers: noStoreHeaders }
        );
      }
      case 'reopen': {
        const result = await reopenAlert(id, { actor });
        if (!result.ok) return mutationFailure(result);
        return NextResponse.json(
          { alert: result.alert, changed: result.changed },
          { status: 200, headers: noStoreHeaders }
        );
      }
      case 'resolve': {
        const result = await resolveAlert(id, { actor });
        if (!result.ok) return mutationFailure(result);
        return NextResponse.json(
          { alert: result.alert, changed: result.changed },
          { status: 200, headers: noStoreHeaders }
        );
      }
      case 'assign': {
        const result = await assignAlert(id, parsed.data.assignee_operator_id, { actor });
        if (!result.ok) return mutationFailure(result);
        return NextResponse.json(
          { alert: result.alert, changed: result.changed },
          { status: 200, headers: noStoreHeaders }
        );
      }
      case 'note': {
        const result = await addAlertNote(id, parsed.data.body, { actor });
        if (!result.ok) return notFound();
        return NextResponse.json(
          { alert: result.alert, note: result.note, changed: result.changed },
          { status: 201, headers: noStoreHeaders }
        );
      }
    }
  } catch (error) {
    logServerError('alert_action_failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: noStoreHeaders });
  }
}