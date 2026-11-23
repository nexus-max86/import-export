# Konzia — rapport complet d'avancement (20 → 23 novembre 2026)

Rapport de passation, écrit pour qu'un agent (humain ou IA) reprenne le projet sans autre contexte. Tout ce qui est décrit ici est dans le dépôt `nexus-max86/import-export`, branche **`ccr-41e606b8-q0hia7`** (dernier commit : `ba37d62`, 52 commits).

---

## 1. Le produit en bref

**Konzia** est une plateforme hybride, à la fois place de marché et logiciel (SaaS), pour l'achat international et l'import en RDC. La ville pilote est **Lubumbashi**.

- Un **client** colle le lien d'un article (SHEIN, AliExpress, Alibaba, Temu…), puis demande des devis à un ou plusieurs **commissionnaires vérifiés**.
- Le **commissionnaire** chiffre, achète à l'étranger, regroupe les articles en colis, expédie, puis remet au client.
- **Konzia ne touche jamais l'argent des achats.** Le client paie directement son commissionnaire (M-Pesa, Orange Money, Airtel Money, espèces, banque). Konzia enregistre ce qui est déclaré et confirmé.
- Trois espaces :
  - **client** ;
  - **commissionnaire**, en multi-organisation, avec les rôles propriétaire, acheteur et comptable ;
  - **administration**, avec double authentification obligatoire et chaque consultation journalisée.

Pour aller plus loin :
- résumé du produit pour l'interface : `PRODUCT.md` ;
- cahier des charges : `docs/cahier-des-charges.md` ;
- exigences : `docs/01-exigences.md` ;
- vocabulaire : `docs/glossaire.md`.

### Contexte humain

- Une seule personne développe : le propriétaire, avec Claude. On privilégie donc peu de pièces mobiles et un code facile à reprendre.
- Pilote : 2 commissionnaires qui travaillent aujourd'hui sur Excel et WhatsApp.
  - Le premier, **Nicolas**, a répondu au questionnaire.
  - Le second, ainsi que son fichier Excel, sont **reportés à plus tard** à la demande du propriétaire.
- Contact affiché dans l'application : WhatsApp **090 195 1088** (+243 90 195 1088).

---

## 2. Règles de travail (à respecter absolument)

Elles viennent de `CLAUDE.md` et des consignes du propriétaire.

**Langue**
- Documentation, interface et messages de commit en **français**. Réponses au propriétaire en français.

**Git**
- Travailler sur la branche `ccr-41e606b8-q0hia7`. Ne pousser ailleurs qu'avec une autorisation explicite.
- Pousser sur `main` a été refusé par le système de sécurité.
- Pas de pull request sans demande explicite.

**Vérification**
- `pnpm verify` avant **chaque** commit : formatage, lint, types, build, tests.
- Ne jamais masquer son code de sortie (pas de `| grep`).

**Données et sécurité**
- Montants en **entiers** (unité mineure) avec la devise ; jamais de flottants.
- Toute table métier comporte :
  - `organization_id` ;
  - `ENABLE ROW LEVEL SECURITY` ;
  - des politiques et des GRANT explicites pour `konzia_app`, écrits dans la migration ;
  - une entrée dans `apps/api/test/tenancy-tables.ts`.
- Données métier : toujours via `TenantDb.run(userId, tx => …)`, avec le rôle `konzia_app`.
- `PrismaService` (rôle propriétaire) : seulement pour l'authentification et les opérations système, qui sont auditées.
- Prisma avec le rôle applicatif : toujours un `select` explicite, car les droits sont accordés par colonne.
- Toute table avec `org_customer_id` doit être ajoutée à `ORG_CUSTOMER_REFERENCES` (`apps/api/src/customers/customers.service.ts`).
- Aucune suppression physique des devis, commandes, paiements ou mouvements de colis.
- Adaptateurs factices nommés `Fake…`, refusés en production.
- **Aucun secret dans le dépôt.**

**Versions** (décision D6) : Next 15.5, NestJS 11, Prisma 6, TypeScript 5.9, Zod 4, Vitest 3.

