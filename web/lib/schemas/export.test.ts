// web/lib/schemas/export.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { ExportParamsSchema } from '@/lib/schemas/export';

describe('ExportParamsSchema', () => {
  it('acepta metric/range/format csv con defaults y xlsx', () => {
    expect(ExportParamsSchema.parse({ metric: 'hosts' })).toEqual({ metric: 'hosts', range: '1h', format: 'csv', device_id: undefined });
    expect(ExportParamsSchema.parse({ metric: 'hosts', format: 'xlsx' }).format).toBe('xlsx');
  });
  it('rechaza métricas no exportables y metric ausente', () => {
    expect(() => ExportParamsSchema.parse({ metric: 'health' })).toThrow();
    expect(() => ExportParamsSchema.parse({})).toThrow();
  });
});
