// SC-Sentinel — geometría del show de drones del login.
// Cada formación devuelve exactamente `count` puntos en espacio unitario
// (x a la derecha, y hacia arriba, radio ~1) más los tramos que los unen:
// los `parts` permiten dibujar el contorno como filamento y que la silueta
// quede nítida en vez de una nube de puntos.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export type Pt = { x: number; y: number };

/** Tramo continuo dentro de `points`: [start, end], con cierre opcional. */
export type Part = { start: number; end: number; closed: boolean };

export type FormationShape = { points: Pt[]; parts: Part[] };

export type Formation = {
  label: string;
  build: (count: number) => FormationShape;
};

const TAU = Math.PI * 2;

/** Arco elíptico; acepta ángulos en cualquier dirección. */
function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  steps = 80
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    out.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return out;
}

function circlePath(cx: number, cy: number, r: number, steps = 80): Pt[] {
  return ellipseArc(cx, cy, r, r, 0, TAU, steps);
}

function quadPath(a: Pt, control: Pt, b: Pt, steps = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    });
  }
  return out;
}

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] {
  const q = Math.PI / 2;
  return [
    ...ellipseArc(x1 - r, y1 - r, r, r, 0, q, 8),
    ...ellipseArc(x0 + r, y1 - r, r, r, q, Math.PI, 8),
    ...ellipseArc(x0 + r, y0 + r, r, r, Math.PI, 1.5 * Math.PI, 8),
    ...ellipseArc(x1 - r, y0 + r, r, r, 1.5 * Math.PI, TAU, 8),
  ];
}

/** Reparte `count` puntos a lo largo de un camino, por longitud de arco. */
function samplePath(path: Pt[], count: number, closed = false): Pt[] {
  if (count <= 0 || path.length === 0) return [];
  const pts = closed ? [...path, path[0]] : path;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lengths.push(d);
    total += d;
  }
  if (total === 0) {
    return Array.from({ length: count }, () => ({ ...pts[0] }));
  }
  const out: Pt[] = [];
  const denom = closed ? count : Math.max(1, count - 1);
  let segment = 0;
  let travelled = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / denom;
    while (segment < lengths.length - 1 && travelled + lengths[segment] < target) {
      travelled += lengths[segment];
      segment++;
    }
    const length = lengths[segment] || 1;
    const t = Math.min(1, Math.max(0, (target - travelled) / length));
    out.push({
      x: pts[segment].x + (pts[segment + 1].x - pts[segment].x) * t,
      y: pts[segment].y + (pts[segment + 1].y - pts[segment].y) * t,
    });
  }
  return out;
}

/** Reparte un total entero según pesos, sin perder unidades por redondeo. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const counts = raw.map(Math.floor);
  let remainder = total - counts.reduce((acc, c) => acc + c, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (remainder > 0) {
    counts[order[cursor % order.length].index]++;
    remainder--;
    cursor++;
  }
  return counts;
}

function mirrorReverse(path: Pt[], skip = 1): Pt[] {
  return path
    .slice(skip)
    .map((p) => ({ x: -p.x, y: p.y }))
    .reverse();
}

/* ------------------------------------------------------------------ */
/* Construcción de siluetas                                            */
/* ------------------------------------------------------------------ */

function createShape(): FormationShape {
  return { points: [], parts: [] };
}

/** Agrega un tramo continuo; queda unido por un filamento. */
function addPart(shape: FormationShape, pts: Pt[], closed = false) {
  if (pts.length === 0) return;
  const start = shape.points.length;
  shape.points.push(...pts);
  if (pts.length > 1) {
    shape.parts.push({ start, end: shape.points.length - 1, closed });
  }
}

/** Nodo con anillo de drones alrededor (un punto central sin filamento). */
function addCluster(shape: FormationShape, center: Pt, count: number) {
  if (count <= 0) return;
  shape.points.push({ x: center.x, y: center.y });
  if (count > 1) {
    addPart(shape, samplePath(circlePath(center.x, center.y, 0.055, 18), count - 1, true), true);
  }
}

/* ------------------------------------------------------------------ */
/* Formaciones                                                         */
/* ------------------------------------------------------------------ */

