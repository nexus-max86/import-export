# Plan — Konzia MVP (conception puis développement)

Référence : [`docs/cahier-des-charges.md`](../../docs/cahier-des-charges.md) · Glossaire : [`docs/glossaire.md`](../../docs/glossaire.md)
Statut : **APPROUVÉ le 20/11/2026** (G1 : VPS KVM 2 ; G2–G9 : recommandations acceptées ; e-mail via Brevo). Phase 0 livrée, en relecture.

## Contexte validé

| Sujet | Réponse |
|---|---|
| Développement | Une seule personne (le propriétaire), avec Claude |
| Hébergement | Hostinger VPS KVM 2 (Docker) |
| Authentification / messages | E-mail + WhatsApp, pas de SMS |
| Pilote | 2 commissionnaires, qui travaillent aujourd'hui sur Excel + WhatsApp |
| Langue | Français uniquement au lancement (architecture prête pour l'i18n) |
| Nom | Konzia |

Conséquence du « développeur unique » : on optimise pour **peu de pièces mobiles** et un code facile à reprendre. Tout ce qui n'est pas indispensable au pilote reste hors périmètre.

---

## Phases

Chaque phase de développement est une **tranche verticale** (base de données → API → écran) livrable et testée seule. Les phases risquées passent en premier.

### Phase 0 — Conception (documents uniquement, aucun code)
Validée quand : le propriétaire a relu et approuvé les documents 0.1 à 0.7.
Fichiers : `docs/01-exigences.md` … `docs/07-backlog.md`

#### 0.1 Exigences fonctionnelles et non fonctionnelles (S)
- Critères : chaque exigence du cahier a un identifiant (`EF-xx`, `ENF-xx`), une phase (MVP/V1/plus tard) et un critère d'acceptation.
- Vérification : relecture ; aucun critère de la section 15 du cahier sans exigence associée.
- Fichiers : `docs/01-exigences.md`
- Bloqué par : aucun

#### 0.2 Architecture technique et décisions (S)
- Critères : schéma des composants, choix de la stack justifiés, topologie de déploiement Hostinger, frontières des modules.
- Vérification : relecture.
- Fichiers : `docs/02-architecture.md`, `.ai/DECISIONS.md`
- Bloqué par : G1, G3

#### 0.3 Modèle de données (M)
- Critères : diagramme entité-relation (Mermaid), toutes les tables MVP avec `organization_id`, règles de non-suppression, montants en entiers (centimes) + devise.
- Vérification : relecture ; chaque règle métier §7 du cahier est couverte par une contrainte ou une table.
- Fichiers : `docs/03-modele-donnees.md`
- Bloqué par : 0.1, G6

#### 0.4 Rôles et permissions (S)
- Critères : matrice rôle × action ; rôles par défaut des employés ; périmètre du support et de l'administrateur.
- Vérification : relecture ; chaque scénario « Compte et permissions » du §15 est traçable.
- Fichiers : `docs/04-roles-permissions.md`
- Bloqué par : 0.1

#### 0.5 Diagrammes d'états et parcours (S)
- Critères : machines d'états (Mermaid) pour demande, devis, commande, paiement, colis, litige ; transitions autorisées et qui les déclenche.
- Vérification : relecture.
- Fichiers : `docs/05-etats-et-parcours.md`
- Bloqué par : 0.3

#### 0.6 Maquettes des écrans principaux (M)
- Critères : maquettes mobiles cliquables — client (importer un lien, comparer les devis, suivre un colis), commissionnaire (demandes, rédaction de devis, colis), admin (vérification).
- Vérification : relecture par le propriétaire et si possible un commissionnaire pilote.
- Fichiers : artefact HTML publié + `docs/06-maquettes.md` (lien et notes)
- Bloqué par : 0.5, G8

#### 0.7 Backlog découpé (S)
- Critères : une tâche par étape des phases 1 à 9, taille XS–M, avec « Bloqué par ».
- Vérification : toutes les exigences MVP sont rattachées à une tâche.
- Fichiers : `docs/07-backlog.md` (+ tickets GitHub selon G7)
- Bloqué par : 0.1–0.6

### Phase 1 — Socle technique et isolation multi-tenant (risque n°1)
Validée quand : `pnpm test` passe, dont un test prouvant qu'un commissionnaire A ne peut lire aucune donnée de B, même avec une requête forgée.
- 1.1 Monorepo, TypeScript strict, lint, CI GitHub Actions, `docker compose` local (Postgres, Redis) — S
- 1.2 Inscription/connexion par e-mail (mot de passe + vérification d'e-mail), sessions, déconnexion de tous les appareils — M
- 1.3 Organisations, membres, rôles ; isolation par Row-Level Security PostgreSQL + gardes serveur ; tests inter-tenant — M
- 1.4 Journal d'audit (table + service) — S

### Phase 2 — Profils, villes et vérification des commissionnaires
Validée quand : un commissionnaire s'inscrit, dépose ses documents, l'admin l'approuve ; l'action est auditée ; le profil apparaît dans l'annuaire public.
- 2.1 Villes/zones (Lubumbashi, Likasi, Kasumbalesa, Kipushi configurables) — S
- 2.2 Profil client + adresses — S
- 2.3 Profil professionnel + documents chiffrés + vérification admin — M
- 2.4 Annuaire public des commissionnaires — S
- 2.5 Import Excel/CSV des clients existants d'un commissionnaire (selon G4) — S

### Phase 3 — Import de produit et demande de devis
Validée quand : les scénarios « Import de produit » du §15 passent (lien reconnu, lien inconnu → saisie manuelle, URL locale bloquée, prix marqué indicatif et daté).
- 3.1 Analyse d'URL : liste blanche de domaines, normalisation, protection SSRF — S
- 3.2 Récupération des métadonnées publiques (titre, image) avec délai et taille limités ; saisie manuelle + capture d'écran — M
- 3.3 Demande de devis multi-articles, brouillon, envoi à un ou plusieurs commissionnaires — M

### Phase 4 — Devis, comparaison, commande
Validée quand : deux commissionnaires répondent à la même demande, le client compare, accepte l'un → une commande liée à la version exacte ; un devis expiré est refusé.
- 4.1 Rédaction de devis détaillé + versions — M
- 4.2 Comparaison côté client, acceptation/refus/demande de correction — S
- 4.3 Création de commande, statuts opérationnels, ajustements approuvés par le client — M

### Phase 5 — Paiements directs
Validée quand : les scénarios « Paiements » du §15 applicables au paiement direct passent (en attente ≠ confirmé, confirmation manuelle trace l'employé et la date, remboursement = événement distinct).
- 5.1 Instructions de paiement du commissionnaire, preuve client, confirmation/refus motivé — M
- 5.2 Taux de change saisis par l'admin (source, date, valeur figée au calcul) — S

### Phase 6 — Achats fournisseurs, colis, suivi
Validée quand : les scénarios « Colis » du §15 passent (commande sur plusieurs colis, colis multi-commandes, client ne voit que ses articles, chaque mouvement horodaté).
- 6.1 Achats fournisseurs + preuves + quantités achetées/reçues — M
- 6.2 Colis, association d'articles, poids/dimensions, photos — M
- 6.3 Expéditions et événements de suivi manuels, étapes configurables — M
- 6.4 Vue de suivi côté client — S

### Phase 7 — Notifications
Validée quand : chaque événement de la liste §6.12 produit une notification dans l'application et un e-mail ; l'adaptateur WhatsApp est en place (actif ou désactivé selon G2).
- 7.1 Centre de notifications dans l'app + préférences — S
- 7.2 E-mail transactionnel via file d'attente (BullMQ) — S
- 7.3 Adaptateur WhatsApp (API Cloud officielle) + liens `wa.me` en attendant — S

### Phase 8 — Console d'administration
Validée quand : l'admin supervise utilisateurs, commissionnaires, commandes, paiements, colis, et consulte l'audit ; MFA obligatoire.
- 8.1 Vue globale + listes paginées — M
- 8.2 Suspension/approbation auditées, MFA admin — S
- 8.3 Signalements et litiges simples (ouverture, réponse, décision historisée) — M

### Phase 9 — Mise en production et pilote
Validée quand : l'application tourne sur Hostinger en HTTPS, une sauvegarde a été restaurée avec succès, les 2 commissionnaires pilotes ont un compte.
- 9.1 Déploiement Docker sur le VPS, HTTPS, environnements staging/production — M
- 9.2 Sauvegardes automatiques + test de restauration — S
- 9.3 Guides commissionnaire et administrateur — S

---

## Journal des décisions (proposées, à confirmer)

| Décision | Option proposée | Pourquoi |
|---|---|---|
| Application client | Web installable (PWA) Next.js, pas d'app native au MVP | Un seul code, pas de Play Store, léger sur réseau instable ; développeur unique |
| Backend | NestJS (monolithe modulaire) | Recommandé par le cahier ; gardes et modules clairs pour le multi-tenant ; OpenAPI généré |
| Monorepo | pnpm workspaces : `apps/web`, `apps/api`, `packages/shared` | Types partagés entre front et API |
| Base de données | PostgreSQL + Prisma | Un seul ORM ; migrations versionnées |
| Isolation | Gardes serveur **+** Row-Level Security PostgreSQL | Double barrière sur le risque n°1 |
| Montants | Entiers (unité mineure) + code devise ; jamais de flottants | Pas d'erreurs d'arrondi |
| Paiements | Paiement direct uniquement ; aucun fonds détenu par la plateforme | Pas de prestataire agréé validé ; conformité |
| Import URL | Métadonnées publiques seulement ; saisie manuelle = parcours normal | Les marketplaces bloquent l'extraction ; interdiction de contourner |
| Authentification | E-mail + mot de passe + vérification d'e-mail ; WhatsApp pour les notifications | Pas de SMS ; la connexion par WhatsApp exige une validation Meta |
| Taux de change | Saisis par l'admin, figés dans chaque devis | Simple, traçable |

## Non encore spécifié

- Phase 2 : liste exacte des documents de vérification d'un commissionnaire (cahier §18.11) — à demander aux 2 pilotes.
- Phase 4 : conditions d'annulation et de remboursement affichées dans les devis (§18.5) — texte à fournir par le propriétaire avant la phase 4.
- Phase 6 : étapes logistiques réellement utilisées par les 2 pilotes (itinéraire Chine → Lubumbashi ? via Kasumbalesa ?) — à recueillir pendant la phase 0.
- Phase 8 : délais de litige — à fixer avant la phase 8.
- Phase 9 : nom de domaine. Nom retenu le 20/11/2026 : **Konzia** (remplace CargoLink, trop proche d'un annuaire IATA et de transitaires existants). Vérifié le 20/11/2026 : `konzia.com` pris ; `konzia.app`, `konzia.co`, `konzia.net`, `konzia.io`, `konziardc.com`, `getkonzia.com` libres ; `.cd` non vérifiable par l'outil. Achat à faire par le propriétaire.
- Recherche multi-marketplaces, connecteurs API, paiements intégrés, abonnements : brouillard, étudiés après le pilote.

## Toujours / Jamais

- **Toujours** : contrôle d'accès côté serveur ; test inter-tenant pour chaque nouvelle table ; audit des actions sensibles ; prix affichés avec leur nature (estimation / devis / final) ; adaptateurs « factices » clairement marqués et désactivés en production ; aucun secret dans le dépôt.
- **Jamais (au MVP)** : application native, paiement intégré ou portefeuille, moteur de recherche multi-marketplaces, scraping contournant des protections, abonnements payants, QR codes, commission plateforme prélevée.

## Avancement

| Phase | Statut |
|---|---|
| 0 — Conception | Livrée (docs 01–07, maquettes, tickets #1–#31) — relecture du propriétaire |
| 1 — Socle et isolation | À faire |
| 2 — Profils et vérification | À faire |
| 3 — Import et demande | À faire |
| 4 — Devis et commande | À faire |
| 5 — Paiements directs | À faire |
| 6 — Achats et colis | À faire |
| 7 — Notifications | À faire |
| 8 — Administration | À faire |
| 9 — Production et pilote | À faire |
