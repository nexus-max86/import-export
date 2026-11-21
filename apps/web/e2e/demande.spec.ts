import { expect, test } from '@playwright/test';
import { approveOrgInDb, createOrgViaApi, login, verifiedAccount } from './helpers';

test('un client envoie une demande ; le commissionnaire la reçoit et l’ouvre', async ({
  browser,
  playwright,
}) => {
  // Parcours long : demande → devis → commande → ajustement → client géré.
  test.setTimeout(240_000);
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
  await expect(pro.getByRole('link', { name: 'Notifications, 1 non lue(s)' })).toBeVisible();
  await pro.getByRole('link', { name: /Ruth/ }).click();
  await expect(pro.getByText('Robe midi plissée à col montant (exemple)')).toBeVisible();
  await expect(pro.getByText('Organiseur de cuisine en bambou')).toBeVisible();
  await expect(pro.getByText('Lue')).toBeVisible();

  // Le client voit que sa demande a été lue.
  await client.reload();
  await expect(client.getByText('Lue')).toBeVisible();

  // --- Devis : pré-rempli, complété, envoyé (version figée) ---
  await pro.getByRole('button', { name: 'Préparer le devis' }).click();
  await expect(pro.getByRole('heading', { name: 'Devis · version 1' })).toBeVisible();
  const prices = pro.getByLabel('Prix unitaire (USD)');
  await prices.nth(0).fill('15,49');
  await prices.nth(1).fill('8,00');
  await prices.nth(2).fill('9,74');
  await prices.nth(3).fill('28,56');
  await prices.nth(4).fill('9,00');
  await expect(pro.getByText('Total').locator('..')).toContainText('86,28 USD');
  await pro.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(pro.getByText('Brouillon enregistré.')).toBeVisible();
  await pro.getByRole('button', { name: 'Envoyer le devis au client' }).click();
  await pro.getByRole('button', { name: /Confirmer l’envoi de 86,28 USD/ }).click();
  await expect(pro.getByText('Devis envoyé', { exact: true })).toBeVisible();
  await expect(pro.getByRole('button', { name: 'Corriger (nouvelle version)' })).toBeVisible();

  // --- Le client compare et accepte : la commande est créée ---
  await client.reload();
  await expect(client.getByRole('heading', { name: 'Devis reçu' })).toBeVisible();
  await expect(client.getByText('86,28 USD').first()).toBeVisible();
  await client.getByRole('button', { name: 'Accepter ce devis' }).click();
  await client.getByRole('button', { name: 'Confirmer et créer la commande' }).click();
  await expect(client.getByRole('heading', { name: /^KZ-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(client.getByText('En attente de paiement').first()).toBeVisible();
  await expect(client.getByText(/· Devis version 1 accepté$/)).toBeVisible();

  await pro.getByRole('link', { name: 'Commandes', exact: true }).click();
  await pro.getByText(/KZ-\d{4}-\d{6}/).click();

  // --- Ajustement de prix : sans effet avant l'accord du client ---
  await pro.getByRole('button', { name: 'Proposer un ajustement de prix' }).click();
  await pro.getByLabel('Montant (USD)').fill('5,00');
  await pro.getByLabel('Raison (visible du client)').fill('Douane plus élevée que prévu');
  await pro.getByRole('button', { name: 'Envoyer la proposition' }).click();
  await expect(pro.getByText('En attente de la réponse du client.')).toBeVisible();

  await client.reload();
  await expect(
    client.getByText('Nouveau montant si vous acceptez : 91,28 USD.', { exact: false }),
  ).toBeVisible();
  await client.getByRole('button', { name: 'Accepter l’ajustement' }).click();
  await expect(client.getByText('ajustements acceptés', { exact: false })).toBeVisible();
  await expect(client.getByText('91,28 USD').first()).toBeVisible();

  // --- Paiement direct : déclaré par le client, confirmé par le commissionnaire ---
  await expect(client.getByLabel('Montant payé')).toHaveValue('91,28');
  await client.getByLabel('Référence de la transaction').fill('MP241121.1042.K93811');
  await client.getByRole('button', { name: 'Envoyer mon paiement' }).click();
  await expect(client.getByText('Paiement envoyé.', { exact: false })).toBeVisible();
  await expect(client.getByText('Paiement à vérifier').first()).toBeVisible();

  await pro.getByRole('link', { name: 'Paiements', exact: true }).click();
  await expect(pro.getByRole('heading', { name: 'À vérifier (1)' })).toBeVisible();
  await expect(pro.getByText('Ruth', { exact: false }).first()).toBeVisible();
  await pro.getByRole('button', { name: 'Confirmer la réception' }).click();
  await expect(pro.getByText('Paiement de 91,28 USD confirmé.')).toBeVisible();
  await expect(pro.getByText('Aucun solde en attente : tout est payé.')).toBeVisible();

  await client.reload();
  await expect(client.getByText('Payée').first()).toBeVisible();

  await pro.getByRole('link', { name: 'Commandes', exact: true }).click();
  await pro
    .getByText(/KZ-\d{4}-\d{6}/)
    .first()
    .click();
  await pro.getByRole('button', { name: 'Passer à « Achat en cours »' }).click();
  await expect(pro.getByText('Achat en cours').first()).toBeVisible();

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

  // Devis puis accord du client géré (reçu par WhatsApp) : la commande est créée.
  await pro.getByRole('button', { name: 'Préparer le devis' }).click();
  await pro.getByLabel('Prix unitaire (USD)').first().fill('25,00');
  await pro.getByRole('button', { name: 'Envoyer le devis au client' }).click();
  await pro.getByRole('button', { name: /Confirmer l’envoi de/ }).click();
  await expect(pro.getByRole('heading', { name: 'Le client a donné son accord ?' })).toBeVisible();
  await pro.getByLabel('Comment le client a accepté').fill('Accord par WhatsApp');
  await pro.getByRole('button', { name: 'Enregistrer l’accord et créer la commande' }).click();
  await expect(pro.getByRole('heading', { name: /^KZ-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(
    pro.getByText('Devis version 1 accepté · Accord par WhatsApp', { exact: false }),
  ).toBeVisible();

  // --- Règle d'achat : le commissionnaire avance l'argent pour ce client géré ---
  await pro.getByRole('radio', { name: /Achat sur mes fonds propres/ }).check();
  await pro.getByRole('button', { name: 'Enregistrer la règle' }).click();
  await expect(pro.getByText('Règle d’achat modifiée')).toBeVisible();

  // --- Achat groupé chez un vendeur : articles de deux commandes dans un même panier ---
  await pro.getByRole('link', { name: 'Achats', exact: true }).click();
  await pro.getByRole('checkbox', { name: /Acheter Robe/ }).check();
  await pro.getByRole('checkbox', { name: /Acheter Organiseur/ }).check();
  await pro.getByRole('checkbox', { name: /Acheter Chaussures/ }).check();
  await pro.getByLabel('Site').selectOption({ label: 'SHEIN' });
  await pro.getByLabel('Boutique ou vendeur').fill('SHEIN');
  await pro.getByLabel('Montant payé au vendeur').fill('118,40');
  await pro.getByRole('button', { name: 'Enregistrer l’achat' }).click();
  await expect(pro.getByText('payé 118,40', { exact: false })).toBeVisible();
  await expect(pro.getByText('Aucun article à acheter pour l’instant.')).toBeVisible();
  await pro.getByRole('button', { name: 'Réception à l’entrepôt' }).click();
  await pro.getByRole('button', { name: 'Enregistrer la réception' }).click();
  await expect(pro.getByText('Reçu', { exact: true })).toBeVisible();

  // Le client voit l'avancement, jamais le coût réel ni la boutique.
  await client.reload();
  await expect(client.getByText('Achetée').first()).toBeVisible();
  await expect(client.getByText('118,40', { exact: false })).toHaveCount(0);

  // --- Colis partagé par deux clients (écran 09) ---
  await pro.getByRole('link', { name: 'Colis', exact: true }).click();
  await pro.getByLabel('Diviseur volumétrique du transporteur').selectOption('6000');
  await pro.getByRole('button', { name: 'Créer le colis' }).click();
  await expect(pro.getByRole('heading', { name: /^KZ-P-[0-9A-Z]{6}$/ })).toBeVisible();
  await pro.getByRole('checkbox', { name: /Mettre en colis Robe/ }).check();
  await pro.getByRole('checkbox', { name: /Mettre en colis Organiseur/ }).check();
  await pro.getByRole('checkbox', { name: /Mettre en colis Chaussures/ }).check();
  await pro.getByRole('button', { name: 'Ajouter au colis' }).click();
  await expect(pro.getByText('Articles ajoutés au colis.')).toBeVisible();
  await expect(pro.getByRole('heading', { name: 'Articles dans ce colis (3)' })).toBeVisible();
  await expect(pro.getByText('Patrick Mbuyi · client géré')).toBeVisible();
  await pro.getByLabel('Poids (kg)').fill('2,5');
  await pro.getByLabel('Longueur (cm)').fill('30');
  await pro.getByLabel('Largeur (cm)').fill('20');
  await pro.getByLabel('Hauteur (cm)').fill('30');
  await expect(
    pro.getByText('Poids volumétrique (÷ 6 000) : 3,0 kg', { exact: false }),
  ).toBeVisible();
  await pro.getByRole('button', { name: 'Enregistrer les mesures' }).click();
  await expect(pro.getByText('Mesures enregistrées.')).toBeVisible();
  await pro
    .getByRole('combobox', { name: /^Étape/ })
    .selectOption({ label: 'Reçu à l’entrepôt d’origine' });
  await pro.getByLabel('Lieu (facultatif)').fill('Guangzhou');
  await pro.getByRole('button', { name: 'Enregistrer l’étape' }).click();
  await expect(pro.getByText('Étape enregistrée.')).toBeVisible();
  await pro.getByRole('button', { name: 'Fermer le colis' }).click();
  await expect(pro.getByText('Colis fermé.')).toBeVisible();

  await client.reload();
  await expect(client.getByText('En préparation logistique').first()).toBeVisible();

  // --- Expédition : une étape enregistrée une fois vaut pour tous ses colis ---
  await pro.getByRole('link', { name: 'Expéditions', exact: true }).click();
  await pro.getByLabel('Départ').fill('Guangzhou');
  await pro.getByLabel('Arrivée').fill('Lubumbashi');
  await pro.getByRole('button', { name: 'Créer l’expédition' }).click();
  await expect(pro.getByText('Expédition créée.')).toBeVisible();
  await pro.getByRole('checkbox', { name: /Ajouter le colis KZ-P-/ }).check();
  await pro.getByRole('button', { name: 'Ajouter à l’expédition' }).click();
  await expect(pro.getByText('Colis ajoutés à l’expédition.')).toBeVisible();
  await pro
    .getByLabel('Étape pour toute l’expédition')
    .selectOption({ label: 'Expédié vers la RDC' });
  await pro.getByRole('button', { name: 'Enregistrer l’étape' }).click();
  await expect(pro.getByText('Étape enregistrée pour tous les colis.')).toBeVisible();
  await expect(pro.getByText('En route')).toBeVisible();

  await client.reload();
  await expect(client.getByText('En transport').first()).toBeVisible();

  // --- Écran 06 : le client suit SES articles ; le colis partagé ne révèle pas l'autre client ---
  await expect(client.getByRole('heading', { name: 'Suivi de mes colis' })).toBeVisible();
  await expect(client.getByText('Expédié vers la RDC').first()).toBeVisible();
  await expect(client.getByText('Reçu à l’entrepôt d’origine')).toBeVisible();
  await expect(client.getByText('Chaussures de sécurité')).toHaveCount(0);
  await expect(client.getByText('Patrick', { exact: false })).toHaveCount(0);

  // --- Notifications du client : chaque étape importante, sans rien demander ---
  await client.getByRole('link', { name: /^Notifications/ }).click();
  await expect(client.getByRole('button', { name: /Colis expédié/ })).toBeVisible();
  await expect(client.getByRole('button', { name: /Paiement confirmé/ })).toBeVisible();
  await client.getByRole('button', { name: 'Tout marquer comme lu' }).click();
  await expect(client.getByRole('button', { name: /^Non lue/ })).toHaveCount(0);

  // --- Export Excel des colis ---
  await pro.getByRole('link', { name: 'Colis', exact: true }).click();
  const download = pro.waitForEvent('download');
  await pro.getByRole('button', { name: 'Exporter les colis (Excel)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^konzia-colis-\d{4}-\d{2}-\d{2}\.csv$/);
});
