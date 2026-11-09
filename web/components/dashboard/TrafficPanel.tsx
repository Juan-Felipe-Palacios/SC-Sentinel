// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Panel de tráfico con selector de visualización. Cada vista consume la misma
// respuesta de `/api/query?metric=overview`: serie temporal, hosts, puertos,
// protocolos y países. El mapa se carga aparte porque arrastra la geometría.
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, Gauge, GitBranch, Globe2, Radar, Waves } from 'lucide-react';
import type {
  OverviewProtocolShare,
  OverviewSeriesPoint,
  OverviewTopCountry,
  OverviewTopHost,
  OverviewTopPort,
} from '@/lib/api-types';
import { TrafficChart } from './TrafficChart';
import { TrafficStream } from './traffic/TrafficStream';
import { TrafficSankey } from './traffic/TrafficSankey';
import { PortsRadar } from './traffic/PortsRadar';
import { ThroughputGauge } from './traffic/ThroughputGauge';

const GeoArcs = dynamic(() => import('./traffic/GeoArcs').then((module) => module.GeoArcs), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] items-center justify-center" aria-busy="true" aria-label="Cargando mapa">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Cargando mapa…</span>
    </div>
  ),
});

const MODES = [
  { id: 'line', label: 'Línea', hint: 'Serie temporal de entrada y salida', icon: Activity },
  { id: 'stream', label: 'Flujo', hint: 'Stream graph de volumen apilado', icon: Waves },
  { id: 'sankey', label: 'Sankey', hint: 'Sankey de host → dirección → país', icon: GitBranch },
  { id: 'geo', label: 'Mapa', hint: 'Mapa geoespacial con arcos neón', icon: Globe2 },
  { id: 'radar', label: 'Radar', hint: 'Radar de puertos y protocolos', icon: Radar },
  { id: 'gauge', label: 'Velocidad', hint: 'Velocímetro radial de throughput', icon: Gauge },
] as const;

type ModeId = (typeof MODES)[number]['id'];

interface TrafficPanelProps {
  series: OverviewSeriesPoint[];
  hosts: OverviewTopHost[];
  ports: OverviewTopPort[];
  protocols: OverviewProtocolShare[];
  countries: OverviewTopCountry[];
  periodLabel: string;
}

function LiveBadge() {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-sc-ok/30 bg-sc-ok/10 px-2.5 py-1 font-mono text-[11px] text-sc-ok">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-sc-ok opacity-60" aria-hidden="true" />
        <span className="relative inline-flex size-2 rounded-full bg-sc-ok" aria-hidden="true" />
      </span>
      En vivo · 5s
    </span>
  );
}

export function TrafficPanel({ series, hosts, ports, protocols, countries, periodLabel }: TrafficPanelProps) {
  const [mode, setMode] = useState<ModeId>('line');
  const active = MODES.find((item) => item.id === mode) ?? MODES[0];
  const showsDirection = mode === 'line' || mode === 'stream';

  return (
    <section aria-label="Tráfico agregado" className="rounded-lg border sc-hairline bg-sc-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-sc-viz-in" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2 className="font-display text-sm font-semibold text-sc-text">Dinámica de tráfico</h2>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted/70">{active.hint}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {showsDirection ? (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-sc-viz-in">
                <span className="size-2 rounded-full bg-sc-viz-in" aria-hidden="true" />
                Bytes In
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-sc-viz-out">
                <span className="size-2 rounded-full bg-sc-viz-out" aria-hidden="true" />
                Bytes Out
              </span>
            </div>
          ) : null}
          <p className="hidden font-mono text-[10px] text-sc-text-muted lg:block">{periodLabel}</p>
          <LiveBadge />
        </div>
      </header>

      <div
        role="group"
        aria-label="Tipo de visualización del tráfico"
        className="mt-3 flex items-center gap-1 overflow-x-auto border-b sc-hairline px-3 pb-3"
      >
        {MODES.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === mode;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              aria-pressed={isActive}
              title={item.hint}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 ${
                isActive
                  ? 'border-sc-viz-in/40 bg-sc-viz-in/10 text-sc-viz-in'
                  : 'border-transparent text-sc-text-muted hover:bg-white/5 hover:text-sc-text'
              }`}
            >
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {/* sr-only mantiene el nombre accesible igual en móvil, donde el texto no se ve */}
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4 pt-3">
        {mode === 'line' ? <TrafficChart series={series} /> : null}
        {mode === 'stream' ? <TrafficStream series={series} /> : null}
        {mode === 'sankey' ? <TrafficSankey hosts={hosts} /> : null}
        {mode === 'geo' ? <GeoArcs countries={countries} /> : null}
        {mode === 'radar' ? <PortsRadar ports={ports} protocols={protocols} /> : null}
        {mode === 'gauge' ? <ThroughputGauge series={series} /> : null}
      </div>
    </section>
  );
}
