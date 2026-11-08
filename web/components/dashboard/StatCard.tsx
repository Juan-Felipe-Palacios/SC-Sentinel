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

// Colores como DashboardPreview: In sky, Out purple, Anomalías amber, Privacidad emerald.
const ACCENT_STYLES: Record<
  NonNullable<StatCardProps['accent']>,
  { icon: string; value: string; shell: string }
> = {
  in: {
    icon: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    value: 'text-sky-400',
    shell: 'border-slate-800 bg-slate-900/60 hover:border-slate-700',
  },
  out: {
    icon: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
    value: 'text-purple-400',
    shell: 'border-slate-800 bg-slate-900/60 hover:border-slate-700',
  },
  warn: {
    icon: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    value: 'text-amber-400',
    shell: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/40',
  },
  neutral: {
    icon: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    value: 'text-emerald-400',
    shell: 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/40',
  },
};

export function StatCard({ icon: Icon, label, value, sub, children, accent = 'neutral' }: StatCardProps) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className={`rounded-xl border p-3.5 transition-colors sm:p-4 ${styles.shell}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg border ${styles.icon}`}>
          <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-1.5 font-display text-xl font-bold leading-none tabular-nums sm:text-2xl ${styles.value}`}>
        {value}
      </p>
      {children ? <div className="mt-2">{children}</div> : null}
      {sub ? <p className="mt-1.5 font-mono text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
