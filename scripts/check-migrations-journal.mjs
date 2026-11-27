// scripts/check-migrations-journal.mjs — comprueba que los `.sql` de
// `web/lib/db/migrations` y las entradas de `meta/_journal.json` sean el mismo
// conjunto, en el mismo orden. SÓLO LECTURA: no aplica, no crea ni borra nada.
//
// Motivo: `migrate()` de Drizzle (la siembra local y las pruebas de
// integración) aplica únicamente lo que el journal nombra, mientras que el
// runner recorría el directorio. Un `.sql` fuera del journal se aplicaba en
// producción y no en PGlite: dos esquemas distintos según el camino. Este
// checker es el gate que impide que eso vuelva a pasar en silencio.
//
// Uso:
//   node scripts/check-migrations-journal.mjs
//   node scripts/check-migrations-journal.mjs --dir web/lib/db/migrations
//
// Sale con 0 si coinciden y con 1 si hay una migración fuera del journal, una
// entrada sin archivo, índices duplicados o fuera de orden, o tags
// desalineados con su índice.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DIR = fileURLToPath(new URL('../web/lib/db/migrations', import.meta.url));

/**
 * Compara el directorio de migraciones con su journal.
 * @param {{ dir?: string }} [options]
 * @returns {{ ok: boolean, problems: { code: string, message: string }[], journalCount: number, fileCount: number, tags: string[] }}
 */
export function checkMigrationsJournal({ dir = DEFAULT_DIR } = {}) {
  const empty = () => ({ ok: false, problems: [], journalCount: 0, fileCount: 0, tags: [] });

  let journal;
  try {
    journal = JSON.parse(readFileSync(resolve(dir, 'meta', '_journal.json'), 'utf8'));
  } catch (error) {
    const result = empty();
    result.problems.push({
      code: 'journal_ilegible',
      message: `no se pudo leer meta/_journal.json en ${dir}: ${error.message}`,
    });
    return result;
  }

  let files;
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
  } catch (error) {
    const result = empty();
    result.problems.push({ code: 'directorio_ilegible', message: `no se pudo leer ${dir}: ${error.message}` });
    return result;
  }

  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const tags = entries.map((entry) => String(entry?.tag ?? ''));
  const problems = [];
  const journalTags = new Set(tags.filter(Boolean));
  const fileTags = new Set(files.map((name) => name.slice(0, -'.sql'.length)));

  for (const file of files) {
    const tag = file.slice(0, -'.sql'.length);
    if (!journalTags.has(tag)) {
      problems.push({
        code: 'sql_fuera_del_journal',
        message: `${file} está en el directorio pero no en meta/_journal.json: \`migrate()\` no la aplicaría, así que el esquema diverge entre la siembra local y producción`,
      });
    }
  }

  const seenIdx = new Set();
  entries.forEach((entry, position) => {
    const tag = String(entry?.tag ?? '');
    if (!tag) {
      problems.push({ code: 'entrada_sin_tag', message: `la entrada en la posición ${position} no tiene tag` });
      return;
    }
    if (!fileTags.has(tag)) {
      problems.push({
        code: 'journal_sin_sql',
        message: `el journal declara ${tag} pero falta ${tag}.sql en el directorio`,
      });
    }
    if (seenIdx.has(entry.idx)) {
      problems.push({ code: 'idx_duplicado', message: `idx ${entry.idx} repetido (${tag})` });
    }
    seenIdx.add(entry.idx);
    if (entry.idx !== position) {
      problems.push({
        code: 'idx_fuera_de_orden',
        message: `${tag} declara idx ${entry.idx} en la posición ${position}`,
      });
    }
    if (tag.split('_')[0] !== String(entry.idx).padStart(4, '0')) {
      problems.push({ code: 'tag_desalineado', message: `${tag} no coincide con su idx ${entry.idx}` });
    }
  });

  if (journalTags.size !== tags.length) {
    problems.push({ code: 'tag_duplicado', message: 'hay tags repetidos en el journal' });
  }

  return { ok: problems.length === 0, problems, journalCount: entries.length, fileCount: files.length, tags };
}

function main() {
  const index = process.argv.indexOf('--dir');
  const dir = index === -1 ? DEFAULT_DIR : resolve(process.argv[index + 1] ?? DEFAULT_DIR);
  const result = checkMigrationsJournal({ dir });

  console.log(`directorio: ${dir}`);
  console.log(`journal: ${result.journalCount} entradas; archivos .sql: ${result.fileCount}`);
  for (const problem of result.problems) {
    console.error(`FALLO [${problem.code}] ${problem.message}`);
  }

  if (!result.ok) {
    console.error('journal inconsistente: corregí meta/_journal.json antes de aplicar migraciones.');
    process.exit(1);
  }

  console.log(`ok: journal y directorio coinciden (${result.journalCount} migraciones)`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href.toLowerCase() : '';
if (invokedPath === import.meta.url.toLowerCase()) {
  main();
}
