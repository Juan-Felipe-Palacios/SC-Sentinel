// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Hash canónico de facts (§11.1/§11.4): JSON canónico (claves ordenadas recursivamente) → SHA-256
// Determinista e independiente de orden de inserción del objeto.

import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    // Las listas se serializan tal cual (el agente ya las emite ordenadas por bytes);
    // cambiar el orden cambiaría el hash, que es la semántica deseada de dedup.
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    );
    return `{${parts.join(',')}}`;
  }
  // Tipos no serializables: JSON.stringify del valor, a efectos de hash determinista.
  return JSON.stringify(value) ?? 'null';
}

export function factsHash(facts: unknown): string {
  return createHash('sha256').update(canonicalJson(facts), 'utf8').digest('hex');
}
