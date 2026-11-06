// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Globe2 } from 'lucide-react';
import type { OverviewResponse } from '@/lib/api-types';
import { formatBytes, formatNum, countryDisplay } from '@/lib/format';

/** Identidad visible del host: nombre resuelto > IP > marca anonimizada. */
function hostLabel(host: OverviewResponse['top_hosts'][number]): string {
  if (host.hostname) return host.hostname;
  if (host.ip) return host.ip;
  return `Host anonimizado ${host.host_key.slice(0, 8)}`;
}

export function TopHostsTable({ hosts }: { hosts: OverviewResponse['top_hosts'] }) {
  return (
    <section aria-label="Principales destinos por tráfico" className="rounded-lg border sc-hairline bg-sc-surface">
      <header className="flex items-center justify-between gap-3 border-b sc-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Globe2 className="size-4 text-sc-viz-in" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-sc-text-muted">Principales destinos</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sc-text-muted/60">Top {Math.min(hosts.length, 5) || 5}</span>
      </header>

      {hosts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-sc-text">Sin hosts en el período</p>
          <p className="mx-auto mt-2 max-w-[16rem] text-xs leading-5 text-sc-text-muted">
            Cuando el agente agregue ventanas, los destinos con más bytes aparecen acá.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-white/5">
          {hosts.slice(0, 5).map((host, index) => {
            const country = countryDisplay(host.country);
            const label = hostLabel(host);
            return (
              <li key={`${host.host_key}-${index}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-sc-surface-alt/40">
                <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-sc-text-muted/60">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-display text-[13px] font-medium text-sc-text"
                    title={host.hostname ?? host.ip ?? host.host_key}
                  >
                    <span aria-hidden="true">{country.flag}</span> {label}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">
                    {country.label}
                    {host.hostname && host.ip ? ` · ${host.ip}` : ''} · {formatNum(host.packets)} paquetes
                  </p>
                </div>
                <p className="shrink-0 text-right font-display text-sm font-semibold tabular-nums text-sc-text">
                  {formatBytes(host.bytes_total)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
