// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { MAX_UNCOMPRESSED_BYTES, readIngestBody } from '../read-body';

function request(body: Uint8Array, headers: Record<string, string> = {}): Request {
  // Copia a un ArrayBuffer propio: BodyInit no acepta el buffer compartido de Node.
  const bytes = Uint8Array.from(body);
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers,
    body: bytes.buffer,
  });
}

describe('readIngestBody', () => {
  it('acepta un cuerpo gzip pequeño y lo descomprime', async () => {
    const compressed = gzipSync(Buffer.from('{"ok":true}'));

    const result = await readIngestBody(
      request(compressed, { 'content-encoding': 'gzip' })
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.toString('utf-8')).toBe('{"ok":true}');
  });

  it('rechaza por Content-Length declarado antes de leer el cuerpo', async () => {
    const result = await readIngestBody(
      request(Buffer.from([1, 2]), {
        'content-encoding': 'gzip',
        'content-length': '999999',
      })
    );

    expect(result).toMatchObject({
      ok: false,
      status: 413,
      error: 'payload_too_large',
    });
  });

  it('rechaza una gzip bomb sin expandirla más allá del límite', async () => {
    const bomb = gzipSync(Buffer.alloc(10 * 1024 * 1024));

    const result = await readIngestBody(request(bomb, { 'content-encoding': 'gzip' }));

    expect(result).toMatchObject({
      ok: false,
      status: 413,
      error: 'payload_too_large',
    });
  });

  it('rechaza gzip inválido con 400', async () => {
    const result = await readIngestBody(
      request(Buffer.from('esto no es gzip'), { 'content-encoding': 'gzip' })
    );

    expect(result).toMatchObject({ ok: false, status: 400, error: 'bad_request' });
  });

  it('rechaza un cuerpo sin comprimir mayor a 512 KB', async () => {
    const result = await readIngestBody(request(Buffer.alloc(MAX_UNCOMPRESSED_BYTES + 1)));

    expect(result).toMatchObject({
      ok: false,
      status: 413,
      error: 'payload_too_large',
    });
  });

  it('rechaza zstd sin leer el cuerpo', async () => {
    const result = await readIngestBody(
      request(Buffer.from('cualquier cosa'), { 'content-encoding': 'zstd' })
    );

    expect(result).toMatchObject({
      ok: false,
      status: 415,
      error: 'unsupported_media_type',
    });
  });
});
