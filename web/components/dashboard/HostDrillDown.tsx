// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Drill-down: hosts del período → actividad de un host ventana por ventana.
// El esquema solo guarda agregados de 30 s: no hay conexiones individuales, así
// que la unidad es la ventana y las alertas se muestran por ventana (correlación
// temporal, no atribución al host).
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronRight, Search, TriangleAlert } from 'lucide-react';
import type { HostDetailResponse, HostsResponse } from '@/lib/api-types';
import type { QueryRange } from '@/lib/schemas/query';
import { fetcher } from '@/lib/swr';
import { formatBytes, formatNum } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { zoomParams, type ZoomRange } from '@/lib/zoom';

const REFRESH_MS = 5000;

interface HostDrillDownProps {
  range: QueryRange;
  zoom: ZoomRange | null;
}

function riskTone(score: number | null): string {
  if (score === null) return 'text-sc-text-muted';
  if (score >= 0.7) return 'text-sc-critical';
  if (score >= 0.4) return 'text-sc-warn';
  return 'text-sc-ok';
}

function hostLabel(host: { host_key: string; ip: string | null }): string {
  return host.ip ?? host.host_key;
}

function DetailChart({ detail }: { detail: HostDetailResponse }) {
  const points = detail.series.map((point) => ({
    ...point,
    label: new Date(point.timestamp).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
  }));

  return (
    <div className="h-40 w-full" role="img" aria-label="Bytes de entrada y salida del host, ventana por ventana">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="host-in-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIZ.in} stopOpacity={0.35} />
              <stop offset="100%" stopColor={VIZ.in} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="host-out-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIZ.out} stopOpacity={0.3} />
              <stop offset="100%" stopColor={VIZ.out} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: VIZ.axis }}
            minTickGap={40}
            tick={{ fill: VIZ.muted, fontSize: 9, fontFamily: 'var(--font-plex-mono)' }}
          />
          <YAxis
            width={54}
            tickLine={false}
            axisLine={{ stroke: VIZ.axis }}
            tick={{ fill: VIZ.muted, fontSize: 9, fontFamily: 'var(--font-plex-mono)' }}
            tickFormatter={(value: number) => formatBytes(value, 0)}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(2, 6, 23, 0.95)',
              border: `1px solid ${VIZ.grid}`,
              borderRadius: 10,
              fontSize: 11,
              fontFamily: 'var(--font-plex-mono)',
            }}
            labelStyle={{ color: VIZ.muted }}
            formatter={(value, name) => [formatBytes(Number(value ?? 0)), name === 'bytes_in' ? 'Entrada' : 'Salida']}
          />
          <Area
            type="monotone"
            dataKey="bytes_in"
            stroke={VIZ.in}
            strokeWidth={2}
            fill="url(#host-in-fill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="bytes_out"
            stroke={VIZ.out}
            strokeWidth={1.8}
            fill="url(#host-out-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HostDrillDown({ range, zoom }: HostDrillDownProps) {
  const suffix = zoomParams(zoom);
  const hostsKey = `/api/query?metric=hosts&range=${range}${suffix}`;
  const { data: hostsData, error: hostsError } = useSWR<HostsResponse>(hostsKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const hosts = useMemo(() => {
    const list = hostsData?.hosts ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? list.filter(
          (host) =>
            host.host_key.toLowerCase().includes(needle) || (host.ip ?? '').toLowerCase().includes(needle)
        )
      : list;
    return filtered.slice(0, 40);
  }, [hostsData, query]);

  const activeHost = selected ?? hosts[0]?.host_key ?? null;
  const detailKey = activeHost ? `/api/query?metric=host&host_key=${encodeURIComponent(activeHost)}&range=${range}${suffix}` : null;
  const { data: detail, error: detailError } = useSWR<HostDetailResponse>(detailKey, fetcher, {
    refreshInterval: REFRESH_MS,
  });

  if (hostsError && !hostsData) {
    return (
      <section aria-label="Investigación por host" className="rounded-lg border sc-hairline bg-sc-surface p-4">
        <p className="font-display text-sm font-semibold text-sc-text">No se pudo cargar la lista de hosts</p>
        <p className="mt-1 text-xs text-sc-text-muted">El servidor no respondió. Reintentá cuando la base esté disponible.</p>
      </section>
    );
  }

  const alertWindows = detail?.series.filter((point) => point.alert_count > 0) ?? [];

  return (
    <section aria-label="Investigación por host" className="rounded-lg border sc-hairline bg-sc-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-sc-text">Investigación por host</h2>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sc-text-muted/70">
            agregados de 30 s · sin conexiones individuales
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-md border sc-hairline px-2 py-1">
          <Search className="size-3.5 text-sc-text-muted" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="IP o host_key"
            aria-label="Filtrar hosts"
            className="w-32 bg-transparent font-mono text-[11px] text-sc-text placeholder:text-sc-text-muted/60 focus:outline-none sm:w-44"
          />
        </label>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,270px)_1fr]">
        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {hosts.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-sc-text-muted">
              {hostsData?.hosts.length ? 'Ningún host coincide con el filtro.' : 'Sin hosts en el período.'}
            </p>
          ) : (
            hosts.map((host) => {
              const isActive = host.host_key === activeHost;
              const bytes = host.bytes_in + host.bytes_out;
              return (
                <button
                  key={host.host_key}
                  type="button"
                  onClick={() => setSelected(host.host_key)}
                  aria-pressed={isActive}
                  className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 ${
                    isActive
                      ? 'border-sc-viz-in/40 bg-sc-viz-in/10'
                      : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-sc-text">{hostLabel(host)}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-sc-text">{formatBytes(bytes)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[9px] text-sc-text-muted">
                      {host.country ?? 'sin país'}
                      {host.ip ? ` · ${host.host_key}` : ''}
                    </span>
                    <span className={`shrink-0 font-mono text-[9px] ${riskTone(host.risk_score)}`}>
                      {host.risk_score === null ? 'sin score' : `riesgo ${host.risk_score.toFixed(2)}`}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="min-w-0">
          {!activeHost ? (
            <div className="flex h-[260px] items-center justify-center text-center">
              <p className="max-w-xs text-xs leading-5 text-sc-text-muted">
                Elegí un host de la lista para ver su actividad ventana por ventana y las alertas que coincidieron en el tiempo.
              </p>
            </div>
          ) : detailError && !detail ? (
            <p className="py-8 text-center text-xs text-sc-text-muted">No se pudo cargar el detalle del host.</p>
          ) : !detail ? (
            <div className="flex h-[260px] items-center justify-center" aria-busy="true">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sc-text-muted">Cargando host…</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-sc-text">{detail.ip ?? detail.host_key}</p>
                  <p className="font-mono text-[10px] text-sc-text-muted">
                    {detail.country ?? 'sin país'} · {formatNum(detail.totals.windows_count)} ventanas observadas
                  </p>
                </div>
                <div className="flex gap-4 font-mono text-[10px] tabular-nums">
                  <span className="text-sc-viz-in">↑ {formatBytes(detail.totals.bytes_in)}</span>
                  <span className="text-sc-viz-out">↓ {formatBytes(detail.totals.bytes_out)}</span>
                  <span className="text-sc-text-muted">{formatNum(detail.totals.packets)} pkt</span>
                </div>
              </div>

              {detail.series.length === 0 ? (
                <p className="py-10 text-center text-xs text-sc-text-muted">Sin ventanas para este host en el período.</p>
              ) : (
                <>
                  <DetailChart detail={detail} />

                  {/* Correlación: una marca por ventana con alertas (de cualquier host). */}
                  {alertWindows.length > 0 ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <TriangleAlert className="size-3 text-sc-warn" strokeWidth={1.75} aria-hidden="true" />
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sc-warn">
                          {formatNum(alertWindows.length)} de {formatNum(detail.series.length)} ventanas con alertas
                        </p>
                      </div>
                      <div className="flex gap-[2px]" aria-hidden="true">
                        {detail.series.map((point) => (
                          <span
                            key={point.timestamp}
                            className={`h-1.5 flex-1 rounded-[1px] ${
                              point.alert_count > 0 ? 'bg-sc-warn/80' : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] leading-4 text-sc-text-muted">
                        Las alertas pertenecen a la ventana, no al host: marcan coincidencia temporal, no atribución.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] leading-4 text-sc-text-muted">
                      Ninguna alerta coincidió con las ventanas de este host en el período seleccionado.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {detail?.totals.alerts_count ? (
        <footer className="flex items-center gap-1.5 border-t sc-hairline px-4 py-2 font-mono text-[10px] text-sc-text-muted">
          <ChevronRight className="size-3" strokeWidth={1.75} aria-hidden="true" />
          {formatNum(detail.totals.alerts_count)} alertas en las ventanas de este host
        </footer>
      ) : null}
    </section>
  );
}
