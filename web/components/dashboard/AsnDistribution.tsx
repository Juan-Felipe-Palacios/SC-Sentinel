// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Network } from 'lucide-react';
import type { OverviewResponse } from '@/lib/api-types';
import { formatBytes } from '@/lib/format';

/**
 * Dispersión de tráfico por sistema autónomo (ASN). Los datos llegan agregados
 * por ventana desde el agente (top_asns del envelope); el nombre de organización
 * no identifica hosts, así que la tarjeta no muestra desglose por host.
 */
export function AsnDistribution({ asns }: { asns: OverviewResponse['top_asns'] }) {
  const total = asns.reduce((sum, item) => sum + item.bytes_total, 0);

  return (
    <section aria-label="Tráfico por ASN" className="flex flex-col rounded-xl border-slate-800/80 bg-slate-900/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Network className="size-4 text-sky-400" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Tráfico por ASN</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400/60">
          {asns.length > 0 ? `${asns.length} sistemas autónomos` : 'Sin datos'}
        </span>
      </header>

      {asns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin datos de ASN en el período</p>
          <p className="mx-auto mt-2 max-w-[22rem] text-xs leading-5 text-slate-400">
            El agente agrega ASNs por ventana con GeoLite2-ASN; esta lista se llena cuando el agente (v0.1.6 o
            posterior, con la base cargada) envía tráfico externo.
          </p>
        </div>
      ) : (
        <ol className="flex-1 divide-y divide-slate-800/60">
          {asns.map((item) => {
            const share = total > 0 ? (item.bytes_total / total) * 100 : 0;
            const label =
              item.asn === 0
                ? 'Sin ASN'
                : item.asn_org
                  ? `AS${item.asn} · ${item.asn_org}`
                  : `AS${item.asn}`;
            return (
              <li key={item.asn} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13px] font-medium text-slate-100">{label}</p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      {share.toFixed(1)}% del tráfico
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-display text-[13px] font-semibold tabular-nums text-slate-100">
                    {formatBytes(item.bytes_total)}
                  </p>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/60" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-sky-400 opacity-70"
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
