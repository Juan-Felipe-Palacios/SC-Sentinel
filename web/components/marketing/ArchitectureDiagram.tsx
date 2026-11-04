// SC-Sentinel - diagrama de arquitectura (Home, sección "Arquitectura resumida").
// SVG propio, sin assets externos. Muestra el pipeline agente → agregación → dashboard/IA
// y qué NO sale del equipo. Referencia: docs/ux/landing-sitemap.md y spec §18.1.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
export default function ArchitectureDiagram() {
  return (
    <figure className="mx-auto w-full max-w-4xl">
      <svg
        viewBox="0 0 760 250"
        role="img"
        aria-labelledby="arch-title arch-desc"
        className="h-auto w-full"
      >
        <title id="arch-title">Arquitectura resumida de SC-Sentinel</title>
        <desc id="arch-desc">
          Diagrama de flujo: el agente local observa el tráfico, el motor determinista agrega ventanas de 30 segundos,
          y solo señales agregadas y hashes llegan al dashboard y a la IA. Los paquetes crudos no salen del equipo.
        </desc>

        <defs>
          <marker
            id="arch-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
        </defs>

        {/* Paso 1 - Agente */}
        <g>
          <rect x="4" y="34" width="168" height="118" rx="12" fill="#0e162e" stroke="rgba(148,163,184,0.28)" />
          <text x="88" y="66" textAnchor="middle" fill="#e5e7eb" fontSize="15" fontWeight="600" fontFamily="var(--font-display)">
            1 · Agente local
          </text>
          <text x="88" y="92" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            PCAP / NetFlow
          </text>
          <text x="88" y="110" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            en tu equipo local
          </text>
          <circle cx="24" cy="52" r="4" fill="#10b981" />
        </g>

        <line x1="176" y1="93" x2="228" y2="93" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arch-arrow)" />

        {/* Paso 2 - Motor determinista */}
        <g>
          <rect x="232" y="34" width="178" height="118" rx="12" fill="#0e162e" stroke="rgba(148,163,184,0.28)" />
          <text x="321" y="66" textAnchor="middle" fill="#e5e7eb" fontSize="15" fontWeight="600" fontFamily="var(--font-display)">
            2 · Motor determinista
          </text>
          <text x="321" y="92" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            reglas y umbrales
          </text>
          <text x="321" y="110" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            ventana de 30 s
          </text>
          <circle cx="252" cy="52" r="4" fill="#10b981" />
        </g>

        <line x1="414" y1="93" x2="466" y2="93" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arch-arrow)" />

        {/* Paso 3 - Señales agregadas */}
        <g>
          <rect x="470" y="34" width="168" height="118" rx="12" fill="#0e162e" stroke="#38bdf8" strokeOpacity="0.55" />
          <text x="554" y="66" textAnchor="middle" fill="#e5e7eb" fontSize="15" fontWeight="600" fontFamily="var(--font-display)">
            3 · Señales agregadas
          </text>
          <text x="554" y="92" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            hashes + conteos
          </text>
          <text x="554" y="110" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="var(--font-mono)">
            sin paquetes crudos
          </text>
          <circle cx="490" cy="52" r="4" fill="#38bdf8" />
        </g>

        {/* Frontera local / nube */}
        <line x1="656" y1="16" x2="656" y2="232" stroke="rgba(148,163,184,0.35)" strokeDasharray="4 6" />
        <text x="640" y="12" textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="1.5">
          TU EQUIPO
        </text>
        <text x="664" y="12" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="1.5">
          NUBE
        </text>

        <line x1="640" y1="93" x2="672" y2="93" stroke="#38bdf8" strokeWidth="2" markerEnd="url(#arch-arrow)" />

        {/* Paso 4 - Dashboard + IA */}
        <g>
          <rect x="676" y="34" width="80" height="118" rx="12" fill="#111827" stroke="rgba(148,163,184,0.28)" />
          <text x="716" y="66" textAnchor="middle" fill="#e5e7eb" fontSize="14" fontWeight="600" fontFamily="var(--font-display)">
            Dashboard
          </text>
          <text x="716" y="88" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">
            + IA
          </text>
          <text x="716" y="106" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="var(--font-mono)">
            lotes 5 min
          </text>
        </g>

        {/* Lo que NO sale */}
        <g>
          <rect x="4" y="168" width="752" height="56" rx="10" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.35)" strokeDasharray="2 4" />
          <text x="380" y="192" textAnchor="middle" fill="#fca5a5" fontSize="12.5" fontWeight="600" fontFamily="var(--font-display)">
            Lo que NO sale del equipo
          </text>
          <text x="380" y="213" textAnchor="middle" fill="#94a3b8" fontSize="10.5" fontFamily="var(--font-mono)">
            paquetes crudos · flujos individuales · IPs sin anonimizar
          </text>
        </g>
      </svg>
      <figcaption className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-sc-text-muted">
        Flujo de datos SC-Sentinel
      </figcaption>
    </figure>
  );
}
