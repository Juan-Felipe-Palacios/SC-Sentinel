// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { QueryRange } from '@/lib/schemas/query';
import type { OverviewResponse } from '@/lib/api-types';
import type { ZoomRange } from '@/lib/zoom';
import { fetcher } from '@/lib/swr';
import { ExportBar } from './ExportBar';
import { TrafficPanel } from './TrafficPanel';
import { TopPortsTable } from './TopPortsTable';
import { GeoDistribution } from './GeoDistribution';
import { zoomParams, formatZoomLabel, formatZoomSpan } from '@/lib/zoom';

const REFRESH_MS = 5000;

export function ConnectionsView({ range }: { range: QueryRange }) {
  const [zoom, setZoom] = useState<ZoomRange | null>(null);

  useEffect(() => {
    setZoom(null);
  }, [range]);

  const zoomSuffix = zoomParams(zoom);
  const overviewKey = `/api/query?metric=overview&range=${range}${zoomSuffix}`;
  const overview = useSWR<OverviewResponse>(overviewKey, fetcher, { refreshInterval: REFRESH_MS });

  if (overview.error && !overview.data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">No se pudieron cargar las conexiones</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {overview.error instanceof Error ? overview.error.message : 'Error de conexión.'} Revisá que la base esté disponible y reintentá.
        </p>
        <button
          type="button"
          onClick={() => void overview.mutate()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border-slate-800/80 px-5 py-2.5 font-display text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!overview.data) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Cargando conexiones">
        <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        <div className="h-72 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 lg:col-span-3" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const { series, top_hosts: topHosts, top_ports: topPorts, protocols, top_countries: topCountries, period } = overview.data;
  const periodLabel = `${new Date(period.start).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} → ${new Date(period.end).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Matriz</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-100">Conexiones y geografía</h2>
          <p className="mt-1 text-sm text-slate-400">
            Puertos, protocolos, distribución geográfica y mapa de calor hora × puerto.
          </p>
        </div>
        <ExportBar range={range} zoom={zoom} />
      </div>

      {zoom ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sc-viz-in/30 bg-sc-viz-in/5 px-4 py-2.5">
          <p className="font-mono text-[11px] text-sc-text">
            <span className="text-sc-viz-in">Vista filtrada</span> · {formatZoomLabel(zoom)}{' '}
            <span className="text-sc-text-muted">({formatZoomSpan(zoom)})</span>
          </p>
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="inline-flex items-center gap-1 rounded-md border sc-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-sc-text-muted transition-colors hover:text-sc-text"
          >
            Quitar filtro
          </button>
        </div>
      ) : null}

      <TrafficPanel
        range={range}
        series={series}
        hosts={topHosts}
        ports={topPorts}
        protocols={protocols}
        countries={topCountries}
        periodLabel={periodLabel}
        zoom={zoom}
        onApplyZoom={setZoom}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopPortsTable ports={topPorts} protocols={protocols} />
        </div>
        <div className="lg:col-span-2">
          <GeoDistribution countries={topCountries} />
        </div>
      </div>
    </div>
  );
}