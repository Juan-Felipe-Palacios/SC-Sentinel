// SC-Sentinel — logo propio (SVG en línea, sin assets externos).
// Motivo: escudo de rack — el motor observa tu red desde adentro.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="SC-Sentinel"
      fill="none"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="4" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="1.4" />
      <rect x="5.5" y="5.5" width="21" height="5.6" rx="1.4" stroke="#38bdf8" strokeWidth="1.6" />
      <circle cx="9.4" cy="8.3" r="1.15" fill="#38bdf8" />
      <rect x="5.5" y="13.2" width="21" height="5.6" rx="1.4" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="1.4" />
      <circle cx="9.4" cy="16" r="1.15" fill="#a78bfa" />
      <rect x="5.5" y="20.9" width="21" height="5.6" rx="1.4" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="1.4" />
      <circle cx="9.4" cy="23.7" r="1.15" fill="#10b981" />
    </svg>
  );
}
