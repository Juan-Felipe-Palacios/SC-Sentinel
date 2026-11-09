// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowDownUp,
  Package,
  ShieldAlert,
  Server,
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
import { TrafficPanel } from './TrafficPanel';
import { TopHostsTable } from './TopHostsTable';
import { TopPortsTable } from './TopPortsTable';
import { GeoDistribution } from './GeoDistribution';
import { RiskSummary } from './RiskSummary';
import { RecentAlerts } from './RecentAlerts';
import { SeverityChips } from './SeverityChips';
import { useDashboardRole } from './DashboardRoleContext';
import { ExportBar } from './ExportBar';

const REFRESH_MS = 5000;

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 ${className}`} />;
}

export function OverviewView({ range }: { range: QueryRange }) {
  const { role } = useDashboardRole();
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
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">Tu sesión expiró</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {role === 'guest'
            ? 'La sesión de visitante dura 1 hora. Volvé a entrar para seguir viendo la demostración.'
            : 'Por seguridad, la sesión de administrador dura 8 horas. Volvé a entrar para seguir viendo el panel.'}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-sky-400/40 bg-sky-400/10 px-5 py-2.5 font-display text-sm font-semibold text-sky-400 transition-colors hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        >
          Volver a entrar
        </Link>
      </div>
    );
  }

  if (overview.error && !overview.data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <TriangleAlert className="mx-auto size-6 text-orange-400" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">No se pudo cargar el resumen</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {overview.error instanceof FetchError ? `El servidor respondió ${overview.error.status}.` : 'Error de conexión.'}{' '}
          Revisá que la base esté disponible y reintentá.
        </p>
        <button
          type="button"
          onClick={() => void overview.mutate()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border-slate-800/80 px-5 py-2.5 font-display text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
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
          <SkeletonBlock className="h-80 lg:col-span-3" />
          <SkeletonBlock className="h-80 lg:col-span-2" />
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <SkeletonBlock className="h-64 lg:col-span-3" />
          <SkeletonBlock className="h-64 lg:col-span-2" />
        </div>
        <SkeletonBlock className="h-48" />
      </div>
    );
  }

  const {
    totals,
    series,
    top_hosts: topHosts,
    top_ports: topPorts,
    top_countries: topCountries,
    protocols,
    risk,
    period,
  } = overview.data;
  const periodLabel = `${new Date(period.start).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} → ${new Date(period.end).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

  return (
    <div className="space-y-5">
      {/* Estado del agente */}
      <AgentHealthCard health={health.data} />
      <ExportBar range={range} />

      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={ArrowDownUp}
          label="Bytes totales"
          value={formatBytes(totals.bytes_in + totals.bytes_out)}
          sub={`↑ ${formatBytes(totals.bytes_in)} · ↓ ${formatBytes(totals.bytes_out)}`}
          accent="in"
        />
        <StatCard
          icon={Package}
          label="Paquetes totales"
          value={formatNum(totals.packets_in)}
          sub={`${formatNum(totals.windows_count)} ventanas agregadas`}
          accent="out"
        />
        <StatCard
          icon={ShieldAlert}
          label="Alertas"
          value={formatNum(totals.alerts_count)}
          sub={`Ventana ${range}`}
          accent="warn"
        >
          <SeverityChips counts={totals.alerts_by_severity} />
        </StatCard>
        <StatCard
          icon={Server}
          label="Hosts únicos"
          value={formatNum(totals.hosts_count)}
          sub={`${formatNum(totals.countries_count)} países observados`}
          accent="neutral"
        />
      </div>

      {/* Análisis IA (lote, refresh 30 s — D8) */}
      <AiInsightCard />

      {/* Dinámica de tráfico multiformato */}
      <TrafficPanel
        series={series}
        hosts={topHosts}
        ports={topPorts}
        protocols={protocols}
        countries={topCountries}
        periodLabel={periodLabel}
      />

      {/* Destinos y puertos */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TopHostsTable hosts={topHosts} />
        </div>
        <div className="lg:col-span-2">
          <TopPortsTable ports={topPorts} protocols={protocols} />
        </div>
      </div>

      {/* Geografía y riesgo determinista */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <GeoDistribution countries={topCountries} />
        </div>
        <div className="lg:col-span-2">
          <RiskSummary risk={risk} hostsCount={totals.hosts_count} />
        </div>
      </div>

      {/* Alertas recientes */}
      <RecentAlerts alerts={alerts.data?.alerts ?? []} />
    </div>
  );
}
