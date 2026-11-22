# Konzia — système de design

Source de vérité des jetons : `apps/web/src/app/globals.css`. Composants : `apps/web/src/components/ui.tsx` et `nav.tsx`. Toute décision graphique nouvelle s'inscrit ici.

## Direction artistique : « Bordereau »

Konzia est un **comptoir de fret**, pas une boutique. L'interface emprunte au bordereau d'expédition : du papier clair, de l'encre, des filets fins, des références lisibles en chasse fixe (`KZ-2026-000123`, `KZ-P-7KD3QX`), et une seule couleur forte, le **cuivre** du Katanga, réservée à ce qu'il faut faire maintenant.

- **Personnalité** : sérieuse, directe, chaleureuse sans être familière. Le ton d'un bon commissionnaire : il dit le prix, le délai et ce qui reste à payer.
- **Ce que l'on refuse** : dégradés, ombres portées marquées, illustrations décoratives, cartes empilées sans hiérarchie, cuivre utilisé pour décorer.

Directions écartées (étude du 22/11/2026) :

1. « Marché numérique », coloré et à base de photos produits : trop lourd en données, et il ferait croire que Konzia vend les articles.
2. « Fintech » sombre à dégradés : générique, et en décalage avec un public qui paie en espèces et en Mobile Money.

## Couleurs

Thème clair, puis thème sombre (même nom de jeton, valeur redéfinie). Contrastes mesurés au calcul WCAG.

| Rôle                   | Jeton                    | Clair                      | Sombre            | Usage                                       |
| ---------------------- | ------------------------ | -------------------------- | ----------------- | ------------------------------------------- |
| Primaire               | `copper`                 | #b05a2a                    | #de8a57           | Action principale, sélection, lien d'action |
| Primaire appuyé        | `copper-strong`          | #934819                    | #ec9f70           | Survol du bouton principal                  |
| Texte sur primaire     | `on-copper`              | #ffffff (4,8:1)            | #0f1519 (6,9:1)   | Texte des boutons cuivre                    |
| Secondaire (fond doux) | `copper-soft`            | #f6e7dd                    | #3a271c           | Élément actif de navigation                 |
| Texte principal        | `ink`                    | #16212b                    | #e7edf1           | Corps, titres                               |
| Texte secondaire       | `muted`                  | #5b6b78 (4,8:1 sur canvas) | #9aabb8           | Méta, aides, dates                          |
| Fond                   | `canvas`                 | #eef1f3                    | #0f1519           | Page                                        |
| Surface                | `surface`                | #ffffff                    | #172027           | Cartes, champs                              |
| Surface en creux       | `sunken`                 | #f5f7f8                    | #131b21           | En-têtes de tableau, survol                 |
| Bordure                | `line` / `line-strong`   | #dbe1e5 / #c3ccd3          | #2a3741 / #3a4954 | Filets / champs                             |
| Succès                 | `ok` / `ok-soft`         | #1f7a4d / #e0f1e8 (4,5:1)  | #5ec48f / #173326 | Payé, confirmé, vérifié                     |
| Attention              | `warn` / `warn-soft`     | #7a5000 / #f8ecd2 (6,0:1)  | #e6b866 / #352a12 | En attente, en transport, estimation        |
| Erreur                 | `danger` / `danger-soft` | #b3261e / #f9e0de (5,2:1)  | #f08a82 / #3d1c1a | Refus, litige, erreur de saisie             |
| Information            | `info` / `info-soft`     | #285e80 / #e0edf5 (5,9:1)  | #7fb8dc / #16293a | Messages neutres                            |

Règles :

