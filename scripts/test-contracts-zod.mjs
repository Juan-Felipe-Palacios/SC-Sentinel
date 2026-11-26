// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Test Zod contracts, auth, and rate-limiting against official contract fixtures

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const validExamplePath = path.join(root, 'docs/contracts/examples/ingest-request.valid.json');
const invalidExamplePath = path.join(root, 'docs/contracts/examples/ingest-request.invalid.json');

const validData = JSON.parse(fs.readFileSync(validExamplePath, 'utf8'));
const invalidData = JSON.parse(fs.readFileSync(invalidExamplePath, 'utf8'));

test('Ingest Pipeline Validation & Auth Tests', async (t) => {
  const { IngestEnvelopeSchema } = await import('../web/lib/schemas/ingest.ts');
  const { hashToken } = await import('../web/lib/auth/token.ts');
  const { checkRateLimit } = await import('../web/lib/rate-limit/ingest.ts');

  await t.test('Valid contract example passes Zod schema', () => {
    const result = IngestEnvelopeSchema.safeParse(validData);
    assert.equal(result.success, true, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  await t.test('Invalid contract example fails Zod schema with proper errors', () => {
    const result = IngestEnvelopeSchema.safeParse(invalidData);
    assert.equal(result.success, false, 'Expected validation to fail for invalid contract');
    assert.ok(result.error.issues.length > 0);

    const issuesPaths = result.error.issues.map((i) => i.path.join('.'));
    // Verify that duration_ms, bytes_in, risk_score, port, protocol, country are caught
    assert.ok(issuesPaths.some((p) => p.includes('duration_ms')));
    assert.ok(issuesPaths.some((p) => p.includes('top_hosts')));
    assert.ok(issuesPaths.some((p) => p.includes('top_ports')));
  });

  await t.test('Gzip compression roundtrip matches contract limits', () => {
    const jsonStr = JSON.stringify(validData);
    const uncompressedBuffer = Buffer.from(jsonStr);
    assert.ok(uncompressedBuffer.length < 512 * 1024, 'Uncompressed exceeds 512 KB limit');

    const compressed = zlib.gzipSync(uncompressedBuffer);
    assert.ok(compressed.length < 128 * 1024, 'Compressed exceeds 128 KB limit');

    const decompressed = zlib.gunzipSync(compressed);
    assert.equal(decompressed.toString('utf8'), jsonStr);
  });

  await t.test('Token SHA-256 hash function is deterministic and matches specs', () => {
    const token = 'sc_device_token_secret_12345';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64, 'SHA-256 hex string must be 64 characters long');
  });

  await t.test('Rate limiter permits burst and drains correctly', () => {
    const testKey = 'test_device_' + Date.now();
    // Burst capacity 5
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(testKey, 60, 5);
      assert.equal(res.allowed, true, `Request ${i} should be allowed`);
    }
    // 6th request should exceed burst capacity
    const exceeded = checkRateLimit(testKey, 60, 5);
    assert.equal(exceeded.allowed, false, 'Should be rate limited after burst');
    assert.ok(exceeded.retryAfterSeconds && exceeded.retryAfterSeconds > 0);
  });
});

// --- Contrato `ot` (M6, E2): los 4 fixtures de docs/contracts/examples/ ---
const examplesDir = path.join(root, 'docs/contracts/examples');
const readExample = (name) =>
  JSON.parse(fs.readFileSync(path.join(examplesDir, name), 'utf8'));
const issuePaths = (result) => result.error.issues.map((i) => i.path.join('.'));

test('Contrato ot (M6 E2): fixtures contra WindowSnapshotSchema', async (t) => {
  const { WindowSnapshotSchema } = await import('../web/lib/schemas/ingest.ts');

  await t.test('0.1.8 sin ot sigue validando: el campo es opcional', () => {
    const result = WindowSnapshotSchema.safeParse(readExample('snapshot-0.1.8-no-ot.json'));
    assert.equal(
      result.success,
      true,
      `Validation failed: ${JSON.stringify(result.error?.issues)}`
    );
    assert.equal(result.data.ot, undefined);
  });

  await t.test('bloque ot válido valida y conserva eventos, protocolos y endpoints', () => {
    const result = WindowSnapshotSchema.safeParse(readExample('snapshot-ot-valid.json'));
    assert.equal(
      result.success,
      true,
      `Validation failed: ${JSON.stringify(result.error?.issues)}`
    );
    assert.equal(result.data.ot.events.length, 2);
    assert.equal(result.data.ot.events[0].rule, 'ot_new_master');
    assert.equal(result.data.ot.protocols[0].name, 'modbus');
    assert.equal(result.data.ot.endpoints[0].port, 502);
    assert.equal(result.data.ot.truncated, false);
  });

  await t.test('bloque ot malformado falla con rutas útiles', () => {
    const result = WindowSnapshotSchema.safeParse(readExample('snapshot-ot-malformed.json'));
    assert.equal(result.success, false);
    const paths = issuePaths(result);
    for (const expected of [
      'ot.engine',
      'ot.capture_mode',
      'ot.truncated',
      'ot.events.0.protocol',
      'ot.events.0.confidence',
      'ot.events.0.evidence',
      'ot.endpoints.0.port',
    ]) {
      assert.ok(
        paths.includes(expected),
        `falta el error en ${expected}: ${JSON.stringify(paths)}`
      );
    }
    assert.ok(
      paths.some((p) => p.startsWith('ot.events.0')),
      `el evento inválido debe señalar su ruta: ${JSON.stringify(paths)}`
    );
  });

  await t.test('bloque ot oversize falla sólo por los topes 8/6/16', () => {
    const fixture = readExample('snapshot-ot-oversize.json');
    assert.equal(fixture.ot.events.length, 9);
    assert.equal(fixture.ot.protocols.length, 7);
    assert.equal(fixture.ot.endpoints.length, 17);

    const result = WindowSnapshotSchema.safeParse(fixture);
    assert.equal(result.success, false);
    const paths = issuePaths(result);
    assert.ok(paths.includes('ot.events'), JSON.stringify(paths));
    assert.ok(paths.includes('ot.protocols'), JSON.stringify(paths));
    assert.ok(paths.includes('ot.endpoints'), JSON.stringify(paths));
    assert.equal(
      result.error.issues.length,
      3,
      `sólo deben fallar los topes: ${JSON.stringify(paths)}`
    );
  });
});
