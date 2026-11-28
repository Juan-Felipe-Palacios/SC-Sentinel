// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// SSR puro (renderToStaticMarkup): la tabla no tiene estado ni efectos.
// createElement (sin JSX): el include de vitest solo toma *.test.ts.

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopPortsTable } from '@/components/dashboard/TopPortsTable';
import type { OverviewResponse } from '@/lib/api-types';

const PROTOCOLS: OverviewResponse['protocols'] = [{ protocol: 'tcp', bytes: 1500, connections: 6 }];

describe('TopPortsTable', () => {
  it('muestra el badge confirmed y el aviso del flujo sintético con el puerto 502 de la demo', () => {
    const ports: OverviewResponse['top_ports'] = [
      { port: 502, protocol: 'tcp', bytes: 1000, connections: 4, confidence: 'confirmed' },
      { port: 443, protocol: 'tcp', bytes: 500, connections: 2 },
    ];

    const html = renderToStaticMarkup(
      createElement(TopPortsTable, { ports, protocols: PROTOCOLS })
    );

    expect(html).toContain('Modbus TCP');
    expect(html).toContain('confirmed');
    expect(html).toContain('confirmed requiere el artefacto sensor Linux');
    expect(html).toContain('Flujo Modbus sintético; no corresponde a tráfico real.');
  });

  it('no inventa confianza ni aviso sintético en datos reales', () => {
    const ports: OverviewResponse['top_ports'] = [
      { port: 502, protocol: 'tcp', bytes: 1000, connections: 4 },
      { port: 443, protocol: 'tcp', bytes: 500, connections: 2 },
    ];

    const html = renderToStaticMarkup(
      createElement(TopPortsTable, { ports, protocols: PROTOCOLS })
    );

    expect(html).toContain('Modbus TCP');
    expect(html).not.toContain('confirmed');
    expect(html).not.toContain('Flujo Modbus sintético');
  });
});
