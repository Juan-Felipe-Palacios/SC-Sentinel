// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Globe2 } from 'lucide-react';
import type { OverviewResponse } from '@/lib/api-types';
import { formatBytes, formatNum } from '@/lib/format';

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
          {hosts.slice(0, 5).map((host, index) => (
            <li key={`${host.host_key}-${index}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-sc-surface-alt/40">
              <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-sc-text-muted/60">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] text-sc-text" title={host.host_key}>{host.host_key}</p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">
                  {host.country ?? 'país desconocido'} · {formatNum(host.packets)} paquetes
                </p>
              </div>
              <p className="shrink-0 text-right font-display text-sm font-semibold tabular-nums text-sc-text">
                {formatBytes(host.bytes_total)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
