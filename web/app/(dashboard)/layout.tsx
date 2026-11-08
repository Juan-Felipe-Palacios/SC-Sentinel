// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { DashboardRoleProvider } from '@/components/dashboard/DashboardRoleContext';
import { GuestBanner } from '@/components/dashboard/GuestBanner';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');

  return (
    <DashboardRoleProvider
      role={auth.role}
      guestExpiresAt={auth.role === 'guest' ? auth.guest.expiresAt : undefined}
    >
      <div className="sc-grid-bg relative flex min-h-dvh bg-[#050a14] text-slate-100 antialiased selection:bg-sky-500/25 selection:text-sky-200">
        {/* Glows ambientales sutiles (Raycast/Cloudflare dark SOC) */}
        <div className="pointer-events-none fixed top-0 left-1/4 h-[380px] w-[480px] rounded-full bg-sky-500/5 blur-[120px]" aria-hidden="true" />
        <div className="pointer-events-none fixed bottom-0 right-1/4 h-[380px] w-[480px] rounded-full bg-purple-500/5 blur-[140px]" aria-hidden="true" />
        <Sidebar />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-16 border-b border-slate-800/80 bg-slate-950/85" aria-hidden="true" />}>
            <Topbar />
          </Suspense>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {auth.role === 'guest' ? <GuestBanner expiresAt={auth.guest.expiresAt} /> : null}
            {children}
          </main>
        </div>
        <ChatWidget />
      </div>
    </DashboardRoleProvider>
  );
}
