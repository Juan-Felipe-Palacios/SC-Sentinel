// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  Network,
  ShieldAlert,
  Sparkles,
  Settings,
  ShieldCheck,
} from 'lucide-react';

interface NavEntry {
  label: string;
  href: string | null;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'Hosts', href: null, icon: Server },
  { label: 'Conexiones', href: null, icon: Network },
  { label: 'Alertas', href: null, icon: ShieldAlert },
  { label: 'Asistente AI', href: null, icon: Sparkles },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r sc-hairline bg-sc-surface lg:flex">
      {/* Marca */}
      <div className="flex h-16 items-center gap-3 border-b sc-hairline px-5">
        <span className="grid size-8 place-items-center rounded-md border border-sc-viz-in/30 bg-sc-bg text-sc-viz-in">
          <ShieldCheck className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="font-display text-[13px] font-semibold tracking-[0.18em] text-sc-text">SC-SENTINEL</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-sc-text-muted">Strategic Connex</p>
        </div>
      </div>

      {/* Navegación */}
      <nav aria-label="Secciones del panel" className="flex-1 px-3 py-5">
        <p className="px-2 font-mono text-[9px] uppercase tracking-[0.28em] text-sc-text-muted/70">Consola</p>
        <ul className="mt-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href !== null && pathname.startsWith(item.href);

            if (item.href === null) {
              return (
                <li key={item.label}>
                  <span
                    aria-disabled="true"
                    title="Próximamente"
                    className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sc-text-muted/50"
                  >
                    <Icon className="size-[17px]" strokeWidth={1.5} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-sc-text-muted/50">pronto</span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-viz-in/50 ${
                    active
                      ? 'border border-sc-viz-in/25 bg-sc-viz-in/10 text-sc-viz-in'
                      : 'border border-transparent text-sc-text-muted hover:bg-sc-surface-alt hover:text-sc-text'
                  }`}
                >
                  <Icon className="size-[17px]" strokeWidth={1.5} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Pie: principio de la plataforma */}
      <div className="border-t sc-hairline px-5 py-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-sc-text-muted/70">Motor local</p>
        <p className="mt-1.5 text-[11px] leading-5 text-sc-text-muted">
          Señal agregada. Ningún paquete crudo sale del sitio.
        </p>
      </div>
    </aside>
  );
}
