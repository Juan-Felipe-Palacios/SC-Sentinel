// scripts/test-migration-ledger.mjs — prueba offline de
// `scripts/verify-migration-ledger.mjs`.
//
// Monta un `web/` temporal con `.sql` de fixture y un módulo falso de
// `@neondatabase/serverless`, ejecuta el checker real como proceso hijo y
// comprueba el código de salida. No abre red, no lee `.env` del repo y no toca
// ninguna base.
//
// Uso: node scripts/test-migration-ledger.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checker = resolve('scripts/verify-migration-ledger.mjs');
const root = mkdtempSync(join(tmpdir(), 'sc-ledger-offline-'));
const migrations = ['0000_init.sql', '0001_next.sql'];

const fakeNeon = `
const ledger = JSON.parse(process.env.FAKE_LEDGER ?? '[]');
export function neon() {
  const sql = (strings) => {
    if (process.env.FAKE_MISSING === '1') {
      return Promise.reject(new Error('relation "sc_schema_migrations" does not exist'));
    }
    const text = strings.join('');
    if (text.includes('sc_schema_migrations')) {
      return Promise.resolve(ledger.map((name) => ({ name })));
    }
    return Promise.resolve([{ n: 13 }]);
  };
  sql.query = async () => ({ rows: [{ n: 13 }] });
  return sql;
}
`;

function prepare(files) {
  const web = join(root, 'web');
  rmSync(web, { recursive: true, force: true });
  for (const dir of [
    join(web, 'lib/db/migrations'),
    join(web, 'node_modules/@neondatabase/serverless'),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(web, 'package.json'), JSON.stringify({ name: 'web', private: true }));
  writeFileSync(
    join(web, 'node_modules/@neondatabase/serverless/package.json'),
    JSON.stringify({
      name: '@neondatabase/serverless',
      version: '0.0.0-offline',
      type: 'module',
      main: 'index.js',
      exports: './index.js',
    })
  );
  writeFileSync(join(web, 'node_modules/@neondatabase/serverless/index.js'), fakeNeon);
  for (const file of files) {
    writeFileSync(join(web, 'lib/db/migrations', file), '-- fixture\n');
  }
  // El `@` sin codificar en la contraseña es deliberado: comprueba que el
  // checker no imprime el userinfo al informar el host.
  writeFileSync(
    join(root, '.env.offline'),
    'DATABASE_URL=postgres://user:s3cr3t@tail@fake.local:5432/test\n'
  );
}

function run(files, ledger, extraEnv = {}) {
  prepare(files);
  return spawnSync(process.execPath, [checker, '--env-file', join(root, '.env.offline')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Vacío para que el script lea el env-file falso y nunca el real.
      DATABASE_URL: '',
      FAKE_LEDGER: JSON.stringify(ledger),
      ...extraEnv,
    },
  });
}

let passed = 0;
let failed = 0;
function expect(name, result, status, needle) {
  const output = `${result.stdout}\n${result.stderr}`;
  const ok = result.status === status && output.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (exit ${result.status}, esperado ${status})`);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(output.trim());
  }
}

try {
  const clean = run(migrations, migrations);
  expect('sin drift → 0', clean, 0, 'sin drift');
  const cleanOutput = `${clean.stdout}\n${clean.stderr}`;
  const hostOnly =
    cleanOutput.includes('destino: fake.local:5432') &&
    !cleanOutput.includes('s3cr3t') &&
    !cleanOutput.includes('tail');
  console.log(`${hostOnly ? 'PASS' : 'FAIL'} no imprime el userinfo del DSN`);
  if (hostOnly) {
    passed++;
  } else {
    failed++;
    console.log(cleanOutput.trim());
  }

  expect('pendiente → 1', run(migrations, ['0000_init.sql']), 1, 'pendientes (1)');
  expect('huérfana → 1', run(['0000_init.sql'], migrations), 1, 'huérfanas en el ledger (1)');
  expect(
    'ledger ilegible → 1',
    run(migrations, migrations, { FAKE_MISSING: '1' }),
    1,
    'no se pudo leer sc_schema_migrations'
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} prueba(s) fallaron`);
  process.exit(1);
}
console.log(`\nprueba offline: ${passed}/5`);
