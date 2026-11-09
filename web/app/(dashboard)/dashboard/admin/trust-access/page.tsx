// web/app/(dashboard)/dashboard/admin/trust-access/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminTrustAccessView } from '@/components/dashboard/AdminTrustAccessView';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export const metadata: Metadata = {
  title: 'Trust Access · SC-Sentinel',
  description: 'Accesos a Trust Pages con IP anonimizada (30 días).',
};

export default async function AdminTrustAccessPage() {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/dashboard/overview');
  return <AdminTrustAccessView />;
}
