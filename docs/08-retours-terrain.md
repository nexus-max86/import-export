# 08 — Retours terrain des commissionnaires pilotes

Source : questionnaire Konzia (`docs/questionnaire/`). Réponses reçues : **1 sur 2** (Nicolas, 21/11/2026).

## Réponses de Nicolas

| Sujet | Réponse |
|---|---|
| Volume | 10 à 30 commandes par mois |
| Sites | SHEIN, AliExpress, Amazon, Alibaba |
| Composition du prix | Article, livraison vendeur → entrepôt, commission, transport jusqu'en RDC, douane, livraison à Lubumbashi |
| Commission | Pourcentage du prix |
| Transport | Au kilo |
| Itinéraire | Avion jusqu'à Lubumbashi, bateau puis route (Dar es Salaam…), parfois un transitaire gère tout |
| Délai | Moins de 2 semaines |
| Paiement des clients | M-Pesa, Orange Money, espèces, banque |
| Moment du paiement | Ça dépend du client |
| Pertes de temps | Retrouver qui a payé quoi ; dire au client où est son colis ; répondre aux mêmes questions sur WhatsApp |
| Documents disponibles | RCCM |
| Application pour les clients | Non, ils préfèrent WhatsApp |
| Abonnement acceptable | 10 à 25 $ par mois |

## Ce que cela confirme

- **Les lignes de devis prévues correspondent exactement** à sa façon de chiffrer (écran 08 des maquettes).
- **Le client géré (D4, D7) est indispensable** : ses clients ne veulent pas d'application. Konzia doit d'abord être l'outil du commissionnaire.
- **Le modèle d'abonnement est crédible** : 10 à 25 $/mois pour un volume de 10 à 30 commandes.
- **Les itinéraires varient** (avion, bateau, transitaire) : les étapes configurables par itinéraire (ticket #21) sont justifiées.

## Ce que cela change

Décisions du propriétaire le 21/11/2026 : R1 **reporté après le MVP** ; R2, R3, R5 (RCCM + pièce d'identité) **validés** ; R4 sans préférence → version recommandée retenue (réversible) ; R6 conservé pour le ticket #25.

| # | Constat | Proposition | Ticket concerné |
|---|---|---|---|
| R1 | Les clients préfèrent WhatsApp ; « dire où est le colis » coûte du temps | **Lien de suivi sans compte** : une page par commande, ouverte depuis WhatsApp, sans connexion, ne montrant que les articles et étapes de ce client (jamais de notes internes ni de coûts). Bouton « Envoyer l'avancement sur WhatsApp » avec message prérempli. | #22 (élargi) |
| R2 | « Retrouver qui a payé quoi » est la 1re perte de temps | Vue « qui doit combien » par client et par commande (soldes), dès le ticket des paiements | #18 (élargi) |
| R3 | Le moment du paiement dépend du client | Paiements partiels et **acompte** dès le MVP ; règle d'achat configurable par commande (tout payé / acompte / achat sur fonds propres), toujours tracée | #18, #19 |
| R4 | Commission en %, transport au kilo | Assistant de devis : commission en % du prix des articles, transport = poids estimé × tarif au kilo ; montants recalculés côté serveur, modifiables | #15 |
| R5 | Seul document disponible : RCCM | Vérification : RCCM obligatoire (+ décision du propriétaire sur la pièce d'identité) | #10 |
| R6 | Réponses répétitives sur WhatsApp | Modèles de messages WhatsApp préremplis par étape (devis prêt, paiement reçu, colis arrivé…) | #25 (élargi) |

## En attente

- Réponses du 2e commissionnaire pilote.
- Un exemple de fichier Excel (noms modifiés) pour l'import des clients (#12).