**Façon de travailler du propriétaire**
- Il valide phase par phase (« Oui », « Continue », « Vas-y »).
- Il veut des explications simples, en français, sans jargon.

---

## 3. Architecture technique

Monorepo **pnpm 10**, **Node 22**.

| Dossier | Contenu |
|---|---|
| `apps/api` | API **NestJS 11** (Express 5). Modules : auth, organizations, tenancy, audit, geo, profile, customers, verification, directory, catalog, requests, fx, quotes, orders, payments, supplier-orders, parcels, tracking, exports, notifications, email, whatsapp, admin, disputes, files, monitoring, health |
| `apps/web` | **Next.js 15.5** (sortie `standalone`), application web installable (PWA), **Tailwind 4** |
| `packages/shared` | Schémas **Zod 4**, permissions, calculs (devises, colis, devis, WhatsApp, CSV) |
| `packages/db` | **Prisma 6.19** et 31 migrations SQL ; scripts `enable-app-login.cjs` et `promote-admin.cjs` |
| `infra/deploy` | Dockerfile (cibles `api`, `web`, `migrate`), `compose.yml`, Caddy (`edge/`), `deploy.sh`, `harden.sh`, sauvegardes (`backup/`), `restore-test.sh` |
| `.github/workflows` | CI et `deploy.yml` (images publiées sur GHCR ; le déploiement est sauté tant que `vars.DEPLOY_ENABLED != 'true'`) |

