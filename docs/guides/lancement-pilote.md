# Lancement du pilote — Lubumbashi

Objectif (ticket #31) : **les deux commissionnaires pilotes ont envoyé un devis réel par Konzia.**

## A. Avant le premier rendez-vous [équipe Konzia]

- [ ] Production en ligne : `https://app.<domaine>/api/health` répond `200` (guide `deploiement.md`).
- [ ] Premier test de restauration de sauvegarde réussi et noté.
- [ ] Compte administrateur créé, double authentification activée.
- [ ] Taux USD → CDF du jour publié ; Lubumbashi active avec ses communes.
- [ ] E-mails : une inscription d'essai reçoit bien le lien de confirmation (vérifiez aussi le dossier « indésirables »).
- [ ] Guide du commissionnaire imprimé ou envoyé en PDF (`commissionnaire.md`).

## B. Avec chaque pilote (1 heure, sur son téléphone)

| Étape | Nicolas | 2e pilote |
|---|---|---|
| Compte créé, e-mail confirmé | ☐ | ☐ |
| Activité créée (nom, WhatsApp) | ☐ | ☐ |
| RCCM + pièce d'identité envoyés | ☐ | ☐ |
| Dossier approuvé par l'admin | ☐ | ☐ |
| Moyens de paiement saisis (M-Pesa, Orange Money…) | ☐ | ☐ |
| Commission % et transport au kilo réglés | ☐ | ☐ |
| Clients importés depuis son fichier Excel | ☐ | ☐ |
| Application ajoutée à l'écran d'accueil | ☐ | ☐ |
| **Premier devis réel envoyé** | ☐ | ☐ |

Pour l'import Excel : faites l'import avec le pilote, sur son fichier. L'aperçu signale les doublons et les numéros invalides : corrigez-les ensemble avant d'enregistrer.

## C. Pendant les 4 premières semaines

- Appel ou message chaque semaine : qu'est-ce qui a fait gagner du temps ? Qu'est-ce qui bloque ?
- Suivre dans la console : devis envoyés, commandes créées, paiements confirmés, colis suivis.
- Noter chaque demande d'évolution dans les tickets GitHub, sans la développer aussitôt.

## D. Critères de réussite du pilote

| Critère | Seuil |
|---|---|
| Devis réels envoyés par chaque pilote | ≥ 1 la première semaine |
| Commandes passées par Konzia | ≥ 10 en un mois, pour les deux pilotes |
| Paiements enregistrés le jour même | la plupart |
| « Qui doit combien » utilisé à la place d'Excel | oui, de l'avis du pilote |
| Questions « où est mon colis ? » sur WhatsApp | en baisse, de l'avis du pilote |
| Incident de sécurité ou fuite entre commissionnaires | aucun |

## E. Sujets en attente

- Réponses du 2e pilote au questionnaire et exemple de son fichier Excel (noms modifiés).
- Lien de suivi sans compte (R1), reporté après le MVP : à reconsidérer selon les retours.
- WhatsApp automatique (API Meta) : à activer après validation du compte professionnel par Meta.
