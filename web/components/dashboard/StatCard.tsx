// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  children?: ReactNode;
  accent?: 'in' | 'out' | 'warn' | 'neutral';
}

const ACCENT_STYLES: Record<NonNullable<StatCardProps['accent']>, string> = {
  in: 'text-sc-viz-in border-sc-viz-in/30 bg-sc-viz-in/10',
  out: 'text-sc-viz-out border-sc-viz-out/30 bg-sc-viz-out/10',
  warn: 'text-sc-warn border-sc-warn/30 bg-sc-warn/10',
  neutral: 'text-sc-text-muted border-white/5 bg-sc-surface-alt/50',
};

export function StatCard({ icon: Icon, label, value, sub, children, accent = 'neutral' }: StatCardProps) {
  return (
    <div className="rounded-lg border sc-hairline bg-sc-surface p-5 transition-colors hover:border-sc-text-muted/20">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sc-text-muted">{label}</p>
        <span className={`grid size-7 place-items-center rounded-md border ${ACCENT_STYLES[accent]}`}>
          <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 font-display text-[26px] font-semibold leading-none tabular-nums text-sc-text sm:text-3xl">
        {value}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
      {sub ? <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">{sub}</p> : null}
    </div>
  );
}
