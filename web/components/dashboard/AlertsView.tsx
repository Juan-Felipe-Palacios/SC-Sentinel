// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ShieldAlert } from 'lucide-react';
import type { AlertsResponse, AlertItem } from '@/lib/api-types';
import type { QueryRange } from '@/lib/schemas/query';
import { fetcher, FetchError } from '@/lib/swr';
import { timeAgo, severityRank } from '@/lib/format';
import { ExportBar } from './ExportBar';

const REFRESH_MS = 5000;
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low'] as const;
type SeverityFilter = (typeof SEVERITIES)[number];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-400 border-red-400/40 bg-red-400/10',
  high: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  medium: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  low: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export function AlertsView({ range }: { range: QueryRange }) {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const key = `/api/query?metric=alerts&range=${range}`;
  const { data, error } = useSWR<AlertsResponse>(key, fetcher, { refreshInterval: REFRESH_MS });

  if (error instanceof FetchError && error.status === 401) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">Tu sesión expiró</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Volvé a entrar para seguir viendo el panel.</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border-slate-800/80 bg-slate-900/60 p-8 text-center">
        <p className="font-display text-lg font-semibold text-slate-100">No se pudieron cargar las alertas</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {error instanceof FetchError ? `El servidor respondió ${error.status}.` : 'Error de conexión.'} Revisá que la base esté disponible y reintentá.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando alertas">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
        ))}
      </div>
    );
  }

  const alerts: AlertItem[] = (data.alerts ?? []).slice().sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
  const filtered = filter === 'all' ? alerts : alerts.filter((a) => (a.severity ?? '').toLowerCase() === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Motor de alertas</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-100">Alertas y anomalías</h2>
          <p className="mt-1 text-sm text-slate-400">
            {data.total} alertas en el rango seleccionado. Cada incidente incluye su evidencia.
          </p>
        </div>
        <ExportBar range={range} zoom={null} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SEVERITIES.map((sev) => {
          const active = filter === sev;
          const label = sev === 'all' ? 'Todas' : SEVERITY_LABELS[sev] ?? sev;
          return (
            <button
              key={sev}
              type="button"
              onClick={() => setFilter(sev)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
                active
                  ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border-slate-800/80 bg-slate-900/60 px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin alertas en el período</p>
          <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-slate-400">
            La señal agregada no disparó reglas en esta ventana. Buen momento para revisar umbrales.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((alert) => {
            const severity = (alert.severity ?? '').toLowerCase();
            const chip = SEVERITY_STYLES[severity] ?? 'text-slate-400 border-white/10 bg-slate-800/60';
            const label = SEVERITY_LABELS[severity] ?? alert.severity;
            return (
              <li key={alert.id} className="rounded-xl border-slate-800/80 bg-slate-900/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${chip}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {label}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                        {alert.rule_id}
                      </span>
                      <time className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                        {alert.created_at ? timeAgo(alert.created_at) : ''}
                      </time>
                    </div>
                    <p className="mt-2 font-display text-[15px] font-semibold text-slate-100">{alert.title}</p>
                    {alert.description ? (
                      <p className="mt-1 text-[12px] leading-5 text-slate-400">{alert.description}</p>
                    ) : null}
                  </div>
                  <ShieldAlert className="size-5 shrink-0 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
                </div>
                {alert.evidence ? (
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[10px] leading-5 text-sky-300">
                    {JSON.stringify(alert.evidence, null, 2)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}