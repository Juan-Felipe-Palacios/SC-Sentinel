// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Mapa geoespacial con arcos neón. El agente no publica el país del sensor, así que
// el origen de los arcos es el país de mayor volumen y el resto son los destinos
// observados; la regla queda escrita en el pie del panel.
import { useMemo } from 'react';
import type { OverviewTopCountry } from '@/lib/api-types';
import { countryDisplay, formatBytes, formatNum } from '@/lib/format';
import { WORLD_HEIGHT, WORLD_WIDTH, countryPoint, worldLandPath } from '@/lib/geo/world';
import { VIZ } from '@/lib/viz';
import { EmptyChart } from './EmptyChart';

interface Hub {
  code: string;
  label: string;
  x: number;
  y: number;
  bytes: number;
  hosts: number;
}

interface Arc {
  key: string;
  path: string;
  width: number;
  share: number;
  from: Hub;
  to: Hub;
}

function arcPath(from: Hub, to: Hub): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return '';
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Normal perpendicular al segmento; se elige el sentido que sube el arco.
  const nx = -dy / distance;
  const ny = dx / distance;
  const bend = Math.min(120, distance * 0.32);
  const sign = ny > 0 ? -1 : 1;
  const cx = mx + nx * bend * sign;
  const cy = my + ny * bend * sign;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

export function GeoArcs({ countries }: { countries: OverviewTopCountry[] }) {
  const model = useMemo(() => {
    const hubs: Hub[] = [];
    let unresolved = 0;
    for (const item of countries) {
      const point = countryPoint(item.country);
      if (!point) {
        if (item.country !== 'LAN') unresolved += 1;
        continue;
      }
      const display = countryDisplay(item.country);
      hubs.push({
        code: item.country,
        label: display.label,
        x: point[0],
        y: point[1],
        bytes: item.bytes_total,
        hosts: item.hosts_count,
      });
    }
    hubs.sort((a, b) => b.bytes - a.bytes);
    if (hubs.length === 0) return null;

    const maxBytes = hubs[0].bytes || 1;
    const origin = hubs[0];
    const arcs: Arc[] = hubs.slice(1).map((hub) => ({
      key: `${origin.code}-${hub.code}`,
      path: arcPath(origin, hub),
      width: 1 + (hub.bytes / maxBytes) * 3.5,
      share: hub.bytes / maxBytes,
      from: origin,
      to: hub,
    }));

    return { hubs, arcs, origin, maxBytes, unresolved };
  }, [countries]);

  if (!model) {
    return (
      <EmptyChart
        title="Sin geolocalización en el período"
        detail="El agente resuelve país por GeoIP. Cuando lleguen ventanas con países conocidos, el mapa dibuja los arcos."
      />
    );
  }

  const land = worldLandPath();

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        className="h-[340px] w-full"
        role="img"
        aria-label={`Mapa de tráfico por país: ${model.hubs
          .map((hub) => `${hub.label} ${formatBytes(hub.bytes)}`)
          .join(', ')}`}
      >
        <defs>
          <linearGradient id="geo-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={VIZ.in} stopOpacity={0.95} />
            <stop offset="100%" stopColor={VIZ.ok} stopOpacity={0.6} />
          </linearGradient>
          <filter id="geo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="geo-hub" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={VIZ.in} stopOpacity={0.9} />
            <stop offset="100%" stopColor={VIZ.in} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Retícula discreta + silueta de continentes */}
        <g stroke="rgba(148,163,184,0.10)" strokeWidth={0.5} fill="none">
          {Array.from({ length: 5 }, (_, index) => {
            const y = 24 + (index * (WORLD_HEIGHT - 48)) / 4;
            return <line key={`lat-${index}`} x1={0} y1={y} x2={WORLD_WIDTH} y2={y} />;
          })}
          {Array.from({ length: 9 }, (_, index) => {
            const x = 20 + (index * (WORLD_WIDTH - 40)) / 8;
            return <line key={`lon-${index}`} x1={x} y1={0} x2={x} y2={WORLD_HEIGHT} />;
          })}
        </g>
        <path d={land} fill="rgba(148,163,184,0.14)" stroke="rgba(148,163,184,0.30)" strokeWidth={0.6} />

        {/* Arcos: capa ancha y difusa + trazo fino brillante */}
        <g fill="none">
          {model.arcs.map((arc) =>
            arc.path ? (
              <path
                key={`${arc.key}-glow`}
                d={arc.path}
                stroke="url(#geo-arc)"
                strokeWidth={arc.width + 5}
                strokeOpacity={0.14}
                strokeLinecap="round"
              />
            ) : null
          )}
          {model.arcs.map((arc) =>
            arc.path ? (
              <path
                key={arc.key}
                d={arc.path}
                stroke="url(#geo-arc)"
                strokeWidth={arc.width}
                strokeLinecap="round"
                filter="url(#geo-glow)"
              >
                <title>{`${arc.from.label} → ${arc.to.label}: ${formatBytes(arc.to.bytes)}`}</title>
              </path>
            ) : null
          )}
        </g>

        {/* Hubs */}
        {model.hubs.map((hub, index) => {
          const display = countryDisplay(hub.code);
          const radius = 3 + (hub.bytes / model.maxBytes) * 5;
          const isOrigin = index === 0;
          return (
            <g key={hub.code}>
              <circle cx={hub.x} cy={hub.y} r={radius * 4} fill="url(#geo-hub)" opacity={isOrigin ? 0.55 : 0.3} />
              <circle cx={hub.x} cy={hub.y} r={radius} fill={isOrigin ? VIZ.in : VIZ.ok} stroke="rgba(11,18,32,0.9)" strokeWidth={1}>
                <title>{`${display.label}: ${formatBytes(hub.bytes)} · ${formatNum(hub.hosts)} hosts`}</title>
              </circle>
              {isOrigin ? (
                <circle cx={hub.x} cy={hub.y} r={radius + 2} fill="none" stroke={VIZ.in} strokeWidth={1.2} opacity={0.7}>
                  <animate attributeName="r" values={`${radius + 2};${radius + 12}`} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <text
                x={hub.x}
                y={hub.y - radius - 8}
                textAnchor="middle"
                className="fill-sc-text font-mono text-[9px] uppercase"
              >
                {display.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 font-mono text-[9px] uppercase leading-5 tracking-[0.16em] text-sc-text-muted/70">
        Origen: {model.origin.label} ({formatBytes(model.origin.bytes)}) → {model.arcs.length} destinos
        {model.unresolved > 0 ? ` · ${model.unresolved} sin forma en el mapa` : ''}
      </p>
    </div>
  );
}
