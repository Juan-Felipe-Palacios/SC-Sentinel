// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldAlert,
  Layers,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { QueryRange } from '@/lib/schemas/query';
import type { AlertsResponse, HealthMetric, OverviewResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';
import { formatBytes, formatNum } from '@/lib/format';
import { AgentHealthCard } from './AgentHealthCard';
import { AiInsightCard } from './AiInsightCard';
import { StatCard } from './StatCard';
import { TrafficChart } from './TrafficChart';
import { TopHostsTable } from './TopHostsTable';
import { RecentAlerts } from './RecentAlerts';

const REFRESH_MS = 5000;

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">
      <span className={`size-2 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg border sc-hairline bg-sc-surface ${className}`} />;
}

export function OverviewView({ range }: { range: QueryRange }) {
  const overviewKey = `/api/query?metric=overview&range=${range}`;
  const alertsKey = `/api/query?metric=alerts&range=${range}`;
  const healthKey = '/api/query?metric=health';

  const overview = useSWR<OverviewResponse>(overviewKey, fetcher, { refreshInterval: REFRESH_MS });
  const alerts = useSWR<AlertsResponse>(alertsKey, fetcher, { refreshInterval: REFRESH_MS });
  const health = useSWR<HealthMetric>(healthKey, fetcher, { refreshInterval: REFRESH_MS });

  const anyError = overview.error ?? alerts.error ?? health.error;
  const sessionExpired = anyError instanceof FetchError && anyError.status === 401;

  if (sessionExpired) {
    return (
      <div className="mx-auto max-w-md rounded-lg border sc-hairline bg-sc-surface p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-sc-warn" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-sc-text">Tu sesión expiró</h2>
        <p className="mt-2 text-sm leading-6 text-sc-text-muted">
          Por seguridad, la sesión de administrador dura 8 horas. Volvé a entrar para seguir viendo el panel.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center rounded-md border border-sc-viz-in/40 bg-sc-viz-in/10 px-5 py-2.5 font-display text-sm font-semibold text-sc-viz-in transition-colors hover:bg-sc-viz-in/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50"
        >
          Volver a entrar
        </Link>
      </div>
    );
  }

  if (overview.error && !overview.data) {
    return (
      <div className="mx-auto max-w-md rounded-lg border sc-hairline bg-sc-surface p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-sc-risk-high" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-sc-text">No se pudo cargar el resumen</h2>
        <p className="mt-2 text-sm leading-6 text-sc-text-muted">
          {overview.error instanceof FetchError ? `El servidor respondió ${overview.error.status}.` : 'Error de conexión.'}{' '}
          Revisá que la base esté disponible y reintentá.
        </p>
        <button
          type="button"
          onClick={() => void overview.mutate()}
          className="mt-6 inline-flex items-center gap-2 rounded-md border sc-hairline px-5 py-2.5 font-display text-sm font-semibold text-sc-text transition-colors hover:bg-sc-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  if (!overview.data) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Cargando resumen">
        <SkeletonBlock className="h-24" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <SkeletonBlock key={i} className="h-28" />)}
        </div>
        <SkeletonBlock className="h-72" />
        <div className="grid gap-4 lg:grid-cols-5">
          <SkeletonBlock className="h-64 lg:col-span-3" />
          <SkeletonBlock className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const { totals, series, top_hosts: topHosts, period } = overview.data;
  const periodLabel = `${new Date(period.start).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} → ${new Date(period.end).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <div className="space-y-5">
      {/* Estado del agente */}
      <AgentHealthCard health={health.data} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={ArrowDownToLine}
          label="Tráfico de entrada"
          value={formatBytes(totals.bytes_in)}
          sub={`${formatNum(totals.packets_in)} paquetes`}
          accent="in"
        />
        <StatCard
          icon={ArrowUpFromLine}
          label="Tráfico de salida"
          value={formatBytes(totals.bytes_out)}
          sub={`${formatNum(totals.packets_out)} paquetes`}
          accent="out"
        />
        <StatCard
          icon={ShieldAlert}
          label="Alertas"
          value={formatNum(totals.alerts_count)}
          sub={`En la ventana ${range}`}
          accent="warn"
        />
        <StatCard
          icon={Layers}
          label="Ventanas agregadas"
          value={formatNum(totals.windows_count)}
          sub={`Período ${range}`}
          accent="neutral"
        />
      </div>

      {/* Análisis IA (lote, refresh 30 s — D8) */}
      <AiInsightCard />

      {/* Tráfico agregado */}
      <section aria-label="Tráfico agregado" className="rounded-lg border sc-hairline bg-sc-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b sc-hairline px-5 py-4">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-sc-text-muted">Tráfico agregado</h2>
            <div className="hidden items-center gap-4 sm:flex">
              <LegendDot className="bg-sc-viz-in" label="Entrada" />
              <LegendDot className="bg-sc-viz-out" label="Salida" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted/70 md:block">{periodLabel}</p>
            <span className="flex items-center gap-2 rounded-full border border-sc-ok/25 bg-sc-ok/5 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-sc-ok">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sc-ok opacity-60" aria-hidden="true" />
                <span className="relative inline-flex size-2 rounded-full bg-sc-ok" aria-hidden="true" />
              </span>
              En vivo · 5s
            </span>
          </div>
        </header>
        <div className="px-2 pb-4 pt-4 sm:px-4">
          <TrafficChart series={series} />
        </div>
      </section>

      {/* Destinos y alertas */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopHostsTable hosts={topHosts} />
        </div>
        <div className="lg:col-span-2">
          <RecentAlerts alerts={alerts.data?.alerts ?? []} />
        </div>
      </div>
    </div>
  );
}
