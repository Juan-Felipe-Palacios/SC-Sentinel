// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import useSWR from 'swr';
import type { QueryRange } from '@/lib/schemas/query';
import type { TopologyResponse } from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';
import { OtNetworkMap } from './OtNetworkMap';

export function NetworkMapCard({ range }: { range: QueryRange }) {
  const key = `/api/query?metric=topology&range=${range}`;
  const { data, error, isLoading } = useSWR<TopologyResponse>(key, fetcher, { refreshInterval: 5000 });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">Topología OT</p>
          <h3 className="font-display text-lg font-semibold text-slate-100">Mapa OT observado</h3>
        </div>
        {data?.truncated.nodes || data?.truncated.edges ? (
          <span className="text-xs text-amber-300">Acotado</span>
        ) : null}
      </div>

      {isLoading && !data ? (
        <div className="h-48 animate-pulse rounded-lg border border-slate-800 bg-slate-900/40" />
      ) : error ? (
        <p className="text-sm text-slate-400">
          {error instanceof FetchError && error.status === 503
            ? 'Servicio de datos no disponible.'
            : 'No se pudo cargar el mapa OT.'}
        </p>
      ) : !data || data.nodes.length === 0 ? (
        <p className="text-sm text-slate-400">Sin activos OT observados en el período.</p>
      ) : (
        <OtNetworkMap nodes={data.nodes} edges={data.edges} />
      )}
    </div>
  );
}
