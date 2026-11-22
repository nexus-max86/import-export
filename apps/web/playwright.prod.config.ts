import { defineConfig, devices } from '@playwright/test';

/**
 * Recette sur la pile de PRODUCTION (images Docker derrière Caddy en HTTPS), sans serveurs de dev.
 *   E2E_BASE_URL=https://app.localhost E2E_API=https://app.localhost \
 *   E2E_MAILPIT=http://localhost:8025 E2E_DATABASE_URL=postgresql://… pnpm exec playwright test -c playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://app.localhost',
    ignoreHTTPSErrors: true,
    trace: 'off',
    locale: 'fr-FR',
    screenshot: 'off',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
});
