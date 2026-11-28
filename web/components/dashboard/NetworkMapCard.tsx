// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import type { ReactNode } from 'react';
import useSWR from 'swr';
import type { QueryRange } from '@/lib/schemas/query';
import type {
  OverviewTopCountry,
  OverviewTopHost,
  OverviewTopPort,
  TopologyResponse,
} from '@/lib/api-types';
import { fetcher, FetchError } from '@/lib/swr';
import { buildItExposure } from '@/lib/it-exposure';
import { OtNetworkMap } from './OtNetworkMap';
import { ItExposureMap } from './ItExposureMap';

/** Marco compartido por las dos cards de red (E8.1 y E8.2). */
export function MapCardFrame({
  eyebrow,
  title,
  badge,
  children,
}: {
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
          <h3 className="font-display text-lg font-semibold text-slate-100">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export function NetworkMapCard({ range }: { range: QueryRange }) {
  const key = `/api/query?metric=topology&range=${range}`;
  const { data, error, isLoading } = useSWR<TopologyResponse>(key, fetcher, { refreshInterval: 30000 });

  return (
    <MapCardFrame
      eyebrow="Topología OT"
      title="Mapa OT observado"
      badge={
        data?.truncated.nodes || data?.truncated.edges ? (
          <span className="text-xs text-amber-300">Acotado</span>
        ) : null
      }
    >
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
    </MapCardFrame>
  );
}

/**
 * «Mapa de exposición IT» (E8.2): top hosts por país y puertos principales.
 * Recibe los datos de `metric=overview` que ya carga `ConnectionsView`; no
 * abre una petición nueva ni dibuja aristas.
 */
export function ItExposureCard({
  hosts,
  countries,
  ports,
}: {
  hosts: OverviewTopHost[];
  countries: OverviewTopCountry[];
  ports: OverviewTopPort[];
}) {
  const layout = buildItExposure(hosts, countries, ports);

  return (
    <MapCardFrame
      eyebrow="Exposición IT"
      title="Mapa de exposición IT"
      badge={layout.truncated ? <span className="text-xs text-amber-300">Acotado</span> : null}
    >
      {layout.groups.length === 0 ? (
        <p className="text-sm text-slate-400">Sin hosts observados en el período.</p>
      ) : (
        <ItExposureMap layout={layout} />
      )}
    </MapCardFrame>
  );
}
