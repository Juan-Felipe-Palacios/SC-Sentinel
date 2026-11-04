// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Comparación de secretos en tiempo constante. Solo node runtime (route handlers).

import { createHash, timingSafeEqual } from 'node:crypto';

export function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB);
}
