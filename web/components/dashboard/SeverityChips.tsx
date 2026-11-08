// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { OverviewAlertSeverityCounts } from '@/lib/api-types';

const SEVERITIES = [
  { key: 'critical', label: 'Críticas', style: 'text-red-400 border-red-400/35 bg-red-400/10' },
  { key: 'high', label: 'Altas', style: 'text-orange-400 border-orange-400/35 bg-orange-400/10' },
  { key: 'medium', label: 'Medias', style: 'text-amber-400 border-amber-400/35 bg-amber-400/10' },
  { key: 'low', label: 'Bajas', style: 'text-emerald-400 border-emerald-400/35 bg-emerald-400/10' },
  { key: 'info', label: 'Informativas', style: 'text-slate-400 border-white/10 bg-slate-800/60' },
] as const satisfies ReadonlyArray<{ key: keyof OverviewAlertSeverityCounts; label: string; style: string }>;

/** Desglose de alertas por severidad (las informativas solo aparecen si existen). */
export function SeverityChips({ counts }: { counts: OverviewAlertSeverityCounts }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Alertas por severidad">
      {SEVERITIES.filter((severity) => severity.key !== 'info' || counts.info > 0).map((severity) => (
        <li key={severity.key}>
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tabular-nums tracking-[0.14em] ${severity.style}`}
            title={`${severity.label}: ${counts[severity.key]}`}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {counts[severity.key]}
          </span>
        </li>
      ))}
    </ul>
  );
}
