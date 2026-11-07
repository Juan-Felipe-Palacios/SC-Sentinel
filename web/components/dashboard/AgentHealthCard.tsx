// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Panel «Salud del agente»: los seis campos que publica agent_health, siempre visibles
// (con «—» cuando el agente no reportó el valor). El motor determinista no depende de esto.
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

type Tone = 'neutral' | 'warn' | 'critical';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-sc-text',
  warn: 'text-sc-risk-high',
  critical: 'text-sc-risk-critical',
};

/** Tasa de descarte: por encima de 1 % es degradación real, por encima de 5 % es crítico. */
function rateTone(rate: number | null): Tone {
  if (rate == null || rate === 0) return 'neutral';
  if (rate > 5) return 'critical';
  return 'warn';
}

function Tile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-sc-bg/40 px-3 py-2.5">
      <dt className="font-mono text-[9px] uppercase leading-4 tracking-[0.2em] text-sc-text-muted">{label}</dt>
      <dd className={`mt-1 truncate font-display text-lg font-semibold tabular-nums ${TONE_TEXT[tone]}`} title={value}>
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-sc-text-muted/70">{hint}</p>
      ) : null}
    </div>
  );
}

export function AgentHealthCard({ health }: { health: HealthMetric | undefined }) {
  const status = captureStatusOf(health?.capture_status);
  const config = STATUS_CONFIG[status];
  const drops = health?.packets_dropped ?? 0;
  const seen = health?.packets_seen ?? 0;
  const rate = dropRate(seen, drops);
  const parseErrors = health?.parse_errors ?? 0;
  const hasReport = Boolean(health?.recorded_at);

  return (
    <section
      aria-label="Salud del agente de captura"
      className={`rounded-lg border transition-colors ${config.ring}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
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

        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted/70">
          {hasReport ? 'Health reportado por el agente' : 'El agente todavía no reportó salud'}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Paquetes capturados" value={hasReport ? formatNum(seen) : '—'} />
        <Tile
          label="Descartados"
          value={hasReport ? formatNum(drops) : '—'}
          tone={drops > 0 ? 'warn' : 'neutral'}
        />
        <Tile label="Tasa de descarte" value={rate != null ? `${rate.toFixed(2)}%` : '—'} tone={rateTone(rate)} />
        <Tile
          label="Errores de parseo"
          value={hasReport ? formatNum(parseErrors) : '—'}
          tone={parseErrors > 0 ? 'critical' : 'neutral'}
          hint={parseErrors > 0 ? 'revisar compatibilidad' : undefined}
        />
        <Tile
          label="Cola"
          value={health?.queue_depth != null ? formatNum(health.queue_depth) : '—'}
          hint="backpressure"
        />
        <Tile
          label="Spool"
          value={health?.spool_bytes != null ? formatBytes(health.spool_bytes) : '—'}
          hint="resiliencia"
        />
      </dl>

      <p
        className={`flex items-start gap-2 border-t border-white/5 px-5 py-3 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] ${
          health?.last_error ? 'text-sc-risk-critical' : 'text-sc-text-muted/70'
        }`}
        title={health?.last_error ?? undefined}
      >
        <AlertTriangle
          className={`mt-0.5 size-3.5 shrink-0 ${health?.last_error ? 'text-sc-risk-critical' : 'text-sc-text-muted/40'}`}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">
          Último error · {health?.last_error ?? 'sin errores registrados'}
        </span>
      </p>
    </section>
  );
}
