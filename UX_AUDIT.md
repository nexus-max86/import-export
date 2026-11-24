# KONZIA — Audit UX/UI de l'existant (phase 0)

24/11/2026. Référentiels : la compétence `.claude/skills/konzia-product-design` et le plan directeur de livraison (transformation B).

Cet audit porte sur la branche `ccr-41e606b8-q0hia7`. **Aucune page de l'application n'est modifiée par cette phase.** Documents liés : `NAVIGATION_ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `docs/audit-2026-11-23.md` (audit fonctionnel et sécurité), `docs/refonte-ux-proposition.md`. Maquettes : https://claude.ai/artifact/KS4uZ4Rh6ZghSvqJg4tZjS.

**Méthode**

- lecture du code des 50 pages, des 24 fichiers de composants et des layouts ;
- captures automatiques à 390, 768 et 1440 px (22 et 23/11) ;
- relecture des 5 parcours de bout en bout ;
- mesures :
  - pages rendues côté client ;
  - plafonds des listes ;
  - dépendance des tests aux libellés ;
  - contrastes.

---

## A. Inventaire des pages (50)

Légende de l'état : **●** bon, à aligner sur le nouveau style · **◐** fonctionnel, mais l'expérience est à repenser · **○** absent ou très en dessous de la vision.

### Market : public et client (14 pages et 7 pages d'authentification)

| Route                                                                                                                 | Fonction                                                               | État | Remarque                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `/`                                                                                                                   | Accueil                                                                | ○    | Colonne de 448 px : titre et 3 boutons. Ni recherche, ni catégories, ni produits      |
| `/commissionnaires`                                                                                                   | Annuaire filtrable (ville, site)                                       | ◐    | Ne permet pas de comparer (ni tarifs, ni délais, ni avis)                             |
| `/commissionnaires/[slug]`                                                                                            | Profil public                                                          | ◐    | Ni tarifs, ni délais, ni avis                                                         |
| `/demande`                                                                                                            | Import d'un lien, saisie manuelle, capture, choix des commissionnaires | ◐    | Bon parcours ; étapes peu visibles ; plusieurs actions cuivre ; étroit sur ordinateur |
| `/demandes`                                                                                                           | Mes demandes                                                           | ●    | État vide correct                                                                     |
| `/demandes/[id]`                                                                                                      | Devis reçus                                                            | ◐    | Devis empilés : **pas de comparaison côte à côte (EF-52)**                            |
| `/commandes`                                                                                                          | Mes commandes                                                          | ●    | Tableau sur ordinateur, cartes sur téléphone                                          |
| `/commandes/[id]`                                                                                                     | Commande : historique, paiement, suivi, litige                         | ◐    | Longue colonne ; la prochaine action n'est pas mise en avant                          |
| `/litiges/[id]`                                                                                                       | Litige (fil de messages et preuves)                                    | ●    | —                                                                                     |
| `/notifications`                                                                                                      | Centre et préférences                                                  | ●    | Refait le 22/11                                                                       |
| `/compte`, `/compte/profil`                                                                                           | Compte, appareils, profil, adresses                                    | ◐    | Pas de navigation d'espace client                                                     |
| `/conditions`, `/confidentialite`                                                                                     | Textes légaux                                                          | ●    | Version de travail, à valider par un juriste                                          |
| `/connexion`, `/inscription`, `/verifier-email`, `/mot-de-passe-oublie`, `/reinitialiser`, `/invitation`, `/reclamer` | Authentification, invitation, réclamation de compte                    | ●    | Carte centrée ; isolée visuellement de la marque                                      |

### Business : commissionnaire (16 pages, sous `/pro/`)

| Route                    | Fonction                                                                 | État | Remarque                                                                                     |
| ------------------------ | ------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------- |
| `/pro`                   | Choix ou création de l'activité                                          | ●    | —                                                                                            |
| —                        | **Vue générale**                                                         | ○    | **Absente** : l'espace s'ouvre directement sur une liste                                     |
| `/pro/demandes`, `[id]`  | Demandes reçues, demande pour un client géré                             | ◐    | Tableau sans tri, filtre ni recherche ; **plafond de 100 à 200 éléments**                    |
| `/pro/devis/[id]`        | Rédaction d'un devis avec assistant de calcul                            | ◐    | Puissant ; le récapitulatif sort de l'écran pendant la saisie                                |
| `/pro/commandes`, `[id]` | Commandes, avancement, ajustements, règle d'achat, paiements, WhatsApp   | ◐    | **Plafond de 200** ; ni aperçu latéral ni « prochaine action » ; fiche sur une seule colonne |
| `/pro/achats`            | Achats chez les vendeurs, réception des quantités                        | ◐    | Formulaire et liste sur la même page                                                         |
| `/pro/colis`, `[id]`     | Colis : création, articles de plusieurs clients, mesures, photos, étapes | ◐    | La fiche ne groupe pas les articles par client et ne distingue pas leurs états               |
| `/pro/expeditions`       | Expéditions et étapes                                                    | ◐    | Pas de tableau ni de vue « en cours »                                                        |
| `/pro/paiements`         | À vérifier, « qui doit combien »                                         | ◐    | Ce n'est pas encore un module Finances ; **pas d'export des paiements**                      |
| `/pro/clients`           | Clients, client géré, import Excel, invitation                           | ◐    | Cartes peu denses sur ordinateur                                                             |
| `/pro/equipe`            | Membres, rôles, invitations                                              | ●    | —                                                                                            |
| `/pro/profil`            | Profil professionnel et dossier de vérification                          | ◐    | Mélange la vitrine publique et la conformité                                                 |
| `/pro/litiges`, `[id]`   | Litiges côté commissionnaire                                             | ●    | —                                                                                            |
| —                        | Réceptions, entrepôt, stocks, rapports                                   | ○    | **Absents**, et **sans données** pour les alimenter (voir G)                                 |

### Admin (13 pages, sous `/admin/`)

| Route                                                       | Fonction                                                     | État | Remarque                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------- |
| `/admin`                                                    | Vue globale                                                  | ◐    | 9 tuiles de chiffres : ni tendance, ni « à traiter », ni santé de la plateforme |
| `/admin/utilisateurs`, `/commandes`, `/paiements`, `/colis` | Listes paginées côté serveur, avec recherche                 | ◐    | Ni filtre, ni tri, ni panneau de détail                                         |
| `/admin/commissionnaires`, `[id]`                           | Dossiers, pièces (ouverture journalisée), décisions motivées | ◐    | Pas de **file** de vérification par ancienneté                                  |
| `/admin/litiges`, `[id]`                                    | Litiges : décision, clôture, réouverture                     | ●    | Pas de signalements                                                             |
| `/admin/journal`                                            | Journal d'audit                                              | ◐    | Liste brute, sans filtre par type ni par acteur                                 |
| `/admin/villes`, `/admin/taux`                              | Référentiels                                                 | ●    | —                                                                               |
| `/admin/securite`                                           | Activation de la double authentification                     | ●    | —                                                                               |

---

## B. Inventaire des composants réutilisables

| Fichier                                                                                                                                                  | Composants                                                                                                                                                                                                                                      | Verdict                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ui.tsx`                                                                                                                                                 | `Logo`, `Field`, `Button`, `buttonClass`, `Spinner`, `Notice`, `Card`, `EmptyState`, `Loading`, `PageLoading`                                                                                                                                   | **Conserver**, puis passer aux nouveaux jetons et compléter les états                   |
| `nav.tsx`                                                                                                                                                | `SideNav`, `ScrollNav`, `SidebarLayout`                                                                                                                                                                                                         | **Conserver**, enrichir (groupes, compteurs, sélecteur d'organisation)                  |
| `pro-nav.tsx`, `admin.tsx` (`AdminShell`, `AdminList`, `useAdmin`)                                                                                       | Coques Business et Admin                                                                                                                                                                                                                        | **Améliorer** : barre du haut, recherche globale ; `AdminList` remplacé par `DataTable` |
| `responsive-list.tsx`                                                                                                                                    | `ResponsiveList` (cartes, puis tableau)                                                                                                                                                                                                         | **Remplacer** par `DataTable` (même principe : cartes sur téléphone)                    |
| `status-pill.tsx`                                                                                                                                        | `StatusPill`                                                                                                                                                                                                                                    | **Améliorer** en `StatusBadge` (icône et texte)                                         |
| `order-view.tsx`, `order-actions.tsx`, `order-list.tsx`                                                                                                  | Fiche, actions et liste de commande                                                                                                                                                                                                             | **Conserver la logique**, réorganiser en onglets avec un encadré « prochaine action »   |
| `payments.tsx`                                                                                                                                           | Historique, déclaration et confirmation des paiements                                                                                                                                                                                           | **Conserver la logique** ; habillage Finances                                           |
| `parcels.tsx`                                                                                                                                            | `ParcelsBoard`, `ParcelEditor`, `fmtKg`                                                                                                                                                                                                         | **Conserver la logique** ; fiche colis groupée par client                               |
| `purchases.tsx`, `shipments.tsx`, `tracking.tsx`                                                                                                         | Achats, expéditions, suivi client, export CSV                                                                                                                                                                                                   | **Conserver la logique** ; tableaux et frises                                           |
| `quote-card.tsx`, `request-items.tsx`                                                                                                                    | Devis et articles d'une demande                                                                                                                                                                                                                 | **Conserver** ; ajouter une vue comparative                                             |
| `disputes.tsx`, `notifications.tsx`, `whatsapp.tsx`, `customer-import.tsx`, `place-select.tsx`, `token-action.tsx`, `commissioner-bits.tsx`, `legal.tsx` | Composants métier                                                                                                                                                                                                                               | **Conserver**, restyler                                                                 |
| `lib/api.ts`, `format.ts`, `money-input.ts`, `use-org.ts`                                                                                                | Accès API, formats, montants, organisation active                                                                                                                                                                                               | **Conserver sans changement**                                                           |
| —                                                                                                                                                        | IconButton, SearchInput, Select, Dropdown, **Dialog**, **Drawer**, Tooltip, **Toast**, **DataTable**, FilterPanel, Pagination, **MetricCard**, **ChartCard**, AlertPanel, ErrorState, FileUploader, ProductCard, MerchantCard, TrackingTimeline | **À créer** (`DESIGN_SYSTEM.md`)                                                        |

**Point positif** : la logique métier des écrans vit dans des composants séparés des pages. La refonte peut donc changer la présentation sans toucher aux appels d'API ni aux règles.

---

## C. Cartographie des parcours

| Parcours                           | Écrans aujourd'hui                                                             | Point de friction                                                                                     | Couvert par un test de bout en bout |
| ---------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Inscription et connexion           | `/inscription` → e-mail → `/connexion`                                         | Aucun majeur                                                                                          | Oui                                 |
| Demande de devis                   | `/` → `/demande` (lien ou saisie) → choix des commissionnaires → envoi         | L'accueil ne mène pas à la recherche ; étapes peu visibles                                            | Oui                                 |
| Comparaison et acceptation         | `/demandes/[id]` → accepter, refuser ou demander une correction                | **Pas de comparaison côte à côte**                                                                    | Oui (acceptation)                   |
| Paiement direct                    | `/commandes/[id]` → déclaration → confirmation par le commissionnaire          | Les instructions de paiement sont peu visibles en tête                                                | Oui                                 |
| Traitement d'une demande           | `/pro/demandes` → `/pro/demandes/[id]` → `/pro/devis/[id]` → envoi             | Pas de file « à traiter » sur une vue générale                                                        | Oui                                 |
| Commande, achat, colis, expédition | `/pro/commandes/[id]` → `/pro/achats` → `/pro/colis/[id]` → `/pro/expeditions` | **Navigation dispersée** : 4 rubriques sans liens croisés systématiques ; aucune « prochaine action » | Oui                                 |
| Remise et clôture                  | `/pro/commandes/[id]` → changements d'étape                                    | Ni preuve de remise ni confirmation par le client ; clôture possible avec un solde impayé (audit S-2) | Non                                 |
| Client géré, puis réclamation      | `/pro/clients` → lien → `/reclamer`                                            | Aucun majeur                                                                                          | Oui                                 |
| Vérification d'un commissionnaire  | `/pro/profil` → `/admin/commissionnaires/[id]` → décision                      | Pas de file côté admin                                                                                | Oui                                 |
| Litige                             | `/commandes/[id]` → `/litiges/[id]` → `/admin/litiges/[id]`                    | Aucun majeur                                                                                          | Non (tests d'API seulement)         |

---

## D. Incohérences visuelles

1. **Deux directions coexistent.**
   - L'application est en « Bordereau » (cuivre en couleur principale, mobile d'abord).
   - Les maquettes et la direction validée sont en bleu et pensées d'abord pour l'ordinateur.
   - `DESIGN.md` décrit encore « Bordereau ».
2. **Le cuivre plein apparaît plusieurs fois par écran** (`/demande`, fiche colis), contrairement à la règle de `DESIGN.md`.
3. **Icônes hétérogènes** : une douzaine de tracés dessinés à la main, sans bibliothèque.
4. **Largeurs de contenu disparates** : 448, 672, 896, 1024 et 1152 px selon les pages, sans logique par espace.
5. **Statuts portés par la couleur seule** : les pastilles n'ont pas d'icône.
6. **Trois couleurs de la palette cible ne sont pas lisibles en texte** : orange, rouge et cuivre (contrastes de 2,7, 4,4 et 3,8). D'où les teintes de texte proposées dans `DESIGN_SYSTEM.md`.
7. **Les liens d'action** sont tantôt soulignés, tantôt présentés comme des boutons.

## E. Difficultés UX

1. **Pas de « où en suis-je »** : ni vue générale Business, ni file admin, ni vue d'ensemble client.
2. **Pas de « prochaine action »** sur les commandes : il faut ouvrir chaque fiche pour savoir quoi faire.
3. **Navigation dispersée** entre commande, achat, colis et expédition, avec peu de liens croisés.
4. **Listes sans recherche, tri ni filtre** côté Business, et tronquées au-delà de 200 éléments.
5. **Aucune fenêtre de confirmation** pour les actions sensibles. Le motif est demandé dans la page, de façon inégale.
6. **Retours d'action discrets** : messages dans la page, sans notification temporaire.
7. **Erreurs sans « Réessayer »**, ce qui pèse sur un réseau mobile instable.
8. **Comparaison impossible** des devis comme des commissionnaires.
9. **Formulaires longs toujours ouverts** (achats, expéditions), au lieu d'une création dans un panneau.
10. **1024 et 1920 px jamais contrôlés.**

## F. Composants : conserver, améliorer, créer

Voir B pour le détail. En résumé :

- **conserver** : 9 composants de base et la logique métier des 18 composants d'écran ;
- **améliorer** : 6 composants (coques, pastilles, listes) ;
- **créer** : 19 composants listés dans `DESIGN_SYSTEM.md` § 5.

## G. Limitations backend qui pèsent sur l'interface

| Limitation                                                                                                | Conséquence pour l'interface                                                                                                   | Ce qu'il faudrait (validation requise)                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Listes pro **plafonnées** (100 à 500 éléments), sans pagination, tri ni filtre côté serveur               | Un vrai `DataTable` est impossible sans risque de données manquantes                                                           | Paramètres facultatifs de pagination, tri, recherche et filtres (R-9), sans casser la réponse actuelle |
| Ni entrepôt, ni emplacement, ni contrôle article par article ; « endommagé » seulement au niveau du colis | Les états « contrôlé », « disponible » et « endommagé (article) », ainsi que la vue par entrepôt, ne peuvent pas être affichés | Tables `warehouses` et `item_receipts` (R-3)                                                           |
| Pas de tarifs publiés sur le profil professionnel                                                         | La comparaison des commissionnaires (Market) n'a rien à comparer avant un devis                                                | Champs de tarifs (R-10)                                                                                |
| Pas d'avis ni de signalements                                                                             | Notes et module Signalements impossibles                                                                                       | Nouvelles tables (P1-4, R-11)                                                                          |
| Aucun catalogue produit (aucun accès AliExpress ou eBay)                                                  | Grilles de produits, recherche de produits et fiche produit impossibles avec de vraies données                                 | Connecteurs, après acceptation des dossiers (audit § 6)                                                |
| Pas de recherche par image ni de traduction                                                               | Bouton photo sans service derrière                                                                                             | Service à choisir ; plus tard                                                                          |
| Pas d'indicateurs agrégés côté serveur (séries par semaine, ancienneté des soldes)                        | Graphiques impossibles sans tout charger dans le navigateur                                                                    | Routes de statistiques en lecture (ajout d'API)                                                        |
| 47 pages sur 50 rendues dans le navigateur, sans `sitemap` ni `robots`                                    | Pages publiques (accueil, annuaire, profils) **non référençables**                                                             | Rendu côté serveur des pages publiques (dans la stack Next.js actuelle)                                |
| Pas de modèle de revenu (abonnements)                                                                     | Module Abonnements admin vide                                                                                                  | Décision D-3                                                                                           |
| Sentry non configuré                                                                                      | La carte « Santé » ne peut pas montrer les erreurs                                                                             | DSN à fournir                                                                                          |
| Clôture possible avec un solde impayé, sans preuve de remise                                              | « Livré » et « remise » non fiables à l'écran                                                                                  | Décisions D-1 et D-2                                                                                   |

