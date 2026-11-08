// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { ShieldCheck } from 'lucide-react';
import type { OverviewRisk } from '@/lib/api-types';
import { formatNum } from '@/lib/format';

type GlobalLevel = 'high' | 'medium' | 'low' | 'none';

const LEVEL_CONFIG: Record<GlobalLevel, { label: string; text: string; chip: string }> = {
  high: { label: 'Alto', text: 'text-orange-400', chip: 'border-orange-400/40 bg-orange-400/10' },
  medium: { label: 'Medio', text: 'text-amber-400', chip: 'border-amber-400/40 bg-amber-400/10' },
  low: { label: 'Bajo', text: 'text-emerald-400', chip: 'border-emerald-400/40 bg-emerald-400/10' },
  none: { label: 'Sin datos', text: 'text-slate-400', chip: 'border-white/10 bg-slate-800/60' },
};

/** Nivel global: manda la banda más alta presente entre los hosts con score. */
function globalLevel(risk: OverviewRisk): GlobalLevel {
  if (risk.scored_hosts === 0) return 'none';
  if (risk.high_hosts > 0) return 'high';
  if (risk.medium_hosts > 0) return 'medium';
  return 'low';
}

function BandRow({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      <span className="font-display text-sm font-semibold tabular-nums text-slate-100">{formatNum(count)}</span>
    </li>
  );
}

export function RiskSummary({ risk, hostsCount }: { risk: OverviewRisk; hostsCount: number }) {
  const level = globalLevel(risk);
  const config = LEVEL_CONFIG[level];
  const total = risk.high_hosts + risk.medium_hosts + risk.low_hosts;

  return (
    <section aria-label="Riesgo del sistema" className="flex flex-col rounded-xl border-slate-800/80 bg-slate-900/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Riesgo del sistema</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400/60">
          {risk.scored_hosts > 0 ? `${formatNum(risk.scored_hosts)} con score` : 'Sin datos'}
        </span>
      </header>

      <div className="flex flex-1 flex-col px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${config.chip} ${config.text}`}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {config.label}
          </span>
          <p className="font-display text-2xl font-semibold tabular-nums text-slate-100">
            {risk.avg_score != null ? risk.avg_score.toFixed(2) : '—'}
          </p>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400/70">promedio</span>
        </div>

        {total > 0 ? (
          <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-slate-800/60" aria-hidden="true">
            <div className="h-full bg-orange-400" style={{ width: `${(risk.high_hosts / total) * 100}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${(risk.medium_hosts / total) * 100}%` }} />
            <div className="h-full bg-emerald-400" style={{ width: `${(risk.low_hosts / total) * 100}%` }} />
          </div>
        ) : null}

        <ul className="mt-4 space-y-2">
          <BandRow label="Hosts de riesgo alto" count={risk.high_hosts} dot="bg-orange-400" />
          <BandRow label="Riesgo medio" count={risk.medium_hosts} dot="bg-amber-400" />
          <BandRow label="Riesgo bajo" count={risk.low_hosts} dot="bg-emerald-400" />
        </ul>

        <p className="mt-auto pt-4 font-mono text-[9px] uppercase leading-5 tracking-[0.16em] text-slate-400/70">
          {risk.scored_hosts === 0
            ? 'El motor determinista no emitió risk_score para estos hosts todavía. La tendencia necesita comparación con el período anterior.'
            : `${formatNum(risk.scored_hosts)} de ${formatNum(hostsCount)} hosts con score · último valor por host`}
        </p>
      </div>
    </section>
  );
}
