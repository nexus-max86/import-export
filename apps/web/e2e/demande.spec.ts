import { expect, test } from '@playwright/test';
import { approveOrgInDb, createOrgViaApi, login, verifiedAccount } from './helpers';

test('un client envoie une demande ; le commissionnaire la reçoit et l’ouvre', async ({
  browser,
  playwright,
}) => {
  const suffix = Date.now();
  const orgName = `Kaseba Import ${suffix}`;
  const setup = await playwright.request.newContext();
  const proEmail = await verifiedAccount(setup, 'Kaseba');
  await createOrgViaApi(setup, proEmail, orgName);
  approveOrgInDb(orgName);
  const clientEmail = await verifiedAccount(setup, 'Ruth');
  await setup.dispose();

  // --- Client : profil (ville), puis demande ---
  const client = await browser.newPage();
  await client.goto('/connexion?suite=/compte/profil');
  await login(client, clientEmail);
  await client.locator('#profile-city').selectOption({ label: 'Lubumbashi' });
  await client.getByRole('button', { name: 'Enregistrer le profil' }).click();
  await expect(client.getByText('Profil enregistré.')).toBeVisible();

  await client.goto('/demande');
  await client
    .getByLabel('Lien du produit')
    .fill('Regarde https://fr.shein.com/Robe-Midi-p-2814455.html?utm_source=wa');
  await client.getByRole('button', { name: 'Lire le lien' }).click();
  await expect(client.getByText('SHEIN reconnu')).toBeVisible();
  await expect(client.getByText('Prix indicatif')).toBeVisible();
  await client.getByLabel('Taille').fill('M');
  await client.getByLabel('Quantité').fill('2');
  await client.getByRole('button', { name: 'Ajouter à ma demande' }).click();
  await expect(client.getByText('Article ajouté à votre demande.')).toBeVisible();

  await client.getByRole('button', { name: 'Pas de lien ? Décrire l’article à la main' }).click();
  await client.getByLabel('Nom de l’article').fill('Organiseur de cuisine en bambou');
  await client.getByRole('button', { name: 'Ajouter à ma demande' }).click();
  await expect(client.getByRole('heading', { name: 'Articles (2)' })).toBeVisible();

  await client.getByRole('checkbox', { name: new RegExp(orgName) }).check();
  await client.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(client.getByRole('heading', { name: /Demande du/ })).toBeVisible();
  await expect(client.getByText('Envoyée').first()).toBeVisible();

  // --- Commissionnaire ---
  const pro = await browser.newPage();
  await pro.goto('/connexion?suite=/pro');
  await login(pro, proEmail);
  await pro.getByRole('button', { name: new RegExp(orgName) }).click();
  await pro.getByRole('link', { name: 'Demandes', exact: true }).click();
  await expect(pro.getByText('À traiter (1)')).toBeVisible();
  await pro.getByRole('link', { name: /Ruth/ }).click();
  await expect(pro.getByText('Robe midi plissée à col montant (exemple)')).toBeVisible();
  await expect(pro.getByText('Organiseur de cuisine en bambou')).toBeVisible();
  await expect(pro.getByText('Lue')).toBeVisible();

  // Le client voit que sa demande a été lue.
  await client.reload();
  await expect(client.getByText('Lue')).toBeVisible();

  // --- Demande saisie pour un client géré (reçue par WhatsApp) ---
  await pro.getByRole('link', { name: 'Clients' }).click();
  await pro.getByRole('button', { name: 'Ajouter un client' }).click();
  await pro.getByLabel('Nom complet').fill('Patrick Mbuyi');
  await pro.getByLabel('Numéro WhatsApp').fill('081 234 5678');
  await pro.getByRole('button', { name: 'Enregistrer le client' }).click();
  await expect(pro.getByText('Patrick Mbuyi ajouté.')).toBeVisible();
  await pro.getByRole('link', { name: 'Demandes', exact: true }).click();
  await pro.getByRole('button', { name: 'Nouvelle demande pour un client' }).click();
  await pro.getByLabel('Client', { exact: true }).selectOption({ label: 'Patrick Mbuyi' });
  await pro.getByLabel('Article', { exact: true }).fill('Chaussures de sécurité');
  await pro.getByLabel('Quantité').fill('3');
  await pro.getByRole('button', { name: 'Créer la demande' }).click();
  await expect(pro.getByRole('heading', { name: 'Patrick Mbuyi' })).toBeVisible();
  await expect(pro.getByText('En cours d’évaluation')).toBeVisible();
});