## H. Risques de régression et parades

| Risque                                      | Mesure                                                                                           | Parade                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Tests de bout en bout liés aux libellés** | **257** sélecteurs (`getByRole`, `getByText`, `getByLabel`) dans 4 fichiers ; 74 par texte exact | Renommer un libellé seulement avec son test, dans le même lot ; préférer les sélecteurs par rôle                               |
| Changement des adresses de pages            | 50 routes                                                                                        | **Aucune route supprimée ni renommée** ; nouvelles routes seulement en ajout ; une redirection si un regroupement s'impose     |
| Permissions dans la navigation              | 85 routes pro avec permission (`@ForOrg`)                                                        | La navigation n'affiche que ce que le rôle permet ; tests par rôle (propriétaire, commercial, acheteur, logistique, comptable) |
| Isolation entre organisations               | 32 tables avec RLS testées                                                                       | Aucune requête nouvelle hors `TenantDb.run` ; toute nouvelle table ajoutée à `tenancy-tables.ts`                               |
| Logique métier mêlée à la présentation      | 18 composants métier                                                                             | Changer l'habillage, pas les appels ; tests d'API inchangés (335)                                                              |
| Plusieurs espaces modifiés à la fois        | 3 espaces                                                                                        | Un lot par espace, chacun vérifiable et réversible (plan directeur, § 15)                                                      |
| Thème sombre                                | Existe pour « Bordereau »                                                                        | Redéfini avec les mêmes noms de jetons                                                                                         |
| Performance sur mobile                      | 1 police (35 Ko), aucune bibliothèque d'icônes ni de graphiques                                  | `lucide-react` n'ajoute que les icônes utilisées ; graphiques SVG maison ; mesure avant et après                               |
| Données fictives                            | Maquettes avec exemples                                                                          | Aucune donnée d'exemple dans l'application ; états vides réels                                                                 |

