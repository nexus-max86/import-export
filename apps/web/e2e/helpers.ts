import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** API visée : dev (3101) par défaut ; pile de production via E2E_API (ex. https://app.localhost). */
export const API = process.env.E2E_API ?? 'http://localhost:3101';
const MAILPIT = process.env.E2E_MAILPIT;

/**
 * Texte du dernier e-mail reçu par `to` : boîte factice de l'API en dev, ou serveur SMTP de test
 * (Mailpit) quand la pile de production est testée.
 */
export async function lastMailText(request: APIRequestContext, to: string): Promise<string> {
  if (!MAILPIT) {
    const res = await request.get(`${API}/api/_dev/outbox?to=${encodeURIComponent(to)}`);
    return (await res.json()).text as string;
  }
  for (let i = 0; i < 40; i++) {
    const res = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const found = (await res.json()) as { messages: { ID: string }[] };
    if (found.messages?.length) {
      const msg = await request.get(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`);
      return ((await msg.json()) as { Text: string }).Text;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun e-mail reçu pour ${to}`);
}
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
  const token = (await lastMailText(request, email)).match(/jeton=([\w-]+)/)![1] as string;
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

/**
 * Capture d'écran nommée, seulement si E2E_SHOTS (dossier) est fourni : visite guidée de l'application.
 * E2E_SHOT_WIDTHS="390,768,1440" capture aussi chaque écran à ces largeurs (contrôle du responsive).
 */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const widths = (process.env.E2E_SHOT_WIDTHS ?? '').split(',').map(Number).filter(Boolean);
  if (widths.length === 0) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    return;
  }
  const initial = page.viewportSize();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true, scale: 'css' });
  }
  if (initial) await page.setViewportSize(initial);
}
