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
    <div className="rounded-xl border border-slate-800 bg-slate-950/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{heading}</p>
      <div className="mt-1.5 space-y-1 font-mono text-xs tabular-nums">
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center justify-between gap-6">
            <span className={`flex items-center gap-1.5 font-semibold ${entry.dataKey === 'bytes_in' ? 'text-sky-400' : 'text-purple-400'}`}>
              <span className={`size-2 rounded-full ${entry.dataKey === 'bytes_in' ? 'bg-sky-400' : 'bg-purple-400'}`} aria-hidden="true" />
              {entry.dataKey === 'bytes_in' ? 'Tráfico Entrada' : 'Tráfico Salida'}
            </span>
            <span className="font-bold text-slate-100">{formatBytes(Number(entry.value ?? 0))}</span>
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
        <p className="font-display text-sm font-semibold text-slate-100">Sin tráfico en el período</p>
        <p className="max-w-xs text-xs leading-5 text-slate-400">
          Cuando el agente empiece a agregar ventanas de flujo, el gráfico aparece acá.
        </p>
      </div>
    );
  }

  return (
    <div className="h-72 w-full" role="img" aria-label="Gráfico de tráfico agregado: bytes de entrada y salida por ventana de tiempo">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sky-400-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="purple-400-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c084fc" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#c084fc" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            minTickGap={48}
            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
            }
          />
          <YAxis
            width={60}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
            tickFormatter={(value: number) => formatBytes(value, 0)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#38bdf8', strokeOpacity: 0.35, strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="bytes_in"
            name="Entrada"
            stroke="#38bdf8"
            strokeWidth={2.5}
            fill="url(#sky-400-fill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="bytes_out"
            name="Salida"
            stroke="#c084fc"
            strokeWidth={2}
            fill="url(#purple-400-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
