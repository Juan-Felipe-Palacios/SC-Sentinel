// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { AlertItem } from '@/lib/api-types';
import { timeAgo, severityRank } from '@/lib/format';

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

export function RecentAlerts({ alerts }: { alerts: AlertItem[] }) {
  const recent = [...alerts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 5);

  return (
    <section aria-label="Alertas recientes" className="flex flex-col rounded-xl border-slate-800/80 bg-slate-900/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="size-4 text-amber-400" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Alertas recientes</h2>
        </div>
        <Link
          href="/dashboard/alerts"
          aria-disabled="true"
          title="Disponible próximamente"
          className="pointer-events-none font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400/50"
        >
          Ver todas →
        </Link>
      </header>

      {recent.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin alertas en el período</p>
          <p className="mt-2 max-w-[15rem] text-xs leading-5 text-slate-400">
            La señal agregada no disparó reglas en esta ventana. Buen momento para revisar umbrales.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {recent.map((alert) => {
            const severity = (alert.severity ?? '').toLowerCase();
            const chip = SEVERITY_STYLES[severity] ?? 'text-slate-400 border-white/10 bg-slate-800/60';
            const label = SEVERITY_LABELS[severity] ?? alert.severity;
            return (
              <li key={alert.id} className="px-5 py-3 transition-colors hover:bg-slate-800/40">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] ${chip}`}>
                    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                    {label}
                  </span>
                  <time className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                    {timeAgo(alert.created_at)}
                  </time>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-slate-100">{alert.title}</p>
                {alert.description ? (
                  <p className="mt-1 text-[11px] leading-5 text-slate-400 line-clamp-2">{alert.description}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
