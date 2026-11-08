// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Globe2 } from 'lucide-react';
import { CountryFlag } from '@/components/dashboard/CountryFlag';
import type { OverviewResponse } from '@/lib/api-types';
import { formatBytes, formatNum, countryDisplay, riskBucket, RISK_LABELS, type RiskBucket } from '@/lib/format';

export const TOP_HOSTS_VISIBLE = 10;

const RISK_STYLES: Record<RiskBucket, string> = {
  high: 'text-orange-400 border-orange-400/35 bg-orange-400/10',
  medium: 'text-amber-400 border-amber-400/35 bg-amber-400/10',
  low: 'text-emerald-400 border-emerald-400/35 bg-emerald-400/10',
};

/** Identidad visible del host: nombre resuelto > IP > marca anonimizada. */
function hostLabel(host: OverviewResponse['top_hosts'][number]): string {
  if (host.hostname) return host.hostname;
  if (host.ip) return host.ip;
  return `Host anonimizado ${host.host_key.slice(0, 8)}`;
}

function RiskBadge({ score }: { score: number | null }) {
  const bucket = riskBucket(score);
  if (bucket === null) return <span className="font-mono text-[9px] tracking-[0.18em] text-slate-400/40">—</span>;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] ${RISK_STYLES[bucket]}`}
      title={`Risk score ${score?.toFixed(2)}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {RISK_LABELS[bucket]}
    </span>
  );
}

export function TopHostsTable({ hosts }: { hosts: OverviewResponse['top_hosts'] }) {
  const visible = hosts.slice(0, TOP_HOSTS_VISIBLE);

  return (
    <section aria-label="Principales destinos por tráfico" className="rounded-xl border-slate-800/80 bg-slate-900/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Globe2 className="size-4 text-sky-400" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Principales destinos</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400/60">
          {visible.length > 0 ? `Top ${visible.length}` : 'Sin datos'}
        </span>
      </header>

      {visible.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin hosts en el período</p>
          <p className="mx-auto mt-2 max-w-[16rem] text-xs leading-5 text-slate-400">
            Cuando el agente agregue ventanas, los destinos con más bytes aparecen acá.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-800/60">
          {visible.map((host, index) => {
            const country = countryDisplay(host.country);
            const label = hostLabel(host);
            return (
              <li
                key={`${host.host_key}-${index}`}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-slate-800/40 sm:gap-4"
              >
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-slate-400/60">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-display text-[13px] font-medium text-slate-100"
                    title={host.hostname ?? host.ip ?? host.host_key}
                  >
                    <CountryFlag country={host.country} className="mr-1.5 align-[-2px]" />{' '}
                    {label}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    {country.label}
                    {host.hostname && host.ip ? ` · ${host.ip}` : ''} · ↑ {formatBytes(host.bytes_in)} · ↓{' '}
                    {formatBytes(host.bytes_out)}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <RiskBadge score={host.risk_score} />
                </div>
                <div className="w-20 shrink-0 text-right">
                  <p className="font-display text-sm font-semibold tabular-nums text-slate-100">
                    {formatBytes(host.bytes_total)}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                    {formatNum(host.packets)} paq.
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
