// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Resolución del device de la demo pública. Node runtime (consulta la base
// solo si hay un device real configurado).
//
// Orden: SC_GUEST_DEVICE_ID (allowlist explícita) → DEFAULT_DEVICE_ID →
// dataset sintético local. Sin allowlist ya no se elige el primer device de
// la base: la demo usa datos de demostración y nunca puede exponer datos
// reales por accidente.

import { getDeviceById } from '@/lib/query/devices';
import {
  SYNTHETIC_DEMO_DEVICE_ID,
  isSyntheticDemoDevice,
} from '@/lib/demo/synthetic';

export type GuestDeviceError = 'not_allowed' | 'not_found';

export interface GuestDeviceResolution {
  deviceId: string | null;
  error: GuestDeviceError | null;
}

export async function resolveGuestDevice(
  requestedDeviceId?: string | null
): Promise<GuestDeviceResolution> {
  const configured = process.env.SC_GUEST_DEVICE_ID?.trim();
  const candidate =
    configured || process.env.DEFAULT_DEVICE_ID?.trim() || SYNTHETIC_DEMO_DEVICE_ID;

  // Si el visitante escribe un device, solo puede ser el de la demo.
  if (requestedDeviceId && requestedDeviceId !== candidate) {
    return { deviceId: null, error: 'not_allowed' };
  }

  // El dataset sintético no existe en la base: se resuelve sin consultarla.
  if (isSyntheticDemoDevice(candidate)) {
    return { deviceId: SYNTHETIC_DEMO_DEVICE_ID, error: null };
  }

  const device = await getDeviceById(candidate);
  if (!device || device.status === 'revoked') {
    return { deviceId: null, error: 'not_found' };
  }

  return { deviceId: device.id, error: null };
}
