// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { createHash } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

