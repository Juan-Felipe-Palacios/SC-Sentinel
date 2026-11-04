// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-sc-bg text-sc-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-16 border-b sc-hairline bg-sc-bg/85" aria-hidden="true" />}>
          <Topbar />
        </Suspense>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
