// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { queryRangeSchema, type QueryRange } from '@/lib/schemas/query';
import { OverviewView } from '@/components/dashboard/OverviewView';

export const metadata: Metadata = {
  title: 'Overview · SC-Sentinel',
  description: 'Resumen de tráfico agregado, salud del agente y alertas recientes.',
};

interface OverviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const raw = await searchParams;
  const rawRange = typeof raw.range === 'string' ? raw.range : undefined;
  const parsed = queryRangeSchema.safeParse(rawRange);
  const range: QueryRange = parsed.success ? parsed.data : '1h';

  return <OverviewView range={range} />;
}
