// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Cabeceras de seguridad globales y específicas de Trust Pages.

export interface SecurityHeader {
  key: string;
  value: string;
}

export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
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
