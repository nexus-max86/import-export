# 05 — États et parcours CargoLink

Chaque transition est faite par une **fonction de service unique** (`quotes.send()`, `payments.confirm()`…) qui vérifie l'état de départ, écrit l'événement et l'audit dans la même transaction. Aucune route ne modifie un statut directement.

## 1. Parcours principal (client avec compte)

```mermaid
sequenceDiagram
  actor Cl as Client
  participant App as CargoLink
  actor A as Commissionnaire A
  actor B as Commissionnaire B
  Cl->>App: Colle un lien (ou saisie manuelle)
  App-->>Cl: Fiche produit « prix indicatif, daté »
  Cl->>App: Ajoute variantes, quantités, autres articles
  Cl->>App: Envoie la demande à A et B
  App-->>A: Notification « nouvelle demande »
  App-->>B: Notification « nouvelle demande »
  A->>App: Vérifie prix/stock, envoie devis v1
  B->>App: Envoie devis v1
  App-->>Cl: 2 devis à comparer
  Cl->>App: Accepte le devis de A
  App-->>A: Commande CL-2026-000123 créée
  App-->>B: Demande attribuée à un autre commissionnaire
  Cl->>App: Paie A (Mobile Money) et joint la preuve
  A->>App: Confirme le paiement
  A->>App: Achète, enregistre la preuve d'achat
  A->>App: Reçoit, met en colis, enregistre les étapes
  App-->>Cl: Notifications à chaque étape visible
  A->>App: Remise au client
  Cl->>App: Confirme la réception (ou ouvre un litige)
```

Variante **client géré** : le commissionnaire crée la demande, le devis et l'acceptation pour le client (acceptation tracée « reçue par WhatsApp le … »), puis envoie le devis/suivi via un lien `wa.me`.

## 2. Demande de devis (`quote_requests.status`)

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> sent: client envoie (≥1 article, ≥1 destinataire)
  draft --> cancelled: client abandonne
  sent --> partially_quoted: 1er devis reçu, d'autres attendus
  sent --> quoted: tous les destinataires ont répondu
  partially_quoted --> quoted
  sent --> expired: date limite dépassée sans devis
  partially_quoted --> converted: un devis accepté
  quoted --> converted: un devis accepté
  sent --> cancelled
  partially_quoted --> cancelled
  quoted --> cancelled
  quoted --> expired: tous les devis expirés
  converted --> [*]
```

Statut par destinataire (`quote_request_recipients.status`) : `sent → viewed → evaluating → quoted | declined | expired`.

Note : une demande peut être convertie plusieurs fois si le client répartit ses articles entre commissionnaires (chaque devis accepté ne couvre que ses lignes). La demande passe à `converted` dès la première acceptation ; les autres devis restent acceptables jusqu'à leur expiration.

## 3. Devis (`quotes.status` + versions)

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> sent: commissionnaire envoie la version n
  sent --> accepted: client accepte (valid_until non dépassé)
  sent --> rejected: client refuse (motif facultatif)
  sent --> changes_requested: client demande une correction
  changes_requested --> sent: nouvelle version n+1 envoyée
  sent --> expired: valid_until dépassé (tâche planifiée)
  expired --> sent: commissionnaire réactive = nouvelle version
  sent --> withdrawn: commissionnaire retire
  draft --> withdrawn
  accepted --> [*]
```

- Une version envoyée est **figée**. Toute modification = nouvelle version.
- `accepted` crée la commande dans la même transaction et lie `orders.quote_version_id`.

## 4. Commande — statut opérationnel (`orders.status`)

