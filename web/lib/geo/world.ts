// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Proyección y contornos de países para el mapa geoespacial.
// Se mantiene fuera de los componentes para calcular el path del mundo una sola vez.
import { geoCentroid, geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import topologyJson from 'world-atlas/countries-110m.json';

export const WORLD_WIDTH = 900;
export const WORLD_HEIGHT = 420;

type CountryFeature = Feature<Geometry, { name?: string }>;

const topology = topologyJson as unknown as Topology<{ countries: GeometryCollection }>;
const collection = feature(
  topology,
  topology.objects.countries
) as unknown as FeatureCollection<Geometry, { name?: string }>;

const projection = geoEqualEarth().fitExtent(
  [
    [16, 18],
    [WORLD_WIDTH - 16, WORLD_HEIGHT - 18],
  ],
  collection
);
const pathGenerator = geoPath(projection);

/** `Intl.DisplayNames` traduce ISO alpha-2 al inglés; world-atlas usa nombres en inglés. */
const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const featuresByName = new Map<string, CountryFeature>();
for (const item of collection.features) {
  const name = item.properties?.name;
  if (name) featuresByName.set(normalize(name), item);
}

/** Nombres que difieren entre `Intl.DisplayNames` y world-atlas (ya normalizados). */
const NAME_ALIASES: Record<string, string> = {
  'united states': 'united states of america',
  turkiye: 'turkey',
  'congo kinshasa': 'dem rep congo',
  'congo brazzaville': 'congo',
  'palestinian territories': 'palestine',
  'north macedonia': 'macedonia',
  eswatini: 'swaziland',
  'timor leste': 'east timor',
  'myanmar burma': 'myanmar',
  'bosnia and herzegovina': 'bosnia and herz',
  'central african republic': 'central african rep',
  'dominican republic': 'dominican rep',
  'equatorial guinea': 'eq guinea',
  'south sudan': 's sudan',
  'western sahara': 'w sahara',
  'falkland islands': 'falkland is',
  'solomon islands': 'solomon is',
};

function featureForRegion(code: string): CountryFeature | null {
  const english = displayNames?.of(code);
  if (!english) return null;
  const key = normalize(english);
  const direct = featuresByName.get(key);
  if (direct) return direct;
  const alias = NAME_ALIASES[key];
  return alias ? (featuresByName.get(normalize(alias)) ?? null) : null;
}

let landPath: string | null = null;

/** Path SVG combinado de todos los países (sirve de silueta de fondo). */
export function worldLandPath(): string {
  if (landPath == null) landPath = pathGenerator(collection) ?? '';
  return landPath;
}

const pointCache = new Map<string, [number, number] | null>();

/**
 * Punto proyectado del centroide de un país ISO alpha-2.
 * Devuelve null si el código no es alpha-2, es el centinela `LAN` o no hay geometría.
 */
export function countryPoint(code: string | null): [number, number] | null {
  if (!code) return null;
  const iso = code.toUpperCase();
  if (iso.length !== 2 || iso === 'LAN') return null;
  if (pointCache.has(iso)) return pointCache.get(iso) ?? null;

  const shape = featureForRegion(iso);
  const centroid = shape ? geoCentroid(shape) : null;
  const projected = centroid ? projection(centroid) : null;
  const point: [number, number] | null =
    projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1])
      ? [projected[0], projected[1]]
      : null;
  pointCache.set(iso, point);
  return point;
}
