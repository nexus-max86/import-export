import { expect, test } from '@playwright/test';
import { login, verifiedAccount } from './helpers';

test('un commissionnaire ajoute un client géré, qui réclame ensuite sa fiche', async ({
  browser,
  request,
}) => {
  const proEmail = await verifiedAccount(request, 'Kaseba');
  const clientEmail = await verifiedAccount(request, 'Patrick');

  // --- Commissionnaire ---
  const pro = await browser.newPage();
  await pro.goto('/connexion?suite=/pro');
  await login(pro, proEmail);
  await expect(pro.getByRole('heading', { name: 'Espace professionnel' })).toBeVisible();
  await pro.getByLabel('Nom commercial').fill('Kaseba Import');
  await pro.getByRole('button', { name: 'Créer mon espace' }).click();

  await expect(pro.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await pro.getByRole('button', { name: 'Ajouter un client' }).click();
  await pro.getByLabel('Nom complet').fill('Patrick Mbuyi');
  await pro.getByLabel('Numéro WhatsApp').fill('081 234 5678');
  await pro.getByLabel('Note interne (jamais visible du client)').fill('Client fidèle');
  await pro.getByRole('button', { name: 'Enregistrer le client' }).click();
  await expect(pro.getByText('Patrick Mbuyi ajouté.')).toBeVisible();
  await expect(pro.getByText('Client géré')).toBeVisible();
  await expect(pro.getByText('+243812345678')).toBeVisible();

  await pro.getByRole('button', { name: 'Inviter Patrick Mbuyi à suivre ses commandes' }).click();
  await expect(pro.getByRole('link', { name: 'Envoyer sur WhatsApp' })).toHaveAttribute(
    'href',
    /wa\.me\/243812345678/,
  );
  const link = (await pro.locator('p.font-mono').textContent())?.trim() ?? '';
  expect(link).toContain('/reclamer?jeton=');

  // --- Client, sur son propre téléphone ---
  const client = await browser.newPage();
  await client.goto(new URL(link).pathname + new URL(link).search);
  await client.getByRole('button', { name: 'Relier ma fiche à mon compte' }).click();
  await client.getByRole('link', { name: 'Se connecter' }).click();
  await login(client, clientEmail);
  await expect(
    client.getByRole('heading', { name: 'Suivre vos commandes sur Konzia' }),
  ).toBeVisible();
  await client.getByRole('button', { name: 'Relier ma fiche à mon compte' }).click();
  await expect(
    client.getByText('votre fiche chez Kaseba Import est reliée à votre compte'),
  ).toBeVisible();

  // --- Le commissionnaire voit que le client a maintenant un compte ---
  await pro.reload();
  await expect(pro.getByText('Compte Konzia')).toBeVisible();
});
