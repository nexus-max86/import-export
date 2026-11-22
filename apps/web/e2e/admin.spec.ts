import { expect, test } from '@playwright/test';
import {
  shot,
  createOrgViaApi,
  login,
  makeAdminInDb,
  submitVerificationViaApi,
  totp,
  verifiedAccount,
} from './helpers';

test('écran 10 : un administrateur active sa MFA puis approuve un commissionnaire', async ({
  page,
  playwright,
}) => {
  test.setTimeout(120_000);
  const orgName = `Mwamba Express ${Date.now()}`;
  const setup = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  const proEmail = await verifiedAccount(setup, 'Mwamba');
  await createOrgViaApi(setup, proEmail, orgName);
  await submitVerificationViaApi(setup, orgName);
  const adminEmail = await verifiedAccount(setup, 'Admin');
  makeAdminInDb(adminEmail);
  await setup.dispose();

  // Sans double authentification, la console renvoie vers la page de sécurité.
  await page.goto('/connexion?suite=/admin');
  await login(page, adminEmail);
  // Renvoi automatique vers la page de sécurité (première compilation de la page en dev : délai large).
  await expect(page.getByRole('heading', { name: 'Double authentification' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Activer la double authentification' }).click();
  const secret = (await page.getByLabel('Clé secrète').textContent())!.replace(/\s/g, '');
  await page.getByLabel('Code à 6 chiffres').fill(totp(secret));
  await page.getByRole('button', { name: 'Activer' }).click();
  await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
  await shot(page, '14-admin-vue-globale');

  // Dossier à vérifier → fiche → pièces → approbation.
  await page.getByRole('link', { name: 'Commissionnaires', exact: true }).click();
  await page.getByLabel('Afficher').selectOption({ label: 'Dossiers à vérifier' });
  await page.getByRole('link', { name: orgName }).click();
  await expect(page.getByText('RCCM (registre du commerce)', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Approuver' }).click();
  await expect(page.getByText('Décision enregistrée et notifiée au responsable.')).toBeVisible();
  await shot(page, '15-admin-ecran-10');
  await expect(page.getByText('Approuvé', { exact: false }).first()).toBeVisible();

  // Le journal montre la décision.
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByText('admin.organization_approved').first()).toBeVisible();
});
