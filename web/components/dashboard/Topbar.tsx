// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, ShieldCheck, LogOut, Loader2 } from 'lucide-react';
import { useDashboardRole } from './DashboardRoleContext';

const RANGE_OPTIONS = ['15m', '1h', '6h', '24h', '7d', '30d'] as const;

const SECTION_TITLES: Array<{ prefix: string; eyebrow: string; title: string }> = [
  { prefix: '/dashboard/overview', eyebrow: 'Módulo en ejecución', title: 'Resumen de tráfico' },
  { prefix: '/dashboard/settings', eyebrow: 'Gobernanza de secretos', title: 'Dispositivos y tokens' },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useDashboardRole();
  const isGuest = role === 'guest';
  const [loggingOut, setLoggingOut] = useState(false);

  const currentRange = searchParams.get('range') ?? '1h';
  const section = SECTION_TITLES.find((entry) => pathname.startsWith(entry.prefix)) ?? {
    eyebrow: 'SC-Sentinel SOC',
    title: 'Resumen de tráfico',
  };

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-400 lg:hidden">
          <ShieldCheck className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-2 truncate font-mono text-[11px] uppercase tracking-wider text-sky-400">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true" />
            {section.eyebrow}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="truncate font-display text-lg font-bold text-slate-100 sm:text-xl">{section.title}</h1>
            {isGuest ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                <Eye className="size-2.5" aria-hidden="true" />
                Demo
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Estado del motor (como DashboardPreview) */}
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-400 md:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          MOTOR LOCAL ONLINE
        </span>

        {/* Rango global: visible en todos los anchos y con scroll propio para que
            nunca quede fuera de alcance (sin selector, el panel se clavaba en 1h). */}
        <nav
          aria-label="Rango de tiempo"
          className="flex max-w-[46vw] shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 p-1 sm:max-w-none sm:gap-0 sm:p-1"
        >
          {RANGE_OPTIONS.map((option) => {
            const active = option === currentRange;
            return (
              <Link
                key={option}
                href={`${pathname}?range=${option}`}
                aria-current={active ? 'true' : undefined}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 sm:px-3 ${
                  active
                    ? 'border border-sky-500/30 bg-sky-500/15 font-semibold text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {option}
              </Link>
            );
          })}
        </nav>

        {/* Cerrar sesión */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="grid size-9 place-items-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 disabled:opacity-50"
        >
          {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
