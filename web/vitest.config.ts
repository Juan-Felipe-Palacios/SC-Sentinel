import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    // PGlite (WASM) tarda en arrancar; con 52 workers en paralelo los hooks
    // beforeAll superan el timeout de 30 s. Cuatro workers mantienen la suite
    // estable sin cambiar ninguna aserción.
    maxWorkers: 4,
  },
});
