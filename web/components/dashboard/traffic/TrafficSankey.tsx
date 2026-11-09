// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Sankey de tres columnas: host → dirección → país, dibujado a mano para controlar
// el glow y evitar el layout rígido de las libs. Todo se deriva de `top_hosts`
// (los totales por país se suman desde los mismos hosts para que cierre el flujo).
import { useMemo } from 'react';
import type { OverviewTopHost } from '@/lib/api-types';
import { formatBytes, formatNum } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { EmptyChart } from './EmptyChart';

const WIDTH = 900;
const HEIGHT = 340;
const NODE_W = 9;
const PAD = 12;
const HOST_LIMIT = 8;

interface Node {
  id: string;
  label: string;
  sublabel: string;
  value: number;
  tone: string;
}

interface Link {
  from: string;
  to: string;
  value: number;
  tone: string;
  label: string;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function hostLabel(host: OverviewTopHost): string {
  return host.hostname ?? host.ip ?? host.host_key.slice(0, 12);
}

export function TrafficSankey({ hosts }: { hosts: OverviewTopHost[] }) {
  const layout = useMemo(() => {
    const top = hosts.filter((host) => host.bytes_total > 0).slice(0, HOST_LIMIT);
    const totalIn = top.reduce((sum, host) => sum + host.bytes_in, 0);
    const totalOut = top.reduce((sum, host) => sum + host.bytes_out, 0);
    if (top.length === 0 || totalIn + totalOut === 0) return null;

    const byCountry = new Map<string, { bytesIn: number; bytesOut: number }>();
    for (const host of top) {
      const key = host.country ?? '—';
      const current = byCountry.get(key) ?? { bytesIn: 0, bytesOut: 0 };
      current.bytesIn += host.bytes_in;
      current.bytesOut += host.bytes_out;
      byCountry.set(key, current);
    }

    const hostNodes: Node[] = top.map((host) => ({
      id: `h:${host.host_key}`,
      label: truncate(hostLabel(host), 22),
      sublabel: formatBytes(host.bytes_total),
      value: host.bytes_total,
      tone: VIZ.in,
    }));
    const directionNodes: Node[] = [
      { id: 'd:in', label: 'Entrada', sublabel: '', value: totalIn, tone: VIZ.in },
      { id: 'd:out', label: 'Salida', sublabel: '', value: totalOut, tone: VIZ.out },
    ].filter((node) => node.value > 0);
    const countryNodes: Node[] = Array.from(byCountry.entries())
      .map(([country, sums]) => ({
        id: `c:${country}`,
        label: country === '—' ? 'Sin país' : country,
        sublabel: formatBytes(sums.bytesIn + sums.bytesOut),
        value: sums.bytesIn + sums.bytesOut,
        tone: country === '—' ? VIZ.muted : VIZ.ok,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const links: Link[] = [];
    for (const host of top) {
      if (host.bytes_in > 0) {
        links.push({ from: `h:${host.host_key}`, to: 'd:in', value: host.bytes_in, tone: VIZ.in, label: 'Entrada' });
      }
      if (host.bytes_out > 0) {
        links.push({ from: `h:${host.host_key}`, to: 'd:out', value: host.bytes_out, tone: VIZ.out, label: 'Salida' });
      }
    }
    for (const node of countryNodes) {
      const country = node.id.slice(2);
      const sums = byCountry.get(country);
      if (!sums) continue;
      if (sums.bytesIn > 0) {
        links.push({ from: 'd:in', to: node.id, value: sums.bytesIn, tone: VIZ.in, label: 'Entrada' });
      }
      if (sums.bytesOut > 0) {
        links.push({ from: 'd:out', to: node.id, value: sums.bytesOut, tone: VIZ.out, label: 'Salida' });
      }
    }

    const columns = [hostNodes, directionNodes, countryNodes];
    const maxTotal = Math.max(...columns.map((column) => column.reduce((sum, node) => sum + node.value, 0)));
    const maxNodes = Math.max(...columns.map((column) => column.length));
    const scale = (HEIGHT - PAD * (maxNodes - 1)) / maxTotal;

    const xs = [0, WIDTH / 2 - NODE_W / 2, WIDTH - NODE_W];
    const positions = new Map<string, { x: number; y: number; height: number; node: Node }>();

    columns.forEach((column, columnIndex) => {
      const columnHeight = column.reduce((sum, node) => sum + node.value * scale, 0) + PAD * (column.length - 1);
      let cursor = (HEIGHT - columnHeight) / 2;
      for (const node of column) {
        const height = Math.max(2, node.value * scale);
        positions.set(node.id, { x: xs[columnIndex], y: cursor, height, node });
        cursor += height + PAD;
      }
    });

    // Cursores de salida/entrada para apilar los ribbons sin solaparlos.
    const outCursor = new Map<string, number>();
    const inCursor = new Map<string, number>();
    const positioned: PositionedLink[] = [];
    for (const link of links) {
      const from = positions.get(link.from);
      const to = positions.get(link.to);
      if (!from || !to) continue;
      const thickness = Math.max(1, link.value * scale);
      const y0 = outCursor.get(link.from) ?? from.y;
      const y1 = inCursor.get(link.to) ?? to.y;
      outCursor.set(link.from, y0 + thickness);
      inCursor.set(link.to, y1 + thickness);
      positioned.push({ ...link, thickness, x0: from.x + NODE_W, x1: to.x, y0, y1 });
    }

    return { positions, links: positioned, total: totalIn + totalOut };
  }, [hosts]);

  if (!layout) {
    return (
      <EmptyChart
        title="Sin flujos que dibujar"
        detail="El Sankey necesita hosts con bytes en el período para armar las columnas de entrada y salida."
      />
    );
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[340px] w-full"
        role="img"
        aria-label="Diagrama de Sankey de tráfico: hosts, dirección de entrada y salida, y países de destino"
      >
        <defs>
          <linearGradient id="sankey-in" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={VIZ.in} stopOpacity={0.55} />
            <stop offset="100%" stopColor={VIZ.in} stopOpacity={0.16} />
          </linearGradient>
          <linearGradient id="sankey-out" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={VIZ.out} stopOpacity={0.55} />
            <stop offset="100%" stopColor={VIZ.out} stopOpacity={0.16} />
          </linearGradient>
        </defs>

        {layout.links.map((link) => (
          <path
            key={`${link.from}->${link.to}`}
            d={ribbonPath(link)}
            fill={link.tone === VIZ.in ? 'url(#sankey-in)' : 'url(#sankey-out)'}
            stroke="none"
          >
            <title>{`${link.label}: ${formatBytes(link.value)}`}</title>
          </path>
        ))}

        {Array.from(layout.positions.values()).map(({ x, y, height, node }) => (
          <g key={node.id}>
            <rect x={x} y={y} width={NODE_W} height={height} rx={2} fill={node.tone} opacity={0.9}>
              <title>{`${node.label}: ${formatBytes(node.value)}`}</title>
            </rect>
            {x < WIDTH / 2 ? (
              <>
                <text
                  x={x - 10}
                  y={y + height / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-sc-text font-display text-[11px]"
                >
                  {node.label}
                </text>
                <text
                  x={x - 10}
                  y={y + height / 2 + 13}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-sc-text-muted font-mono text-[9px]"
                >
                  {node.sublabel}
                </text>
              </>
            ) : (
              <>
                <text
                  x={x + NODE_W + 10}
                  y={y + height / 2}
                  dominantBaseline="middle"
                  className="fill-sc-text font-display text-[11px]"
                >
                  {node.label}
                </text>
                <text
                  x={x + NODE_W + 10}
                  y={y + height / 2 + 13}
                  dominantBaseline="middle"
                  className="fill-sc-text-muted font-mono text-[9px]"
                >
                  {node.sublabel}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-sc-text-muted/70">
        Top {Math.min(HOST_LIMIT, hosts.length)} hosts · {formatNum(layout.links.length)} flujos ·{' '}
        {formatBytes(layout.total)} en el período
      </p>
    </div>
  );
}

interface PositionedLink extends Link {
  thickness: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function ribbonPath(link: PositionedLink): string {
  const xm = (link.x0 + link.x1) / 2;
  const t = link.thickness;
  return [
    `M ${link.x0} ${link.y0}`,
    `C ${xm} ${link.y0}, ${xm} ${link.y1}, ${link.x1} ${link.y1}`,
    `L ${link.x1} ${link.y1 + t}`,
    `C ${xm} ${link.y1 + t}, ${xm} ${link.y0 + t}, ${link.x0} ${link.y0 + t}`,
    'Z',
  ].join(' ');
}
