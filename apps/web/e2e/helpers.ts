import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:3101';
export const PASSWORD = 'motdepasse-solide-42';
const CSRF = { 'x-konzia-csrf': '1' };

/** Crée un compte vérifié par l'API (lien lu dans la boîte d'envoi factice). */
export async function verifiedAccount(request: APIRequestContext, name: string): Promise<string> {
  const email = `${name.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await request.post(`${API}/api/auth/register`, {
    headers: CSRF,
    data: { email, password: PASSWORD, displayName: name, acceptTerms: true },
  });
  expect(res.status()).toBe(201);
  const mail = await request.get(`${API}/api/_dev/outbox?to=${encodeURIComponent(email)}`);
  const token = (await mail.json()).text.match(/jeton=([\w-]+)/)[1] as string;
  expect(
    (
      await request.post(`${API}/api/auth/verify-email`, { headers: CSRF, data: { token } })
    ).status(),
  ).toBe(204);
  return email;
}

export async function login(page: Page, email: string): Promise<void> {
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://konzia:konzia@localhost:5432/konzia_test';

/** Approuve une organisation directement en base (raccourci : le parcours admin a son propre test). */
export function approveOrgInDb(name: string): void {
  execFileSync('psql', [
    DB,
    '-qc',
    `UPDATE organizations SET status = 'approved', verified_at = now() WHERE name = '${name.replace(/'/g, "''")}'`,
  ]);
}

/** Crée une activité de commissionnaire par l'API, connecté avec `request` (cookies partagés). */
export async function createOrgViaApi(
  request: APIRequestContext,
  email: string,
  name: string,
): Promise<void> {
  expect(
    (
      await request.post(`${API}/api/auth/login`, {
        headers: CSRF,
        data: { email, password: PASSWORD },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await request.post(`${API}/api/organizations`, {
        headers: CSRF,
        data: { name, type: 'independent' },
      })
    ).status(),
  ).toBe(201);
}

/** Donne le rôle d'administrateur de la plateforme à un compte (aucun écran ne le fait, volontairement). */
export function makeAdminInDb(email: string): void {
  execFileSync('psql', [
    DB,
    '-qc',
    `UPDATE users SET platform_role = 'admin' WHERE email = '${email.replace(/'/g, "''")}'`,
  ]);
}

/** Code TOTP actuel (RFC 6238) pour une clé base32, comme l'application du téléphone. */
export function totp(base32: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of base32.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Envoie le dossier de vérification (RCCM + pièce d'identité) de l'activité active du compte. */
export async function submitVerificationViaApi(request: APIRequestContext, orgName: string) {
  const orgs = await (await request.get(`${API}/api/organizations/mine`)).json();
  const org = (orgs as { organizationId?: string; id?: string; name: string }[]).find(
    (o) => o.name === orgName,
  )!;
  const orgId = org.organizationId ?? org.id!;
  const pdf = Buffer.from('%PDF-1.4\n% dossier e2e\n%%EOF\n');
  for (const kind of ['rccm', 'identity']) {
    const res = await request.post(`${API}/api/org/verification/documents`, {
      headers: { ...CSRF, 'x-konzia-org': orgId },
      multipart: { kind, file: { name: `${kind}.pdf`, mimeType: 'application/pdf', buffer: pdf } },
    });
    expect(res.status()).toBe(201);
  }
  expect(
    (
      await request.post(`${API}/api/org/verification/submit`, {
        headers: { ...CSRF, 'x-konzia-org': orgId },
      })
    ).status(),
  ).toBe(201);
}
