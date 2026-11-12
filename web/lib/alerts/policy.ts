// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Política operativa de alertas. Los valores son deliberadamente explícitos:
// el SLA se mide desde el inicio de la ventana que originó la alerta.

export const ALERT_SLA_MINUTES = {
  critical: 60,
  high: 240,
  medium: 1440,
  low: 4320,
  info: 4320,
} as const;

export const ALERT_EXPIRY_HOURS = 168; // 7 días

export type AlertSeverity = keyof typeof ALERT_SLA_MINUTES;

export function normalizeAlertSeverity(severity: string): AlertSeverity {
  const normalized = severity.toLowerCase();
  return normalized in ALERT_SLA_MINUTES ? (normalized as AlertSeverity) : 'medium';
}

export function alertDeadlines(severity: string, createdAt: Date = new Date()) {
  const normalized = normalizeAlertSeverity(severity);
  const slaMinutes = ALERT_SLA_MINUTES[normalized];
  return {
    slaMinutes,
    slaDueAt: new Date(createdAt.getTime() + slaMinutes * 60 * 1000),
    expiresAt: new Date(createdAt.getTime() + ALERT_EXPIRY_HOURS * 60 * 60 * 1000),
  };
}

export function isAlertSlaBreached(
  slaDueAt: Date | string | null,
  resolvedAt: Date | string | null,
  now: Date = new Date()
): boolean {
  if (!slaDueAt) return false;
  const due = new Date(slaDueAt).getTime();
  const comparison = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  return comparison > due;
}
