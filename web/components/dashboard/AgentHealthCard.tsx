// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Activity, AlertTriangle } from 'lucide-react';
import type { HealthMetric } from '@/lib/api-types';
import { formatBytes, formatNum, timeAgo, dropRate } from '@/lib/format';

type CaptureStatus = 'ok' | 'degraded' | 'error' | 'unknown';

function captureStatusOf(raw: string | null | undefined): CaptureStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'ok': return 'ok';
    case 'degraded': return 'degraded';
    case 'error': return 'error';
    default: return 'unknown';
  }
}

const STATUS_CONFIG: Record<CaptureStatus, { label: string; dot: string; text: string; ring: string }> = {
  ok: {
    label: 'Captura en línea',
    dot: 'bg-sc-ok',
    text: 'text-sc-ok',
    ring: 'border-sc-ok/30 bg-sc-ok/5',
  },
  degraded: {
    label: 'Captura degradada',
    dot: 'bg-sc-degraded',
    text: 'text-sc-degraded',
    ring: 'border-sc-degraded/30 bg-sc-degraded/5',
  },
  error: {
    label: 'Captura con error',
    dot: 'bg-sc-risk-critical',
    text: 'text-sc-risk-critical',
    ring: 'border-sc-risk-critical/30 bg-sc-risk-critical/5',
  },
  unknown: {
    label: 'Sin datos del agente',
    dot: 'bg-sc-text-muted',
    text: 'text-sc-text-muted',
    ring: 'border-white/5 bg-sc-surface-alt/40',
  },
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-sc-text-muted">{label}</p>
      <p className="mt-1 truncate font-display text-sm font-semibold tabular-nums text-sc-text" title={value}>
        {value}
      </p>
    </div>
  );
}

export function AgentHealthCard({ health }: { health: HealthMetric | undefined }) {
  const status = captureStatusOf(health?.capture_status);
  const config = STATUS_CONFIG[status];
  const drops = health?.packets_dropped ?? 0;
  const seen = health?.packets_seen ?? 0;
  const rate = dropRate(seen, drops);

  return (
    <section
      aria-label="Salud del agente de captura"
      className={`flex flex-col gap-4 rounded-lg border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between ${config.ring}`}
    >
      {/* Estado + última señal */}
      <div className="flex items-center gap-4">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-md border border-white/5 bg-sc-bg">
          <Activity className="size-5 text-sc-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <span className="absolute -right-1.5 -top-1.5 flex size-3.5">
            {status === 'ok' ? (
              <span className={`absolute inline-flex size-full animate-ping rounded-full ${config.dot} opacity-60`} aria-hidden="true" />
            ) : null}
            <span className={`relative inline-flex size-3.5 rounded-full border-2 border-sc-surface ${config.dot}`} aria-hidden="true" />
          </span>
        </span>
        <div className="leading-tight">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-sc-text-muted">Agente de captura</p>
          <p className={`mt-1 font-display text-base font-semibold ${config.text}`}>{config.label}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sc-text-muted">
            Última señal · {timeAgo(health?.recorded_at)}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/5 pt-4 sm:grid-cols-4 sm:border-0 sm:pt-0">
        <Metric label="Paquetes vistos" value={formatNum(seen)} />
        <Metric
          label="Drops"
          value={`${formatNum(drops)}${rate != null ? ` · ${rate.toFixed(2)}%` : ''}`}
        />
        <Metric label="Cola" value={health?.queue_depth != null ? formatNum(health.queue_depth) : '—'} />
        <Metric label="Spool" value={health?.spool_bytes != null ? formatBytes(health.spool_bytes) : '—'} />
      </dl>

      {health?.last_error ? (
        <p className="flex items-start gap-2 rounded-md border border-sc-risk-critical/25 bg-sc-risk-critical/5 px-3 py-2 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-sc-risk-critical sm:hidden">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {health.last_error}
        </p>
      ) : null}

      {health?.last_error ? (
        <p className="hidden max-w-[16rem] items-start gap-2 rounded-md border border-sc-risk-critical/25 bg-sc-risk-critical/5 px-3 py-2 font-mono text-[9px] uppercase leading-5 tracking-[0.12em] text-sc-risk-critical xl:flex" title={health.last_error}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{health.last_error}</span>
        </p>
      ) : null}

    </section>
  );
}
