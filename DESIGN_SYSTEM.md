# KONZIA — Système de design (proposition)

24/11/2026. Ce système remplacera la direction « Bordereau » décrite dans `DESIGN.md`, **après validation**. Planche visuelle : artboard 9 des maquettes (https://claude.ai/artifact/KS4uZ4Rh6ZghSvqJg4tZjS).

Une fois validé, il sera mis en œuvre dans `apps/web/src/app/globals.css` (jetons Tailwind 4) et dans les composants. Une page de démonstration des composants est prévue en phase 1 (`/design-system`, réservée au développement).

---

## 1. Identité

**Un écosystème, trois expériences, une même grammaire.**

- Le **bleu** sert à agir.
- L'**encre** sert à lire.
- Le **cuivre** porte la marque.

**Ce qui rend KONZIA reconnaissable** (ce n'est pas un modèle de SaaS) :

1. **Le K et le point cuivre**. Le point marque aussi le « non lu » et ce qui demande une attention.
2. **La barre de trajet** : Achat → Entrepôt → Transport → Lubumbashi → Remise. Elle est présente dans le Market (suivi), dans Business (panneau de commande) et dans les alertes.
3. **Le bloc « coût poste par poste »** : chaque montant est qualifié (fournisseur, transport, commission, douane, estimation ou confirmé).
4. **Les références en chasse fixe et copiables** : `KZ-2026-004388`, `KZ-P-7KD3QX`.
5. **La trame « plan »** : un quadrillage fin dans les en-têtes Market, à la place des dégradés.
6. **Les espaces se reconnaissent d'un coup d'œil** : Market sur un en-tête blanc, Business avec une barre latérale blanche, Admin avec une barre latérale encre.

## 2. Couleurs

Palette officielle du plan directeur, **complétée** par des teintes de texte qui passent le contraste WCAG AA. Les ratios sont calculés.

| Jeton                                       | Valeur                            | Usage                                      | Contraste                                            |
| ------------------------------------------- | --------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `primary`                                   | `#2457F5`                         | Action principale, lien, sélection         | blanc sur bleu 5,6:1                                 |
| `primary-dark`                              | `#1742C5`                         | Survol, appui, texte sur `primary-soft`    | —                                                    |
| `primary-soft`                              | `#EEF2FE`                         | Sélection, pastille d'information          | —                                                    |
| `bg`                                        | `#F7F8FC`                         | Fond des pages                             | —                                                    |
| `surface`                                   | `#FFFFFF`                         | Cartes, tableaux, panneaux                 | —                                                    |
| `sunken`                                    | `#F1F4FA`                         | En-tête de tableau, survol de menu         | —                                                    |
| `ink`                                       | `#172033`                         | Texte principal                            | 16:1                                                 |
| `ink-2`                                     | `#3D4659`                         | Texte secondaire appuyé                    | 9,5:1                                                |
| `muted`                                     | `#697386`                         | Métadonnées                                | 4,5:1 sur `bg`                                       |
| `border` / `border-strong`                  | `#E5E9F2` / `#D5DBE8`             | Filets / champs                            | —                                                    |
| `success` / `success-text` / `success-soft` | `#16845B` / `#11694A` / `#E6F4EE` | Payé, confirmé, remis                      | texte 5,9:1                                          |
| `warning` / `warning-text` / `warning-soft` | `#D98B20` / `#8A5300` / `#FFF3DF` | En attente, estimation, acompte            | texte 5,8:1 (`#D98B20` en texte : 2,7, **interdit**) |
| `danger` / `danger-text` / `danger-soft`    | `#D64545` / `#A12A2A` / `#FDE7E7` | Refus, retard, erreur                      | texte 6,2:1 (`#D64545` en texte : 4,4, **interdit**) |
| `accent` / `accent-text` / `accent-soft`    | `#B87345` / `#7E4A26` / `#F6EDE6` | Point de marque, « Business », « bientôt » | texte 7,3:1 (`#B87345` en texte : 3,8, **interdit**) |
| `admin-ink`                                 | `#121A2B`                         | Barre latérale Admin                       | —                                                    |

**Règles**

- Une seule action en bleu plein par zone (carte, panneau, barre d'outils).
- L'état n'est **jamais porté par la couleur seule** : il y a toujours une icône et un texte.

**Thème sombre** : mêmes noms de jetons, valeurs redéfinies. Il sera livré avec la phase 1.

## 3. Typographie : Archivo (variable, 35 Ko)

| Style     | Ordinateur | Téléphone | Graisse                           | Usage                                  |
| --------- | ---------- | --------- | --------------------------------- | -------------------------------------- |
| `display` | 52/56      | 34/38     | 800, interlettrage −2,5 %         | Accueil Market                         |
| `h1`      | 30/36      | 24/30     | 800                               | Titre de page                          |
| `h2`      | 22/28      | 20/26     | 800                               | Section                                |
| `h3`      | 17/24      | 16/22     | 700                               | Titre de carte ou de panneau           |
| `body`    | 15/22      | 15/22     | 400                               | Texte courant                          |
| `small`   | 13/18      | 13/18     | 400–600                           | Métadonnées                            |
| `caption` | 12/16      | 12/16     | 600, capitales espacées           | En-tête de tableau, intitulé de groupe |
| `metric`  | 30/36      | 26/32     | 800, chiffres alignés             | Valeur d'indicateur                    |
| `mono`    | 13–15      | 13–15     | 700, police système à chasse fixe | Références                             |

## 4. Espacements, formes, profondeur, mouvement, grilles

| Thème                    | Valeurs                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Espacement (pas de 4 px) | 4, 8, 12, 16, 20, 24, 32, 40, 56, 72                                                                                                         |
| Rayons                   | 10 (champs, boutons) · 14 (cartes) · 16 (panneaux, fenêtres) · pilule (pastilles)                                                            |
| Ombres                   | Aucune sur les cartes · `sm` (menus, infobulles) · `lg` (panneau latéral, fenêtre, notification temporaire)                                  |
| Mouvement                | 120 ms (survol, appui) · 180 ms (changement d'état) · 240 ms (ouverture d'un panneau) ; courbe de sortie ; `prefers-reduced-motion` respecté |
| Points de rupture        | 640 · 1024 · 1440 · 1920                                                                                                                     |
| Largeurs de contenu      | Market 1360 · Business et Admin : fluide avec barre latérale (contenu jusqu'à 1600) · formulaires 640                                        |
| Densité des tableaux     | 52 px (confortable) · 40 px (compacte)                                                                                                       |

## 5. Composants

**Icônes** : **Lucide**, trait de 1,8 à 2, 16, 18 ou 20 px. Les icônes linéaires sont la règle ; l'icône pleine est réservée à l'état actif (étoile d'avis, point cuivre). Ajout proposé de `lucide-react` (R-2).

**États obligatoires de chaque composant interactif** :

- défaut, survol, focus visible (anneau bleu de 2 px avec un décalage de 2 px), appui, désactivé, chargement, erreur ;
- succès quand c'est pertinent.

| Composant                                        | Variantes                                                                          | Existe ?                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Button                                           | principal, secondaire, discret, danger ; tailles 34, 40, 46, 52                    | Oui (à restyler)                                   |
| IconButton                                       | Libellé accessible obligatoire                                                     | À créer                                            |
| Input, Select, Checkbox, Radio                   | Avec aide et erreur reliées au champ                                               | En partie (`Field`)                                |
| SearchInput                                      | Raccourci clavier, effacement, suggestions                                         | À créer                                            |
| Badge, StatusBadge                               | Succès, attention, danger, info, neutre, bientôt ; **icône et texte**              | `StatusPill` à remplacer                           |
| Tabs                                             | Avec compteur                                                                      | En partie                                          |
| Dropdown, menu « ⋯ »                             | Clavier complet (flèches, Échap)                                                   | À créer                                            |
| Dialog                                           | Confirmation avec motif ; destructive                                              | À créer                                            |
| Drawer                                           | Aperçu latéral (460 px) ; création rapide ; plein écran sur téléphone              | À créer                                            |
| Tooltip                                          | Au survol **et** au focus                                                          | À créer                                            |
| Toast                                            | Succès, erreur avec « Réessayer » ; rôle d'annonce pour les lecteurs d'écran       | À créer                                            |
| **DataTable**                                    | Voir § 6                                                                           | À créer (remplace `ResponsiveList` et `AdminList`) |
| FilterPanel, Pagination                          | Pastilles, feuille sur téléphone ; curseur                                         | À créer                                            |
| MetricCard                                       | Valeur, comparaison, lien                                                          | À créer                                            |
| ChartCard                                        | Courbe, barres, répartition, jauge (SVG maison, R-4)                               | À créer                                            |
| AlertPanel                                       | Alerte à règle : constat, données, action, « Vérifier »                            | À créer                                            |
| TrackingTimeline, barre de trajet                | Étapes datées ; étapes futures en pointillé                                        | En partie (suivi client)                           |
| ProductCard, MerchantCard, OrderCard, ParcelCard | Cartes métier                                                                      | En partie                                          |
| EmptyState, LoadingState, Skeleton               | —                                                                                  | Oui                                                |
| ErrorState                                       | Avec « Réessayer »                                                                 | À créer                                            |
| FileUploader                                     | Glisser-déposer ; photo sur téléphone ; contrôle du type sur le serveur (existant) | En partie                                          |

**Composants propres à chaque espace**

- **Market** : en-tête à recherche universelle, ProductCard, MerchantCard, bloc « coût », tableau comparatif.
- **Business** : barre latérale claire, menu « Créer », DataTable dense, AlertPanel.
- **Admin** : barre latérale encre, file de traitement, carte « Santé ».

## 6. Tableau de référence (`DataTable`)

Disposition :

1. onglets de statut avec compteurs ;
2. barre d'outils : recherche, filtres en pastilles, « Colonnes », densité, export ;
3. tableau :
   - en-tête fixe au défilement ;
   - sélection ;
   - colonnes triables, avec `aria-sort` ;
   - menu par ligne, limité aux actions permises au rôle ;
4. barre d'actions groupées dès la première sélection (seulement des actions réelles) ;
5. pagination par curseur (« 1–25 sur 48 ») ;
6. **clic sur une ligne : panneau latéral** (Échap pour fermer), puis « Ouvrir la fiche ».

**Sur téléphone** : cartes, filtres en feuille montante, « Charger plus ».

**Petites listes** : pour moins de 20 éléments sans action groupée, une simple liste, sans barre d'outils.

**Prérequis** : pagination, tri et filtres côté serveur (R-9).

## 7. Graphiques

Chaque graphique répond à une question écrite dans son titre et indique sa période, son unité et sa légende. Il a des infobulles au survol **et** au clavier, un équivalent textuel (`aria-label` ou tableau), et un état « pas encore de données ».

Couleurs :

- série principale `primary` ;
- comparaison `#C9D6FC` ;
- répartitions : succès, attention, danger, neutre `#B6BECD`.

Les teintes d'une répartition **diffèrent aussi en clarté** et sont doublées d'une légende textuelle.

## 8. Accessibilité (objectif WCAG 2.2 AA)

- Contrastes : tableau du § 2.
- Cibles tactiles d'au moins 44 px sur téléphone, 36 px sur ordinateur.
- Focus toujours visible.
- Navigation clavier complète : tableaux, menus, panneaux, fenêtres (focus piégé dans les fenêtres, puis rendu à l'élément d'origine).
- Structure de titres continue.
- Libellés sur tous les champs.
- Erreurs reliées à leur champ.
- Mouvement réduit respecté.
- Un audit automatique (axe) sera ajouté aux parcours de bout en bout.
