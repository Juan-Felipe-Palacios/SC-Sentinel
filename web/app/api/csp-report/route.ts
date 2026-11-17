// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Colector de violaciones CSP para la fase P2 (Report-Only).
//
// Diseño:
// - sin autenticación de usuario: el navegador no envía credenciales de sesión
//   y la CSP Report-Only debe poder reportar también en rutas públicas;
// - rate limit por IP y cuerpo acotado antes de parsear (anti-abuso);
// - solo se registran campos saneados: nunca la política original (lleva el
//   nonce) ni URLs con query o con el token de una Trust Page;
// - un único log por request (máximo 5 violaciones) y siempre 204: el
//   navegador ignora la respuesta y un error no debe generar reintentos.

import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/http/client-ip';
import { checkRateLimit } from '@/lib/rate-limit/ingest';
import { normalizeCspReports, readCspReportBody } from '@/lib/security/csp-report';

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const ipLimit = checkRateLimit(`csp_${clientIp(request)}`, 30, 15);
  if (!ipLimit.allowed) return noContent();

  const rawBody = await readCspReportBody(request);
  if (rawBody === null) return noContent();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return noContent();
  }

  const violations = normalizeCspReports(payload);
  if (violations.length > 0) {
    console.warn(JSON.stringify({ event: 'csp_violation', violations }));
  }

  return noContent();
}
