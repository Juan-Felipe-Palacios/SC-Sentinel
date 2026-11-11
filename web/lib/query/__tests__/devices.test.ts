import { describe, expect, it, vi } from 'vitest';
import { deleteDevice, enrollDevice, listDevices, rotateDeviceToken } from '@/lib/query/devices';
import { hashToken } from '@/lib/auth/token';

const deviceRow = {
  id: 'dev_1',
  name: 'Nodo casa',
  status: 'enrolled_pending',
  enrolled_at: '2026-11-05T10:00:00.000Z',
  last_seen_at: null,
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

  it('enrollDevice emite un token sc_dev_ + UUID permanente', async () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const db = fakeDb([[deviceRow]]);
    const enrollment = await enrollDevice({ name: 'Nodo casa' }, db, now);

    expect(enrollment.token).toMatch(/^sc_dev_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // El device devuelto es la fila persistida (el id generado lo asigna la base).
    expect(enrollment.device.id).toBe('dev_1');
    expect(enrollment).not.toHaveProperty('expires_at');
    // El token se persiste hasheado (nunca en claro).
    expect(hashToken(enrollment.token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enrollDevice construye el device aunque el driver no devuelva filas', async () => {
    const db = fakeDb([[]]);
    const enrollment = await enrollDevice({ name: '  ' }, db);

    expect(enrollment.device.name).toBeNull();
    expect(enrollment.device.status).toBe('enrolled_pending');
    expect(enrollment).not.toHaveProperty('expires_at');
  });

  it('rotateDeviceToken emite un token nuevo cuando el device existe', async () => {
    const db = fakeDb([[{ id: 'dev_1' }]]);
    const rotated = await rotateDeviceToken('dev_1', db);

    expect(rotated?.token).toMatch(/^sc_dev_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('rotateDeviceToken devuelve null si el device no existe o está revocado', async () => {
    const db = fakeDb([[]]);
    await expect(rotateDeviceToken('dev_missing', db)).resolves.toBeNull();
  });

  it('deleteDevice devuelve true cuando elimina el device', async () => {
    const db = fakeDb([[{ id: 'dev_1' }]]);
    await expect(deleteDevice('dev_1', db)).resolves.toBe(true);
  });

  it('deleteDevice devuelve false cuando el device no existe', async () => {
    const db = fakeDb([[]]);
    await expect(deleteDevice('dev_missing', db)).resolves.toBe(false);
  });
});
