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

  // Vérification : RCCM + pièce d'identité, puis envoi du dossier.
  await pro.getByRole('link', { name: 'Profil et vérification' }).click();
  const pdf = {
    name: 'rccm.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  };
  await pro.getByLabel('Envoyer : RCCM (registre du commerce)').setInputFiles(pdf);
  await expect(pro.getByText('rccm.pdf')).toBeVisible();
  await pro
    .getByLabel(/Envoyer : Pièce d’identité/)
    .setInputFiles({ ...pdf, name: 'carte-electeur.pdf' });
  await expect(pro.getByText('carte-electeur.pdf')).toBeVisible();
  await pro.getByRole('button', { name: 'Envoyer mon dossier' }).click();
  await expect(pro.getByText('Dossier en cours d’examen par l’équipe Konzia.')).toBeVisible();
  await pro.getByRole('link', { name: 'Clients' }).click();
  await expect(pro.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await pro.getByRole('button', { name: 'Ajouter un client' }).click();
  await pro.getByLabel('Nom complet').fill('Patrick Mbuyi');
  await pro.getByLabel('Numéro WhatsApp').fill('081 234 5678');
  await pro.getByLabel('Note interne (jamais visible du client)').fill('Client fidèle');
  await pro.getByRole('button', { name: 'Enregistrer le client' }).click();
  await expect(pro.getByText('Patrick Mbuyi ajouté.')).toBeVisible();
  await expect(pro.getByText('Client géré')).toBeVisible();
  await expect(pro.getByText('+243 81 234 5678')).toBeVisible();

  await pro.getByRole('button', { name: 'Inviter Patrick Mbuyi à suivre ses commandes' }).click();
  await expect(pro.getByRole('link', { name: 'Envoyer sur WhatsApp' })).toHaveAttribute(
    'href',
    /wa\.me\/243812345678/,
  );
  const link = (await pro.locator('p.font-mono').textContent())?.trim() ?? '';
  expect(link).toContain('/reclamer?jeton=');

  // Import Excel (CSV « Excel français ») : aperçu puis confirmation.
  await pro.getByRole('button', { name: 'Importer depuis Excel' }).click();
  await pro.getByLabel('Choisir le fichier de clients').setInputFiles({
    name: 'clients.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Nom;Téléphone;Commune\nGrace Ilunga;0997001122;Kenya\nDoublon;081 234 5678;\n',
    ),
  });
  await expect(pro.getByText('1 client(s) à importer · 1 doublon(s) ignoré(s)')).toBeVisible();
  await pro.getByRole('button', { name: 'Importer 1 client(s)' }).click();
  await expect(pro.getByText('1 client(s) importé(s), 1 ligne(s) ignorée(s).')).toBeVisible();
  await expect(pro.getByText('Grace Ilunga', { exact: true })).toBeVisible();

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

  // --- Équipe : inviter un acheteur ---
  await pro.getByRole('link', { name: 'Équipe', exact: true }).click();
  await pro.getByLabel('Adresse e-mail').fill(`acheteur.${Date.now()}@example.test`);
  await pro.getByRole('radio', { name: /^Acheteur/ }).check();
  await pro.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await expect(pro.getByText(/^Invitation envoyée à acheteur\./)).toBeVisible();
});