**Base et stockage**
- **PostgreSQL 16**, avec la Row-Level Security comme seconde barrière d'isolation.
- **Redis** porte la file d'envoi des e-mails (BullMQ) et les limites de débit.
- Les fichiers (RCCM, pièces d'identité, preuves de paiement) sont **chiffrés en AES-256** avant d'être stockés, en local ou sur S3/R2.

### Décisions d'architecture (`.ai/DECISIONS.md`)

| # | Décision |
|---|---|
| D1 | Isolation entre commissionnaires par **Row-Level Security** PostgreSQL, en plus des gardes serveur. Rôle `konzia_app` sans `BYPASSRLS` |
| D2 | **Sessions opaques** en base (cookie `HttpOnly`) plutôt que JWT, pour pouvoir les révoquer immédiatement |
| D3 | Montants en entiers + devise ; taux de change **figé dans chaque version de devis** |
| D4 | **Client géré** sans compte (créé par le commissionnaire), qui peut réclamer sa fiche plus tard |
| D5 | **PWA** au lieu d'une application native pour le MVP |
| D6 | Versions majeures des dépendances |
| D7 | L'adresse d'un client géré est portée par sa fiche ; fusion à la réclamation |
| D8 | Suivi client par des **vues filtrées** (`customer_parcel_tracking`, `customer_parcel_events`) : dans un colis partagé, chaque client ne voit que ses articles ; l'historique est rattaché à la réclamation |
| D9 | **Base externe possible (Neon)**. Le conteneur Postgres n'existe que sous le profil `local-db`. Le script d'activation ne touche plus à BYPASSRLS mais vérifie que le rôle ne l'a pas |

### Mécanismes de sécurité notables

- Fonctions SQL `SECURITY DEFINER` : `app_user_org_ids()`, `app_user_org_role()`, `order_net_paid()`.
- Déclencheurs qui rendent certaines tables en insertion seule ou figées : `forbid_delete`, `forbid_update`, `payments_guard`, `disputes_guard`, `parcel_items_check_qty`.
- Journal d'audit immuable (`audit_logs`) : lectures admin, ouvertures de documents, décisions.
- Analyse des liens produits protégée contre la SSRF.
- Limites de débit, dont l'inscription à 30 par heure et par IP, à cause du partage d'adresses IP chez les opérateurs congolais.
- Sentry facultatif : inactif sans `SENTRY_DSN`. Les données personnelles sont retirées des rapports et seules les erreurs 5xx sont envoyées.

---

## 4. Historique, phase par phase

Le plan complet et le tableau d'avancement se trouvent dans `plans/pending/konzia-mvp.md`. Tickets GitHub **#1 à #31** : un ticket correspond à une étape.

| Phase | Statut | Contenu |
|---|---|---|
| **0 — Conception** | Livrée le 20/11 | Exigences, architecture, modèle de données, rôles, états et parcours, maquettes (10 écrans), backlog, questionnaire. Projet renommé de CargoLink en Konzia |
| **1 — Socle et isolation** (#1–#4) | Terminée le 20/11 | Monorepo, CI, inscription, vérification d'e-mail, connexion, sessions, organisations et rôles, RLS, journal d'audit |
| **2 — Profils et vérification** (#5–#7, #10–#12) | Terminée le 21/11 | Villes et zones, profil client et adresses, numéros WhatsApp, fiches clients et clients gérés avec réclamation, dossier de vérification chiffré (RCCM + pièce d'identité), annuaire public, import des clients depuis Excel (.xlsx, .csv) |
| **3 — Import et demande** (#9, #13, #14) | Terminée le 21/11 | Analyse des liens produits, prix indicatif daté, captures, demandes multi-articles et multi-commissionnaires |
| **4 — Devis et commande** (#8, #15–#17) | Terminée le 21/11 | Taux de change publiés par l'admin, devis versionnés avec assistant de calcul (commission en %, transport au kilo), comparaison et acceptation, commande, ajustements de prix acceptés par le client |
| **5 — Paiements directs** (#18) | Terminée | Paiements déclarés ou confirmés, acomptes, remboursements séparés, vue « qui doit combien » |
| **6 — Achats et colis** (#19–#22) | Terminée | Achats chez les vendeurs, règle d'achat par commande (tout payé, acompte ou fonds propres), colis multi-clients (code `KZ-P-XXXXXX`, poids volumétrique), itinéraires, expéditions, suivi client, exports CSV |
| **7 — Notifications** (#23–#25) | Terminée | Centre de notifications (15 types), e-mails en file avec SMTP Brevo, modèles WhatsApp préremplis. L'envoi WhatsApp automatique est **désactivé** jusqu'à la validation de Meta |
| **8 — Administration** (#26–#28) | Terminée | Console en lecture (journalisée), double authentification (TOTP), décisions motivées (approuver, rejeter, suspendre), litiges (preuves, réponse, décision, clôture, réouverture motivée) |
| **9 — Production et pilote** (#29–#31) | **En cours** | Voir § 5. #29 (déploiement) et #30 (sauvegardes) sont vérifiés en local ; #31 est en partie fait |
| **Finition de l'interface** | Faite les 22 et 23/11 | Voir § 6 |

### Retours terrain (`docs/08-retours-terrain.md`)

Nicolas a confirmé les lignes de devis, l'importance du client géré et le modèle d'abonnement (10 à 25 $ par mois). Ses retours ont changé le plan :

- **R2** : vue « qui doit combien ».
- **R3** : acomptes et règle d'achat.
- **R4** : assistant de devis.
- **R5** : RCCM + pièce d'identité pour la vérification.
- **R6** : modèles de messages WhatsApp.
- **R1** (lien de suivi sans compte) : **reporté après le MVP**.

---

## 5. Phase 9 : mise en production (détail)

### Ce qui est fait

**Déploiement** (`docs/guides/deploiement.md`)
- Images Docker et frontal **Caddy** en HTTPS, avec en-têtes de sécurité et staging protégé par mot de passe.
- `deploy.sh` : images, base et Redis, migrations avant l'API, contrôle de santé. Retour à la version précédente possible.
- `harden.sh` pour le VPS : pare-feu, fail2ban, utilisateur `deploy`, SSH par clé uniquement.
- Workflow GitHub de déploiement (staging automatique, production manuelle avec approbation).

**Sauvegardes**
- `pg_dump` chiffré avec **age** (clé publique sur le serveur, clé privée hors du serveur), envoyé vers **R2**, rétention de 30 jours.
- `restore-test.sh` restaure dans une base vide et vérifie le résultat. Restauration **réussie** en local.

**Recette sur la pile de production en local**
- Pile complète : Caddy HTTPS, Mailpit, SeaweedFS pour imiter S3.
- 5 parcours de bout en bout sur 5 réussis, et 15 captures.
- Rapport : https://claude.ai/artifact/14U4iSiLCcHxMiDW5EjvMD

**Guides**
- `docs/guides/commissionnaire.md`, `administrateur.md`, `lancement-pilote.md`.
- Version téléphone du guide commissionnaire : https://claude.ai/artifact/T97wm7ec1TMvjqF1fuVGqG

**Autres réalisations**
- Textes légaux en **version de travail**, à faire valider par un juriste. Les éléments à compléter sont entre crochets. Pages `/conditions` et `/confidentialite`, qui citent le Code du numérique de la RDC (ordonnance-loi n° 23/010).
- Désignation du premier administrateur depuis le serveur : `promote-admin.cjs`, action auditée.
- Envoi immédiat des e-mails de compte, avec repli sur la file d'attente si le serveur SMTP est indisponible (`sendOrQueue`).
- **Icône de l'application** (proposition C, choisie par le propriétaire) : K sombre et point cuivre sur fond clair, en Archivo 800. Elle est déclinée en 192, 512, version « maskable », icône Apple 180 et favicon 32.
- **Neon** (base PostgreSQL hébergée) à la place de Supabase, dont l'offre gratuite est déjà pleine avec 2 projets. Le code est prêt (D9, § 4 bis du guide de déploiement).
  - Essai fait sur un Postgres 16 vierge dont le propriétaire n'est pas superutilisateur, comme chez Neon : les migrations passent, les 335 tests de l'API passent, la sauvegarde est relue.
  - Cet essai a révélé un vrai problème, corrigé : le script d'activation échouait sur `ALTER ROLE … NOBYPASSRLS`.
- **Branche `main`** : créée depuis le commit `b114728`, à la demande du propriétaire. Elle **n'a pas reçu** les 6 commits suivants (icône, Neon, design, tableaux).

### Ce qui reste, et à qui

| Action | Qui | Détail |
|---|---|---|
| Nom de domaine (`konzia.app` était libre) | Propriétaire | Il le créera plus tard. DNS : `app.`, `staging.`, plus les enregistrements SPF, DKIM et DMARC de Brevo |
| Hébergement de l'API, du web et de Redis | Propriétaire | VPS Hostinger KVM 2 prévu, ou toute autre machine Docker. **Neon ne remplace que la base** |
| Projets Neon | Propriétaire | Deux projets (`konzia-production`, `konzia-staging`), **Postgres 16 obligatoire**, région Francfort, connexion **directe** (sans « -pooler ») |
| Cloudflare R2 (seaux `konzia-files`, `konzia-backups`) et Brevo (clé SMTP, domaine authentifié) | Propriétaire | Comptes à créer |
| Secrets GitHub (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) et variables `KONZIA_DOMAIN`, `DEPLOY_ENABLED=true` | Propriétaire | Aucun outil ne permet à l'agent de les créer ; il faut aussi que le serveur existe |
| `main` comme branche par défaut, et mise à jour de `main` | Propriétaire | Une pull request ou une autorisation explicite est nécessaire |
| **Sentry** | Propriétaire ou agent | La page de transfert demande d'installer la CLI depuis `cli.sentry.dev`, ce que le propriétaire a **refusé**. Plus simple : créer le projet sur sentry.io et copier le DSN dans `SENTRY_DSN` du fichier `production.env` du serveur |
| Validation juridique des textes légaux | Propriétaire et un juriste | Compléter les éléments entre crochets |
| Pilote réel avec Nicolas : compte, premier devis réel (clôt #31) | Propriétaire | Suivre `docs/guides/lancement-pilote.md` |
| Second pilote et son fichier Excel | Plus tard | Reporté par le propriétaire |
| WhatsApp automatique (API Cloud de Meta) | Plus tard | Une fois la validation Meta obtenue : `WHATSAPP_TRANSPORT=cloud` |

---

## 6. Système de design et interface (22 et 23 novembre)

Demandé avec un cahier « Frontend Premium System ». Les compétences citées (Taste Skill, Impeccable, « animate » d'Emil Kowalski) **n'étaient pas installées** : le travail a été fait directement, sans elles.

### Documents

- `PRODUCT.md` : le produit, ses utilisateurs, ses contraintes.
- `DESIGN.md` : direction artistique, jetons, composants, mouvement, responsive. **Toute nouvelle décision graphique s'y inscrit.**

### Direction « Bordereau »

L'interface s'inspire d'un bordereau d'expédition :
- papier clair, encre, filets fins plutôt qu'ombres ;
- références écrites en chasse fixe (`KZ-2026-000123`) ;
- une seule couleur forte, le **cuivre** du Katanga, réservée à l'action principale de chaque écran.

Deux directions ont été écartées et justifiées : « marché numérique » et « fintech sombre ».

### Ce qui a changé

**Couleurs et police**
- Jetons de couleur complets en thème clair et sombre (`apps/web/src/app/globals.css`). Les contrastes ont été mesurés.
- **Défaut corrigé** : le bouton cuivre du thème sombre n'avait qu'un contraste de 2,7:1. Avec le jeton `on-copper`, il passe à 6,9:1.
- **Une seule police variable, Archivo** (35 Ko), à la place d'Inter et de l'Archivo statique.

**Composants** (`apps/web/src/components/ui.tsx`)
- `Button` : 4 variantes, retour visuel à l'appui, état occupé avec indicateur.
- `buttonClass()` : donne l'aspect d'un bouton à un lien.
- `EmptyState`, `Loading` et `PageLoading` (silhouettes de chargement), `Notice` (tons info, ok, attention, erreur).
- Contrôles natifs (listes, zones de texte, cases, sélecteur de fichier) harmonisés dans `globals.css`.

**Navigation** (`nav.tsx`)
- **Barre latérale** groupée sur ordinateur (≥ 1024 px) pour les espaces pro et admin.
- Les pages pro ont été déplacées dans le groupe de routes `app/pro/(espace)/`. Les **adresses ne changent pas**.
- Sur téléphone : onglets défilants, avec fondu en bord et onglet courant recentré. La cloche de notifications devient une icône sous 640 px.

**Listes**
- `ResponsiveList` (`responsive-list.tsx`) : cartes sous 1024 px, **tableau** au-delà, toute la ligne ouvre la fiche (y compris au clavier).
- Utilisée pour les commandes (client et pro), les demandes et les colis. La page colis passe en deux colonnes sur ordinateur.
- Les notifications non lues sont signalées par un filet et un point cuivre, au lieu d'un bloc plein.

**Mouvement**
- Arrivée des pages en 200 ms, appliquée sur `<main>` (la navigation latérale ne bouge pas).
- Apparition des messages, compression des boutons à l'appui.
- Aucune transition sur « all ». Le réglage `prefers-reduced-motion` est respecté.

### Contrôles

- 15 écrans capturés à **390, 768 et 1440 px**, avant et après.
- Aucune erreur dans la console et aucun débordement horizontal à 390 px, en thème clair comme sombre.
- Commande pour refaire les captures : `E2E_SHOTS=<dossier> E2E_SHOT_WIDTHS=390,768,1440 pnpm --filter @konzia/web e2e`.

### Laissé volontairement

- Espace client sur une colonne de lecture, même sur ordinateur.
- Clients, Paiements et Équipe restent en cartes, car chaque ligne porte ses propres boutons.
- Pas de fenêtre modale, de tiroir, d'info-bulle ni de toast : aucun écran n'en a besoin pour l'instant.
- Dates et sélecteurs de fichiers natifs affichés en anglais dans les captures : cela vient de la langue du navigateur de test, pas de l'application.

---

## 7. État des tests (au 23/11/2026, dernier passage)

| Suite | Résultat |
|---|---|
| `pnpm verify` (formatage, lint, types, build, tests) | Réussi |
| Tests du paquet partagé (Vitest) | **65 / 65** |
| Tests de l'API (Vitest, contre un vrai PostgreSQL et un vrai Redis) | **335 / 335**, dont les tests d’isolation sur les 32 tables d’organisation et les 2 tables personnelles listées dans `tenancy-tables.ts` |
| Parcours de bout en bout (Playwright, Pixel 7) | **5 / 5** : inscription ; erreur de saisie ; demande → devis → paiement → achat → colis → expédition → suivi → notifications ; client géré qui réclame sa fiche ; administrateur avec MFA qui approuve |
| Même suite sur la pile Docker de production (HTTPS) | 5 / 5 (le 22/11) |
| Restauration d'une sauvegarde | Réussie (en local) |
| Simulation Neon (propriétaire non superutilisateur) | Migrations OK, 335 / 335, sauvegarde relue |

**Jamais éprouvé, faute d'accès** : VPS réel, certificats Let's Encrypt réels, envoi réel par Brevo, seaux R2 réels, vraie base Neon, workflow GitHub de déploiement réel.

---

## 8. Reprendre le travail

### Commandes

```bash
pnpm install
pnpm --filter @konzia/shared --filter @konzia/db build   # paquets partagés d'abord
pnpm verify                                               # avant chaque commit
cd apps/web && pnpm exec playwright test --trace off       # parcours de bout en bout
```

- Tests de l'API : base `postgresql://konzia:konzia@localhost:5432/konzia_test`, Redis `redis://localhost:6379` (valeurs par défaut dans `apps/api/test/setup.ts`).
- Parcours de bout en bout : il faut d'abord `pnpm build` à la racine, avec PostgreSQL et Redis démarrés.

### Pièges connus de l'environnement cloud

- **Après un redémarrage du conteneur**, PostgreSQL et Redis sont arrêtés. Les symptômes : « Timed out waiting … config.webServer », ou des tests d'API en erreur de connexion. Pour les relancer :
  ```bash
  pg_ctlcluster 16 main start
  redis-server --daemonize yes --save ""
  ```
- Après un déplacement de pages Next.js, supprimer `apps/web/.next/types` (cache généré) avant `pnpm verify`. Sinon, les types pointent vers les anciens chemins.
- Le démon Docker (`nohup dockerd`) refuse parfois de redémarrer (containerd ne répond pas). Les tests sans Docker suffisent pour la plupart des vérifications.
- **Réseau limité** :
  - `deb.debian.org` et `quay.io` sont bloqués. Pour les images locales, une base Ubuntu est passée par `ARG NODE_IMAGE`.
  - Environnement cloud « import-export » créé avec l'accès à `sentry.io`. `cli.sentry.dev` a été refusé.
- Le système de sécurité bloque `rm` dans `bash -c` et `git push` vers `main`. Ne pas chercher à le contourner.
- Avec Playwright, `getByText` trouve aussi les éléments **masqués** (par exemple le tableau caché sur téléphone). Viser les liens et boutons par leur rôle (`getByRole`).

### Liens utiles (privés, propriété du propriétaire)

- Maquettes cliquables : https://claude.ai/artifact/GkemHVvvzE4x9MRmmE7DkB
- Questionnaire des commissionnaires : https://claude.ai/artifact/NSbKLimsZaz4M2X9U2JrPi
- Guide commissionnaire sur téléphone : https://claude.ai/artifact/T97wm7ec1TMvjqF1fuVGqG
- Rapport de recette : https://claude.ai/artifact/14U4iSiLCcHxMiDW5EjvMD

---

## 9. Prochaines étapes recommandées, dans l'ordre

1. **Le propriétaire choisit et crée l'hébergement** (VPS ou autre), les projets Neon, R2 et Brevo, puis remplit `/opt/konzia/production.env` à partir de `infra/deploy/production.env.example` (option B pour Neon).
2. **Mettre `main` à jour** (pull request depuis `ccr-41e606b8-q0hia7`), en faire la branche par défaut, puis ajouter les secrets GitHub et `DEPLOY_ENABLED=true`.
3. **Premier déploiement en staging**, puis rejouer les parcours de bout en bout contre lui (commande au § « Recette » du guide de déploiement) et faire un **test de restauration** sur une vraie sauvegarde.
4. **Désigner l'administrateur**, activer sa double authentification, faire valider les textes légaux.
5. **Pilote avec Nicolas** : compte, vérification, premier devis réel, retours sur son téléphone Android. Cela clôt #31.
6. Ensuite : Sentry (DSN), second pilote et import de son Excel, lien de suivi sans compte (R1), WhatsApp automatique après validation de Meta.
