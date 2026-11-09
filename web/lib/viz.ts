// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Paleta para SVG/Canvas. Espeja los tokens --color-sc-* de app/globals.css
// porque las props de recharts y los atributos SVG reciben strings de color.
export const VIZ = {
  in: '#38bdf8', // --color-sc-viz-in
  out: '#a78bfa', // --color-sc-viz-out
  warn: '#f59e0b', // --color-sc-warn
  ok: '#10b981', // --color-sc-ok
  critical: '#ef4444', // --color-sc-risk-critical
  muted: '#94a3b8', // --color-sc-text-muted
  grid: '#1e293b',
  axis: '#334155',
} as const;
