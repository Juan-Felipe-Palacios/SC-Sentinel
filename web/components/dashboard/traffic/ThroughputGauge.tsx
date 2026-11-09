// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Velocímetro radial del throughput agregado (bytes/s). La aguja marca la última
// ventana; el arco de color llega hasta ahí sobre el pico del período. Las
// partículas recorren el arco con animateMotion y se ocultan con reduced-motion.
import { useMemo } from 'react';
import type { OverviewSeriesPoint } from '@/lib/api-types';
import { formatBytes, formatNum } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { EmptyChart } from './EmptyChart';

const WIDTH = 400;
const HEIGHT = 220;
const CX = WIDTH / 2;
const CY = 186;
const RADIUS = 148;

function pointAt(fraction: number, radius = RADIUS): [number, number] {
  const angle = Math.PI + Math.PI * Math.min(1, Math.max(0, fraction));
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function arcPath(fraction: number, radius = RADIUS): string {
  const [x1, y1] = pointAt(0, radius);
  const [x2, y2] = pointAt(Math.min(1, Math.max(0.0001, fraction)), radius);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
}

export function ThroughputGauge({ series }: { series: OverviewSeriesPoint[] }) {
  const model = useMemo(() => {
    if (series.length === 0) return null;
    const stamp = (value: string) => new Date(value).getTime();
    const last = series[series.length - 1];
    const previous = series.length > 1 ? series[series.length - 2] : null;
    const deltaSeconds =
      previous && stamp(last.timestamp) > stamp(previous.timestamp)
        ? (stamp(last.timestamp) - stamp(previous.timestamp)) / 1000
        : 60;

    const rateOf = (point: OverviewSeriesPoint) => (point.bytes_in + point.bytes_out) / deltaSeconds;
    const current = rateOf(last);
    const peak = Math.max(...series.map(rateOf), current);
    const total = series.reduce((sum, point) => sum + point.bytes_in + point.bytes_out, 0);
    const average = total / (series.length * deltaSeconds);

    return { current, peak, average, deltaSeconds, bucketCount: series.length };
  }, [series]);

  if (!model) {
    return (
      <EmptyChart
        title="Sin velocidad que medir"
        detail="El velocímetro usa la última ventana agregada; necesita al menos una ventana en el período."
      />
    );
  }

  const fraction = model.peak > 0 ? Math.min(1, model.current / model.peak) : 0;
  const needle = pointAt(fraction, RADIUS - 26);
  const valueArc = arcPath(fraction);

  return (
    <div className="w-full">
      <div
        className="flex h-[340px] w-full items-center justify-center"
        role="img"
        aria-label={`Velocidad de tráfico actual ${formatBytes(model.current)} por segundo, pico ${formatBytes(model.peak)} por segundo`}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full max-h-[340px] w-full max-w-[520px]">
          <defs>
            <linearGradient id="gauge-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={VIZ.ok} />
              <stop offset="55%" stopColor={VIZ.in} />
              <stop offset="100%" stopColor={VIZ.warn} />
            </linearGradient>
            <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Pista */}
          <path d={arcPath(1)} stroke="rgba(148,163,184,0.14)" strokeWidth={16} fill="none" strokeLinecap="round" />

          {/* Marcas */}
          {Array.from({ length: 9 }, (_, index) => {
            const f = index / 8;
            const [x1, y1] = pointAt(f, RADIUS - 14);
            const [x2, y2] = pointAt(f, RADIUS - 22);
            return <line key={f} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(148,163,184,0.3)" strokeWidth={1} />;
          })}

          {/* Arco de valor */}
          {fraction > 0.001 ? (
            <path
              d={valueArc}
              stroke="url(#gauge-arc)"
              strokeWidth={14}
              fill="none"
              strokeLinecap="round"
              filter="url(#gauge-glow)"
            />
          ) : null}

          {/* Aguja */}
          <line
            x1={CX}
            y1={CY}
            x2={needle[0]}
            y2={needle[1]}
            stroke={VIZ.in}
            strokeWidth={2.2}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
          />
          <circle cx={CX} cy={CY} r={5} fill={VIZ.in} />
          <circle cx={CX} cy={CY} r={9} fill="none" stroke={VIZ.in} strokeOpacity={0.4} strokeWidth={1} />

          {/* Partículas sobre el arco */}
          {fraction > 0.04 ? (
            <g className="sc-gauge-particles" fill="#e0f2fe">
              {[0, 0.9, 1.8, 2.7].map((begin, index) => (
                <circle key={begin} r={index === 0 ? 2.6 : 1.8} opacity={0.9 - index * 0.16}>
                  <animateMotion dur="3.6s" begin={`${begin}s`} repeatCount="indefinite" path={valueArc} />
                </circle>
              ))}
            </g>
          ) : null}

          {/* Lectura */}
          <text
            x={CX}
            y={CY - 58}
            textAnchor="middle"
            className="fill-sc-text font-display text-[30px] font-semibold tabular-nums"
          >
            {formatBytes(model.current)}
          </text>
          <text
            x={CX}
            y={CY - 34}
            textAnchor="middle"
            className="fill-sc-text-muted font-mono text-[10px] uppercase tracking-[0.24em]"
          >
            bytes / s
          </text>
          <text
            x={pointAt(0, RADIUS + 18)[0]}
            y={CY + 18}
            textAnchor="middle"
            className="fill-sc-text-muted/70 font-mono text-[9px]"
          >
            0
          </text>
          <text
            x={pointAt(1, RADIUS + 18)[0]}
            y={CY + 18}
            textAnchor="middle"
            className="fill-sc-text-muted/70 font-mono text-[9px]"
          >
            {formatBytes(model.peak)}/s
          </text>
        </svg>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-t sc-hairline pt-3">
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">Pico</dt>
          <dd className="mt-0.5 font-display text-sm font-semibold tabular-nums text-sc-text">
            {formatBytes(model.peak)}/s
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">Promedio</dt>
          <dd className="mt-0.5 font-display text-sm font-semibold tabular-nums text-sc-text">
            {formatBytes(model.average)}/s
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted">Ventanas</dt>
          <dd className="mt-0.5 font-display text-sm font-semibold tabular-nums text-sc-text">
            {formatNum(model.bucketCount)} · {Math.round(model.deltaSeconds)} s
          </dd>
        </div>
      </dl>
    </div>
  );
}
