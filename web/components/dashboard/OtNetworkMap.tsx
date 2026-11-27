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
    pos.set(n.host_key, { x: 40, y: PAD + i * ROW + ROW / 2 });
  });
  right.forEach((n, i) => {
    pos.set(n.host_key, { x: WIDTH - 40, y: PAD + i * ROW + ROW / 2 });
  });

  const label = (n: OtTopologyNode) => (n.label && n.label.trim() ? n.label : n.host_key).slice(0, 18);

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
          return (
            <g key={n.host_key}>
              <circle cx={p.x} cy={p.y} r={6} fill="#38bdf8" />
              <text x={p.x - 10} y={p.y + 4} textAnchor="end" fontSize={10} fill="#cbd5e1">
                {label(n)}
              </text>
            </g>
          );
        })}
        {right.map((n) => {
          const p = pos.get(n.host_key)!;
          return (
            <g key={n.host_key}>
              <circle cx={p.x} cy={p.y} r={6} fill="#a78bfa" />
              <text x={p.x + 10} y={p.y + 4} textAnchor="start" fontSize={10} fill="#cbd5e1">
                {label(n)}
              </text>
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
