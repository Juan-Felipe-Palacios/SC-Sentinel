// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { queryRangeSchema, type QueryRange } from '@/lib/schemas/query';
import { ConnectionsView } from '@/components/dashboard/ConnectionsView';

export const metadata: Metadata = {
  title: 'Conexiones · SC-Sentinel',
  description: 'Puertos, protocolos y distribución geográfica del tráfico.',
};

interface ConnectionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const raw = await searchParams;
  const rawRange = typeof raw.range === 'string' ? raw.range : undefined;
  const parsed = queryRangeSchema.safeParse(rawRange);
  const range: QueryRange = parsed.success ? parsed.data : '1h';

  return <ConnectionsView range={range} />;
}