// web/components/dashboard/ExportBar.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import type { QueryRange } from '@/lib/schemas/query';
import { zoomParams, type ZoomRange } from '@/lib/zoom';

type ExportMetric = 'overview' | 'hosts' | 'alerts';

const METRIC_LABELS: Record<ExportMetric, string> = {
  overview: 'Resumen',
  hosts: 'Hosts',
  alerts: 'Alertas',
};

function hrefFor(
  metric: ExportMetric,
  range: QueryRange,
  format: 'csv' | 'xlsx',
  zoom: ZoomRange | null
): string {
  return `/api/export?metric=${metric}&range=${range}&format=${format}${zoomParams(zoom)}`;
}

export function ExportBar({ range, zoom }: { range: QueryRange; zoom: ZoomRange | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Exportar datos">
      {(['overview', 'hosts', 'alerts'] as const).map((metric) => (
        <span key={metric} className="inline-flex items-center gap-1">
          <a
            href={hrefFor(metric, range, 'csv', zoom)}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            aria-label={`Exportar ${METRIC_LABELS[metric]} como CSV`}
          >
            {METRIC_LABELS[metric]} CSV
          </a>
          <a
            href={hrefFor(metric, range, 'xlsx', zoom)}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
            aria-label={`Exportar ${METRIC_LABELS[metric]} como XLSX`}
          >
            {METRIC_LABELS[metric]} XLSX
          </a>
        </span>
      ))}
    </div>
  );
}
