// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { OverviewAlertSeverityCounts } from '@/lib/api-types';

const SEVERITIES = [
  { key: 'critical', label: 'Críticas', style: 'text-sc-risk-critical border-sc-risk-critical/35 bg-sc-risk-critical/10' },
  { key: 'high', label: 'Altas', style: 'text-sc-risk-high border-sc-risk-high/35 bg-sc-risk-high/10' },
  { key: 'medium', label: 'Medias', style: 'text-sc-risk-medium border-sc-risk-medium/35 bg-sc-risk-medium/10' },
  { key: 'low', label: 'Bajas', style: 'text-sc-risk-low border-sc-risk-low/35 bg-sc-risk-low/10' },
  { key: 'info', label: 'Informativas', style: 'text-sc-text-muted border-white/10 bg-white/5' },
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
