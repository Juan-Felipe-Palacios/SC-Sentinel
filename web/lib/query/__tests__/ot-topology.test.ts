// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { describe, expect, it } from 'vitest';
import { deriveOtEdges } from '../ot-topology';

describe('deriveOtEdges (E8.1)', () => {
  const nodes = new Set(['client-a', 'server-b', 'server-c']);

  it('descarta pares cuyo extremo no es nodo activo', () => {
    const edges = deriveOtEdges(nodes, [
      { rule_id: 'ot_new_master', client: 'client-a', server: 'ghost' },
    ]);
    expect(edges).toHaveLength(0);
  });

  it('descarta self-loops', () => {
    const edges = deriveOtEdges(nodes, [
      { rule_id: 'ot_new_master', client: 'client-a', server: 'client-a' },
    ]);
    expect(edges).toHaveLength(0);
  });

  it('deduplica por (client, server) acumulando conteo', () => {
    const edges = deriveOtEdges(nodes, [
      { rule_id: 'ot_new_master', client: 'client-a', server: 'server-b' },
      { rule_id: 'ot_write_outside_hours', client: 'client-a', server: 'server-b' },
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ client: 'client-a', server: 'server-b', count: 2 });
  });

  it('conserva pares reales entre nodos activos', () => {
    const edges = deriveOtEdges(nodes, [
      { rule_id: 'ot_new_master', client: 'client-a', server: 'server-b' },
      { rule_id: 'ot_new_master', client: 'client-a', server: 'server-c' },
    ]);
    expect(edges).toHaveLength(2);
  });
});
