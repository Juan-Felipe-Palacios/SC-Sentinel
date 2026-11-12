// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth/resolve';
import {
  acknowledgeAlert,
  addAlertNote,
  assignAlert,
  getAlertDetail,
  resolveAlert,
} from '@/lib/query/alerts';
import type { AlertItem } from '@/lib/api-types';
import { GET, PATCH } from '../route';

vi.mock('@/lib/auth/resolve', () => ({
  authorize: vi.fn(),
}));

vi.mock('@/lib/query/alerts', () => ({
  acknowledgeAlert: vi.fn(),
  addAlertNote: vi.fn(),
  assignAlert: vi.fn(),
  getAlertDetail: vi.fn(),
  resolveAlert: vi.fn(),
}));

const mockedAuthorize = vi.mocked(authorize);
const mockedAcknowledge = vi.mocked(acknowledgeAlert);
const mockedResolve = vi.mocked(resolveAlert);
const mockedAssign = vi.mocked(assignAlert);
const mockedNote = vi.mocked(addAlertNote);
const mockedDetail = vi.mocked(getAlertDetail);

const alert: AlertItem = {
  id: 'alert_1',
  window_id: 'win_1',
  rule_id: 'port_scan',
  severity: 'high',
  title: 'Port scan',
  description: 'Muchos puertos',
  evidence: null,
  created_at: '2026-11-11T11:00:00.000Z',
  status: 'open',
  assignee: null,
  assignee_operator_id: null,
  acknowledged_at: null,
  resolved_at: null,
  sla_due_at: '2026-11-11T12:00:00.000Z',
  expires_at: '2026-11-18T11:00:00.000Z',
  sla_breached: false,
  sla_remaining_seconds: 3600,
  updated_at: '2026-11-11T11:00:00.000Z',
  notes_count: 0,
};

function context(id = 'alert_1') {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/alerts/alert_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/alerts/alert_1');
}

function admin() {
  mockedAuthorize.mockResolvedValue({ ok: true, auth: { role: 'admin' } });
}

beforeEach(() => {
  mockedAuthorize.mockReset();
  mockedAcknowledge.mockReset();
  mockedResolve.mockReset();
  mockedAssign.mockReset();
  mockedNote.mockReset();
  mockedDetail.mockReset();
});

describe('PATCH /api/alerts/[id]', () => {
  it('rechaza al visitante sin ejecutar la mutación', async () => {
    mockedAuthorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(403);
    expect(mockedAcknowledge).not.toHaveBeenCalled();
  });

  it('reconoce una alerta para un admin', async () => {
    admin();
    mockedAcknowledge.mockResolvedValue({
      ok: true,
      alert: { ...alert, status: 'acknowledged' },
      changed: true,
    });

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(200);
    expect(mockedAcknowledge).toHaveBeenCalledWith('alert_1', {
      actor: { operatorId: null, name: 'Administrador', email: null },
    });
    expect(await response.json()).toMatchObject({
      alert: { id: 'alert_1', status: 'acknowledged' },
      changed: true,
    });
  });

  it('devuelve 409 al intentar reconocer una alerta resuelta', async () => {
    admin();
    mockedAcknowledge.mockResolvedValue({ ok: false, reason: 'resolved' });

    const response = await PATCH(patchRequest({ action: 'acknowledge' }), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'alert_resolved' });
  });

  it('normaliza un responsable vacío a null', async () => {
    admin();
    mockedAssign.mockResolvedValue({ ok: true, alert, changed: false });

    const response = await PATCH(
      patchRequest({ action: 'assign', assignee_operator_id: null }),
      context()
    );

    expect(response.status).toBe(200);
    expect(mockedAssign).toHaveBeenCalledWith('alert_1', null, {
      actor: { operatorId: null, name: 'Administrador', email: null },
    });
  });

  it('agrega una nota y devuelve 201', async () => {
    admin();
    const note = {
      id: 'note_1',
      alert_id: 'alert_1',
      author: 'admin',
      author_operator_id: null,
      body: 'Revisado.',
      created_at: '2026-11-11T11:15:00.000Z',
    };
    mockedNote.mockResolvedValue({
      ok: true,
      alert: { ...alert, notes_count: 1 },
      note,
      changed: true,
    });

    const response = await PATCH(
      patchRequest({ action: 'note', body: 'Revisado.' }),
      context()
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ note: { body: 'Revisado.' } });
  });

  it('rechaza una acción desconocida', async () => {
    admin();

    const response = await PATCH(patchRequest({ action: 'delete' }), context());

    expect(response.status).toBe(400);
    expect(mockedAcknowledge).not.toHaveBeenCalled();
  });
});

describe('GET /api/alerts/[id]', () => {
  it('devuelve el detalle con notas y auditoría', async () => {
    admin();
    mockedDetail.mockResolvedValue({ alert, notes: [], audit: [] });

    const response = await GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alert, notes: [], audit: [] });
  });

  it('devuelve 404 si la alerta no existe', async () => {
    admin();
    mockedDetail.mockResolvedValue(null);

    const response = await GET(getRequest(), context('alert_missing'));

    expect(response.status).toBe(404);
  });
});
