// web/lib/export/__tests__/stream.test.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { csvStreamFromRows } from '@/lib/export/stream';

describe('csvStreamFromRows', () => {
  it('emite encabezado y filas en orden', async () => {
    const stream = csvStreamFromRows('a,b', ['1,2', '3,4']);
    const text = await new Response(stream).text();
    expect(text).toBe('a,b\n1,2\n3,4\n');
  });
});