function shieldFormation(count: number): FormationShape {
  const shape = createShape();
  const [outlineCount, checkCount] = allocate(count, [0.72, 0.28]);

  const top = quadPath({ x: 0, y: 0.94 }, { x: 0.34, y: 0.98 }, { x: 0.66, y: 0.7 }, 22);
  const upper = quadPath({ x: 0.66, y: 0.7 }, { x: 0.72, y: 0.36 }, { x: 0.6, y: 0.0 }, 20);
  const lower = quadPath({ x: 0.6, y: 0.0 }, { x: 0.52, y: -0.52 }, { x: 0, y: -0.98 }, 26);
  const outline = [
    ...top,
    ...upper.slice(1),
    ...lower.slice(1),
    ...mirrorReverse(lower),
    ...mirrorReverse(upper),
    ...mirrorReverse(top),
  ];

  addPart(shape, samplePath(outline, outlineCount, true), true);

  // El check se dibuja con dos trazos paralelos: se lee grueso y prolijo.
  const check: Pt[] = [
    { x: -0.3, y: 0.05 },
    { x: -0.07, y: -0.27 },
    { x: 0.37, y: 0.24 },
  ];
  const thickA = check.map((p) => ({ x: p.x, y: p.y + 0.04 }));
  const thickB = check.map((p) => ({ x: p.x, y: p.y - 0.04 }));
  const [checkA, checkB] = allocate(checkCount, [1, 1]);
  addPart(shape, samplePath(thickA, checkA));
  addPart(shape, samplePath(thickB, checkB));

  return shape;
}

function globeFormation(count: number): FormationShape {
  const shape = createShape();
  const [ringCount, lon1, lon2, lat1, lat2] = allocate(count, [0.32, 0.18, 0.18, 0.16, 0.16]);
  const latitude = (y: number) => {
    const radius = Math.sqrt(Math.max(0.02, 1 - y * y));
    return ellipseArc(0, y, radius * 0.99, radius * 0.17, 0, TAU, 90);
  };

  addPart(shape, samplePath(circlePath(0, 0, 0.95, 140), ringCount, true), true);
  addPart(shape, samplePath(ellipseArc(0, 0, 0.44, 0.95, 0, TAU, 100), lon1, true), true);
  addPart(shape, samplePath(ellipseArc(0, 0, 0.79, 0.95, 0, TAU, 100), lon2, true), true);
  addPart(shape, samplePath(latitude(0.38), lat1, true), true);
  addPart(shape, samplePath(latitude(-0.38), lat2, true), true);

  return shape;
}

function padlockFormation(count: number): FormationShape {
  const shape = createShape();
  const [bodyCount, shackleCount, keyholeCount] = allocate(count, [0.46, 0.3, 0.24]);

  addPart(shape, samplePath(roundedRect(-0.58, -0.72, 0.58, 0.28, 0.14), bodyCount, true), true);
  addPart(shape, samplePath(ellipseArc(0, 0.26, 0.36, 0.46, Math.PI, 0, 90), shackleCount));

  const [holeRing, holeStem] = allocate(keyholeCount, [1.5, 1]);
  addPart(shape, samplePath(circlePath(0, -0.1, 0.09, 36), holeRing, true), true);
  addPart(
    shape,
    samplePath(
      [
        { x: 0, y: -0.16 },
        { x: 0, y: -0.42 },
      ],
      holeStem
    )
  );

  return shape;
}

function radarFormation(count: number): FormationShape {
  const shape = createShape();
  const [outerN, midN, innerN, tickN, sweepN, blipN] = allocate(count, [
    0.2, 0.16, 0.12, 0.11, 0.11, 0.3,
  ]);

  addPart(shape, samplePath(circlePath(0, 0, 0.93, 150), outerN, true), true);
  addPart(shape, samplePath(circlePath(0, 0, 0.56, 110), midN, true), true);
  addPart(shape, samplePath(circlePath(0, 0, 0.26, 80), innerN, true), true);

  const tickShares = allocate(tickN, Array.from({ length: 12 }, () => 1));
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TAU;
    addPart(
      shape,
      samplePath(
        [
          { x: Math.cos(angle) * 0.93, y: Math.sin(angle) * 0.93 },
          { x: Math.cos(angle) * 1.04, y: Math.sin(angle) * 1.04 },
        ],
        tickShares[i]
      )
    );
  }

  const sweepAngle = -0.62;
  addPart(
    shape,
    samplePath(
      [
        { x: 0, y: 0 },
        { x: Math.cos(sweepAngle) * 0.93, y: Math.sin(sweepAngle) * 0.93 },
      ],
      sweepN
    )
  );

  const blips = [
    { center: { x: 0.34, y: 0.3 }, weight: 1.3 },
    { center: { x: -0.44, y: 0.38 }, weight: 1 },
    { center: { x: -0.16, y: -0.5 }, weight: 1.15 },
    { center: { x: 0.48, y: -0.24 }, weight: 0.85 },
    { center: { x: 0.04, y: 0.64 }, weight: 0.7 },
  ];
  const blipShares = allocate(blipN, blips.map((b) => b.weight));
  blips.forEach((blip, i) => addCluster(shape, blip.center, blipShares[i]));

  return shape;
}

