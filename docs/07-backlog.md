# 07 — Backlog MVP CargoLink

Une tâche = une étape du [plan](../plans/pending/cargolink-mvp.md). Taille : XS < S < M (aucune tâche L ou plus). Chaque tâche est une tranche verticale (base → API → écran) sauf le socle.
« Prête » = toutes ses tâches bloquantes sont terminées. Les tickets GitHub reprennent le même identifiant (`[1.2]`).

## Phase 1 — Socle et isolation

| ID | Tâche | Taille | Bloqué par | Critères d'acceptation | Vérification |
|---|---|---|---|---|---|
| 1.1 | Monorepo pnpm (`apps/web`, `apps/api`, `packages/shared`, `packages/db`), TypeScript strict, ESLint, Vitest, `docker compose` (Postgres 16, Redis 7), CI GitHub Actions, `.env.example`, README de démarrage | S | — | `pnpm dev` démarre web + api ; CI verte (lint, typecheck, test, build) | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |
| 1.2 | Authentification e-mail : inscription, vérification, connexion, déconnexion, réinitialisation, sessions en base, « déconnecter tous les appareils », CGU, limitation de débit | M | 1.1 | Compte non vérifié bloqué ; jeton de réinitialisation à usage unique ; sessions révoquées refusées | `pnpm --filter api test auth` + parcours Playwright inscription |
| 1.3 | Organisations, membres, invitations, rôles ; contexte de requête ; RLS + rôle SQL sans BYPASSRLS ; **suite de tests inter-tenant** | M | 1.2 | B obtient 0 ligne / erreur sur les tables de A, même en SQL direct ; `sales` reçoit 403 sur `payment.confirm` | `pnpm --filter api test tenancy` |
| 1.4 | Journal d'audit (table insertion seule, service, intercepteur) | S | 1.3 | UPDATE/DELETE refusés au rôle applicatif ; avant/après enregistrés | `pnpm --filter api test audit` |

