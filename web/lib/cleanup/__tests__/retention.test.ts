// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import { RETENTION_DAYS, retentionCutoff } from '@/lib/cleanup/retention';

describe('lib/cleanup/retention', () => {
  it('define la retención de spec §12.1', () => {
    expect(RETENTION_DAYS).toEqual({
      flowWindows: 7,
      hostStats: 7,
      alerts: 30,
      alertAudit: 90,
      agentHealth: 7,
      aiInsights: 15,
      ingestBatches: 2,
    });
  });

  it('retentionCutoff resta exactamente N días', () => {
    const now = new Date('2026-11-04T03:00:00.000Z');
    const cutoff = retentionCutoff(7, now);
    expect(cutoff.toISOString()).toBe('2026-10-28T03:00:00.000Z');
  });

  it('retentionCutoff(30) cubre la retención de alertas', () => {
    const now = new Date('2026-11-04T03:00:00.000Z');
    const cutoff = retentionCutoff(30, now);
    expect(cutoff.toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });
});
