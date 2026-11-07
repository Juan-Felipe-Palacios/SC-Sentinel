// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { getDashboardAuth } from '@/lib/auth/dashboard';

export const metadata: Metadata = {
  title: 'Configuración · SC-Sentinel',
  description: 'Dispositivos enrolados, emisión y rotación de tokens del agente.',
};

export default async function SettingsPage() {
  const auth = await getDashboardAuth();
  if (!auth) redirect('/login');
  // Defensa en profundidad: el middleware también redirige a los visitantes.
  if (auth.role !== 'admin') redirect('/dashboard/overview');

  return <SettingsView />;
}
