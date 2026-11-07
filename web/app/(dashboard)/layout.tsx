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
      <div className="flex min-h-dvh bg-sc-bg text-sc-text">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-16 border-b sc-hairline bg-sc-bg/85" aria-hidden="true" />}>
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
