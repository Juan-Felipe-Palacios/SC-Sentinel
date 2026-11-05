// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { SettingsView } from '@/components/dashboard/SettingsView';

export const metadata: Metadata = {
  title: 'Configuración · SC-Sentinel',
  description: 'Dispositivos enrolados, emisión y rotación de tokens del agente.',
};

export default function SettingsPage() {
  return <SettingsView />;
}
