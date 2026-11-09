// web/components/trust/TrustView.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import type { HostMetricItem } from '@/lib/query/hosts';
import type { AlertItem } from '@/lib/query/alerts';
import type { AiInsightRecord } from '@/lib/ai/analyze';
import type { OverviewResult } from '@/lib/query/overview';

export interface TrustViewProps {
  totals: OverviewResult['totals'];
  hosts: HostMetricItem[];
  alerts: AlertItem[];
  insight: AiInsightRecord | null;
}

function shortHostKey(hostKey: string): string {
  return hostKey.length > 16 ? `${hostKey.slice(0, 16)}…` : hostKey;
}

export function TrustView({ totals, hosts, alerts, insight }: TrustViewProps) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-sky-400">
          SC-Sentinel · Trust Page
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
          Postura de red verificable
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">
          Agregados de solo lectura de la ventana reciente. No se publican paquetes, payloads ni direcciones sin anonimizar.
        </p>
      </header>
      <section aria-label="Totales" className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Ventanas</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{totals.windows_count}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Hosts</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{totals.hosts_count}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Alertas</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{totals.alerts_count}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Países</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-100">{totals.countries_count}</p>
        </div>
      </section>
      <section aria-label="Hosts principales">
        <h2 className="font-display text-xl font-semibold text-slate-100">Hosts principales</h2>
        <ul className="mt-4 grid gap-3">
          {hosts.map((host) => (
            <li key={host.host_key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
              <span className="font-mono text-xs text-slate-200">{shortHostKey(host.host_key)}</span>
              <span className="text-slate-400">{host.country ?? 'Red local'}</span>
              <span className="font-mono text-xs text-slate-200">{host.bytes_in + host.bytes_out} bytes</span>
            </li>
          ))}
          {hosts.length === 0 && <li className="text-sm text-slate-400">Sin hosts en la ventana.</li>}
        </ul>
      </section>
      <section aria-label="Alertas recientes">
        <h2 className="font-display text-xl font-semibold text-slate-100">Alertas recientes</h2>
        <ul className="mt-4 grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">{alert.severity}</span>
              <span className="ml-2 text-slate-200">{alert.title}</span>
            </li>
          ))}
          {alerts.length === 0 && <li className="text-sm text-slate-400">Sin alertas en la ventana.</li>}
        </ul>
      </section>
      {insight && (
        <section aria-label="Análisis de IA">
          <h2 className="font-display text-xl font-semibold text-slate-100">Análisis de IA</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{insight.summary}</p>
          <p className="mt-2 font-mono text-xs text-slate-400">
            Modelo {insight.model} · estado {insight.status} · riesgo {insight.risk_level ?? '—'}
          </p>
        </section>
      )}
    </main>
  );
}
