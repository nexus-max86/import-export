import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:3101';
export const PASSWORD = 'motdepasse-solide-42';
const CSRF = { 'x-konzia-csrf': '1' };

/** Crée un compte vérifié par l'API (lien lu dans la boîte d'envoi factice). */
export async function verifiedAccount(request: APIRequestContext, name: string): Promise<string> {
  const email = `${name.toLowerCase()}.${Date.now()}@example.test`;
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
