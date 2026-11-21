import { defineConfig, devices } from '@playwright/test';

const db = process.env.E2E_DATABASE_URL ?? 'postgresql://konzia:konzia@localhost:5432/konzia_test';

/**
 * Parcours de bout en bout : API compilée + Next.js en mode dev (qui relaie /api vers l'API).
 * Prérequis : `pnpm build` à la racine, PostgreSQL et Redis démarrés.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:3100', trace: 'off', locale: 'fr-FR' },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:3101/api/health',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        API_PORT: '3101',
        APP_URL: 'http://localhost:3100',
        DATABASE_URL: db,
        APP_DATABASE_URL:
          process.env.E2E_APP_DATABASE_URL ??
          'postgresql://konzia_app:konzia_app@localhost:5432/konzia_test',
        REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/2',
        HASH_SALT: 'e2e-salt-e2e-salt-e2e-salt-e2e-salt',
        EMAIL_TRANSPORT: 'fake',
        PRODUCT_FETCHER: 'fake',
        FILES_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
        FILE_STORAGE_DIR: '/tmp/konzia-e2e-storage',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm exec next dev --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_ORIGIN: 'http://localhost:3101' },
    },
  ],
});
