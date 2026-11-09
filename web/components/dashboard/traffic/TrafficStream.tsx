// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Stream graph: las dos series apiladas con offset "silhouette" (centradas), que
// deja ver la forma del volumen total sin perder la proporción entrada/salida.
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OverviewSeriesPoint } from '@/lib/api-types';
import { formatBytes } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { EmptyChart } from './EmptyChart';

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
}

function StreamTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const at = new Date(label);
  const heading = Number.isNaN(at.getTime())
    ? String(label)
    : at.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
  return (
    <div className="rounded-lg border sc-hairline bg-sc-bg/95 px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">{heading}</p>
      <div className="mt-1 space-y-0.5 font-mono text-[11px] tabular-nums">
        {payload.map((entry, index) => (
          <p key={index} className="flex items-center justify-between gap-5">
            <span className={entry.dataKey === 'bytes_in' ? 'text-sc-viz-in' : 'text-sc-viz-out'}>
              {entry.dataKey === 'bytes_in' ? 'Entrada' : 'Salida'}
            </span>
            <span className="font-semibold text-sc-text">{formatBytes(Number(entry.value ?? 0))}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function TrafficStream({ series }: { series: OverviewSeriesPoint[] }) {
  if (series.length === 0) {
    return (
      <EmptyChart
        title="Sin tráfico en el período"
        detail="El stream graph aparece cuando el agente publica ventanas de flujo."
      />
    );
  }

  return (
    <div className="w-full">
      <div
        className="h-[340px] w-full"
        role="img"
        aria-label="Stream graph de bytes de entrada y salida apilados por ventana temporal"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} stackOffset="silhouette" margin={{ top: 16, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="stream-in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIZ.in} stopOpacity={0.55} />
                <stop offset="100%" stopColor={VIZ.in} stopOpacity={0.12} />
              </linearGradient>
              <linearGradient id="stream-out" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={VIZ.out} stopOpacity={0.55} />
                <stop offset="100%" stopColor={VIZ.out} stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timestamp"
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tick={{ fill: VIZ.muted, fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
              tickFormatter={(value: string) =>
                new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
              }
            />
            <YAxis hide />
            <Tooltip content={<StreamTooltip />} cursor={{ stroke: VIZ.in, strokeOpacity: 0.35, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="bytes_in"
              stackId="stream"
              stroke={VIZ.in}
              strokeWidth={1.6}
              fill="url(#stream-in)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="bytes_out"
              stackId="stream"
              stroke={VIZ.out}
              strokeWidth={1.6}
              fill="url(#stream-out)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase leading-5 tracking-[0.16em] text-sc-text-muted/70">
        Área apilada centrada · {series.length} ventanas
      </p>
    </div>
  );
}
