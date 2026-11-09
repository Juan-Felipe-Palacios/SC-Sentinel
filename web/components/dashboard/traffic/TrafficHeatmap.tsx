// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Mapa de calor hora UTC × puerto. Los puertos se publican agregados por ventana
// (`snapshot_json.top_ports`), así que la celda es tráfico del período en esa hora,
// no una conexión ni un host concreto.
import useSWR from 'swr';
import type { HeatmapResponse } from '@/lib/api-types';
import type { QueryRange } from '@/lib/schemas/query';
import { fetcher } from '@/lib/swr';
import { formatBytes } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { zoomParams, type ZoomRange } from '@/lib/zoom';
import { EmptyChart } from './EmptyChart';

const REFRESH_MS = 5000;
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

function rgbaFromHex(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function cellAlpha(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  // Raíz cuadrada: sin escala logarítmica los picos aplastan el resto a negro.
  return 0.12 + 0.78 * Math.sqrt(value / max);
}

export function TrafficHeatmap({ range, zoom }: { range: QueryRange; zoom: ZoomRange | null }) {
  const key = `/api/query?metric=heatmap&range=${range}${zoomParams(zoom)}`;
  const { data, error } = useSWR<HeatmapResponse>(key, fetcher, { refreshInterval: REFRESH_MS });

  if (error && !data) {
    return (
      <EmptyChart
        title="No se pudo cargar el mapa de calor"
        detail="El servidor no respondió con la matriz hora/puerto. Reintentá cuando la base esté disponible."
      />
    );
  }

  if (!data) {
    return (
      <div className="flex h-[340px] items-center justify-center" aria-busy="true" aria-label="Cargando mapa de calor">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Cargando matriz…</span>
      </div>
    );
  }

  if (data.ports.length === 0 || data.total_bytes === 0) {
    return (
      <EmptyChart
        title="Sin puertos en el período"
        detail="El agente todavía no publicó top_ports en estas ventanas; el mapa se llena cuando los snapshots incluyan puertos de destino."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {/* Encabezado de horas */}
          <div className="flex items-end pl-[124px]">
            {data.hours.map((hour) => (
              <div key={hour} className="flex-1 text-center font-mono text-[9px] text-sc-text-muted">
                {HOUR_TICKS.includes(hour) ? `${String(hour).padStart(2, '0')}h` : ''}
              </div>
            ))}
          </div>

          {data.ports.map((port, portIndex) => (
            <div key={`${port.port}-${port.protocol}`} className="flex items-center">
              <div className="w-[124px] shrink-0 pr-2 text-right">
                <span className="font-mono text-[11px] text-sc-text">{port.port}</span>
                <span className="ml-1 font-mono text-[9px] uppercase text-sc-text-muted">{port.protocol}</span>
              </div>
              <div className="flex flex-1 gap-[2px] py-[2px]">
                {data.hours.map((hour) => {
                  const value = data.cells[hour]?.[portIndex] ?? 0;
                  return (
                    <div
                      key={hour}
                      className="h-6 flex-1 rounded-[2px] border border-white/5"
                      style={{ backgroundColor: rgbaFromHex(VIZ.in, cellAlpha(value, data.max)) }}
                      title={`${String(hour).padStart(2, '0')}:00 UTC · puerto ${port.port}/${port.protocol} · ${formatBytes(value)}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-sc-text-muted">menos</span>
          <span className="flex gap-[2px]">
            {[0.12, 0.3, 0.5, 0.7, 0.9].map((alpha) => (
              <span
                key={alpha}
                className="size-3 rounded-[2px] border border-white/5"
                style={{ backgroundColor: rgbaFromHex(VIZ.in, alpha) }}
                aria-hidden="true"
              />
            ))}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-sc-text-muted">más</span>
        </div>
        <p className="font-mono text-[10px] text-sc-text-muted">
          {formatBytes(data.total_bytes)} en puertos · hora UTC
        </p>
      </div>
    </div>
  );
}
