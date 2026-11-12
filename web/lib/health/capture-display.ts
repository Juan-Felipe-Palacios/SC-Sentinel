// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Mapeo del `capture_status` que reporta el agente a lo que muestra el panel.
//
// Vive fuera del componente para poder probarlo: el caso `disabled` es
// legítimo (servicio en modo colector con `--no-capture`) y no debe confundirse
// con "sin datos", que es el agente mudo.

export type CaptureStatus = 'ok' | 'degraded' | 'error' | 'disabled' | 'unknown';

/** El agente agrega ventanas cada 30 s; 5 minutos sin reporte ya es señal perdida. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

/** `disabled` = modo colector: mide flujos NetFlow/IPFIX, no paquetes. */
export function captureStatusOf(raw: string | null | undefined): CaptureStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'ok':
      return 'ok';
    case 'degraded':
      return 'degraded';
    case 'error':
      return 'error';
    case 'disabled':
      return 'disabled';
    default:
      return 'unknown';
  }
}

export function isStale(
  recordedAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!recordedAt) return false;
  const at = new Date(recordedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at > STALE_AFTER_MS;
}

export type DisplayStatus = CaptureStatus | 'stale';

/** La falta de señal reciente manda sobre el último estado reportado. */
export function displayStatusOf(
  raw: string | null | undefined,
  recordedAt: string | null | undefined,
  now: number = Date.now()
): DisplayStatus {
  if (isStale(recordedAt, now)) return 'stale';
  return captureStatusOf(raw);
}
