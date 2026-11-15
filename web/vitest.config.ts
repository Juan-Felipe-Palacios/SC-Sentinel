import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Transform JSX real para los tests de componentes: Next exige "jsx":
  // "preserve" en tsconfig y ese valor rompe el parse de esbuild.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'components/**/*.test.ts'],
    // PGlite (WASM) tarda en arrancar; con 52 workers en paralelo los hooks
    // beforeAll superan el timeout de 30 s. Cuatro workers mantienen la suite
    // estable sin cambiar ninguna aserción.
    maxWorkers: 4,
  },
});
