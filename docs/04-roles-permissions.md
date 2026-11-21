# 04 — Rôles et permissions Konzia

Deux niveaux de contrôle :
1. **Entre organisations et entre clients** : Row-Level Security PostgreSQL (voir [03](03-modele-donnees.md) §8). Infranchissable par l'application.
2. **À l'intérieur d'une organisation** : rôle du membre, vérifié par une garde NestJS (`@RequirePermission('quote.send')`).

Les permissions sont des chaînes `domaine.action`. Au MVP, les rôles sont **prédéfinis** ; les rôles personnalisés (V1) ne seront qu'une autre combinaison des mêmes permissions.

## 1. Acteurs

| Acteur | Code | Description |
|---|---|---|
| Visiteur | — | Non connecté |
| Client | `customer` | Utilisateur avec compte, sans organisation (peut aussi être membre d'une organisation) |
| Client géré | — | Pas de compte : n'agit pas dans l'application, le commissionnaire agit pour lui |
| Propriétaire | `owner` | Administrateur d'une organisation (le commissionnaire indépendant est seul `owner`) |
| Commercial | `sales` | Demandes, clients, devis |
| Acheteur | `buyer` | Achats fournisseurs |
| Logistique | `logistics` | Colis, expéditions, événements |
| Comptable | `accountant` | Paiements, exports |
| Livreur | `courier` | Colis qui lui sont attribués (V1 : attribution ; MVP : lecture des colis prêts) |
| Support | `platform_support` | Litiges assignés, lecture limitée, notes internes |
| Admin plateforme | `platform_admin` | Tout le paramétrage, vérification, suspension ; MFA obligatoire |

## 2. Matrice côté commissionnaire

✅ autorisé · 👁 lecture seule · — interdit

| Permission | owner | sales | buyer | logistics | accountant | courier |
|---|---|---|---|---|---|---|
| `org.settings.edit` (profil, zones, instructions de paiement) | ✅ | — | — | — | — | — |
| `org.members.manage` | ✅ | — | — | — | — | — |
| `org.verification.submit` | ✅ | — | — | — | — | — |
| `customer.view` | ✅ | ✅ | 👁 | 👁 | 👁 | 👁 (nom + téléphone des colis attribués) |
| `customer.edit` / `customer.import` | ✅ | ✅ | — | — | — | — |
| `customer.invite_claim` | ✅ | ✅ | — | — | — | — |
| `request.view` | ✅ | ✅ | 👁 | — | — | — |
| `request.create_for_managed` | ✅ | ✅ | — | — | — | — |
| `request.decline` | ✅ | ✅ | — | — | — | — |
| `quote.edit` / `quote.send` / `quote.withdraw` | ✅ | ✅ | — | — | — | — |
| `order.view` | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 |
| `order.status.update` | ✅ | ✅ | ✅ | ✅ | — | — |
| `order.adjustment.propose` | ✅ | ✅ | — | — | — | — |
| `order.purchase_rule.edit` (règle d'achat : tout payé, acompte, fonds propres) | ✅ | ✅ | — | — | — | — |
| `order.cancel` | ✅ | — | — | — | — | — |
| `supplier_order.manage` (coûts réels : achat, suivi vendeur, réception) | ✅ | — | ✅ | — | — | — |
| `supplier_order.view` (lecture des achats et preuves) | ✅ | — | ✅ | — | ✅ | — |
| `parcel.manage` / `shipment.manage` / `tracking.record` | ✅ | — | — | ✅ | — | — |
| `parcel.deliver` (preuve de remise) | ✅ | — | — | ✅ | — | ✅ |
| `payment.view` | ✅ | 👁 | — | — | ✅ | — |
| `payment.confirm` / `payment.reject` / `payment.record_offline` | ✅ | — | — | — | ✅ | — |
| `payment.refund` | ✅ | — | — | — | ✅ | — |
| `finance.margins.view` (coût réel vs prix) | ✅ | — | — | — | ✅ | — |
| `export.csv` | ✅ | — | — | — | ✅ | — |
| `dispute.respond` | ✅ | ✅ | — | — | — | — |
| `audit.view_own_org` | ✅ | — | — | — | — | — |

## 3. Matrice côté client

| Action | Client | Remarque |
|---|---|---|
| Profil, adresses, préférences | ✅ | Les siens |
| Importer un lien / saisie manuelle | ✅ | Compte vérifié |
| Créer, modifier un brouillon, envoyer une demande | ✅ | |
| Voir les devis reçus | ✅ | Versions envoyées uniquement ; jamais les coûts réels ni les notes privées |
| Accepter / refuser / demander une correction | ✅ | |
| Accepter / refuser un ajustement | ✅ | |
| Déclarer un paiement + preuve | ✅ | Statut « à vérifier », jamais « payé » |
| Suivre ses articles et colis | ✅ | Uniquement ses articles dans un colis partagé |
| Ouvrir un litige, ajouter des preuves | ✅ | |
| Réclamer un compte de client géré | ✅ | Via lien d'invitation |
| Voir les autres clients d'un commissionnaire, ses achats fournisseurs, ses marges | — | |
| Modifier un paiement confirmé | — | |

## 4. Matrice côté plateforme

| Action | Support | Admin |
|---|---|---|
| Vue globale, statistiques | 👁 (agrégées) | ✅ |
| Utilisateurs : consulter | 👁 (champs nécessaires) | ✅ |
| Utilisateurs : suspendre | — | ✅ (motif + audit) |
| Commissionnaires : consulter les documents de vérification | — | ✅ (lecture journalisée) |
| Commissionnaires : approuver / refuser / suspendre | — | ✅ (motif + audit) |
| Commandes, paiements, colis : consulter | 👁 si lié à un litige assigné (journalisé) | 👁 (journalisé) |
| Paiements : modifier | — | — (correction uniquement via procédure auditée, V1) |
| Litiges : traiter, notes internes, décider | ✅ (assignés) | ✅ |
| Litige clôturé : rouvrir | — | ✅ (motif + audit) |
| Villes, zones, marketplaces, modèles d'étapes, taux de change | — | ✅ |
| Journal d'audit | — | 👁 |

Le **service d'importation propre** de Konzia est une organisation ordinaire (`is_platform_operated = true`). Ses membres n'ont **aucune** permission plateforme du fait de cette appartenance ; un même humain qui serait admin et membre du service agit avec un seul contexte à la fois (choix explicite de l'espace), et toute lecture admin est journalisée.

## 5. Règles transverses

- Toute action marquée « motif + audit » exige un champ `reason` non vide et écrit dans `audit_logs` (avant/après).
- Un membre suspendu ou une organisation suspendue : sessions révoquées immédiatement ; les clients voient « commissionnaire temporairement indisponible » sur les commandes en cours.
- Une organisation au statut `pending` peut configurer son espace et gérer ses clients gérés, mais n'apparaît pas dans l'annuaire et ne reçoit pas de demandes de nouveaux clients.

## 6. Tests d'acceptation associés

| Test | Niveau |
|---|---|
| Le commissionnaire B obtient 0 ligne sur chaque table métier de A (requête directe avec le contexte de B) | Intégration SQL |
| Le client X ne voit pas les `parcel_items` du client Y dans un colis partagé | Intégration API |
| Un `sales` reçoit 403 sur `payment.confirm` et `supplier_order.manage` | Intégration API |
| Un `courier` ne voit pas les montants | Intégration API |
| La suspension d'un commissionnaire par l'admin crée une ligne `audit_logs` avec motif | Intégration API |
| Un admin sans MFA reçoit 403 sur toute route `/api/admin` | Intégration API |
