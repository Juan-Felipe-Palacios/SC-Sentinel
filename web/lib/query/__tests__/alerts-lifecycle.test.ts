// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it, vi } from 'vitest';
import {
  acknowledgeAlert,
  addAlertNote,
  assignAlert,
  getAlertDetail,
  queryAlerts,
  resolveAlert,
} from '@/lib/query/alerts';

const fixedNow = new Date('2026-11-11T12:00:00.000Z');

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

const baseAlertRow = {
  id: 'alert_1',
  window_id: 'win_1',
  rule_id: 'port_scan',
  severity: 'high',
  title: 'Port scan',
  description: 'Muchos puertos distintos',
  evidence: { distinct_ports: 25 },
  created_at: '2026-11-11T11:00:00.000Z',
  status: 'open',
  assignee: null,
  acknowledged_at: null,
  resolved_at: null,
  updated_at: '2026-11-11T11:00:00.000Z',
  notes_count: 0,
};

const acknowledgedRow = {
  ...baseAlertRow,
  status: 'acknowledged',
  assignee: 'SOC',
  assignee_operator_id: 'op_1',
  acknowledged_at: '2026-11-11T11:10:00.000Z',
  updated_at: '2026-11-11T11:10:00.000Z',
  notes_count: 2,
};

const resolvedRow = {
  ...acknowledgedRow,
  status: 'resolved',
  resolved_at: '2026-11-11T11:20:00.000Z',
  updated_at: '2026-11-11T11:20:00.000Z',
};

const noteRow = {
  id: 'note_1',
  alert_id: 'alert_1',
  author: 'admin',
  body: 'Revisado con el cliente.',
  created_at: '2026-11-11T11:15:00.000Z',
};

const auditRow = {
  id: 'audit_1',
  alert_id: 'alert_1',
  action: 'acknowledge',
  actor: 'admin',
  details: { previous_status: 'open' },
  created_at: '2026-11-11T11:10:00.000Z',
};

describe('alert lifecycle queries', () => {
  it('mapea estado, asignación, fechas y cantidad de notas en la lista', async () => {
    const db = fakeDb([[acknowledgedRow], [{ total: '1' }]]);
    const result = await queryAlerts('24h', 'dev_1', db, fixedNow);

    expect(result.alerts[0]).toMatchObject({
      id: 'alert_1',
      status: 'acknowledged',
      assignee: 'SOC',
      acknowledged_at: '2026-11-11T11:10:00.000Z',
      notes_count: 2,
    });
  });

  it('devuelve el detalle con notas y auditoría ordenadas', async () => {
    const db = fakeDb([[acknowledgedRow], [noteRow], [auditRow]]);
    const detail = await getAlertDetail('alert_1', db);

    expect(detail?.alert.status).toBe('acknowledged');
    expect(detail?.notes[0]?.body).toBe('Revisado con el cliente.');
    expect(detail?.audit[0]).toMatchObject({
      action: 'acknowledge',
      details: { previous_status: 'open' },
    });
  });

  it('acknowledge actualiza una alerta abierta', async () => {
    const db = fakeDb([[acknowledgedRow]]);
    const result = await acknowledgeAlert('alert_1', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ status: 'acknowledged' }),
      changed: true,
    });
  });

  it('acknowledge es idempotente si ya estaba reconocida', async () => {
    const db = fakeDb([[], [acknowledgedRow]]);
    const result = await acknowledgeAlert('alert_1', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ status: 'acknowledged' }),
      changed: false,
    });
  });

  it('acknowledge rechaza una alerta resuelta', async () => {
    const db = fakeDb([[], [resolvedRow]]);
    const result = await acknowledgeAlert('alert_1', { database: db });

    expect(result).toEqual({ ok: false, reason: 'resolved' });
  });

  it('resolve marca la alerta como resuelta', async () => {
    const db = fakeDb([[resolvedRow]]);
    const result = await resolveAlert('alert_1', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ status: 'resolved' }),
      changed: true,
    });
  });

  it('resolve es idempotente si ya estaba resuelta', async () => {
    const db = fakeDb([[], [resolvedRow]]);
    const result = await resolveAlert('alert_1', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ status: 'resolved' }),
      changed: false,
    });
  });

  it('assign guarda el responsable y registra el cambio', async () => {
    const db = fakeDb([
      [{ id: 'op_1', email: 'soc@example.com', name: 'SOC' }],
      [acknowledgedRow],
    ]);
    const result = await assignAlert('alert_1', 'op_1', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ assignee: 'SOC' }),
      changed: true,
    });
  });

  it('assign distingue una alerta inexistente', async () => {
    const db = fakeDb([
      [{ id: 'op_1', email: 'soc@example.com', name: 'SOC' }],
      [],
      [],
    ]);
    const result = await assignAlert('alert_missing', 'op_1', { database: db });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('addAlertNote inserta la nota y devuelve el contador actualizado', async () => {
    const db = fakeDb([[noteRow], [{ ...baseAlertRow, notes_count: 1 }]]);
    const result = await addAlertNote('alert_1', 'Revisado con el cliente.', { database: db });

    expect(result).toEqual({
      ok: true,
      alert: expect.objectContaining({ notes_count: 1 }),
      note: expect.objectContaining({ body: 'Revisado con el cliente.' }),
      changed: true,
    });
  });

  it('addAlertNote no inserta si la alerta no existe', async () => {
    const db = fakeDb([[]]);
    const result = await addAlertNote('alert_missing', 'Nota', { database: db });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
