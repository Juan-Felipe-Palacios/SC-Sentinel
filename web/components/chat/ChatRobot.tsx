// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Mascota original del asistente (SVG, sin assets externos).

'use client';

import { useId } from 'react';

interface ChatRobotProps {
  className?: string;
  /** `compact` oculta el cuerpo y deja solo el casco. */
  variant?: 'full' | 'compact';
}

export function ChatRobot({ className, variant = 'full' }: ChatRobotProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const bodyGradient = `${uid}-body`;
  const visorGradient = `${uid}-visor`;
  const glow = `${uid}-glow`;
  const blur = `${uid}-blur`;

  return (
    <svg
      viewBox="0 0 180 180"
      role="img"
      aria-label="Mascota de SC Sentinel AI"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bodyGradient} x1="60" y1="30" x2="125" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor="#164e63" />
          <stop offset="0.45" stopColor="#0e7490" />
          <stop offset="0.75" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={visorGradient} x1="55" y1="55" x2="125" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#020617" />
          <stop offset="0.55" stopColor="#041f2e" />
          <stop offset="1" stopColor="#062f3f" />
        </linearGradient>
        <radialGradient id={glow} cx="0" cy="0" r="1" gradientTransform="translate(90 88) rotate(90) scale(78)">
          <stop stopColor="#22d3ee" stopOpacity="0.32" />
          <stop offset="0.65" stopColor="#38bdf8" stopOpacity="0.08" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <circle cx="90" cy="88" r="78" fill={`url(#${glow})`} />
      <circle cx="90" cy="88" r="60" stroke="#38bdf8" strokeOpacity="0.16" />
      <circle cx="90" cy="88" r="72" stroke="#a78bfa" strokeOpacity="0.1" strokeDasharray="3 9" />

      {/* Paneles holográficos */}
      <g opacity="0.45" stroke="#22d3ee" strokeWidth="1">
        <rect x="135" y="47" width="30" height="18" rx="3" fill="#0e7490" fillOpacity="0.08" />
        <path d="M140 60h7M149 60h5M140 56h14M140 52h9" strokeOpacity="0.75" />
        <rect x="139" y="76" width="25" height="16" rx="3" fill="#0e7490" fillOpacity="0.08" />
        <path d="M143 88l4-5 3 3 4-6 4 8" stroke="#67e8f9" strokeOpacity="0.85" />
      </g>

      {/* Cuerpo */}
      {variant === 'full' ? (
        <g>
          <path
            d="M59 112c7-6 15-9 31-9s24 3 31 9l9 17c2 4-1 8-5 8H55c-4 0-7-4-5-8l9-17Z"
            fill={`url(#${bodyGradient})`}
            stroke="#67e8f9"
            strokeOpacity="0.55"
            strokeWidth="1.2"
          />
          <path
            d="M74 118h32l6 12c1 3-1 6-4 6H72c-3 0-5-3-4-6l6-12Z"
            fill="#031525"
            stroke="#38bdf8"
            strokeOpacity="0.5"
          />
          <path d="M84 124h12l3 7H81l3-7Z" fill="#22d3ee" fillOpacity="0.7" />
          <path d="M90 112v-5" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
          <circle cx="90" cy="105" r="3.5" fill="#a78bfa" />
          <circle cx="90" cy="105" r="7" fill="#a78bfa" fillOpacity="0.16" filter={`url(#${blur})`} />
          {/* Brazos */}
          <path d="M58 119c-8 0-14 5-15 13l-1 9" stroke="#0e7490" strokeWidth="8" strokeLinecap="round" />
          <path d="M122 119c8 0 14 5 15 13l1 9" stroke="#0e7490" strokeWidth="8" strokeLinecap="round" />
          <circle cx="42" cy="143" r="5" fill="#22d3ee" fillOpacity="0.6" />
          <circle cx="138" cy="143" r="5" fill="#22d3ee" fillOpacity="0.6" />
        </g>
      ) : null}

      {/* Casco */}
      <g>
        <path
          d="M50 71c0-23 17-38 40-38s40 15 40 38v7c0 19-17 32-40 32S50 97 50 78v-7Z"
          fill={`url(#${bodyGradient})`}
          stroke="#a5f3fc"
          strokeOpacity="0.7"
          strokeWidth="1.4"
        />
        <path
          d="M59 60c0-14 12-23 31-23s31 9 31 23v10c0 13-13 21-31 21S59 83 59 70V60Z"
          fill={`url(#${visorGradient})`}
          stroke="#22d3ee"
          strokeOpacity="0.85"
          strokeWidth="1.6"
        />
        <path d="M67 57c7-7 15-10 23-10s16 3 23 10" stroke="#67e8f9" strokeOpacity="0.35" strokeLinecap="round" />
        {/* Ojos */}
        <ellipse cx="76" cy="67" rx="8" ry="5.5" fill="#67e8f9" />
        <ellipse cx="104" cy="67" rx="8" ry="5.5" fill="#67e8f9" />
        <ellipse cx="76" cy="67" rx="12" ry="9" fill="#22d3ee" fillOpacity="0.22" filter={`url(#${blur})`} />
        <ellipse cx="104" cy="67" rx="12" ry="9" fill="#22d3ee" fillOpacity="0.22" filter={`url(#${blur})`} />
        <path
          d="M80 78c3 3 6 4 10 4s7-1 10-4"
          stroke="#a5f3fc"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Orejas */}
        <rect x="42" y="66" width="8" height="17" rx="4" fill="#0e7490" stroke="#67e8f9" strokeOpacity="0.6" />
        <rect x="130" y="66" width="8" height="17" rx="4" fill="#0e7490" stroke="#67e8f9" strokeOpacity="0.6" />
        {/* Antena */}
        <path d="M90 33V22" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
        <circle cx="90" cy="18" r="4" fill="#c4b5fd" />
        <circle cx="90" cy="18" r="8" fill="#a78bfa" fillOpacity="0.25" filter={`url(#${blur})`} />
        {/* Símbolo frontal */}
        <path
          d="M82 91h16M90 91v7"
          stroke="#a5f3fc"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
      </g>

      {/* Chispas */}
      <g fill="#22d3ee">
        <circle cx="36" cy="53" r="2" />
        <circle cx="147" cy="105" r="1.6" />
        <circle cx="132" cy="31" r="1.4" />
        <circle cx="49" cy="113" r="1.4" />
      </g>
    </svg>
  );
}
