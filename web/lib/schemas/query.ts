// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { z } from 'zod';

export const QueryParamsSchema = z.object({
  metric: z.enum(['overview', 'hosts', 'alerts', 'health', 'ai']),
  range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
  device_id: z.string().min(1).optional(),
});

export type QueryParams = z.infer<typeof QueryParamsSchema>;
export type QueryRange = NonNullable<QueryParams['range']>;

export const queryRangeSchema = QueryParamsSchema.shape.range;
