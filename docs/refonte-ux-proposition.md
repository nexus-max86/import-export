# KONZIA — proposition de refonte UX/UI

Version 1 du 24/11/2026. C'est l'étape 10 de la méthode (`.claude/skills/konzia-product-design/SKILL.md`). **Rien n'est développé tant que cette proposition n'est pas validée.**

Sources :
- `PRODUCT.md` et `DESIGN.md` ;
- l'audit du 23/11 (`docs/audit-2026-11-23.md`) ;
- les maquettes de validation (https://claude.ai/artifact/KS4uZ4Rh6ZghSvqJg4tZjS) ;
- les 17 captures de référence fournies le 23/11 ;
- la lecture du code (routes, composants, modèle de données) faite le 24/11.

---

## 0. En bref

1. **On garde tout ce qui fonctionne.**
   - 85 % du travail est de la présentation : les mêmes données et les mêmes règles, dans une interface de niveau Shopify ou Stripe.
   - Les adresses de pages actuelles restent valides (`/pro/...`, `/admin/...`).
2. **Trois fondations manquent** avant de refaire les écrans :
   - une **pagination côté serveur** : les listes pro sont aujourd'hui plafonnées à 200 éléments sans prévenir ;
   - un **jeu de composants de gestion** : tableau, panneau latéral, fenêtre de confirmation, notifications temporaires, cartes d'indicateurs et de graphiques ;
   - les **nouvelles couleurs**, avec des variantes de texte lisibles.
3. **La visibilité des stocks demande de nouvelles données**, pas seulement de nouveaux écrans.
   - Le code suit déjà les quantités achetées et reçues par article, et l'état d'un colis (correct, endommagé, ouvert).
   - Il ne connaît **ni entrepôt, ni emplacement, ni contrôle article par article** (§ 6).
4. **L'« IA » commence par des alertes à règles explicables**, pas par de l'IA.
   - Chaque alerte montre ses données et peut être vérifiée.
   - Elle n'est **jamais** présentée comme de l'IA.
   - Une vraie couche prédictive ne viendra qu'avec un historique suffisant (§ 7).
5. **Le Market sans catalogue doit rester honnête.**
   - Tant qu'aucun accès officiel (AliExpress, eBay) n'est ouvert, la page d'accueil ne peut pas afficher une grille de produits « du catalogue ».
   - Elle met en avant l'import par lien, les catégories et les commissionnaires (§ 9, décision R-7).
6. **Ordre proposé** : fondations, puis Business, puis Market, puis Admin. Les deux corrections urgentes de l'audit (dépendances vulnérables, clôture des commandes impayées) passent avant.

---

## 1. Méthode suivie (étapes 1 à 9)

| Étape | Fait | Constat principal |
|---|---|---|
| 1–2 `PRODUCT.md`, `DESIGN.md` | Oui | `DESIGN.md` décrit la direction « Bordereau » (cuivre en couleur principale, mobile d'abord) : **à remplacer** par la nouvelle direction (bleu, ordinateur d'abord) une fois celle-ci validée. `PRODUCT.md` reste juste sur le métier |
| 3 Architecture | Oui | Next 15.5, NestJS 11, Prisma 6, Postgres avec RLS. Aucune bibliothèque d'icônes, de graphiques ni de composants : tout est fait maison (Tailwind 4) |
| 4 Routes | Oui | Market : `/`, `/commissionnaires`, `/demande`, `/demandes`, `/commandes`, `/litiges`, `/notifications`, `/compte`. Business : 11 rubriques sous `/pro/`. Admin : 10 rubriques sous `/admin/`. **Aucune route** `/recherche` ni `/produits` |
| 5 Composants | Oui | `ui.tsx` (bouton, champ, carte, message, état vide, chargement), `nav.tsx` (barre latérale, onglets), `responsive-list.tsx` (cartes puis tableau, **sans tri, filtre ni sélection**), `status-pill.tsx`. Ni fenêtre de confirmation, ni panneau latéral, ni notification temporaire, ni graphique |
| 6 Pages | Oui | 50 pages ; captures à 390, 768 et 1440 px faites le 22/11 |
| 7 Fonctionnalités réelles | Oui | Voir l'audit, § 2 |
| 8 Captures de référence | Oui | Voir § 2 ci-dessous |
| 9 Écarts | Oui | § 3 à § 10 |

---

## 2. Ce que l'on retient des références (et ce que l'on écarte)

| Référence | On retient | On écarte |
|---|---|---|
| Stripe (Today, Reports overview) | Une valeur principale par carte, la comparaison avec la période précédente en petit, des courbes fines, beaucoup d'air, une typographie précise | Les indicateurs d'abonnement (MRR) : sans objet aujourd'hui |
| Shopify (Home) | La liste « à traiter » (« 6 orders to fulfill, 50+ payments to capture »), qui mène droit à l'action : c'est la colonne vertébrale de notre vue générale | La promotion de services maison au milieu du tableau de bord |
| Amazon (accueil) | Recherche omniprésente, rangée de catégories, sélections | La densité promotionnelle, les remises clignotantes, les recommandations « basées sur votre historique » (nous n'avons pas cet historique) |
| Consolidation de colis (Cart) | Onglets « prêts à expédier / hors gabarit / interdits », sélection multiple, coût d'expédition affiché avant validation : modèle exact pour **regrouper des colis** côté Business | Le paiement en ligne (Konzia n'encaisse pas, D-7) |
| Article endommagé (photos) | Fiche d'anomalie : référence, photos, motif : modèle pour le **contrôle à réception** | — |
| Calculateur de frais d'expédition | Saisie par étapes (trajet, dimensions, services), poids volumétrique lisible : modèle pour l'**estimation côté client** | Les couleurs saturées par bloc |
| AI Inventory Visibility | Score de santé, stock par lieu, mouvements entrées et sorties, recommandations avec impact | Le « score IA » sans source, les « 1,24 M unités » : volumes sans rapport avec Konzia. Nos recommandations seront des **alertes à règles** (§ 7) |
| Bada (admin) | Rangée d'indicateurs, commandes récentes, meilleurs vendeurs, inscriptions en attente, état du système | Les icônes colorées dans chaque carte (bruit visuel) |
| NexRoute (Orders) | Indicateurs au-dessus d'un tableau, filtres rapides en onglets (Tous, Réussis, En attente, Échoués), recherche, tri, export, pagination numérotée : **modèle de nos tableaux** | — |
| Dokani, Kraft | Graphique de revenus avec infobulle, tableau produits avec indicateur de risque | Les « recommandations IA » sans données ; le thème sombre comme thème principal |
| Cognicart (mobile) | Catégories en grille, filtres en pastilles, cartes produits à deux colonnes | « Plus que 2 en stock », « prix le plus bas sur 30 jours » : données que nous n'avons pas |
| Suivi sur carte, « My Shipping » | Frise d'étapes datées, carte de l'envoi en cours | **La carte en temps réel** : nous n'avons ni coordonnées GPS ni livreur suivi. Une carte serait décorative |
| Amazon Lens, traduction automatique | La recherche par image et la traduction des fiches : à garder en **phase ultérieure** | Toute promesse avant d'avoir un service réel (correspondance, coût) |

---

## 3. Architecture des trois espaces

| Espace | Routes (inchangées sauf mention) | Navigation |
|---|---|---|
| **Market** | `/`, `/recherche` (**nouvelle**), `/produits/[id]` (**nouvelle**, seulement avec un catalogue), `/commissionnaires`, `/commissionnaires/[slug]`, `/demande`, `/demandes`, `/commandes`, `/litiges`, `/notifications`, `/compte` | En-tête horizontal (recherche, lieu, devise, compte) ; espace client avec onglets « Commandes, Devis, Colis, Favoris… » |
| **Business** | `/pro/...` : les adresses restent, le nom affiché devient « Konzia Business » | Barre latérale groupée (Ventes, Logistique, Gestion), déjà en place ; ajout de **Vue générale**, **Entrepôt**, **Finances** |
| **Admin** | `/admin/...` | Barre latérale (déjà en place) ; ajout de **Santé de la plateforme**, **Signalements**, **Catégories**, **Sources** |

Règle : aucun lien de navigation d'un espace ne mène dans la logique d'un autre. Seul un lien explicite permet d'en changer (« Changer d'activité », « Espace Business »).