const MESH_NODES: Pt[] = [
  { x: 0, y: 0.66 },
  { x: -0.52, y: 0.32 },
  { x: 0.52, y: 0.32 },
  { x: -0.84, y: -0.16 },
  { x: -0.26, y: -0.18 },
  { x: 0.28, y: -0.14 },
  { x: 0.84, y: -0.12 },
  { x: -0.58, y: -0.62 },
  { x: 0.04, y: -0.74 },
  { x: 0.6, y: -0.58 },
  { x: 0, y: 0.08 },
];

const MESH_EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 10], [1, 3], [1, 4], [1, 10], [2, 5], [2, 6], [2, 10],
  [3, 4], [4, 5], [4, 7], [4, 10], [5, 6], [5, 8], [5, 9], [5, 10], [6, 9],
  [7, 8], [8, 9], [8, 10], [9, 10], [7, 4], [6, 5],
];

function meshFormation(count: number): FormationShape {
  const shape = createShape();
  const [nodeN, edgeN] = allocate(count, [0.38, 0.62]);
  const nodeShares = allocate(nodeN, MESH_NODES.map((_, i) => (i === 10 ? 2.2 : 1)));
  MESH_NODES.forEach((node, i) => addCluster(shape, node, nodeShares[i]));

  const lengths = MESH_EDGES.map(([a, b]) =>
    Math.hypot(MESH_NODES[b].x - MESH_NODES[a].x, MESH_NODES[b].y - MESH_NODES[a].y)
  );
  const edgeShares = allocate(edgeN, lengths);
  MESH_EDGES.forEach(([a, b], i) => {
    addPart(shape, samplePath([MESH_NODES[a], MESH_NODES[b]], edgeShares[i]));
  });

  return shape;
}

/** Monograma SC: cierre del ciclo, firma de la casa. */
function monogramFormation(count: number): FormationShape {
  const shape = createShape();
  const [sCount, cCount] = allocate(count, [0.46, 0.54]);

  const s = [
    ...quadPath({ x: 0.3, y: 0.55 }, { x: 0.16, y: 0.69 }, { x: -0.1, y: 0.7 }, 20),
    ...quadPath({ x: -0.1, y: 0.7 }, { x: -0.32, y: 0.7 }, { x: -0.32, y: 0.42 }, 20),
    ...quadPath({ x: -0.32, y: 0.42 }, { x: -0.32, y: 0.18 }, { x: 0, y: 0.1 }, 20),
    ...quadPath({ x: 0, y: 0.1 }, { x: 0.32, y: 0 }, { x: 0.32, y: -0.25 }, 20),
    ...quadPath({ x: 0.32, y: -0.25 }, { x: 0.32, y: -0.55 }, { x: 0.1, y: -0.65 }, 20),
    ...quadPath({ x: 0.1, y: -0.65 }, { x: -0.1, y: -0.73 }, { x: -0.3, y: -0.6 }, 20),
  ].map((p) => ({ x: p.x - 0.5, y: p.y }));

  const c = ellipseArc(0.55, 0.02, 0.4, 0.68, 0.92, 5.36, 110);

  addPart(shape, samplePath(s, sCount));
  addPart(shape, samplePath(c, cCount));

  // Centrar el conjunto (S a la izquierda, C a la derecha).
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  shape.points = shape.points.map((p) => ({ x: p.x - centerX, y: p.y - centerY }));

  return shape;
}

export const FORMATIONS: Formation[] = [
  { label: 'Perímetro protegido', build: shieldFormation },
  { label: 'Cobertura de red', build: globeFormation },
  { label: 'Nada sale del sitio', build: padlockFormation },
  { label: 'Señal en tiempo real', build: radarFormation },
  { label: 'Motor determinista local', build: meshFormation },
  { label: 'Firma SC-Sentinel', build: monogramFormation },
];
