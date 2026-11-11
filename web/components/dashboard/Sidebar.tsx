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
  Terminal,
  Activity,
  BarChart3,
} from 'lucide-react';
import { useDashboardRole } from './DashboardRoleContext';

interface NavEntry {
  label: string;
  href: string | null;
  icon: typeof LayoutDashboard;
  action?: 'open-chat';
  badge?: string;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'Hosts', href: '/dashboard/hosts', icon: Server },
  { label: 'Conexiones', href: '/dashboard/connections', icon: Network },
  { label: 'Alertas', href: '/dashboard/alerts', icon: ShieldAlert },
  { label: 'Evals de IA', href: '/dashboard/evals', icon: BarChart3 },
  { label: 'Exports', href: '/dashboard/admin/exports', icon: BarChart3 },
  { label: 'Trust Access', href: '/dashboard/admin/trust-access', icon: ShieldCheck },
  { label: 'Asistente AI', href: null, icon: Sparkles, action: 'open-chat', badge: 'copilot' },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useDashboardRole();
  const isGuest = role === 'guest';
  // Configuración expone devices y tokens: solo administración.
  const navItems = isGuest
    ? NAV_ITEMS.filter((item) => item.href !== '/dashboard/settings')
    : NAV_ITEMS;

  return (
    <aside className="z-20 hidden w-60 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl lg:flex">
      {/* Marca */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800/80 px-5">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-400">
            <ShieldCheck className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-sm font-semibold tracking-tight text-slate-100">
              SC-Sentinel
            </span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">
              Strategic Connex
            </span>
          </span>
        </Link>
      </div>

      {/* Navegación — Vistas Principales (como DashboardPreview) */}
      <nav aria-label="Secciones del panel" className="flex-1 px-3 py-5">
        <p className="px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Vistas Principales
        </p>
        <ul className="mt-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href !== null && pathname.startsWith(item.href);

            if (item.action === 'open-chat') {
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event('sc:open-chat'))}
                    title="Abrir asistente"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm text-slate-400 transition-all hover:bg-slate-900/60 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-purple-400" strokeWidth={1.5} aria-hidden="true" />
                      <span className="truncate font-display text-sm font-medium">{item.label}</span>
                    </span>
                    <span className="rounded-full bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
                      {item.badge}
                    </span>
                  </button>
                </li>
              );
            }

            if (item.href === null) {
              return (
                <li key={item.label}>
                  <span
                    aria-disabled="true"
                    title="Próximamente"
                    className="flex cursor-not-allowed items-center justify-between gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm text-slate-500"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-slate-500" strokeWidth={1.5} aria-hidden="true" />
                      <span className="truncate font-display text-sm font-medium">{item.label}</span>
                    </span>
                    <span className="rounded-full bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
                      {item.badge}
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-display font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 ${
                    active
                      ? 'border border-sky-500/30 bg-sky-500/15 text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.15)]'
                      : 'border border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className={`size-4 shrink-0 ${active ? 'text-sky-400' : 'text-slate-500'}`} strokeWidth={1.5} aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Widget del agente (como DashboardPreview) */}
      <div className="mx-3 mb-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <div className="flex items-center justify-between font-mono text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            sc-agent daemon
          </span>
          <span className="font-semibold text-emerald-400">OK</span>
        </div>
        <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-500">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-sky-400" aria-hidden="true" />
              Estado
            </span>
            <span className="text-slate-300">{isGuest ? 'Demo pública' : 'Motor local'}</span>
          </div>
          <p className="leading-4 text-slate-400">
            {isGuest
              ? 'Solo lectura. La configuración y los tokens están ocultos.'
              : 'Señal agregada. Ningún paquete crudo sale del sitio.'}
          </p>
        </div>
      </div>
    </aside>
  );
}
