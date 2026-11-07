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
