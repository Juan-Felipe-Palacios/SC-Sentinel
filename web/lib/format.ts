// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Helpers de formato para el dashboard (es-AR, separadores de miles, bytes binarios).

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log10(abs) / 3), units.length - 1);
  const value = abs / 1024 ** exponent;
  const formatted = exponent === 0 ? String(Math.round(value)) : value.toFixed(decimals);
  return `${sign}${formatted} ${units[exponent]}`;
}

export function formatNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR').format(Math.round(value));
}

/** Porcentaje de drops sobre packets_seen. Devuelve null si no se puede calcular. */
export function dropRate(seen: number | null | undefined, dropped: number | null | undefined): number | null {
  if (seen == null || dropped == null || !Number.isFinite(seen) || !Number.isFinite(dropped)) return null;
  const total = seen + dropped;
  if (total <= 0) return 0;
  return (dropped / total) * 100;
}

/** "hace 3 min", "hace 2 h", "hace 5 d" — sin dependencias externas. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'sin datos';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'sin datos';
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSeconds < 60) return 'hace instantes';
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function severityRank(severity: string): number {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

/**
 * Bandera + nombre legible del país de un host.
 * `LAN` = red local/privada (centinela del agente, no es un país) y null/'' = sin geolocalizar.
 */
export function countryDisplay(country: string | null | undefined): { flag: string; label: string } {
  const code = country?.trim();
  if (!code) return { flag: '🌐', label: 'Sin geolocalizar' };
  if (code.toUpperCase() === 'LAN') return { flag: '🏠', label: 'Red local' };
  if (/^[A-Za-z]{2}$/.test(code)) {
    const upper = code.toUpperCase();
    const flag = upper.replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    );
    return { flag, label: regionName(upper) };
  }
  return { flag: '🌐', label: code };
}

/** Nombre del país en español a partir del código ISO alpha-2 (fallback al código). */
function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}