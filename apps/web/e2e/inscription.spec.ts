import { expect, test } from '@playwright/test';

test('un client s’inscrit, confirme son e-mail et gère ses appareils', async ({
  page,
  request,
}) => {
  const email = `ruth.${Date.now()}@example.test`;
  const password = 'motdepasse-solide-42';

  await page.goto('/inscription');
  await page.getByLabel('Nom').fill('Ruth Kabeya');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByLabel(/J’accepte les conditions/).check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte e-mail' })).toBeVisible();

  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Ruth Kabeya' })).toBeVisible();
  await expect(page.getByText(/Confirmez votre adresse/)).toBeVisible();

  // Lien reçu par e-mail (boîte d'envoi factice, disponible seulement hors production).
  const mail = await request.get(
    `http://localhost:3101/api/_dev/outbox?to=${encodeURIComponent(email)}`,
  );
  const link = (await mail.json()).text.match(/http\S+jeton=\S+/)[0] as string;
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByText('Votre adresse est confirmée')).toBeVisible();

  await page.getByRole('link', { name: 'Aller à mon compte' }).click();
  await expect(page.getByText('cet appareil')).toBeVisible();
  await expect(page.getByText(/Confirmez votre adresse/)).toHaveCount(0);

  // Profil : numéro WhatsApp normalisé et première adresse de livraison.
  await page.getByRole('link', { name: /Profil et adresses/ }).click();
  await page.getByLabel('Numéro WhatsApp').fill('081 000 0000');
  await page.locator('#profile-city').selectOption({ label: 'Lubumbashi' });
  await page.locator('#profile-zone').selectOption({ label: 'Kampemba' });
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();
  await expect(page.getByLabel('Numéro WhatsApp')).toHaveValue('+243810000000');

  await page.getByLabel('Nom de l’adresse').fill('Maison');
  await page.locator('#addr-new-zone').selectOption({ label: 'Kampemba' });
  await page.getByLabel('Avenue et numéro').fill('Av. Lumumba 12');
  await page.getByLabel('Point de repère (facultatif)').fill('En face de la paroisse');
  await page.getByRole('button', { name: 'Ajouter l’adresse' }).click();
  await expect(page.getByText('Adresse ajoutée.')).toBeVisible();
  await expect(page.getByText('Par défaut', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '← Mon compte' }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});

test('une erreur de saisie est expliquée sans recharger la page', async ({ page }) => {
  await page.goto('/inscription');
  await page.getByLabel('Mot de passe').fill('court');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByText('Au moins 10 caractères.')).toBeVisible();
  await expect(page.getByText('Vous devez accepter les conditions.')).toBeVisible();
});