## I. Possibilités d'amélioration, par priorité

| Écran                                          | État actuel | Problème                                      | Amélioration proposée                                                                                | Priorité                     |
| ---------------------------------------------- | ----------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| Accueil Market                                 | ○           | Pas une place de marché                       | Maquettes 1 (ordinateur) et 5 (téléphone), en version « sans catalogue » tant que R-7 n'est pas levé | P1                           |
| Vue générale Business                          | ○           | Absente                                       | Maquette 4 sur des données existantes                                                                | P1                           |
| Commandes Business                             | ◐           | Plafond, ni tri ni filtre, pas d'aperçu       | Maquette 6 : tableau, panneau latéral, prochaine action (après R-9)                                  | P1                           |
| Colis Business                                 | ◐           | Articles non groupés par client, états confus | Maquette 7 : fiche colis groupée par client, avec états                                              | P1                           |
| Vue globale Admin                              | ◐           | Tuiles brutes                                 | Maquette 8 : à traiter, tendances, santé, activité                                                   | P1                           |
| Système de design                              | ◐           | Deux directions                               | Planche 9 et `DESIGN_SYSTEM.md`                                                                      | P1                           |
| Comparaison des devis                          | ◐           | EF-52 non tenue                               | Tableau comparatif                                                                                   | P1                           |
| Finances Business                              | ◐           | Pas de module ni d'export des paiements       | Module Finances                                                                                      | P1                           |
| Commandes client                               | ◐           | Fiche longue                                  | Frise, prochaine action, onglets                                                                     | P2                           |
| Demande (Market)                               | ◐           | Étapes peu visibles                           | Parcours par étapes avec récapitulatif                                                               | P2                           |
| Rédaction de devis                             | ◐           | Récapitulatif hors de vue                     | Deux colonnes, récapitulatif fixe                                                                    | P2                           |
| Achats, expéditions, clients                   | ◐           | Formulaires longs, cartes                     | Tableaux et création en panneau                                                                      | P2                           |
| Listes admin et journal                        | ◐           | Ni filtre ni panneau                          | `DataTable` et panneau                                                                               | P2                           |
| Vérifications admin                            | ◐           | Pas de file                                   | File par ancienneté                                                                                  | P2                           |
| Réceptions, entrepôt, stocks                   | ○           | Pas de données                                | Après R-3                                                                                            | P2 (bloqué par une décision) |
| Authentification, légal, notifications, équipe | ●           | —                                             | Nouveau style                                                                                        | P3                           |
