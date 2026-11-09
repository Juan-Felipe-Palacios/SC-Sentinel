// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Lectura y descompresión del cuerpo de ingesta con límites aplicados antes de
// materializar y de expandir el payload (protección contra gzip bombs).

import { gunzipSync } from 'zlib';

export const MAX_COMPRESSED_BYTES = 128 * 1024; // 128 KB
export const MAX_UNCOMPRESSED_BYTES = 512 * 1024; // 512 KB

export type IngestBodyResult =
  | { ok: true; body: Buffer }
  | { ok: false; status: 400 | 413 | 415; error: string; message: string };

function tooLarge(message: string): IngestBodyResult {
  return { ok: false, status: 413, error: 'payload_too_large', message };
}

/**
 * Lee el cuerpo de `POST /api/ingest` respetando `Content-Length` y el límite
 * de salida de gzip. No consume el cuerpo si la cabecera ya supera el tope.
 */
export async function readIngestBody(request: Request): Promise<IngestBodyResult> {
  const contentEncoding = (request.headers.get('content-encoding') || '').toLowerCase().trim();

  if (contentEncoding === 'zstd') {
    return {
      ok: false,
      status: 415,
      error: 'unsupported_media_type',
      message: 'zstd compression is not enabled in this route',
    };
  }

  const isGzip = contentEncoding === 'gzip';
  const bodyLimit = isGzip ? MAX_COMPRESSED_BYTES : MAX_UNCOMPRESSED_BYTES;

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > bodyLimit) {
    return tooLarge(
      isGzip
        ? 'Compressed payload exceeds 128 KB limit'
        : 'Uncompressed payload exceeds 512 KB limit'
    );
  }

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await request.arrayBuffer());
  } catch {
    return { ok: false, status: 400, error: 'bad_request', message: 'Failed to read request body' };
  }

  if (isGzip) {
    if (rawBody.length > MAX_COMPRESSED_BYTES) {
      return tooLarge('Compressed payload exceeds 128 KB limit');
    }
    try {
      rawBody = gunzipSync(rawBody, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ERR_BUFFER_TOO_LARGE' || error instanceof RangeError) {
        return tooLarge('Uncompressed payload exceeds 512 KB limit');
      }
      return {
        ok: false,
        status: 400,
        error: 'bad_request',
        message: 'Failed to decompress gzip body',
      };
    }
  }

  if (rawBody.length > MAX_UNCOMPRESSED_BYTES) {
    return tooLarge('Uncompressed payload exceeds 512 KB limit');
  }

  return { ok: true, body: rawBody };
}
