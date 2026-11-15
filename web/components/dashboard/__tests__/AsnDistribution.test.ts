// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// SSR puro (renderToStaticMarkup): la tarjeta no tiene estado ni efectos.
// createElement (sin JSX): el include de vitest solo toma *.test.ts.

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsnDistribution } from '@/components/dashboard/AsnDistribution';

describe('AsnDistribution', () => {
  it('muestra el estado vacío cuando no hay datos de ASN', () => {
    const html = renderToStaticMarkup(createElement(AsnDistribution, { asns: [] }));
    expect(html).toContain('Sin datos de ASN en el período');
    // El estado vacío aclara el requisito de versión (agente 0.1.6+).
    expect(html).toContain('v0.1.6');
    expect(html).not.toContain('AS15169');
  });

  it('lista ASNs con organización y aclara que hosts es máximo por ventana', () => {
    const html = renderToStaticMarkup(
      createElement(AsnDistribution, {
        asns: [
          { asn: 15169, asn_org: 'Google LLC', bytes_total: 900, hosts: 2 },
          { asn: 0, asn_org: null, bytes_total: 10, hosts: 1 },
        ],
      })
    );
    expect(html).toContain('AS15169 · Google LLC');
    // ASN 0 = tráfico sin ASN resuelto (GeoLite2-ASN no cargada o LAN).
    expect(html).toContain('Sin ASN');
    // La nota evita que el operador sume hosts entre ventanas.
    expect(html).toContain('hosts = máximo observado en una ventana del período');
  });
});
