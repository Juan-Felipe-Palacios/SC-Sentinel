// Captura supervisada del dashboard real.
// Requiere: pnpm add -D playwright-core en web/ (o PLAYWRIGHT_CORE_PATH).
// El propietario inicia sesión manualmente; este script no pide ni guarda credenciales.
//
// Uso:
//   node docs/qa/scripts/captura-dashboard.mjs
//   APP_URL=https://sc-sentinel.vercel.app BROWSER_PATH="C:\...\msedge.exe" node ...
//
// Salida: docs/evidence/dashboard-<marca>/shot-*.png y texto.json

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const requireFromWeb = createRequire(new URL('../../../web/package.json', import.meta.url));
const playwright = process.env.PLAYWRIGHT_CORE_PATH
  ? createRequire(path.resolve(process.env.PLAYWRIGHT_CORE_PATH, 'package.json'))('playwright-core')
  : requireFromWeb('playwright-core');

const { chromium } = playwright;

const APP_URL = (process.env.APP_URL ?? 'https://sc-sentinel.vercel.app').replace(/\/$/, '');
const BROWSER_PATH =
  process.env.BROWSER_PATH ??
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find((candidate) => existsSync(candidate));

const ROUTES = [
  '/dashboard/overview',
  '/dashboard/hosts',
  '/dashboard/alerts',
  '/dashboard/ai',
];

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '390', width: 390, height: 844 },
];

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

async function main() {
  if (!BROWSER_PATH) {
    throw new Error('No se encontró Edge/Chrome. Definí BROWSER_PATH.');
  }

  const outDir = path.resolve('docs/evidence', `dashboard-${stamp()}`);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    executablePath: BROWSER_PATH,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const rl = readline.createInterface({ input, output });
  try {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    console.log('\nSe abrió el navegador. Iniciá sesión manualmente.');
    console.log('No escribas credenciales en esta terminal; usá la ventana del navegador.');
    await rl.question('Cuando estés dentro del dashboard, pulsá Enter... ');

    if (!page.url().includes('/dashboard')) {
      throw new Error(`La sesión no está en /dashboard (URL actual: ${page.url()}). Abortado.`);
    }

    const results = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        await page.goto(`${APP_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const slug = route.replace(/^\/dashboard\//, '').replace(/\//g, '-');
        const file = path.join(outDir, `shot-${slug}-${viewport.label}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const text = (await page.locator('body').innerText()).slice(0, 20000);
        results.push({ route, viewport: viewport.label, url: page.url(), file, text });
        console.log(`OK ${route} @ ${viewport.label}px`);
      }
    }

    await writeFile(
      path.join(outDir, 'texto.json'),
      JSON.stringify({ app: APP_URL, capturedAt: new Date().toISOString(), results }, null, 2),
      'utf8'
    );
    console.log(`\nCapturas y texto en: ${outDir}`);
    console.log('Ese directorio está ignorado por git; puede contener IPs de clase C.');
  } finally {
    rl.close();
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
