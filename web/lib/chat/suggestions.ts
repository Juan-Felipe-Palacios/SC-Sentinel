// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Detección de intención y sugerencias contextuales (F12 del hito M3.5).

import type { ChatContext, ChatQueryType } from './types';

const KEYWORDS: Record<Exclude<ChatQueryType, 'general'>, RegExp> = {
  traffic: /tr[aá]fico|bytes|paquetes|ancho de banda|pico|volumen|mb|gb/i,
  hosts: /host|ip|destino|origen|pa[ií]s|geolocal|dns|lan|red local/i,
  alerts: /alerta|incidente|riesgo|cr[ií]tic|severidad|ataque|amenaza/i,
  health: /agente|salud|captura|drop|cola|spool|paquetes perdidos|sync|sincron/i,
};

/** Elige la intención dominante por orden de prioridad (alertas > salud > ...). */
export function detectQueryType(message: string): ChatQueryType {
  const text = message.trim();
  if (!text) return 'general';
  if (KEYWORDS.alerts.test(text)) return 'alerts';
  if (KEYWORDS.health.test(text)) return 'health';
  if (KEYWORDS.hosts.test(text)) return 'hosts';
  if (KEYWORDS.traffic.test(text)) return 'traffic';
  return 'general';
}

const SUGGESTIONS: Record<ChatQueryType, readonly string[]> = {
  traffic: [
    '¿Qué host generó más tráfico?',
    'Mostrame los puertos más usados',
    '¿Hay picos anómalos en las últimas 24 h?',
  ],
  hosts: [
    '¿Qué IPs externas dominan el tráfico?',
    '¿Hay hosts en la LAN?',
    '¿Qué país concentra más tráfico?',
  ],
  alerts: [
    '¿Qué alertas son críticas?',
    'Explicame la alerta más reciente',
    '¿Qué debería revisar primero?',
  ],
  health: [
    '¿El agente está perdiendo paquetes?',
    '¿Hay datos en cola o en el spool?',
    '¿La captura está al día?',
  ],
  general: [
    '¿Cómo está la red en las últimas 24 h?',
    '¿Qué hosts generan más tráfico?',
    '¿Hay alertas que requieran acción?',
  ],
};

/** Máximo 3 sugerencias, adaptadas cuando todavía no hay datos. */
export function buildSuggestions(type: ChatQueryType, context?: ChatContext): string[] {
  if (context && context.totals.windows === 0 && context.topHosts.length === 0) {
    return [
      '¿Por qué no hay datos en las últimas 24 h?',
      '¿El agente está conectado y sincronizando?',
      '¿Qué debo revisar en la captura?',
    ];
  }
  return [...SUGGESTIONS[type]].slice(0, 3);
}

/** F9: el pedido de exportación se marca para que la UI lo ofrezca. */
export function isExportableQuery(message: string): boolean {
  return /\breporte\b|\bexportar\b|\bexport\b|\bpdf\b|\bmarkdown\b|\bdescargar\b/i.test(message);
}
