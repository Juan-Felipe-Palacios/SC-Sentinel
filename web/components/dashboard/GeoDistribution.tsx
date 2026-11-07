// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { MapPin } from 'lucide-react';
import type { OverviewResponse } from '@/lib/api-types';
import { countryDisplay, formatBytes, formatNum } from '@/lib/format';

export function GeoDistribution({ countries }: { countries: OverviewResponse['top_countries'] }) {
  const total = countries.reduce((sum, item) => sum + item.bytes_total, 0);

  return (
    <section aria-label="Tráfico por país" className="flex flex-col rounded-lg border sc-hairline bg-sc-surface">
      <header className="flex items-center justify-between gap-3 border-b sc-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <MapPin className="size-4 text-sc-viz-in" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-sc-text-muted">Tráfico por país</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sc-text-muted/60">
          {countries.length > 0 ? `${countries.length} países` : 'Sin datos'}
        </span>
      </header>

      {countries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-sc-text">Sin geolocalización en el período</p>
          <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-sc-text-muted">
            El agente resuelve país por GeoIP; esta lista se llena cuando las ventanas incluyen hosts
            geolocalizados.
          </p>
        </div>
      ) : (
        <ol className="flex-1 divide-y divide-white/5">
          {countries.map((item) => {
            const display = countryDisplay(item.country);
            const share = total > 0 ? (item.bytes_total / total) * 100 : 0;
            return (
              <li key={item.country} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-base leading-none" aria-hidden="true">
                    {display.flag}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13px] font-medium text-sc-text">{display.label}</p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">
                      {formatNum(item.hosts_count)} hosts · {share.toFixed(1)}%
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-display text-[13px] font-semibold tabular-nums text-sc-text">
                    {formatBytes(item.bytes_total)}
                  </p>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-sc-viz-in opacity-70"
                    style={{ width: `${Math.max(2, Math.round(share))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
