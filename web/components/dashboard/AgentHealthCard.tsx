// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Panel «Salud del agente»: los seis campos que publica agent_health, siempre visibles
// (con «—» cuando el agente no reportó el valor). Si el agente reporta métricas del
// colector NetFlow/IPFIX (T4.1) se agrega una fila adicional. El motor determinista no depende de esto.
import { Activity, AlertTriangle } from 'lucide-react';
import type { HealthMetric } from '@/lib/api-types';
import { formatBytes, formatNum, timeAgo, dropRate } from '@/lib/format';
// El mapeo vive en lib/ para poder probarlo sin montar React.
import {
  captureStatusOf,
  isStale,
  type DisplayStatus,
} from '@/lib/health/capture-display';

const STATUS_CONFIG: Record<DisplayStatus, { label: string; dot: string; text: string; ring: string }> = {
  ok: {
    label: 'Captura en línea',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    ring: 'border-emerald-400/30 bg-emerald-400/5',
  },
  degraded: {
    label: 'Captura degradada',
    dot: 'bg-purple-400',
    text: 'text-purple-400',
    ring: 'border-purple-400/30 bg-purple-400/5',
  },
  error: {
    label: 'Captura con error',
    dot: 'bg-red-400',
    text: 'text-red-400',
    ring: 'border-red-400/30 bg-red-400/5',
  },
  // Modo colector: el servicio corre con --no-capture y mide flujos, así que
  // no es una degradación. "Captura en línea" queda para el modo live.
  disabled: {
    label: 'Modo colector · captura deshabilitada',
    dot: 'bg-cyan-400',
    text: 'text-cyan-300',
    ring: 'border-cyan-400/30 bg-cyan-400/5',
  },
  unknown: {
    label: 'Sin datos del agente',
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    ring: 'border-slate-800/60 bg-slate-800/40',
  },
  stale: {
    label: 'Sin señal reciente',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    ring: 'border-amber-400/30 bg-amber-400/5',
  },
};

type Tone = 'neutral' | 'warn' | 'critical';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-slate-100',
  warn: 'text-orange-400',
  critical: 'text-red-400',
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
    <div className="min-w-0 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2.5">
      <dt className="font-mono text-[9px] uppercase leading-4 tracking-[0.18em] text-slate-400">{label}</dt>
      <dd className={`mt-1 truncate font-display text-lg font-bold tabular-nums ${TONE_TEXT[tone]}`} title={value}>
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-400/70">{hint}</p>
      ) : null}
    </div>
  );
}

export function AgentHealthCard({ health }: { health: HealthMetric | undefined }) {
  const reported = captureStatusOf(health?.capture_status);
  const stale = isStale(health?.recorded_at);
  // `stale` manda para el color, pero el último estado reportado se conserva.
  const status: DisplayStatus = stale ? 'stale' : reported;
  const config = STATUS_CONFIG[status];
  const drops = health?.packets_dropped ?? 0;
  const seen = health?.packets_seen ?? 0;
  const rate = dropRate(seen, drops);
  const parseErrors = health?.parse_errors ?? 0;
  const hasReport = Boolean(health?.recorded_at);

  return (
    <section
      aria-label="Salud del agente de captura"
      className={`rounded-xl border-slate-800 bg-slate-900/60 transition-colors ${config.ring}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-slate-800 bg-slate-950/80">
            <Activity className="size-5 text-sky-400" strokeWidth={1.5} aria-hidden="true" />
            <span className="absolute -right-1.5 -top-1.5 flex size-3.5">
              {status === 'ok' ? (
                <span className={`absolute inline-flex size-full animate-ping rounded-full ${config.dot} opacity-60`} aria-hidden="true" />
              ) : null}
              <span className={`relative inline-flex size-3.5 rounded-full border-2 border-slate-950 ${config.dot}`} aria-hidden="true" />
            </span>
          </span>
          <div className="leading-tight">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400">Agente de captura</p>
            <p className={`mt-1 font-display text-base font-bold ${config.text}`}>{config.label}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Última señal · {timeAgo(health?.recorded_at)}
              {/* El último estado reportado se conserva: dice qué pasó antes de callarse. */}
              {stale && reported !== 'unknown' ? ` · reportó ${reported}` : ''}
            </p>
          </div>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400/70">
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

      {/* T4.1 (M4): métricas del colector NetFlow/IPFIX; solo si el agente las reporta. */}
      {health?.collector_packets_received != null ? (
        <>
          <p className="border-t border-slate-800/80 px-5 pt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
            Colector NetFlow / IPFIX
          </p>
          <dl className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-3 xl:grid-cols-5">
            <Tile
              label="Datagramas recibidos"
              value={formatNum(health.collector_packets_received)}
            />
            <Tile
              label="Descartados"
              value={formatNum(health.collector_packets_dropped ?? 0)}
              tone={(health.collector_packets_dropped ?? 0) > 0 ? 'warn' : 'neutral'}
              hint="backpressure"
            />
            <Tile
              label="Errores de parseo"
              value={formatNum(health.collector_parse_errors ?? 0)}
              tone={(health.collector_parse_errors ?? 0) > 0 ? 'critical' : 'neutral'}
              hint="colector"
            />
            <Tile
              label="Templates en caché"
              value={formatNum(health.collector_templates_cached ?? 0)}
              hint="v9 / ipfix"
            />
            <Tile
              label="Flujos normalizados"
              value={formatNum(health.collector_flows_normalized ?? 0)}
            />
          </dl>
        </>
      ) : null}

      <p
        className={`flex items-start gap-2 border-t border-slate-800/80 px-5 py-3 font-mono text-[10px] uppercase leading-5 tracking-[0.12em] ${
          health?.last_error ? 'text-red-400' : 'text-slate-400/70'
        }`}
        title={health?.last_error ?? undefined}
      >
        <AlertTriangle
          className={`mt-0.5 size-3.5 shrink-0 ${health?.last_error ? 'text-red-400' : 'text-slate-400/40'}`}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">
          Último error · {health?.last_error ?? 'sin errores registrados'}
        </span>
      </p>
    </section>
  );
}
