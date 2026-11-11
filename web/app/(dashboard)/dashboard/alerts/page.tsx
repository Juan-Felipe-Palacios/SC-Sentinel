// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { queryRangeSchema, type QueryRange } from '@/lib/schemas/query';
import { AlertsView } from '@/components/dashboard/AlertsView';

export const metadata: Metadata = {
  title: 'Alertas · SC-Sentinel',
  description: 'Alertas y anomalías detectadas por el motor determinista.',
};

interface AlertsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const raw = await searchParams;
  const rawRange = typeof raw.range === 'string' ? raw.range : undefined;
  const parsed = queryRangeSchema.safeParse(rawRange);
  const range: QueryRange = parsed.success ? parsed.data : '1h';

  return <AlertsView range={range} />;
}