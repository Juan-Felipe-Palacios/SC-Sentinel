// scripts/test-migrations-journal.mjs — prueba offline de
// `scripts/check-migrations-journal.mjs`.
//
// Monta árboles de migraciones temporales (journal + `.sql`), ejecuta el
// checker real como proceso hijo y comprueba el código de salida y el mensaje.
// No lee el directorio de migraciones del repo ni abre red.
//
// Uso: node scripts/test-migrations-journal.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checker = resolve('scripts/check-migrations-journal.mjs');
const root = mkdtempSync(join(tmpdir(), 'sc-journal-offline-'));
const dir = join(root, 'migrations');

function entry(idx, tag) {
  return { idx, version: '7', when: 1000 + idx, tag, breakpoints: true };
}

function prepare({ entries, files, withJournal = true }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'meta'), { recursive: true });
  if (withJournal) {
    writeFileSync(
      join(dir, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries }, null, 2)
    );
  }
  for (const file of files) {
    writeFileSync(join(dir, file), '-- fixture\n');
  }
}

function run() {
  return spawnSync(process.execPath, [checker, '--dir', dir], { encoding: 'utf8' });
}

let passed = 0;
let failed = 0;
function expect(name, fixture, status, needle) {
  prepare(fixture);
  const result = run();
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

const cleanEntries = [entry(0, '0000_init'), entry(1, '0001_next')];
const cleanFiles = ['0000_init.sql', '0001_next.sql'];

try {
  expect('journal y archivos coinciden → 0', { entries: cleanEntries, files: cleanFiles }, 0, 'coinciden (2');
  expect(
    'migración fuera del journal → 1',
    { entries: cleanEntries, files: [...cleanFiles, '0002_suelta.sql'] },
    1,
    'sql_fuera_del_journal'
  );
  expect(
    'entrada del journal sin archivo → 1',
    { entries: [...cleanEntries, entry(2, '0002_falta')], files: cleanFiles },
    1,
    'journal_sin_sql'
  );
  expect(
    'idx duplicado → 1',
    { entries: [entry(0, '0000_init'), entry(1, '0001_a'), entry(1, '0001_b')], files: [...cleanFiles, '0001_a.sql', '0001_b.sql'] },
    1,
    'idx_duplicado'
  );
  expect(
    'tag desalineado con su idx → 1',
    { entries: [entry(0, '0000_init'), entry(1, '0007_next')], files: ['0000_init.sql', '0007_next.sql'] },
    1,
    'tag_desalineado'
  );
  expect(
    'journal ilegible → 1',
    { entries: cleanEntries, files: cleanFiles, withJournal: false },
    1,
    'journal_ilegible'
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} prueba(s) fallaron`);
  process.exit(1);
}
console.log(`\nprueba offline: ${passed}/6`);
