// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//
// Layout puro de la card «Mapa de exposición IT» (M6 · E8.2). Reusa
// `metric=overview` (top_hosts/top_countries/top_ports) y no dibuja aristas:
// el contrato actual no publica pares origen-destino, así que la card rotula
// «exposición» y nunca «topología».

import type { OverviewTopCountry, OverviewTopHost, OverviewTopPort } from '@/lib/api-types';

/** Países visibles en la card. */
export const IT_EXPOSURE_COUNTRY_CAP = 6;
/** Hosts visibles en total (sumados entre todos los países). */
export const IT_EXPOSURE_HOST_CAP = 12;
/** Puertos principales visibles. */
export const IT_EXPOSURE_PORT_CAP = 6;
/** Bucket para hosts cuyo país no se resolvió. */
export const IT_EXPOSURE_NO_COUNTRY = 'Sin país';

export interface ItExposureHost {
  /** `host_key` estable del host; nunca se inventa uno nuevo. */
  key: string;
  label: string;
  bytesTotal: number;
}

export interface ItExposureGroup {
  country: string;
  hosts: ItExposureHost[];
  bytesTotal: number;
}

export interface ItExposurePort {
  port: number;
  protocol: string;
  connections: number;
}

export interface ItExposureLayout {
  groups: ItExposureGroup[];
  ports: ItExposurePort[];
  /** true si se recortaron países, hosts o puertos. */
  truncated: boolean;
}

function hostLabel(host: OverviewTopHost): string {
  const hostname = host.hostname?.trim();
  if (hostname) return hostname;
  if (host.ip) return host.ip;
  return host.host_key;
}

/**
 * Agrupa los top hosts por país y resume los puertos principales.
 * Determinista: ordena por bytes totales y desempata por nombre/clave.
 */
export function buildItExposure(
  hosts: OverviewTopHost[],
  countries: OverviewTopCountry[],
  ports: OverviewTopPort[]
): ItExposureLayout {
  const countryBytes = new Map(countries.map((c) => [c.country, c.bytes_total]));
  const buckets = new Map<string, ItExposureHost[]>();

  for (const host of hosts) {
    const country = host.country ?? IT_EXPOSURE_NO_COUNTRY;
    const list = buckets.get(country) ?? [];
    list.push({ key: host.host_key, label: hostLabel(host), bytesTotal: host.bytes_total });
    buckets.set(country, list);
  }

  const ordered = [...buckets.entries()]
    .map(([country, list]) => {
      const sorted = list
        .slice()
        .sort((a, b) => b.bytesTotal - a.bytesTotal || a.key.localeCompare(b.key));
      const total = countryBytes.get(country) ?? sorted.reduce((sum, h) => sum + h.bytesTotal, 0);
      return { country, hosts: sorted, bytesTotal: total };
    })
    .sort((a, b) => b.bytesTotal - a.bytesTotal || a.country.localeCompare(b.country));

  let truncated = ordered.length > IT_EXPOSURE_COUNTRY_CAP || hosts.length > IT_EXPOSURE_HOST_CAP;
  let remaining = IT_EXPOSURE_HOST_CAP;
  const groups: ItExposureGroup[] = [];
  for (const group of ordered.slice(0, IT_EXPOSURE_COUNTRY_CAP)) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const visible = group.hosts.slice(0, remaining);
    if (visible.length < group.hosts.length) truncated = true;
    remaining -= visible.length;
    groups.push({ country: group.country, hosts: visible, bytesTotal: group.bytesTotal });
  }

  const sortedPorts = ports
    .slice()
    .sort((a, b) => b.bytes - a.bytes || a.port - b.port)
    .slice(0, IT_EXPOSURE_PORT_CAP)
    .map((p) => ({ port: p.port, protocol: p.protocol, connections: p.connections }));
  if (ports.length > IT_EXPOSURE_PORT_CAP) truncated = true;

  return { groups, ports: sortedPorts, truncated };
}