- Le cuivre plein n'apparaît qu'**une fois par écran**, sur l'action principale.
- « Attention » n'est plus du cuivre : une commande en attente ne doit pas ressembler à un bouton.
- Le vert WhatsApp (#1f7a4d) est réservé au bouton « Ouvrir dans WhatsApp ».

## Typographie

Une seule famille : **Archivo**, en version variable (graisses 100 à 900, 35 Ko en alphabet latin), la même que le logo et l'icône. Les chiffres sont alignés (`tabular-nums`) dans les tableaux et les montants ; les références utilisent la police à chasse fixe du système.

| Rôle                                   | Classe                                 | Taille / graisse                  |
| -------------------------------------- | -------------------------------------- | --------------------------------- |
| Display (logo)                         | `font-display text-2xl font-extrabold` | 24 px / 800                       |
| H1 (titre de page)                     | `font-display text-2xl font-bold`      | 24 px / 700, interlettrage −1,5 % |
| H2 (titre de carte)                    | `font-display text-lg font-bold`       | 18 px / 700                       |
| H3                                     | `font-semibold`                        | 16 px / 600                       |
| Corps                                  | (défaut)                               | 16 px / 400                       |
| Corps secondaire                       | `text-sm text-muted`                   | 14 px / 400                       |
| Légende                                | `text-xs text-muted`                   | 12 px / 400                       |
| Libellé de champ                       | `text-sm font-semibold`                | 14 px / 600                       |
| Bouton                                 | `font-semibold`                        | 16 px / 600                       |
| Intitulé de groupe, en-tête de tableau | `text-xs uppercase tracking-wide`      | 12 px / 600                       |

## Espacements et formes

- Échelle Tailwind (pas de 4 px) : 1, 1,5, 2, 3, 4, 5, 6, 8, 10. Les écarts entre blocs d'une page valent 5 (20 px) ; à l'intérieur d'une carte, 4 (16 px).
- Rayons : 8 px pour les champs et boutons, 16 px pour les cartes, en pilule pour les pastilles et onglets.
- Profondeur : des filets, jamais d'ombre portée, sauf l'anneau de focus.
- Largeur de contenu : 448 px (formulaires courts), 672 px (pages de travail), 896 px (administration).

## Composants

| Composant                     | Où                            | Règles                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` / `buttonClass()`    | `ui.tsx`                      | Variantes `primary`, `secondary`, `ghost`, `danger`. Hauteur ≥ 44 px. Compression à 97 % à l'appui. État occupé : indicateur qui tourne + « Un instant… ». `buttonClass()` donne le même aspect à un lien. |
| `Field`                       | `ui.tsx`                      | Libellé visible, aide ou erreur reliée par `aria-describedby`.                                                                                                                                             |
| Listes, zones de texte, cases | `globals.css` (`@layer base`) | Même fond, même bordure, même anneau de focus cuivre, quelle que soit la page. Cases en cuivre.                                                                                                            |
| Sélecteur de fichier          | `globals.css`                 | Bouton secondaire.                                                                                                                                                                                         |
| `Notice`                      | `ui.tsx`                      | Tons `info`, `ok`, `warn`, `error` ; `role="alert"` pour une erreur. Apparition en fondu.                                                                                                                  |
| `StatusPill`                  | `status-pill.tsx`             | Tons `ok`, `warn`, `info`, `bad`, `neutral`.                                                                                                                                                               |
| `Card`                        | `ui.tsx`                      | Surface blanche, filet, rayon 16 px.                                                                                                                                                                       |
| `EmptyState`                  | `ui.tsx`                      | Bordure en tirets, titre qui dit ce qui manque, texte qui dit comment le faire apparaître.                                                                                                                 |
| `Loading`, `PageLoading`      | `ui.tsx`                      | Silhouette pulsée ; « Chargement… » reste lu par les lecteurs d'écran.                                                                                                                                     |
| `ScrollNav`                   | `nav.tsx`                     | Onglets défilants (téléphone, tablette) : fondu en bord d'écran, onglet courant recentré.                                                                                                                  |
| `SideNav`, `SidebarLayout`    | `nav.tsx`                     | Barre latérale à partir de 1024 px, rubriques groupées, repère cuivre animé sur la page courante.                                                                                                          |
| Tableaux                      | `admin.tsx` et pages          | En-tête en surface en creux, filet entre lignes, survol léger, défilement horizontal dans un cadre.                                                                                                        |
| Notifications                 | `notifications.tsx`           | Non lue : filet et point cuivre, texte en encre ; lue : texte secondaire. Cloche en icône sous 640 px.                                                                                                     |

Pas encore créés, faute d'usage réel dans l'application : fenêtre modale, tiroir, info-bulle, toast. Les confirmations se font aujourd'hui sur place, par une `Notice`. À créer ici, avec les mêmes jetons, le jour où un écran en a besoin.

## Mouvement

Des animations utiles et courtes, sans aucune bibliothèque.

| Jeton                  | Valeur                         | Usage                                                              |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `ease-out-quint`       | cubic-bezier(0.22, 1, 0.36, 1) | Entrées, changements d'état                                        |
| `animate-page`         | 200 ms, montée de 6 px         | Arrivée de chaque page (sur `<main>` : la navigation ne bouge pas) |
| `animate-enter`        | 220 ms, montée de 4 px         | Messages, erreurs de champ, compteur de notifications              |
| `animate-shimmer`      | 1,4 s, opacité                 | Silhouettes de chargement                                          |
| Appui                  | 150 ms, échelle 0,97           | Boutons                                                            |
| Transitions de couleur | 150 ms                         | Survol et focus : propriétés listées, jamais `transition: all`     |

- `prefers-reduced-motion: reduce` supprime les déplacements et les durées ; les changements d'état restent visibles.
- Aucune animation ne retarde une action : pas d'attente avant l'envoi d'un formulaire, et le contenu est lisible dès la première image.

## Responsive

Contrôlé à 390, 768 et 1440 px sur les 15 écrans de la visite guidée :

```
E2E_SHOTS=<dossier> E2E_SHOT_WIDTHS=390,768,1440 pnpm --filter @konzia/web e2e
```

- **Téléphone et tablette** : une colonne, en-tête compact, onglets défilants.
- **Ordinateur (≥ 1024 px)** : barre latérale fixe pour les espaces pro et admin. Les espaces client restent sur une colonne de lecture, car leurs écrans sont des formulaires et des suivis courts.
- Aucun débordement horizontal à 390 px (contrôlé).
