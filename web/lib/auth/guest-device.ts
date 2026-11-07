// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Resolución del device de la demo pública. Node runtime (consulta la base).
//
// Orden: SC_GUEST_DEVICE_ID (allowlist explícita) → DEFAULT_DEVICE_ID →
// primer device no revocado. Sin configuración, la demo funciona igual.

import { getDeviceById, listDevices } from '@/lib/query/devices';

export type GuestDeviceError = 'not_allowed' | 'not_found';

export interface GuestDeviceResolution {
  deviceId: string | null;
  error: GuestDeviceError | null;
}

export async function resolveGuestDevice(
  requestedDeviceId?: string | null
): Promise<GuestDeviceResolution> {
  const configured = process.env.SC_GUEST_DEVICE_ID?.trim();
  let candidate = configured || process.env.DEFAULT_DEVICE_ID?.trim() || null;

  if (!candidate) {
    const devices = await listDevices();
    candidate =
      devices.find((device) => device.status === 'active')?.id ??
      devices.find((device) => device.status !== 'revoked')?.id ??
      null;
  }

  if (!candidate) {
    return { deviceId: null, error: 'not_found' };
  }

  // Si el visitante escribe un device, solo puede ser el de la demo.
  if (requestedDeviceId && requestedDeviceId !== candidate) {
    return { deviceId: null, error: 'not_allowed' };
  }

  const device = await getDeviceById(candidate);
  if (!device || device.status === 'revoked') {
    return { deviceId: null, error: 'not_found' };
  }

  return { deviceId: device.id, error: null };
}