## Phase 2 — Profils et vérification

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 2.1 | Villes, zones, modes de remise (seed Lubumbashi active ; Likasi, Kasumbalesa, Kipushi inactives) + écran admin | S | 1.4 | Ajouter une ville sans code | test API + seed |
| 2.2 | Profil client + adresses multiples | S | 1.3 | Exactement un propriétaire par adresse | test API + écran |
| 2.3 | Profil professionnel, fichiers R2 (URL signées, type/taille contrôlés), documents chiffrés, soumission de vérification | M | 1.4, 2.1 | Documents illisibles par une autre organisation ; chiffrés au repos | test API + test RLS `documents` |
| 2.4 | Annuaire public des commissionnaires approuvés (filtre ville/marketplace) | S | 2.3 | Non approuvé invisible | test API + écran 03 |
| 2.5 | Clients du commissionnaire (`org_customers`) : création manuelle, liste, lien de réclamation | M | 1.4 | Réclamation rattache l'historique sans doublon | test API réclamation |
| 2.6 | Import CSV/XLSX des clients (aperçu, doublons, rapport d'erreurs, via worker) | S | 2.5 | 500 lignes < 30 s ; lignes invalides listées | test worker avec fichier d'exemple |

## Phase 3 — Import et demande

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 3.1 | Marketplaces (liste blanche), analyse et normalisation d'URL, garde SSRF (DNS → IP vérifiée, redirections revérifiées) | S | 1.1 | `127.0.0.1`, `169.254.169.254`, `file://`, redirection vers IP privée refusés | `pnpm --filter api test url-guard` |
| 3.2 | Lecture Open Graph/JSON-LD dans le worker (5 s, 2 Mo), `product_snapshots`, saisie manuelle + capture ; écran 02 | M | 3.1, 2.3 | Prix marqué indicatif et daté ; lien inconnu → saisie manuelle | test worker (serveur HTTP local de test) + Playwright écran 02 |
| 3.3 | Demande multi-articles, brouillon auto, envoi à N commissionnaires, création pour client géré ; écrans 03 et 07 (liste) | M | 3.2, 2.4, 2.5 | Chaque commissionnaire ne voit que ses demandes | test RLS `quote_requests` + Playwright |

## Phase 4 — Devis et commande

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 4.1 | Rédaction de devis, lignes typées, total serveur, versions figées, taux copié ; écran 08 | M | 3.3, 5.2 | Version envoyée non modifiable (déclencheur) ; total = somme | `pnpm --filter api test quotes` |
| 4.2 | Comparaison, acceptation, refus, demande de correction, expiration planifiée ; écran 04 | S | 4.1 | Devis expiré non acceptable | test API + Playwright écran 04 |
| 4.3 | Commande à l'acceptation (numéro, version exacte), statuts, annulation motivée, ajustements soumis au client | M | 4.2 | Deux commandes séparées pour deux commissionnaires ; montant inchangé sans accord | `pnpm --filter api test orders` |

## Phase 5 — Paiements directs

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 5.1 | Instructions de paiement, déclaration client + preuve, confirmation/refus motivé, paiement hors appli, remboursement, idempotence ; écrans 05 et 07 | M | 4.3 | Déclaré ≠ confirmé ; confirmateur et date tracés ; remboursement = nouvel enregistrement | `pnpm --filter api test payments` |
| 5.2 | Taux de change admin (source, date), conversion USD↔CDF/CNY dans `packages/shared` | S | 1.4 | Un nouveau taux ne change pas un devis existant | test unitaire conversions |

## Phase 6 — Achats et colis

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 6.1 | Achats fournisseurs (multi-commandes), preuves, quantités achetées/reçues/manquantes ; blocage achat si non payé | M | 5.1 | Coûts invisibles au client ; achat refusé si `payment_status ≠ paid` sans dérogation tracée | `pnpm --filter api test supplier-orders` |
| 6.2 | Colis, ajout/retrait d'articles audité, poids/dimensions/volumétrique, photos ; écran 09 | M | 6.1 | Colis multi-commandes ; retrait = marquage | `pnpm --filter api test parcels` |
| 6.3 | Modèles d'étapes, événements de colis et d'expédition (insertion seule), expéditions | M | 6.2 | Chaque mouvement horodaté ; correction = nouvel événement | test API événements |
| 6.4 | Vue de suivi client (`customer_parcel_tracking`), écran 06 ; export CSV commissionnaire | S | 6.3 | Client X ne voit pas les articles de Y dans un colis partagé | test RLS vue + Playwright écran 06 |

## Phase 7 — Notifications

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 7.1 | Centre de notifications dans l'app + préférences ; émission sur les 13 événements | S | 6.3 | Chaque événement crée une notification pour les bons destinataires uniquement | test API notifications |
| 7.2 | E-mails transactionnels via BullMQ + adaptateur SMTP Brevo (modèles FR) | S | 7.1 | Nouvelles tentatives ; aucune donnée sensible dans les logs | test worker avec serveur SMTP de test |
| 7.3 | Liens `wa.me` préremplis ; adaptateur WhatsApp Cloud API (désactivé par configuration) | XS | 7.1 | Adaptateur factice refusé en production | test unitaire |

## Phase 8 — Administration

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 8.1 | Console : vue globale, listes paginées (utilisateurs, organisations, commandes, paiements, colis), lecture d'audit | M | 6.4 | Toute lecture admin d'une donnée de tenant journalisée | test API admin |
| 8.2 | MFA TOTP admin ; approuver/refuser/suspendre organisation et utilisateur avec motif ; écran 10 | S | 8.1 | Admin sans MFA → 403 ; suspension révoque les sessions | test API + Playwright écran 10 |
| 8.3 | Litiges : ouverture avec preuves, réponse, décision, clôture, réouverture admin | M | 8.2 | Litige clôturé modifiable seulement par admin avec audit | `pnpm --filter api test disputes` |

## Phase 9 — Production et pilote

| ID | Tâche | Taille | Bloqué par | Critères | Vérification |
|---|---|---|---|---|---|
| 9.1 | VPS Hostinger : durcissement, Docker, Caddy, staging + production, déploiement depuis GitHub Actions | M | 1.1 (peut démarrer tôt) | HTTPS actif ; déploiement en une commande | `curl -I https://staging.<domaine>/api/health` |
| 9.2 | Sauvegardes chiffrées vers R2 + test de restauration documenté | S | 9.1 | Restauration réussie sur une base vide | script `infra/deploy/restore-test.sh` |
| 9.3 | Guides commissionnaire et administrateur ; comptes des 2 pilotes ; import de leurs clients | S | 8.3, 9.2 | Les 2 pilotes ont envoyé un devis réel | constat avec les pilotes |

## Ordre d'exécution (chemin critique)

1.1 → 1.2 → 1.3 → 1.4 → (2.1, 2.2, 2.5, 5.2, 3.1 en parallèle) → 2.3 → 2.4 → 2.6 → 3.2 → 3.3 → 4.1 → 4.2 → 4.3 → 5.1 → 6.1 → 6.2 → 6.3 → 6.4 → 7.1 → 7.2 → 7.3 → 8.1 → 8.2 → 8.3 → 9.2 → 9.3
9.1 peut commencer dès 1.1 pour disposer d'un staging tôt.

## Tickets GitHub

| Étape | Ticket | Étape | Ticket | Étape | Ticket |
|---|---|---|---|---|---|
| 1.1 | #1 | 2.4 | #11 | 6.1 | #19 |
| 1.2 | #2 | 2.6 | #12 | 6.2 | #20 |
| 1.3 | #3 | 3.2 | #13 | 6.3 | #21 |
| 1.4 | #4 | 3.3 | #14 | 6.4 | #22 |
| 2.1 | #5 | 4.1 | #15 | 7.1 | #23 |
| 2.2 | #6 | 4.2 | #16 | 7.2 | #24 |
| 2.5 | #7 | 4.3 | #17 | 7.3 | #25 |
| 5.2 | #8 | 5.1 | #18 | 8.1 | #26 |
| 3.1 | #9 | | | 8.2 | #27 |
| 2.3 | #10 | | | 8.3 | #28 |
| 9.1 | #29 | 9.2 | #30 | 9.3 | #31 |
