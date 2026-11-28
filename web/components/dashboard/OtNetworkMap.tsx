// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import type { OtTopologyEdge, OtTopologyNode } from '@/lib/api-types';

interface OtNetworkMapProps {
  nodes: OtTopologyNode[];
  edges: OtTopologyEdge[];
}

const WIDTH = 640;
const ROW = 36;
const PAD = 24;
// Los nodos se separan del borde lo suficiente para que la etiqueta quepa
// dentro del viewBox: antes arrancaban en x=40 y el texto se salía del SVG.
const SIDE = 150;
const MAX_CHARS = 24;

function truncate(value: string): string {
  return value.length > MAX_CHARS ? `${value.slice(0, MAX_CHARS - 1)}…` : value;
}

/**
 * Parte la etiqueta en nombre y detalle entre paréntesis («PLC (192.0.2.201)»)
 * para dibujarla en dos líneas cortas que no se salgan del mapa.
 */
function splitLabel(n: OtTopologyNode): { name: string; detail: string } {
  const full = n.label && n.label.trim() ? n.label : n.host_key;
  const match = full.match(/^(.*\S)\s+\(([^)]+)\)$/);
  const name = match ? match[1] : full;
  const detail = match ? `(${match[2]})` : '';
  return { name: truncate(name), detail: truncate(detail) };
}

function fullLabel(n: OtTopologyNode): string {
  return n.label && n.label.trim() ? n.label : n.host_key;
}

export function OtNetworkMap({ nodes, edges }: OtNetworkMapProps) {
  const left = nodes
    .filter((n) => n.role !== 'server')
    .slice()
    .sort((a, b) => a.host_key.localeCompare(b.host_key));
  const right = nodes
    .filter((n) => n.role === 'server')
    .slice()
    .sort((a, b) => a.host_key.localeCompare(b.host_key));

  const rows = Math.max(left.length, right.length, 1);
  const height = rows * ROW + PAD * 2;

  const pos = new Map<string, { x: number; y: number }>();
  left.forEach((n, i) => {
    pos.set(n.host_key, { x: SIDE, y: PAD + i * ROW + ROW / 2 });
  });
  right.forEach((n, i) => {
    pos.set(n.host_key, { x: WIDTH - SIDE, y: PAD + i * ROW + ROW / 2 });
  });

  // Solo se dibujan pares con ambos extremos entre los nodos: una arista huérfana
  // no se inventa y tampoco cuenta para el aviso de "sin aristas".
  const drawn = edges.filter((e) => pos.has(e.client) && pos.has(e.server));

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full rounded-lg border border-slate-800 bg-slate-950/60"
        role="img"
        aria-label="Mapa OT observado"
      >
        {drawn.map((e, i) => {
          const a = pos.get(e.client)!;
          const b = pos.get(e.server)!;
          return (
            <line
              key={`${e.client}-${e.server}-${i}`}
              x1={a.x + 6}
              y1={a.y}
              x2={b.x - 6}
              y2={b.y}
              stroke="rgba(56,189,248,0.55)"
              strokeWidth={1.5}
            />
          );
        })}
        {left.map((n) => {
          const p = pos.get(n.host_key)!;
          const { name, detail } = splitLabel(n);
          return (
            <g key={n.host_key}>
              <title>{fullLabel(n)}</title>
              <circle cx={p.x} cy={p.y} r={6} fill="#38bdf8" />
              <text x={p.x - 12} y={detail ? p.y - 1 : p.y + 4} textAnchor="end" fontSize={10} fill="#cbd5e1">
                {name}
              </text>
              {detail ? (
                <text x={p.x - 12} y={p.y + 11} textAnchor="end" fontSize={9} fill="#94a3b8">
                  {detail}
                </text>
              ) : null}
            </g>
          );
        })}
        {right.map((n) => {
          const p = pos.get(n.host_key)!;
          const { name, detail } = splitLabel(n);
          return (
            <g key={n.host_key}>
              <title>{fullLabel(n)}</title>
              <circle cx={p.x} cy={p.y} r={6} fill="#a78bfa" />
              <text x={p.x + 12} y={detail ? p.y - 1 : p.y + 4} textAnchor="start" fontSize={10} fill="#cbd5e1">
                {name}
              </text>
              {detail ? (
                <text x={p.x + 12} y={p.y + 11} textAnchor="start" fontSize={9} fill="#94a3b8">
                  {detail}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {drawn.length === 0 ? (
        <p className="text-xs text-slate-400">Sin aristas observadas: solo se muestran los activos OT.</p>
      ) : null}
    </div>
  );
}
