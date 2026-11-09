// web/lib/schemas/export.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { z } from 'zod';
import { queryRangeSchema } from './query';

export const ExportParamsSchema = z.object({
  metric: z.enum(['overview', 'hosts', 'alerts']),
  range: queryRangeSchema,
  format: z.enum(['csv', 'xlsx']).default('csv'),
  device_id: z.string().min(1).optional(),
  // Drill-down: exportar solo la ventana elegida con el zoom.
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
});

export type ExportParams = z.infer<typeof ExportParamsSchema>;
