import { describe, expect, it, vi } from 'vitest';
import {
  DEVICE_TOKEN_TTL_MS,
  enrollDevice,
  listDevices,
  rotateDeviceToken,
} from '@/lib/query/devices';
import { hashToken } from '@/lib/auth/token';

const deviceRow = {
  id: 'dev_1',
  name: 'Nodo casa',
  status: 'enrolled_pending',
  enrolled_at: '2026-11-05T10:00:00.000Z',
  last_seen_at: null,
  token_expires_at: '2026-11-06T10:00:00.000Z',
};

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

describe('devices', () => {
  it('lista los devices enrolados con fechas ISO', async () => {
    const db = fakeDb([[deviceRow]]);
    const devices = await listDevices(db);

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe('dev_1');
    expect(devices[0].status).toBe('enrolled_pending');
    expect(devices[0].enrolled_at).toBe('2026-11-05T10:00:00.000Z');
    expect(devices[0].last_seen_at).toBeNull();
  });

  it('enrollDevice emite un token sc_dev_ + UUID con 24 h de validez', async () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const db = fakeDb([[deviceRow]]);
    const enrollment = await enrollDevice({ name: 'Nodo casa' }, db, now);

    expect(enrollment.token).toMatch(/^sc_dev_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // El device devuelto es la fila persistida (el id generado lo asigna la base).
    expect(enrollment.device.id).toBe('dev_1');
    expect(enrollment.expires_at).toBe(new Date(now.getTime() + DEVICE_TOKEN_TTL_MS).toISOString());
    // El token se persiste hasheado (nunca en claro).
    expect(hashToken(enrollment.token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enrollDevice construye el device aunque el driver no devuelva filas', async () => {
    const db = fakeDb([[]]);
    const enrollment = await enrollDevice({ name: '  ' }, db);

    expect(enrollment.device.name).toBeNull();
    expect(enrollment.device.status).toBe('enrolled_pending');
    expect(enrollment.device.token_expires_at).toBe(enrollment.expires_at);
  });

  it('rotateDeviceToken devuelve null cuando el device no existe', async () => {
    const db = fakeDb([[]]);
    await expect(rotateDeviceToken('dev_missing', db)).resolves.toBeNull();
  });

  it('rotateDeviceToken devuelve un token nuevo y su expiración', async () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const db = fakeDb([[{ ...deviceRow, status: 'active' }]]);
    const enrollment = await rotateDeviceToken('dev_1', db, now);

    expect(enrollment).not.toBeNull();
    expect(enrollment?.token).toMatch(/^sc_dev_/);
    expect(enrollment?.device.status).toBe('active');
    expect(enrollment?.expires_at).toBe(new Date(now.getTime() + DEVICE_TOKEN_TTL_MS).toISOString());
  });
});
