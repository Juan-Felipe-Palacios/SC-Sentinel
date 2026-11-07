// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, LogOut, Loader2 } from 'lucide-react';

const RANGE_OPTIONS = ['15m', '1h', '6h', '24h', '7d', '30d'] as const;

const SECTION_TITLES: Array<{ prefix: string; eyebrow: string; title: string }> = [
  { prefix: '/dashboard/overview', eyebrow: 'Sentinel / Overview', title: 'Resumen de tráfico' },
  { prefix: '/dashboard/settings', eyebrow: 'Sentinel / Configuración', title: 'Dispositivos y tokens' },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

  const currentRange = searchParams.get('range') ?? '1h';
  const section = SECTION_TITLES.find((entry) => pathname.startsWith(entry.prefix)) ?? {
    eyebrow: 'Sentinel',
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b sc-hairline bg-sc-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-sc-viz-in/30 bg-sc-surface text-sc-viz-in lg:hidden">
          <ShieldCheck className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.28em] text-sc-text-muted">{section.eyebrow}</p>
          <h1 className="truncate font-display text-[15px] font-semibold text-sc-text">{section.title}</h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Rango global */}
        <nav aria-label="Rango de tiempo" className="flex items-center rounded-md border sc-hairline bg-sc-surface p-0.5">
          {RANGE_OPTIONS.map((option) => {
            const active = option === currentRange;
            return (
              <Link
                key={option}
                href={`${pathname}?range=${option}`}
                aria-current={active ? 'true' : undefined}
                className={`rounded px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 sm:px-3 ${
                  active ? 'bg-sc-viz-in/15 text-sc-viz-in' : 'text-sc-text-muted hover:text-sc-text'
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
          className="grid size-9 place-items-center rounded-md border sc-hairline text-sc-text-muted transition-colors hover:bg-sc-surface-alt hover:text-sc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 disabled:opacity-50"
        >
          {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
