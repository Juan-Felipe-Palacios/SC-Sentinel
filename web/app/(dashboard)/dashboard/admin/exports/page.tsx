// web/app/(dashboard)/dashboard/admin/exports/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminExportsView } from '@/components/dashboard/AdminExportsView';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export const metadata: Metadata = {
  title: 'Exports · SC-Sentinel',
  description: 'Uso de exportaciones: conteos por rol y métrica en los últimos 30 días.',
};

export default async function AdminExportsPage() {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/dashboard/overview');
  return <AdminExportsView />;
}
