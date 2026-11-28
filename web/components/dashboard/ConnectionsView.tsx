// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { QueryRange } from '@/lib/schemas/query';
import type { OverviewResponse } from '@/lib/api-types';
import type { ZoomRange } from '@/lib/zoom';
import { fetcher, FetchError } from '@/lib/swr';
import { ExportBar } from './ExportBar';
import { TrafficPanel } from './TrafficPanel';
import { TopPortsTable } from './TopPortsTable';
import { GeoDistribution } from './GeoDistribution';
import { ItExposureCard, NetworkMapCard } from './NetworkMapCard';
import { zoomParams, formatZoomLabel, formatZoomSpan } from '@/lib/zoom';

const REFRESH_MS = 30000;

type ConnectionsTab = 'conexiones' | 'activos-ot';

export function ConnectionsView({ range }: { range: QueryRange }) {
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [tab, setTab] = useState<ConnectionsTab>('conexiones');

  useEffect(() => {
    setZoom(null);
  }, [range]);

  const zoomSuffix = zoomParams(zoom);
  const overviewKey = `/api/query?metric=overview&range=${range}${zoomSuffix}`;
  const overview = useSWR<OverviewResponse>(overviewKey, fetcher, { refreshInterval: REFRESH_MS });

  if (overview.error && !overview.data) {
    const unavailable = overview.error instanceof FetchError && overview.error.status === 503;
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">
          {unavailable ? 'Servicio de datos no disponible' : 'No se pudieron cargar las conexiones'}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {unavailable
            ? 'El servicio de datos no está disponible en este momento; no es un período sin datos. Reintentá en unos minutos.'
            : `${overview.error instanceof Error ? overview.error.message : 'Error de conexión.'} Revisá la conexión y reintentá.`}
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

  const {
    series,
    top_hosts: topHosts,
    top_ports: topPorts,
    protocols,
    top_countries: topCountries,
    period,
    totals,
    last_data_at: lastDataAt,
    last_traffic_at: lastTrafficAt,
  } = overview.data;
  const hasTraffic = totals.bytes_in + totals.bytes_out > 0;
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

      <div className="flex gap-2" role="tablist" aria-label="Vistas de conexiones">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'conexiones'}
          onClick={() => setTab('conexiones')}
          className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
            tab === 'conexiones'
              ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          Conexiones
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activos-ot'}
          onClick={() => setTab('activos-ot')}
          className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
            tab === 'activos-ot'
              ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          Activos OT
        </button>
      </div>

      {!hasTraffic ? (
        <div
          role="status"
          className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-300"
        >
          <p className="font-display font-semibold">
            {totals.windows_count === 0
              ? 'Sin datos en el período seleccionado'
              : 'Ventanas recibidas, sin tráfico observado'}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-200/80">
            {totals.windows_count === 0
              ? lastDataAt
                ? `Última ventana recibida: ${new Date(lastDataAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}.`
                : 'El dispositivo todavía no reportó ninguna ventana.'
              : lastTrafficAt
                ? `Último tráfico observado: ${new Date(lastTrafficAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}. Las ventanas recientes existen pero no contienen bytes ni paquetes.`
                : 'El dispositivo nunca registró tráfico; solo ventanas vacías.'}
          </p>
        </div>
      ) : null}

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

      {tab === 'conexiones' ? (
        <>
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

          <ItExposureCard hosts={topHosts} countries={topCountries} ports={topPorts} />
        </>
      ) : (
        <NetworkMapCard range={range} />
      )}
    </div>
  );
}