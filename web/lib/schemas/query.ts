// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { z } from 'zod';

const isoDatetime = z.iso.datetime({ offset: true });

export const QueryParamsSchema = z.object({
  metric: z.enum(['overview', 'hosts', 'alerts', 'health', 'ai', 'evals', 'host', 'heatmap']),
  range: z.enum(['15m', '1h', '6h', '24h', '7d', '30d']).default('1h'),
  device_id: z.string().min(1).optional(),
  // Idioma del análisis IA devuelto (el producto es en español por defecto).
  lang: z.enum(['es', 'en']).default('es'),
  // Drill-down: ventana exacta elegida con el zoom del gráfico. Van juntos y el
  // rango nominal queda como etiqueta del período cuando no hay zoom.
  start: isoDatetime.optional(),
  end: isoDatetime.optional(),
  // Host elegido en la lista del drill-down (metric=host).
  host_key: z.string().min(1).max(128).optional(),
});

export type QueryParams = z.infer<typeof QueryParamsSchema>;
export type QueryRange = NonNullable<QueryParams['range']>;

export const queryRangeSchema = QueryParamsSchema.shape.range;