---

## 4. Système de tableaux (`DataTable`)

### 4.1 Prérequis côté serveur (bloquant)

Les listes pro (`GET /org/orders`, `/org/parcels`, `/org/requests`) renvoient **au plus 200 éléments**, triés du plus récent au plus ancien, **sans pagination et sans avertissement**. Au-delà, l'historique disparaît de l'écran.

À faire :
- une pagination par **curseur** côté serveur, avec recherche, filtres (statut, dates, client) et tri autorisés ;
- un format de réponse commun `{ items, nextCursor, total? }` ;
- garder les anciennes réponses le temps de la migration (aucune route cassée).

La console admin est déjà paginée et sert de modèle.

### 4.2 Le composant

| Fonction | Retenue | Remarque |
|---|---|---|
| Recherche instantanée | Oui | Côté serveur, après 300 ms sans frappe |
| Filtres combinables | Oui | En pastilles au-dessus du tableau, comme NexRoute ; un panneau de filtres pour les filtres avancés |
| Tri des colonnes | Oui | Seulement sur les colonnes indexées |
| Pagination | Oui | Curseur ; « Charger plus » sur téléphone |
| Colonnes masquables | Oui | Choix mémorisé dans le navigateur (préférence personnelle) |
| Sélection multiple et actions groupées | Oui, **là où une action groupée existe vraiment** | Exemples : confirmer plusieurs paiements, ajouter plusieurs articles à un colis, exporter une sélection |
| Export CSV | Oui | Existe pour commandes et colis ; ajouter les paiements (EF-108) |
| Vues sauvegardées | **Non pour l'instant** | Pas justifié à moins de 30 commandes par mois (volume du pilote) |
| Menu contextuel par ligne | Oui | Uniquement les actions permises au rôle |
| Panneau de détails latéral | Oui | Aperçu rapide d'une commande ou d'un colis sans quitter la liste ; la fiche complète reste une page |
| Historique des modifications | Oui | Il existe déjà (événements de commande, de colis, journal d'audit) ; on l'affiche dans le panneau |
| États chargement, vide, erreur | Oui | Composants existants, complétés par `ErrorState` |
| Téléphone | Cartes empilées | Déjà fait avec `ResponsiveList`, que `DataTable` remplacera |

---

## 5. Commandes et colis

### 5.1 Liste des commandes

Colonnes : identifiant, client, articles (nombre et premier titre), montant et devise, paiement (pastille), étape (pastille), **prochaine action**, dernière activité.

- **« Prochaine action » se calcule à partir des données existantes** : paiement à vérifier, achat à lancer, articles à recevoir, colis à expédier, remise à faire.
- Colonne « commissionnaire » : seulement côté client et admin, puisque côté Business c'est toujours soi-même.

### 5.2 Fiche commande

Onglets : Résumé · Articles · Devis (versions) · Paiements · Achats fournisseurs · Colis liés · Documents · Historique.

- Les actions autorisées sont dans un bandeau fixe.
- **Tout existe déjà dans l'API**, sauf « Documents » : reçus et factures PDF, prévus en V1.

### 5.3 Colis

Colonnes : identifiant, clients (nombre), commandes liées, articles, lieu, poids réel, dimensions, poids volumétrique, état (correct, endommagé, ouvert), statut, expédition.

**Confidentialité** : la vue Business voit tout le colis ; la vue client ne voit que ses articles (vues D8, inchangées).

### 5.4 États d'un article : ce qui existe et ce qui manque

| État demandé | Existe aujourd'hui ? | Source |
|---|---|---|
| Attendu | **Oui** | Quantité achetée moins quantité reçue |
| Reçu | **Oui** | `qty_received` par article et par achat fournisseur |
| Contrôlé | **Non** | Aucune étape de contrôle article par article |
| Endommagé | **Partiel** | Seulement au niveau du colis (`condition = damaged`), pas de l'article |
| Stocké (avec emplacement) | **Non** | Pas d'entrepôt ni d'emplacement ; seulement un texte libre « lieu » sur le colis |
| Dans un colis | **Oui** | Lien colis–article |
| Expédié | **Oui** | Colis rattaché à une expédition |
| Livré | **Partiel** | Commande « Terminée » sans preuve de remise (audit S-2, D-1, D-2) |

---

## 6. Visibilité des stocks (module Entrepôt)

### 6.1 Ce qu'il faut ajouter au modèle de données (décision R-3)

| Ajout | Contenu | Sécurité |
|---|---|---|
| `warehouses` | Entrepôts d'une organisation : nom, ville, pays, type (fournisseur, transit, distribution) | `organization_id`, RLS, GRANT, test d'isolation (règle du dépôt) |
| `item_receipts` | Réception d'un article : quantité, date, **contrôle** (conforme, endommagé, non conforme, manquant), photos, note, auteur | Insertion seule, comme les autres mouvements (pas de suppression physique) |
| Lien colis–entrepôt | Remplace le texte libre « lieu » (gardé pour l'historique) | — |

### 6.2 Indicateurs, avec leur source

| Indicateur | Calculable aujourd'hui | Après l'ajout |
|---|---|---|
| Articles attendus, reçus | Oui | Oui |
| Articles manquants | Partiel (achats « partiellement reçus ») | Oui |
| Articles contrôlés, endommagés, disponibles | Non | Oui |
| Colis à regrouper, prêts à expédier, en transit | Oui | Oui |
| Colis en retard | Partiel (délai annoncé dans le devis) | Oui, par étape |
| Vue par entrepôt, mouvements entrées et sorties | Non | Oui |

---

## 7. Couche « intelligence opérationnelle »

### 7.1 Phase 1 : alertes à règles (réalisables, vérifiables)

Chaque alerte affiche quatre choses :
- **ce qui est détecté** ;
- **les données** qui la justifient, en lien vers la commande ou le colis ;
- **l'action proposée** ;
- un bouton **« Vérifier »**, qui ouvre la source avant toute action.

Pas de « niveau de confiance » : une règle est vraie ou fausse.

| Alerte | Règle (sur des données existantes) |
|---|---|
| Risque de retard | Date d'acceptation + délai maximum annoncé dans le devis < aujourd'hui + X jours, et commande pas encore expédiée |
| Achat non reçu | Achat fournisseur « passé » depuis plus de N jours (N réglable) sans réception |
| Écart de poids | Poids mesuré du colis > poids estimé dans les devis des articles concernés de plus de 20 % (seuil réglable) |
| Colis immobile | Colis fermé, non expédié depuis plus de N jours |
| Paiement à vérifier | Déclaré depuis plus de 48 heures sans décision |
| Solde impayé à la remise | Commande prête à remettre avec un solde (lié à D-1) |

Le libellé de cette zone sera « **Alertes** » ou « **À surveiller** ». **Jamais « IA »**, puisque ce n'en est pas.

### 7.2 Phase 2 : vraie couche prédictive (plus tard, sous conditions)

- **Conditions** : plusieurs mois d'historique réel (délais par itinéraire, écarts de poids) et un service de prédiction choisi et évalué.
- **Affichage** : le niveau de confiance et les données d'entraînement résumées.
- **Garde-fou** : aucune case « IA » dans l'interface avant que le service ne tourne et ne soit testé.

---

## 8. Tableaux de bord et graphiques

**Choix technique (décision R-4)**. Aucune bibliothèque de graphiques n'est installée. Je recommande des **composants SVG maison**, sans nouvelle dépendance, légers sur un réseau mobile :
- courbe ;
- barres ;
- répartition par statut ;
- jauge d'objectif.

Chacun aura un titre, une période, une unité, une légende, des infobulles et un état « pas encore de données ».

| Espace | Question à laquelle chaque graphique répond |
|---|---|
| Business | Combien de commandes cette semaine, par rapport à la précédente ? Où sont bloquées mes commandes (répartition par étape) ? Combien me doit-on, et depuis quand (âge des soldes) ? Mes délais tiennent-ils (délai réel comparé au délai annoncé, par itinéraire) ? |
| Admin | Combien de commissionnaires actifs, en attente, suspendus ? Volume de commandes par semaine sur la plateforme. Litiges ouverts et délai de traitement. Santé : files d'envoi, erreurs, sauvegarde du jour |
| Client | Pas de graphique : une liste « en cours » et une frise par commande |

Aucun chiffre de revenu Konzia tant qu'il n'existe pas de modèle de revenu (D-3).

---

## 9. Konzia Market

| Élément | Avec catalogue connecté | **Sans catalogue (situation actuelle)** |
|---|---|---|
| Accueil | Maquette 1 telle quelle | Même structure, mais la grille de produits devient : l'**import par lien** en avant ; des **exemples d'articles importés récemment**, avec l'accord des clients (vraies demandes rendues anonymes) ; ou rien |
| Recherche | Maquette 2 | La recherche cherche dans les **commissionnaires** et les **catégories**, et propose l'import par lien. Pas de faux résultats de produits |
| Fiche produit | Maquette 3 | Remplacée par l'**écran de validation d'un lien importé**, qui existe déjà, restylé, avec le bloc « coût jusqu'à Lubumbashi » |
| Comparaison des commissionnaires | Tableau de la maquette 3 | Pareil, à partir des tarifs publiés : **nouveau champ du profil professionnel** |
| Avis | Notes sur 5 | **À construire** (audit P1-4) ; d'ici là, la mention « Pas encore d'avis » |
| Recherche par image | Plus tard | Non affichée |

---

## 10. Konzia Admin

Ordre de la barre latérale :
- Vue globale ;
- Utilisateurs, Organisations, Commissionnaires, Vérifications ;
- Commandes, Litiges, **Signalements** (nouveau) ;
- **Catégories**, **Sources** (nouveaux, avec le catalogue) ;
- Abonnements (avec D-3) ;
- Indicateurs ;
- Audit ;
- **Santé de la plateforme** (nouveau : files, erreurs, sauvegardes).

Règles déjà en place, à conserver :
- double authentification ;
- chaque lecture journalisée ;
- décisions motivées.

À ajouter :
- **fenêtre de confirmation** avant toute action sensible, qui rappelle l'objet et demande le motif ;
- **accès aux pièces d'identité à la demande** (bouton « Ouvrir », motif facultatif et journalisé) plutôt qu'un affichage direct. Le fonctionnement actuel est déjà proche.

---

## 11. Système de design

### 11.1 Jetons (décision R-1)

La palette fournie est conservée. Elle est **complétée par des variantes de texte** pour les trois couleurs qui ne passent pas le contraste de 4,5:1 sur fond blanc :

| Rôle | Fond, icône, bordure | Texte (calcul WCAG) |
|---|---|---|
| Attention | `#D98B20` | `#8A5300` (5,8:1 sur `#FFF3DF`) |
| Danger | `#D64545` | `#A12A2A` (7,3:1 sur blanc, 6,2:1 sur `#FDE7E7`) |
| Accent cuivre | `#B87345` | `#7E4A26` (7,3:1, texte) ; `#B87345` réservé au décor et aux grands éléments |

Le thème sombre est à redéfinir avec les mêmes noms de jetons. Il existe aujourd'hui pour la direction « Bordereau ».

### 11.2 Icônes (décision R-2)

La spécification demande **Lucide**. Deux options :
- **(a)** la bibliothèque `lucide-react`, qui n'ajoute au site que les icônes utilisées. C'est une dépendance, justifiée par l'exigence de cohérence ;
- **(b)** recopier à la main les tracés utilisés, comme dans les maquettes.

Je recommande **(a)**.

### 11.3 Composants

| Composant | État | Action |
|---|---|---|
| Button, Input (`Field`), EmptyState, LoadingState (`Loading`), Skeleton | Existent | Nouvelles couleurs ; tous les états (survol, focus, appui, désactivé, chargement, erreur) |
| Badge, StatusBadge | `StatusPill` existe | Renommer, ajouter une icône par statut (l'état n'est jamais porté par la seule couleur) |
| Tabs, navigation latérale | Existent (`nav.tsx`) | Restyler |
| ProductCard, MerchantCard, OrderCard, ParcelCard, TrackingTimeline | En partie (cartes de liste, frise du suivi client) | Extraire en composants partagés |
| **IconButton, SearchInput, Select, Dropdown, Dialog, Drawer, Tooltip, Toast, DataTable, FilterPanel, Pagination, MetricCard, ChartCard, AlertPanel, ErrorState, FileUploader** | **N'existent pas** | À créer (phase 1), en HTML natif d'abord (`<dialog>`, `popover`) pour éviter des dépendances |

---

## 12. Responsive et accessibilité

- **Ordinateur d'abord, sans oublier le téléphone.** La direction validée est « ordinateur d'abord », mais les clients et les commissionnaires du pilote utilisent surtout un téléphone Android en 4G (`PRODUCT.md`). Chaque écran sera donc **conçu à 1440 px puis réellement adapté à 390 px avant d'être livré**.
- **Contrôle sur cinq largeurs** : 390, 768, 1024, 1440 et 1920 px. Les captures automatiques existent déjà (`E2E_SHOT_WIDTHS`) : on y ajoute 1024 et 1920.
- **Accessibilité** : objectif WCAG 2.2 AA. Un audit automatique (axe) sera ajouté aux parcours de bout en bout, comme nouvelle dépendance de test, pour mesurer au lieu de supposer.

---

## 13. Phases proposées

| Phase | Contenu | Livrables (§ 15 de la compétence) |
|---|---|---|
| **0 — Urgences de l'audit** | P0-1 dépendances vulnérables ; P0-2 clôture des commandes impayées (selon D-1) | Tests, `pnpm verify` |
| **1 — Fondations** | Jetons et thème ; icônes ; pagination serveur des listes ; composants listés en § 11.3 ; `DESIGN.md` réécrit | Page de référence des composants ; captures avant et après ; aucune fonctionnalité modifiée |
| **2 — Business** | Vue générale (maquette 4, sur données réelles) ; tableaux Commandes, Colis, Demandes, Paiements ; fiche commande à onglets ; alertes à règles (§ 7.1) ; regroupement de colis inspiré de la capture « consolidation » | Parcours de bout en bout mis à jour ; captures sur 5 largeurs |
| **3 — Entrepôt** | Modèle `warehouses` et `item_receipts` (avec RLS) ; réception et contrôle avec photos ; vue par entrepôt ; indicateurs § 6.2 | Migrations, tests d'isolation, parcours |
| **4 — Market** | Accueil, recherche, comparaison des commissionnaires, espace client ; **en version « sans catalogue »** tant que R-7 n'est pas levé | Captures ; aucun produit factice |
| **5 — Admin** | Console restructurée, santé de la plateforme, confirmations | Tests d'accès et journalisation |
| **6 — Catalogue** | Connecteur AliExpress puis eBay (après acceptation des dossiers), fiches produits, recherche produits | Respect des conditions des plateformes |

---

## 14. Décisions demandées

| # | Décision | Ma recommandation |
|---|---|---|
| R-1 | Variantes de texte des couleurs (§ 11.1) | Accepter |
| R-2 | Icônes : `lucide-react` ou tracés recopiés | `lucide-react` |
| R-3 | Ajouter entrepôts et réceptions contrôlées au modèle de données (§ 6.1) | Oui, en phase 3 |
| R-4 | Graphiques maison en SVG plutôt qu'une bibliothèque | Oui |
| R-5 | Ordre des phases (§ 13) | Accepter, avec la phase 0 d'abord |
| R-6 | « Alertes à règles » d'abord, rien d'étiqueté IA avant un vrai service | Oui |
| R-7 | Market sans catalogue : import par lien mis en avant, aucune grille de produits factice | Oui, jusqu'à l'accès AliExpress ou eBay |
| R-8 | Adapter chaque écran à 390 px avant de le livrer, malgré « ordinateur d'abord » | Oui (réalité des utilisateurs du pilote) |
| — | Décisions de l'audit encore ouvertes : D-1 (clôture impayée), D-2 (code de remise), D-3 (revenu), D-4 (litiges), D-6, D-8, D-9, D-10 | Voir `docs/audit-2026-11-23.md` § 10 |
