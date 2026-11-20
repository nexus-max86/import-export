import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC est nécessaire pour les métadonnées de décorateurs utilisées par NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Les tests d'intégration partagent une base : pas de parallélisme entre fichiers.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
