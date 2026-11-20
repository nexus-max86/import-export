import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Applique les migrations sur la base de test avant la suite. */
export default function setup(): void {
  const url = process.env.DATABASE_URL ?? 'postgresql://konzia:konzia@localhost:5432/konzia_test';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
