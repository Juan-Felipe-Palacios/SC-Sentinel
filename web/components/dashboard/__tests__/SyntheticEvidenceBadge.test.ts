// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SyntheticEvidenceBadge } from '@/components/dashboard/SyntheticEvidenceBadge';

describe('SyntheticEvidenceBadge', () => {
  it('se muestra solo cuando la evidencia es del dataset sintético', () => {
    const html = renderToStaticMarkup(
      createElement(SyntheticEvidenceBadge, { evidence: { demo: true, client: 'demo_ot_rogue_204' } })
    );
    expect(html).toContain('Evidencia sintética');
  });

  it('no se muestra en alertas reales ni sin evidencia', () => {
    expect(
      renderToStaticMarkup(createElement(SyntheticEvidenceBadge, { evidence: { demo: false } }))
    ).toBe('');
    expect(renderToStaticMarkup(createElement(SyntheticEvidenceBadge, { evidence: null }))).toBe('');
  });
});
