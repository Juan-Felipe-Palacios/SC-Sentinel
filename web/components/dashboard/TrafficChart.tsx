// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { OverviewSeriesPoint } from '@/lib/api-types';
import { formatBytes } from '@/lib/format';

interface TrafficChartProps {
  series: OverviewSeriesPoint[];
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length || label == null) return null;

  const at = new Date(label);
  const heading = Number.isNaN(at.getTime())
    ? String(label)
    : at.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="rounded-md border sc-hairline bg-sc-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">{heading}</p>
      <div className="mt-1.5 space-y-1 font-mono text-[11px] tabular-nums">
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center justify-between gap-4">
            <span className={entry.dataKey === 'bytes_in' ? 'text-sc-viz-in' : 'text-sc-viz-out'}>
              {entry.dataKey === 'bytes_in' ? 'Entrada' : 'Salida'}
            </span>
            <span className="text-sc-text">{formatBytes(Number(entry.value ?? 0))}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function TrafficChart({ series }: TrafficChartProps) {
  if (series.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="font-display text-sm font-semibold text-sc-text">Sin tráfico en el período</p>
        <p className="max-w-xs text-xs leading-5 text-sc-text-muted">
          Cuando el agente empiece a agregar ventanas de flujo, el gráfico aparece acá.
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de tráfico agregado: bytes de entrada y salida por ventana de tiempo">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sc-viz-in-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="sc-viz-out-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#94a3b8" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
            }
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
            tickFormatter={(value: number) => formatBytes(value, 0)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#94a3b8', strokeOpacity: 0.25, strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="bytes_in"
            name="Entrada"
            stroke="#38bdf8"
            strokeWidth={1.8}
            fill="url(#sc-viz-in-fill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="bytes_out"
            name="Salida"
            stroke="#a78bfa"
            strokeWidth={1.8}
            fill="url(#sc-viz-out-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
