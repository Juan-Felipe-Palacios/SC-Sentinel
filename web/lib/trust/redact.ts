// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Redacción del payload público de las Trust Pages: la página no debe exponer
// IPs ni evidencia de alertas, ni siquiera en el payload RSC que serializa Next.

import type { AiInsightRecord } from '@/lib/ai/analyze';
import type { AlertItem } from '@/lib/query/alerts';
import type { HostMetricItem } from '@/lib/query/hosts';

const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const REDACTED_IPV4 = '•••.•••.•••.•••';

/** Sustituye cualquier IPv4 embebida en texto libre. */
export function redactIpv4(text: string): string {
  return text.replace(IPV4_PATTERN, REDACTED_IPV4);
}

/** Host público: sin IP legible y con IPv4 redactada también en la clave. */
export function redactTrustHost(host: HostMetricItem): HostMetricItem {
  return {
    ...host,
    host_key: redactIpv4(host.host_key),
    ip: null,
  };
}

/** Alerta pública: sin descripción ni evidencia; el título se conserva redactado. */
export function redactTrustAlert(alert: AlertItem): AlertItem {
  return {
    ...alert,
    title: redactIpv4(alert.title),
    description: null,
    evidence: null,
  };
}

/** Insight público: sin identificadores internos y con IPv4 redactada en el texto. */
export function redactTrustInsight(insight: AiInsightRecord | null): AiInsightRecord | null {
  if (!insight) return null;

  return {
    ...insight,
    device_id: '',
    facts_hash: '',
    summary: redactIpv4(insight.summary),
    findings: insight.findings.map((finding) => ({
      ...finding,
      description: redactIpv4(finding.description),
    })),
    recommendations: insight.recommendations.map(redactIpv4),
  };
}
