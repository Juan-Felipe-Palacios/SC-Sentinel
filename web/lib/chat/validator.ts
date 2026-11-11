// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Validación de grounding del chatbot: toda IP citada por el modelo debe
// existir en el contexto RAG recuperado para el device autorizado.

import { isIP } from 'node:net';
import type { ChatContext } from './types';

const IPV4_CANDIDATE = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
// Candidato deliberadamente laxo: se valida con `isIP` para descartar horas,
// versiones y otros textos con dos puntos.
const IPV6_CANDIDATE = /(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}/gi;

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

/** IPv4 válidas, únicas y en orden de aparición. */
export function extractIpv4(text: string): string[] {
  const matches = text.match(IPV4_CANDIDATE) ?? [];
  return [...new Set(matches.filter(isIpv4))];
}

/** IPv6 válidas, únicas y en orden de aparición. */
export function extractIpv6(text: string): string[] {
  const matches = text.match(IPV6_CANDIDATE) ?? [];
  const valid = matches.map((match) => match.trim()).filter((match) => isIP(match) === 6);
  return [...new Set(valid)];
}

function collectContextIps(context: ChatContext): Set<string> {
  const serialized = JSON.stringify(context);
  return new Set([...extractIpv4(serialized), ...extractIpv6(serialized)]);
}

export interface ChatValidationResult {
  ok: boolean;
  unknownIps: string[];
  warnings: string[];
}

/**
 * Devuelve una advertencia por cada IP inventada. No bloquea la respuesta:
 * el producto la muestra como aviso de grounding al operador.
 */
export function validateChatAnswer(answer: string, context: ChatContext): ChatValidationResult {
  const allowed = collectContextIps(context);
  const unknownIps = [...extractIpv4(answer), ...extractIpv6(answer)].filter((ip) => !allowed.has(ip));

  return {
    ok: unknownIps.length === 0,
    unknownIps,
    warnings: unknownIps.map(
      (ip) => `La IP ${ip} no aparece en el contexto recuperado; verificá el dato antes de usarlo.`
    ),
  };
}
