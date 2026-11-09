// scripts/trust-smoke.mjs — smoke test Trust Page: crear → ver → rotar → revocar
// Requiere dev server en http://localhost:3000 (pnpm dev, NODE_ENV=development sin ADMIN_SECRET = admin dev).
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const DEVICE = process.env.SMOKE_DEVICE ?? 'dev_63a7ecf58718704d';
const LABEL = `smoke-${Date.now()}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return res;
}

try {
  // 1. Crear
  const createRes = await fetch(`${BASE}/api/trust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: DEVICE, label: LABEL }),
  });
  const created = await createRes.json().catch(() => ({}));
  check('POST /api/trust → 200', createRes.status === 200 && created.id && created.token, `status=${createRes.status}`);
  if (!created.token) throw new Error('sin token, aborto');
  const id = created.id;
  const token1 = created.token;

  // 2. Página pública con token1 → 200
  const page1 = await get(`/p/${token1}`);
  check('GET /p/<token1> → 200', page1.status === 200, `status=${page1.status}`);

  // 3. Rotar
  const rotateRes = await fetch(`${BASE}/api/trust/${id}/rotate`, { method: 'POST' });
  const rotated = await rotateRes.json().catch(() => ({}));
  check('POST /api/trust/<id>/rotate → 200 + token nuevo', rotateRes.status === 200 && rotated.token && rotated.token !== token1, `status=${rotateRes.status}`);
  const token2 = rotated.token;

  // 4. Token viejo revocado → 404 (si rotar devolvió token)
  if (token2) {
    const oldPage = await get(`/p/${token1}`);
    check('GET /p/<token1> tras rotar → 404', oldPage.status === 404, `status=${oldPage.status}`);
    const newPage = await get(`/p/${token2}`);
    check('GET /p/<token2> tras rotar → 200', newPage.status === 200, `status=${newPage.status}`);
  }

  // 5. Revocar
  const deleteRes = await fetch(`${BASE}/api/trust?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const deleted = await deleteRes.json().catch(() => ({}));
  check('DELETE /api/trust?id=<id> → ok', deleteRes.status === 200 && deleted.ok === true, `status=${deleteRes.status}`);

  // 6. Tras revocar → 404
  if (token2) {
    const revokedPage = await get(`/p/${token2}`);
    check('GET /p/<token2> tras revocar → 404', revokedPage.status === 404, `status=${revokedPage.status}`);
  }

  // 7. La página admin de accesos responde (compila)
  const access = await get('/api/trust/access');
  check('GET /api/trust/access → 200', access.status === 200, `status=${access.status}`);
} catch (error) {
  console.error('ERROR fatal:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
if (failed > 0 || results.length === 0) process.exitCode = 1;
