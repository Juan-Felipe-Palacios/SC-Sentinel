// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Lectura acotada y sanitización de reportes CSP antes de loguearlos.
//
// Los reportes llegan del navegador (Report-Only) y no se confían: se acota el
// tamaño, se descartan campos desconocidos y nunca se registra la política
// original (contiene el nonce de la request) ni URLs completas con query. La
// ruta de Trust Page `/p/<token>` se redacta porque el token viaja en el path.

const MAX_CSP_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 5;
const MAX_FIELD_LENGTH = 200;

export interface CspViolation {
  directive: string;
  blocked?: string;
  document?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

function firstString(source: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Reduce una URL reportada a origen + ruta, sin query ni fragmento. Valores
 * no-URL (`inline`, `eval`) se conservan sin query; esquemas no HTTP se
 * reducen al esquema.
 */
export function sanitizeReportedUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return truncate(raw.replace(/[?#].*$/, ''));
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return truncate(url.protocol);
  const pathname = url.pathname.replace(/^\/p\/[^/]+/, '/p/[redacted]');
  return truncate(`${url.origin}${pathname}`);
}

function toViolation(source: JsonRecord): CspViolation | null {
  const directive = firstString(source, [
    'effective-directive',
    'effectiveDirective',
    'violated-directive',
  ]);
  if (!directive) return null;

  return {
    directive: truncate(directive),
    blocked: sanitizeReportedUrl(source['blocked-uri'] ?? source['blockedURL']),
    document: sanitizeReportedUrl(source['document-uri'] ?? source['documentURL']),
  };
}

/**
 * Acepta el formato legacy (`application/csp-report`, `{ "csp-report": … }`) y
 * el de Reporting API (`application/reports+json`, array de reportes). Cualquier
 * otra forma devuelve una lista vacía.
 */
export function normalizeCspReports(payload: unknown): CspViolation[] {
  const records: JsonRecord[] = [];

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (isRecord(entry) && entry.type === 'csp-violation' && isRecord(entry.body)) {
        records.push(entry.body);
      }
    }
  } else if (isRecord(payload) && isRecord(payload['csp-report'])) {
    records.push(payload['csp-report']);
  }

  return records
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map(toViolation)
    .filter((violation): violation is CspViolation => violation !== null);
}

/**
 * Lee el cuerpo del reporte respetando `Content-Length` y un tope duro tras
 * materializarlo. Devuelve `null` cuando el cuerpo excede el límite.
 */
export async function readCspReportBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_CSP_REPORT_BYTES) return null;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return null;
  }

  if (bytes.byteLength > MAX_CSP_REPORT_BYTES) return null;
  return new TextDecoder().decode(bytes);
}
