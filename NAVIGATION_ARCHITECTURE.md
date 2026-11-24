# KONZIA — Architecture de navigation

24/11/2026. Proposition, à valider. Elle part des menus du plan directeur (§ 6) et y ajoute :

- les sous-menus ;
- les actions rapides ;
- les liens entre modules ;
- la correspondance avec les routes existantes.

**Aucune route existante n'est supprimée ni renommée.** Les nouvelles routes sont des ajouts.

Principe : **un écosystème, trois expériences**. Chaque espace a sa propre navigation ; on passe de l'un à l'autre par un lien explicite :

- « Espace Business » dans le menu du compte, pour les membres d'une organisation ;
- « Retour au Market » dans Business ;
- « Administration » seulement pour les administrateurs, avec double authentification.

---

## 1. KONZIA MARKET

### 1.1 Ordinateur : en-tête sur deux niveaux (maquettes 1 à 3)

**Niveau 1**

- Logo ;
- « Livrer à » (ville) ;
- **recherche universelle** (mot, lien collé détecté automatiquement, photo quand le service existera) ;
- devise ;
- Favoris ;
- Notifications ;
- **Compte**.

**Niveau 2**

- **Explorer**, avec un menu de catégories par familles ;
- catégories phares ;
- Commissionnaires ;
- Comment ça marche ;
- Aide ;
- « Konzia Business ».

### 1.2 Téléphone (maquette 5)

- **En-tête compact** : logo, notifications et **recherche toujours visible**.
- **Barre d'onglets en bas** : Accueil · Rechercher · Demandes · Commandes · Compte.

### 1.3 Menu « Compte » (espace client)

Sur ordinateur, c'est une barre latérale dans l'espace client ; sur téléphone, une liste.

| Entrée (plan directeur) | Sous-menu                                                | Route                                                               |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Accueil                 | —                                                        | `/`                                                                 |
| Explorer                | Catégories, sélections                                   | **nouvelle** `/explorer`                                            |
| Catégories              | Familles, puis catégories                                | **nouvelle** `/categories/[slug]`                                   |
| Recherche               | Résultats et filtres                                     | **nouvelle** `/recherche`                                           |
| Mes demandes            | Brouillon, envoyées, devis reçus                         | `/demandes`, `/demande`                                             |
| Mes devis               | À examiner, acceptés, refusés, expirés ; **comparaison** | `/demandes/[id]` (vue comparative)                                  |
| Mes commandes           | En cours, terminées ; fiche avec frise                   | `/commandes`, `/commandes/[id]`                                     |
| Mes colis               | Suivi de mes articles uniquement                         | onglet « Suivi » de `/commandes/[id]` ; liste **nouvelle** `/colis` |
| Favoris                 | Produits, commissionnaires                               | **nouvelle** (avec le catalogue)                                    |
| Notifications           | —                                                        | `/notifications`                                                    |
| Profil                  | Identité, adresses, appareils                            | `/compte`, `/compte/profil`                                         |
| Aide                    | Guides, contact WhatsApp, réclamations                   | **nouvelle** `/aide` ; litiges `/litiges/[id]`                      |

### 1.4 Actions rapides

- « Importer un produit », par lien ou capture, accessible partout depuis la recherche.
- « Demander un devis », depuis un produit ou un commissionnaire.

### 1.5 Liens entre modules

Produit ou lien → demande → devis → **comparaison** → commande → paiement → suivi → remise → (litige).

Chaque écran renvoie à l'étape précédente et à la suivante.

---

## 2. KONZIA BUSINESS

### 2.1 Barre latérale (maquettes 4, 6 et 7)

| Entrée (plan directeur) | Sous-menu                                                                          | Route                                                           | Permission            |
| ----------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| **Vue générale**        | —                                                                                  | **nouvelle** `/pro/vue-generale` (devient l'entrée de l'espace) | tout membre           |
| Demandes                | À traiter, traitées ; demande pour un client géré                                  | `/pro/demandes`                                                 | `request.view`        |
| Devis                   | Brouillons, envoyés, acceptés, expirés                                             | **nouvelle** `/pro/devis` (liste) ; `/pro/devis/[id]` existe    | `quote.edit`          |
| Commandes               | Onglets par étape ; tableau, panneau, fiche                                        | `/pro/commandes`                                                | `order.view`          |
| Clients                 | Tableau, fiche client (commandes, solde), import                                   | `/pro/clients`                                                  | `customer.view`       |
| Achats fournisseurs     | À acheter, passés, reçus                                                           | `/pro/achats`                                                   | `supplier_order.view` |
| Entrepôt                | Réceptions, vue par entrepôt, mouvements                                           | **nouvelles** (après R-3)                                       | `parcel.manage`       |
| Inventaire et colis     | Stocks (états des articles), colis, regroupement                                   | `/pro/colis` (puis stocks, après R-3)                           | `parcel.manage`       |
| Expéditions             | En cours, arrivées, frise                                                          | `/pro/expeditions`                                              | `shipment.manage`     |
| Finances                | Paiements à vérifier, confirmés, soldes clients, remboursements, exports           | `/pro/paiements` (puis onglets)                                 | `payment.view`        |
| Équipe                  | Membres, rôles, invitations                                                        | `/pro/equipe`                                                   | `org.members.manage`  |
| Boutique publique       | Profil vu par les clients, tarifs publiés (R-10)                                   | `/pro/profil` (partie vitrine)                                  | `org.settings.edit`   |
| Rapports                | Commandes, délais, soldes, exports                                                 | **nouvelle** `/pro/rapports`                                    | `export.csv`          |
| Paramètres              | Zones, instructions de paiement, réglages des devis, itinéraires, **vérification** | regroupement de réglages existants                              | `org.settings.edit`   |