```mermaid
stateDiagram-v2
  [*] --> awaiting_payment
  awaiting_payment --> payment_to_verify: paiement déclaré
  payment_to_verify --> awaiting_payment: paiement refusé
  payment_to_verify --> paid: paiement confirmé couvrant le total
  awaiting_payment --> paid: paiement hors appli enregistré par le commissionnaire
  paid --> purchasing: 1er achat fournisseur
  purchasing --> partially_purchased
  purchasing --> purchased
  partially_purchased --> purchased
  purchased --> in_logistics: articles reçus / mis en colis
  in_logistics --> in_transit: expédition partie
  in_transit --> at_distribution_point
  at_distribution_point --> ready_for_handover
  ready_for_handover --> completed: remise confirmée
  awaiting_payment --> cancelled
  paid --> cancelled: avec remboursement enregistré
  purchasing --> in_dispute
  in_transit --> in_dispute
  ready_for_handover --> in_dispute
  completed --> in_dispute: dans le délai de réclamation
  in_dispute --> completed: litige résolu
  in_dispute --> cancelled: litige résolu par annulation
  completed --> [*]
  cancelled --> [*]
```

- **Règle clé** : impossible de passer à `purchasing` tant que `payment_status ≠ paid` (sauf si le commissionnaire coche « achat avancé sur fonds propres », tracé dans l'audit).
- Le statut de la commande est **dérivé** des colis lorsqu'ils avancent (le colis le moins avancé détermine l'étape affichée), mais peut être forcé par le commissionnaire avec une note.

## 5. Statut de paiement de la commande (`orders.payment_status`)

Calculé à partir des paiements `confirmed` : `unpaid → partially_paid → paid`, puis `partially_refunded` / `refunded` si des remboursements sont confirmés.

## 6. Paiement (`payments.status`)

```mermaid
stateDiagram-v2
  [*] --> pending_verification: client déclare + preuve
  [*] --> confirmed: commissionnaire enregistre un paiement reçu hors appli
  pending_verification --> confirmed: commissionnaire confirme (qui + quand)
  pending_verification --> rejected: commissionnaire refuse (motif obligatoire)
  pending_verification --> cancelled: client annule sa déclaration
  confirmed --> [*]
  rejected --> [*]
```

Un remboursement est un **nouveau** paiement `kind = refund`, jamais une modification du paiement d'origine.

## 7. Colis (`parcels.current_step_code` + `status`)

Étapes du modèle global (configurables, issues du cahier §5.4) :

```mermaid
stateDiagram-v2
  direction LR
  [*] --> received_origin_warehouse
  received_origin_warehouse --> checked
  checked --> weighed
  weighed --> consolidated
  consolidated --> ready_international
  ready_international --> shipped_to_drc
  shipped_to_drc --> in_transit
  in_transit --> arrived_drc
  arrived_drc --> customs
  customs --> released
  released --> at_distribution_point
  at_distribution_point --> ready_for_handover
  ready_for_handover --> out_for_delivery
  ready_for_handover --> delivered: retrait
  out_for_delivery --> delivered
  delivered --> [*]
```

- Un événement `anomaly` (bloqué, perdu, endommagé) peut être enregistré à n'importe quelle étape, avec photo et note ; il notifie le client et peut ouvrir un litige.
- Les étapes avant colis (en attente d'achat, acheté, expédié par le vendeur) sont portées par les **achats fournisseurs**, pas par le colis.
- `status` : `open` (on peut ajouter/retirer des articles) → `closed` (scellé, prêt à expédier) → `delivered` | `lost` | `cancelled`.
- Chaque étape enregistrée = une ligne `parcel_events` (horodatée, auteur, lieu), jamais modifiée. Une erreur se corrige par un nouvel événement `correction`.

## 8. Litige (`disputes.status`)

```mermaid
stateDiagram-v2
  [*] --> open: client ouvre + motif + preuves
  open --> awaiting_commissioner: notification au commissionnaire
  awaiting_commissioner --> under_review: réponse reçue ou délai dépassé
  under_review --> resolved: décision du support (motif)
  resolved --> closed: ajustement / remboursement enregistré ou rien à faire
  closed --> under_review: réouverture par un admin (motif + audit)
  closed --> [*]
```

## 9. Organisation (`organizations.status`)

```mermaid
stateDiagram-v2
  [*] --> pending: inscription
  pending --> approved: admin vérifie les documents
  pending --> rejected: admin refuse (motif)
  rejected --> pending: nouvelle soumission
  approved --> suspended: admin suspend (motif)
  suspended --> approved: admin réactive (motif)
```
