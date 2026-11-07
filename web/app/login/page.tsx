// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Acceso · SC-Sentinel',
  description: 'Acceso restringido al panel de SC-Sentinel.',
};

/** Marca lineal: nodos y enlaces de captura, discreta sobre fondo oscuro. */
function CaptureMotif() {
  const nodes = [
    { x: 64, y: 300, r: 4 },
    { x: 148, y: 208, r: 5 },
    { x: 132, y: 396, r: 3 },
    { x: 252, y: 128, r: 4 },
    { x: 268, y: 300, r: 6 },
    { x: 232, y: 470, r: 3.5 },
    { x: 380, y: 208, r: 4.5 },
    { x: 396, y: 376, r: 3 },
    { x: 480, y: 284, r: 5 },
  ];
  const links = [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5],
    [3, 6], [4, 6], [4, 7], [4, 8], [5, 7], [6, 8], [7, 8],
  ];

  return (
    <svg
      viewBox="0 0 560 600"
      role="presentation"
      aria-hidden="true"
      className="h-full w-full"
    >
      <defs>
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="linkGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Retícula de fondo */}
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`v${i}`} x1={40 + i * 48} y1="24" x2={40 + i * 48} y2="576" stroke="#94a3b8" strokeOpacity="0.07" strokeWidth="1" />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`h${i}`} x1="24" y1={28 + i * 48} x2="536" y2={28 + i * 48} stroke="#94a3b8" strokeOpacity="0.07" strokeWidth="1" />
      ))}

      {/* Núcleo luminoso */}
      <circle cx="268" cy="300" r="96" fill="url(#coreGlow)" />

      {/* Enlaces */}
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="url(#linkGrad)"
          strokeWidth="1.1"
          strokeOpacity="0.55"
        />
      ))}

      {/* Nodos */}
      {nodes.map((node, i) => (
        <g key={i}>
          <circle cx={node.x} cy={node.y} r={node.r + 3.5} fill="#0b1220" stroke="#38bdf8" strokeOpacity="0.35" />
          <circle cx={node.x} cy={node.y} r={node.r} fill="#111827" stroke="#38bdf8" strokeOpacity="0.9" strokeWidth="1.2" />
        </g>
      ))}
      <circle cx="268" cy="300" r="2.4" fill="#e5e7eb" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/5 bg-sc-surface p-10 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,rgba(56,189,248,0.08),transparent_55%),radial-gradient(ellipse_at_80%_20%,rgba(167,139,250,0.08),transparent_55%)]"
        />
        <header className="relative flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border border-sc-viz-in/30 bg-sc-bg text-sc-viz-in">
            <ShieldCheck className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold tracking-[0.18em] text-sc-text">SC-SENTINEL</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">Strategic Connex</p>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-lg">
            <CaptureMotif />
          </div>
        </div>

        <footer className="relative max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-sc-viz-in">Captura local · Señal agregada</p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-[1.15] text-sc-text xl:text-4xl">
            La red se observa desde adentro, <span className="text-sc-text-muted">no desde una pantalla genérica.</span>
          </h1>
          <p className="mt-4 text-sm leading-6 text-sc-text-muted">
            El motor determinista corre en el sitio. La nube recibe señales agregadas — nunca paquetes crudos.
          </p>
        </footer>
      </section>

      {/* Panel de acceso */}
      <section className="flex items-center justify-center bg-sc-bg px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Marca compacta en mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md border border-sc-viz-in/30 bg-sc-surface text-sc-viz-in">
              <ShieldCheck className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-[15px] font-semibold tracking-[0.18em] text-sc-text">SC-SENTINEL</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-sc-text-muted">Strategic Connex</p>
            </div>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-sc-text-muted">Acceso restringido</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-sc-text">Entrar a Sentinel</h2>
          <p className="mt-2 text-sm leading-6 text-sc-text-muted">
            Entrá a la demo pública de solo lectura o accedé como administrador. La sesión admin expira a las
            8&nbsp;horas; la demo, a la hora.
          </p>

          <Suspense fallback={<div className="mt-8 h-40 animate-pulse rounded-lg border sc-hairline bg-sc-surface" />}>
            <LoginForm />
          </Suspense>

          <p className="mt-8 border-t sc-hairline pt-5 font-mono text-[10px] uppercase leading-5 tracking-[0.18em] text-sc-text-muted">
            Motor determinista local<br />Ningún paquete crudo sale del sitio
          </p>
        </div>
      </section>
    </main>
  );
}