La navigation **n'affiche que les entrées permises au rôle**. La matrice `ROLE_PERMISSIONS` est inchangée.

### 2.2 Barre du haut

- **Recherche globale** (Ctrl+K) : n° de commande, n° de colis, client ou téléphone.
- **« Créer »** : demande pour un client, client, achat, colis, expédition, paiement reçu.
- Notifications.
- Sélecteur d'organisation.

### 2.3 Liens entre modules

Demande → devis → commande → achat → **réception** → colis → expédition → remise.

On peut toujours remonter :

- d'un colis, vers chacune de ses commandes ;
- d'une commande, vers ses achats, ses colis et ses paiements ;
- d'un client, vers ses commandes et son solde.

Le panneau latéral des tableaux affiche ces liens.

### 2.4 Téléphone et tablette

- La barre latérale devient un menu à ouvrir ; les entrées principales restent en onglets défilants, comme aujourd'hui.
- Les tableaux deviennent des cartes ; les filtres passent dans une feuille qui monte du bas.

---

## 3. KONZIA ADMIN

### 3.1 Barre latérale (maquette 8), fond encre pour distinguer l'espace

| Entrée (plan directeur) | Sous-menu                                                                          | Route                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Vue globale             | À traiter, tendances, santé, activité                                              | `/admin`                                                                              |
| Utilisateurs            | Tableau, fiche, suspension et réactivation                                         | `/admin/utilisateurs`                                                                 |
| Organisations           | Toutes les organisations (commissionnaires et entreprises)                         | `/admin/commissionnaires` (vue « toutes »)                                            |
| Commissionnaires        | Organisations approuvées : profil, activité                                        | `/admin/commissionnaires` (vue « approuvés »)                                         |
| Vérifications           | **File** : reçus, incomplets, en attente, approuvés, refusés ; motifs ; historique | `/admin/commissionnaires/[id]` (décision) et **nouvelle** file `/admin/verifications` |
| Commandes               | Commandes, paiements, colis (lecture journalisée)                                  | `/admin/commandes`, `/admin/paiements`, `/admin/colis`                                |
| Litiges                 | Priorité, statut, parties, documents, décision                                     | `/admin/litiges`                                                                      |
| Signalements            | —                                                                                  | **nouvelle** (après R-11)                                                             |
| Catégories              | —                                                                                  | **nouvelle** (avec le catalogue)                                                      |
| Sources de produits     | État des connecteurs, conditions                                                   | **nouvelle** (avec le catalogue)                                                      |
| Villes et zones         | —                                                                                  | `/admin/villes`                                                                       |
| Abonnements             | —                                                                                  | **nouvelle** (après D-3)                                                              |
| Audit                   | Journal filtrable (acteur, type, organisation, période)                            | `/admin/journal`                                                                      |
| Santé de la plateforme  | API, file d'e-mails, sauvegardes, alertes d'erreurs                                | **nouvelle** `/admin/sante`                                                           |
| Paramètres              | Taux de change, sécurité (double authentification)                                 | `/admin/taux`, `/admin/securite`                                                      |

**Remarque** : dans les données, « Organisations » et « Commissionnaires » désignent la même table (`organizations`). Les deux entrées sont conservées comme demandé ; ce sont deux **vues** de la même liste, sans doublon de données.

### 3.2 Actions rapides et règles

- « Examiner la prochaine vérification » et « Ouvrir le prochain litige ».
- **Toute action sensible** (approuver, refuser, suspendre, réactiver, décider un litige) passe par une **fenêtre de confirmation avec motif**, puis est **journalisée**. C'est déjà le cas côté serveur.
- Les pièces d'identité restent ouvertes **à la demande**, chaque ouverture étant journalisée (déjà en place). La console n'affiche jamais de données personnelles sans action explicite.
