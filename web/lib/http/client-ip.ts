// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Resolución de IP de cliente sin confiar ciegamente en X-Forwarded-For.
//
// V2: fuera de Vercel, X-Forwarded-For solo se acepta si TRUST_PROXY=1.
// En Vercel, la plataforma sobrescribe x-vercel-forwarded-for/x-forwarded-for;
// se prefieren esos headers y se valida que el valor sea una IP real.

import { isIP } from 'node:net';
import type { NextRequest } from 'next/server';

const UNKNOWN_IP = 'unknown';

function firstValidIp(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(',')) {
    const candidate = part.trim();
    if (isIP(candidate) !== 0) return candidate;
  }
  return null;
}

/**
 * IP de cliente para rate limiting.
 *
 * - Vercel: usa `x-vercel-forwarded-for` (o `x-forwarded-for`/`x-real-ip`),
 *   validando que sea una IP.
 * - Otros despliegues: solo usa headers de proxy si `TRUST_PROXY=1`.
 * - Sin proxy declarado: devuelve `unknown` (bucket compartido, no spoofeable).
 */
export function clientIp(request: NextRequest): string {
  if (process.env.VERCEL === '1') {
    return (
      firstValidIp(request.headers.get('x-vercel-forwarded-for')) ??
      firstValidIp(request.headers.get('x-forwarded-for')) ??
      firstValidIp(request.headers.get('x-real-ip')) ??
      UNKNOWN_IP
    );
  }

  if (process.env.TRUST_PROXY === '1') {
    return (
      firstValidIp(request.headers.get('x-forwarded-for')) ??
      firstValidIp(request.headers.get('x-real-ip')) ??
      UNKNOWN_IP
    );
  }

  return UNKNOWN_IP;
}
