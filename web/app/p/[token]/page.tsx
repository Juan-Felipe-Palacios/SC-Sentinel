// web/app/p/[token]/page.tsx
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Trust Page pública sin cookies. 404 para ausente/expirado/revocado.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTrustPage } from '@/lib/trust/queries';
import { hashTrustToken } from '@/lib/trust/token';
import { checkTrustRateLimit } from '@/lib/trust/rate-limit';
import { logTrustAccess } from '@/lib/trust/access-log';
import { maybeAlertLeak } from '@/lib/trust/leak-alert';
import { redactTrustAlert, redactTrustHost, redactTrustInsight } from '@/lib/trust/redact';
import { queryOverview } from '@/lib/query/overview';
import { queryHosts } from '@/lib/query/hosts';
import { queryAlerts } from '@/lib/query/alerts';
import { fetchLatestInsight } from '@/lib/ai/analyze';
import { TrustView } from '@/components/trust/TrustView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Trust Page · SC-Sentinel',
  description: 'Postura de red verificable: agregados de solo lectura, sin paquetes ni payloads.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TrustPage({ params }: PageProps) {
  const { token } = await params;
  const resolved = await resolveTrustPage(token);
  if (!resolved) notFound();

  const tokenHash = hashTrustToken(token);
  const rate = checkTrustRateLimit(tokenHash);
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || '';
  void logTrustAccess(tokenHash, ip, userAgent);
  void maybeAlertLeak(tokenHash);

  if (!rate.allowed) {
    throw new Error('rate_limited');
  }

  const deviceId = resolved.device_id;
  const [overview, hostsResult, alertsResult, insight] = await Promise.all([
    queryOverview('1h', deviceId),
    queryHosts('1h', deviceId),
    queryAlerts('1h', deviceId),
    fetchLatestInsight(deviceId, 'es'),
  ]);

  return (
    <TrustView
      totals={overview.totals}
      hosts={hostsResult.hosts.slice(0, 10).map(redactTrustHost)}
      alerts={alertsResult.alerts.slice(0, 10).map(redactTrustAlert)}
      insight={redactTrustInsight(insight)}
    />
  );
}
