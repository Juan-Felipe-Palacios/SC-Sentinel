// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { subDays, subHours, subMinutes } from 'date-fns';
import type { QueryRange } from '@/lib/schemas/query';

export interface RangeBounds {
  start: Date;
  end: Date;
}

export function getRangeBounds(range: QueryRange, now: Date = new Date()): RangeBounds {
  const end = new Date(now.getTime());

  switch (range) {
    case '15m':
      return { start: subMinutes(end, 15), end };
    case '1h':
      return { start: subHours(end, 1), end };
    case '6h':
      return { start: subHours(end, 6), end };
    case '24h':
      return { start: subHours(end, 24), end };
    case '7d':
      return { start: subDays(end, 7), end };
    case '30d':
      return { start: subDays(end, 30), end };
  }
}

export function seriesBucketSeconds(range: QueryRange): number {
  switch (range) {
    case '15m':
      // Las ventanas del agente son de 30 s: el bucket mínimo no puede ser menor.
      return 30;
    case '1h':
      return 30;
    case '6h':
      return 60;
    case '24h':
      return 300;
    case '7d':
      return 3600;
    case '30d':
      return 7200;
  }
}

/** Tope del zoom manual: evita escanear meses de ventanas desde el dashboard. */
export const MAX_CUSTOM_WINDOW_DAYS = 31;

export type ResolvedWindow =
  | { ok: true; bounds: RangeBounds }
  | { ok: false; message: string };

/**
 * Resuelve el período de una consulta. Sin `start`/`end` usa el rango nominal
 * (15m…30d); con ambos, respeta la ventana exacta que eligió el drill-down.
 */
export function resolveQueryBounds(
  range: QueryRange,
  startIso?: string | null,
  endIso?: string | null,
  now: Date = new Date()
): ResolvedWindow {
  const hasStart = Boolean(startIso);
  const hasEnd = Boolean(endIso);
  if (!hasStart && !hasEnd) return { ok: true, bounds: getRangeBounds(range, now) };
  if (hasStart !== hasEnd) {
    return { ok: false, message: 'start y end van juntos' };
  }

  const start = new Date(startIso as string);
  const end = new Date(endIso as string);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: 'start y end deben ser fechas ISO 8601' };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, message: 'end debe ser posterior a start' };
  }
  const maxMs = MAX_CUSTOM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxMs) {
    return { ok: false, message: `La ventana no puede superar ${MAX_CUSTOM_WINDOW_DAYS} días` };
  }

  return { ok: true, bounds: { start, end } };
}

/**
 * Bucket de agregación para una ventana arbitraria: replica la escala de los
 * rangos nominales para que el gráfico no reciba miles de puntos.
 */
export function customBucketSeconds(bounds: RangeBounds): number {
  const spanSeconds = (bounds.end.getTime() - bounds.start.getTime()) / 1000;
  if (spanSeconds <= 60 * 60) return 30;
  if (spanSeconds <= 6 * 60 * 60) return 60;
  if (spanSeconds <= 24 * 60 * 60) return 300;
  if (spanSeconds <= 7 * 24 * 60 * 60) return 3600;
  return 7200;
}
