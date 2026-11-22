# Konzia — le produit

Référence détaillée : `docs/01-exigences.md` à `docs/07-backlog.md`, `docs/glossaire.md`. Ce fichier en est le résumé pour toute personne qui touche à l'interface.

## En une phrase

Konzia permet aux habitants de Lubumbashi d'acheter à l'étranger (SHEIN, AliExpress, Alibaba, Temu…) par l'intermédiaire de **commissionnaires vérifiés**, et donne à ces commissionnaires l'outil pour gérer devis, paiements, achats et colis, sans que Konzia ne touche jamais l'argent des achats.

## Utilisateurs

| Qui                                                     | Contexte réel                                                                                                   | Ce qu'il veut                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Client**                                              | Téléphone Android d'entrée ou de milieu de gamme, données mobiles chères, réseau irrégulier, habitué à WhatsApp | Envoyer un lien, comparer des devis clairs, payer en confiance, savoir où est son colis                             |
| **Commissionnaire** (propriétaire, acheteur, comptable) | Téléphone toute la journée, ordinateur au bureau pour les tâches longues (devis, colis, export Excel)           | Traiter vite les demandes, ne pas perdre un paiement, regrouper les articles en colis, prévenir ses clients         |
| **Administrateur Konzia**                               | Ordinateur, double authentification obligatoire                                                                 | Vérifier les commissionnaires, arbitrer les litiges, surveiller la plateforme ; chaque consultation est journalisée |

## Parcours principaux

1. **Demande** : le client colle un lien (ou décrit l'article), choisit un ou plusieurs commissionnaires.
2. **Devis** : le commissionnaire chiffre (articles, commission, transport, douane) ; une version envoyée est figée.
3. **Commande et paiement** : le client accepte un devis, paie directement le commissionnaire (M-Pesa, Orange Money, Airtel Money, espèces, banque), déclare son paiement ; le commissionnaire le confirme.
4. **Achat et logistique** : achats chez les vendeurs, colis multi-clients (chaque client ne voit que ses articles), expéditions et étapes de suivi.
5. **Remise** et, si besoin, **litige** arbitré par Konzia.

## Espaces et routes

- Public : `/`, `/commissionnaires`, `/conditions`, `/confidentialite`, authentification (`/connexion`, `/inscription`…).
- Client : `/demande`, `/demandes`, `/commandes`, `/notifications`, `/compte`, `/litiges`.
- Commissionnaire : `/pro` (choix de l'activité), puis `/pro/demandes`, `/pro/commandes`, `/pro/achats`, `/pro/colis`, `/pro/expeditions`, `/pro/paiements`, `/pro/litiges`, `/pro/clients`, `/pro/equipe`, `/pro/profil`.
- Administration : `/admin` et ses rubriques.

## Contraintes qui pèsent sur l'interface

- **Mobile d'abord, réellement** : cibles tactiles ≥ 44 px, une action principale par écran, pas de survol indispensable.
- **Données comptées** : une seule police variable (35 Ko), aucune image décorative, pas de bibliothèque d'animation.
- **Confiance** : la nature d'un prix est toujours écrite (« Prix indicatif », « Devis confirmé · v2 », « estimation ») ; statut de paiement et statut opérationnel sont deux pastilles distinctes.
- **Montants** : entiers en unité mineure + devise, affichés avec des chiffres alignés.
- **Langue** : tout en français, vocabulaire du métier (voir `docs/glossaire.md`).
- **Aucune donnée inventée** dans l'application : les états vides disent ce qui manque et comment le faire apparaître.
