// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import type { Metadata } from 'next';
import { queryRangeSchema, type QueryRange } from '@/lib/schemas/query';
import { HostsView } from '@/components/dashboard/HostsView';

export const metadata: Metadata = {
  title: 'Hosts · SC-Sentinel',
  description: 'Inventario de endpoints monitoreados con scoring de riesgo.',
};

interface HostsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HostsPage({ searchParams }: HostsPageProps) {
  const raw = await searchParams;
  const rawRange = typeof raw.range === 'string' ? raw.range : undefined;
  const parsed = queryRangeSchema.safeParse(rawRange);
  const range: QueryRange = parsed.success ? parsed.data : '1h';

  return <HostsView range={range} />;
}