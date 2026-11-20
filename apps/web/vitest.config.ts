import { defineConfig } from 'vitest/config';

// Les tests de bout en bout (e2e/) sont lancés par Playwright, pas par Vitest.
export default defineConfig({ test: { include: ['src/**/*.test.{ts,tsx}'] } });
