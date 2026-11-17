// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cabeceras de seguridad globales y específicas de Trust Pages.

export interface SecurityHeader {
  key: string;
  value: string;
}

export const CSP_HEADER = 'Content-Security-Policy';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_REPORT_PATH = '/api/csp-report';
export const CSP_REPORT_GROUP = 'csp-endpoint';
export const CSP_REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;

export type CspMode = 'enforce' | 'report-only';

/**
 * P2: fuera de desarrollo la política se informa con Report-Only; solo
 * desarrollo la aplica para que un dev vea el bloqueo al instante.
 * `CSP_ENFORCE=1` la aplica en el entorno donde se defina (P4 preview,
 * P5 producción) sin tocar código. Sin la variable nunca se bloquea nada en
 * preview ni en producción.
 */
export function resolveCspMode(
  env: { nodeEnv?: string; cspEnforce?: string } = {
    nodeEnv: process.env.NODE_ENV,
    cspEnforce: process.env.CSP_ENFORCE,
  }
): CspMode {
  if (env.cspEnforce === '1') return 'enforce';
  return env.nodeEnv === 'development' ? 'enforce' : 'report-only';
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
  reportOnly = false
): string {
  if (!nonce || /['"\s]/.test(nonce)) {
    throw new Error('nonce inválido para CSP');
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.vercel-insights.com https://va.vercel-scripts.com${
      isDev ? " ws: http://localhost:* http://127.0.0.1:*" : ""
    }`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    // `report-uri` es legacy pero todavía soportado; `report-to` usa el grupo
    // declarado en `Reporting-Endpoints`. Se emiten los dos porque ningún
    // navegador implementa ambos.
    ...(reportOnly ? [`report-uri ${CSP_REPORT_PATH}`, `report-to ${CSP_REPORT_GROUP}`] : []),
  ].join("; ");
}

export function buildGlobalSecurityHeaders(isDev: boolean): SecurityHeader[] {
  // La CSP con nonce se emite por request desde middleware; aquí solo van
  // las cabeceras estáticas globales.
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    ...(isDev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]),
  ];
}

export function buildTrustPageHeaders(): SecurityHeader[] {
  return [
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cache-Control", value: "private, no-store, max-age=0" },
  ];
}
