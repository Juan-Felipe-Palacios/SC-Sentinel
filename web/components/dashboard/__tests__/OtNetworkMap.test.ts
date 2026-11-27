// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// SSR puro (renderToStaticMarkup): el mapa no tiene estado ni efectos.
// createElement (sin JSX): el include de vitest solo toma *.test.ts.

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtNetworkMap } from '@/components/dashboard/OtNetworkMap';
import type { OtTopologyEdge, OtTopologyNode } from '@/lib/api-types';

const LAST_SEEN = '2026-11-27T15:33:35.000Z';

function node(hostKey: string, role: string, label: string | null): OtTopologyNode {
  return { host_key: hostKey, label, role, protocols: [], last_seen: LAST_SEEN };
}

function edge(client: string, server: string): OtTopologyEdge {
  return { client, server, rule_id: 'ot_client_server', count: 2 };
}

describe('OtNetworkMap', () => {
  it('muestra los activos y aclara que no hay aristas cuando solo hay nodos', () => {
    const html = renderToStaticMarkup(
      createElement(OtNetworkMap, {
        nodes: [node('a1b2c3d4e5f60718', 'client', 'HMI de línea 2'), node('18f60718a1b2c3d4', 'server', 'PLC de mezcla')],
        edges: [],
      })
    );
    expect(html).toContain('HMI de línea 2');
    expect(html).toContain('PLC de mezcla');
    expect(html).not.toContain('<line');
    expect(html).toContain('Sin aristas observadas: solo se muestran los activos OT.');
  });

  it('dibuja una arista por par cliente/servidor y omite el aviso de vacío', () => {
    const html = renderToStaticMarkup(
      createElement(OtNetworkMap, {
        nodes: [node('a1b2c3d4e5f60718', 'client', 'HMI de línea 2'), node('18f60718a1b2c3d4', 'server', 'PLC de mezcla')],
        edges: [edge('a1b2c3d4e5f60718', '18f60718a1b2c3d4')],
      })
    );
    expect(html.match(/<line/g)).toHaveLength(1);
    expect(html).not.toContain('Sin aristas observadas');
  });

  it('no inventa aristas cuando el par apunta a un host que no está en los nodos', () => {
    const html = renderToStaticMarkup(
      createElement(OtNetworkMap, {
        nodes: [node('a1b2c3d4e5f60718', 'client', 'HMI de línea 2')],
        edges: [edge('a1b2c3d4e5f60718', 'ffffffffffffffff')],
      })
    );
    expect(html).not.toContain('<line');
    expect(html).toContain('Sin aristas observadas: solo se muestran los activos OT.');
  });

  it('cae al host_key cuando el activo no tiene etiqueta', () => {
    const html = renderToStaticMarkup(
      createElement(OtNetworkMap, {
        nodes: [node('c0ffee00c0ffee11', 'unknown', null)],
        edges: [],
      })
    );
    expect(html).toContain('c0ffee00c0ffee11');
  });
});
