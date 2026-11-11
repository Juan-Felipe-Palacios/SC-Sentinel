// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import type { QueryRange } from '@/lib/schemas/query';
import { ExportBar } from './ExportBar';
import { HostDrillDown } from './HostDrillDown';

export function HostsView({ range }: { range: QueryRange }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Inventario</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-100">Hosts monitoreados</h2>
          <p className="mt-1 text-sm text-slate-400">
            Investigación por host con actividad ventana por ventana y correlación temporal de alertas.
          </p>
        </div>
        <ExportBar range={range} zoom={null} />
      </div>

      <HostDrillDown range={range} zoom={null} />
    </div>
  );
}