// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { formatBytes, formatNum } from '@/lib/format';
import type { ItExposureLayout } from '@/lib/it-exposure';

/**
 * «Mapa de exposición IT»: hosts agrupados por país y puertos principales.
 * No dibuja aristas — el contrato no publica pares origen-destino.
 */
export function ItExposureMap({ layout }: { layout: ItExposureLayout }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {layout.groups.map((group) => (
          <div
            key={group.country}
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
          >
            <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              <span className="truncate">{group.country}</span>
              <span className="shrink-0">{formatBytes(group.bytesTotal)}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {group.hosts.map((host) => (
                <li
                  key={host.key}
                  className="flex items-baseline justify-between gap-2 text-xs text-slate-200"
                >
                  <span className="truncate font-mono">{host.label}</span>
                  <span className="shrink-0 text-slate-400">{formatBytes(host.bytesTotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
          Puertos principales
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {layout.ports.map((port) => (
            <li
              key={`${port.port}-${port.protocol}`}
              className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-300"
            >
              :{port.port} <span className="text-slate-500">{port.protocol}</span>
              <span className="text-slate-400"> · {formatNum(port.connections)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-500">
        Exposición observada; no muestra aristas: el contrato no publica pares origen-destino.
      </p>
    </div>
  );
}
