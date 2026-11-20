# 01 — Exigences Konzia

Source : [`cahier-des-charges.md`](cahier-des-charges.md). Termes : [`glossaire.md`](glossaire.md).
Colonne **Phase** : `MVP` (pilote), `V1`, `Plus tard`. Colonne **Étape** : étape du plan [`plans/pending/konzia-mvp.md`](../plans/pending/konzia-mvp.md).

Décisions prises le 20/11/2026 qui modifient le cahier :
- Application client = **web installable (PWA)** au MVP ; application native reportée.
- Connexion **e-mail + mot de passe** (pas de SMS). WhatsApp pour les notifications, après validation Meta.
- **Client géré** : un commissionnaire peut gérer des clients sans compte Konzia.
- Import des **clients** depuis Excel/CSV pour les commissionnaires pilotes.
- **USD** devise de référence ; **CDF** affiché via taux admin ; **CNY** pour les coûts d'achat.

---

## 1. Exigences fonctionnelles

### Comptes et authentification (§6.1)
| ID | Exigence | Phase | Étape | Critère d'acceptation |
|---|---|---|---|---|
| EF-01 | Inscription par e-mail + mot de passe, vérification de l'e-mail par lien | MVP | 1.2 | Un compte non vérifié ne peut pas envoyer de demande |
| EF-02 | Connexion, déconnexion, réinitialisation du mot de passe par e-mail | MVP | 1.2 | Le lien de réinitialisation expire après 1 h et ne sert qu'une fois |
| EF-03 | Liste des sessions actives, déconnexion de tous les appareils | MVP | 1.2 | Après « tout déconnecter », les anciens jetons sont refusés |
| EF-04 | MFA (application TOTP) obligatoire pour les administrateurs | MVP | 8.2 | Un admin sans MFA ne peut pas ouvrir la console |
| EF-05 | MFA facultative pour les professionnels | V1 | — | — |
| EF-06 | Acceptation des CGU et de la politique de confidentialité ; consentement marketing séparé | MVP | 1.2 | Version des CGU acceptée et date stockées dans `consents` |
| EF-07 | Connexion par code WhatsApp | Plus tard | — | Dépend de la validation Meta |

### Organisations et équipes (§4.3–4.5)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-10 | Créer une organisation (indépendant ou entreprise) ; le créateur en devient administrateur | MVP | 1.3 | — |
| EF-11 | Inviter des membres par e-mail avec un rôle prédéfini | MVP | 1.3 | Le membre invité ne voit que les écrans de son rôle |
| EF-12 | Rôles personnalisés par entreprise | V1 | — | — |
| EF-13 | Attribution d'une demande à un agent | V1 | — | — |
| EF-14 | Plusieurs agences / points de collecte | Plus tard | — | — |

### Profils, villes, vérification (§6.2, §8)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-20 | Profil client : nom, téléphone/WhatsApp, e-mail, ville, commune, adresses multiples, instructions | MVP | 2.2 | — |
| EF-21 | Profil professionnel : nom commercial, type, zones, services, marketplaces prises en charge, modes de transport, politique tarifaire | MVP | 2.3 | — |
| EF-22 | Dépôt de documents de vérification chiffrés ; statut (en attente, approuvé, refusé, suspendu) | MVP | 2.3 | Seuls l'admin et l'organisation concernée accèdent aux documents |
| EF-23 | Villes et zones configurables (Lubumbashi active ; Likasi, Kasumbalesa, Kipushi prêtes) | MVP | 2.1 | Ajouter une ville ne demande aucune modification de code |
| EF-24 | Annuaire public des commissionnaires approuvés, filtrable par ville et marketplace | MVP | 2.4 | Un commissionnaire non approuvé n'apparaît pas |
| EF-25 | **Client géré** : le commissionnaire crée un client sans compte ; lien d'invitation pour réclamer le compte | MVP | 2.5 | À la réclamation, l'historique est rattaché au nouveau compte sans doublon |
| EF-26 | Import CSV/XLSX des clients d'un commissionnaire (aperçu, détection des doublons, rapport d'erreurs) | MVP | 2.5 | Un fichier de 500 lignes est importé en moins de 30 s ; les lignes invalides sont listées |

### Import de produit (§6.3)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-30 | Coller une URL HTTPS ; détection de la marketplace par liste blanche de domaines | MVP | 3.1 | `https://www.shein.com/...` → SHEIN |
| EF-31 | Blocage des schémas dangereux, des IP privées/locales et des redirections vers celles-ci (SSRF) | MVP | 3.1 | `http://127.0.0.1`, `http://169.254.169.254`, `file://` sont refusés |
| EF-32 | Lecture des métadonnées publiques (Open Graph : titre, image, prix si présent) avec délai ≤ 5 s et taille ≤ 2 Mo | MVP | 3.2 | Le prix éventuel est marqué « indicatif » avec sa date |
| EF-33 | Saisie manuelle complète + capture d'écran si l'extraction échoue ou si le domaine est inconnu | MVP | 3.2 | Un lien non pris en charge propose directement la saisie manuelle |
| EF-34 | Le client corrige variante, taille, couleur, quantité, note | MVP | 3.2 | — |
| EF-35 | Connecteurs API officiels par marketplace | V1 | — | — |
| EF-36 | Moteur de recherche multi-marketplaces | Plus tard | — | — |

### Demandes de devis (§6.5)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-40 | Demande multi-articles, brouillon sauvegardé automatiquement | MVP | 3.3 | Un brouillon survit à une coupure réseau |
| EF-41 | Envoi à un ou plusieurs commissionnaires choisis dans l'annuaire | MVP | 3.3 | Chaque commissionnaire ne voit que les demandes qui lui sont adressées |
| EF-42 | Un commissionnaire crée une demande pour un client géré | MVP | 3.3 | — |
| EF-43 | Statuts : brouillon, envoyée, reçue, en évaluation, devis partiellement reçu, devis reçu, expirée, annulée, convertie | MVP | 3.3 | — |
| EF-44 | Mise en relation automatique selon la ville | V1 | — | — |

### Devis (§6.6)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-50 | Devis détaillé : prix produits, quantités, frais vendeur, commission, transport international, manutention, douane estimée, livraison locale, réductions, total, devise, taux de change et date, validité, délai et hypothèses, conditions | MVP | 4.1 | Total = somme des lignes, recalculé côté serveur |
| EF-51 | Chaque modification crée une nouvelle version ; les versions précédentes restent consultables | MVP | 4.1 | — |
| EF-52 | Le client compare les devis côte à côte | MVP | 4.2 | Les montants des différents commissionnaires ne sont jamais additionnés en un seul paiement |
| EF-53 | Accepter, refuser, demander une correction | MVP | 4.2 | Un devis expiré ne peut pas être accepté |
| EF-54 | Le devis distingue Estimation / Devis confirmé / Montant final | MVP | 4.1 | Libellé visible sur chaque écran de prix |

### Commandes et achats (§6.7, §6.8)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-60 | Acceptation → commande avec numéro lisible (`KZ-2026-000123`), liée à la version exacte du devis | MVP | 4.3 | — |
| EF-61 | Statuts opérationnels séparés du statut de paiement | MVP | 4.3 | — |
| EF-62 | Ajustement de prix après acceptation = demande soumise au client, acceptée ou refusée | MVP | 4.3 | Le montant ne change pas sans accord |
| EF-63 | Achats fournisseurs : boutique, plateforme, référence, date, montant réel, devise, taux, preuve, numéro de suivi vendeur, articles et quantités | MVP | 6.1 | Coût réel et prix facturé stockés séparément |
| EF-64 | Quantités achetées / reçues / manquantes par ligne | MVP | 6.1 | — |
| EF-65 | Annulation de commande avec motif ; jamais de suppression physique | MVP | 4.3 | — |

### Paiements (§6.11)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-70 | Instructions de paiement direct propres à chaque commissionnaire (Mobile Money, espèces, virement) | MVP | 5.1 | — |
| EF-71 | Le client déclare un paiement avec référence et preuve → statut « à vérifier » | MVP | 5.1 | Jamais « payé » sur simple déclaration |
| EF-72 | Le commissionnaire confirme ou refuse avec motif ; l'employé et la date sont tracés | MVP | 5.1 | — |
| EF-73 | Le commissionnaire enregistre un paiement reçu hors application (client géré) | MVP | 5.1 | — |
| EF-74 | Remboursement = événement distinct | MVP | 5.1 | — |
| EF-75 | Taux de change saisis par l'admin (USD↔CDF, USD↔CNY), figés dans chaque devis | MVP | 5.2 | — |
| EF-76 | Paiement intégré via prestataire agréé | V1 | — | — |

### Colis et expéditions (§6.9, §6.10)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-80 | Colis avec identifiant unique, poids, dimensions, poids volumétrique (facteur configurable), état, photos | MVP | 6.2 | — |
| EF-81 | Associer/dissocier des lignes de commande (de plusieurs commandes, plusieurs clients) à un colis, avec audit | MVP | 6.2 | — |
| EF-82 | Expéditions : mode, origine, destination, transporteur, référence, suivi, dates estimées/réelles, coût | MVP | 6.3 | — |
| EF-83 | Événements de suivi horodatés, non modifiables ; étapes configurables par itinéraire | MVP | 6.3 | — |
| EF-84 | Le client voit le suivi de SES articles uniquement | MVP | 6.4 | Dans un colis partagé, il ne voit ni les articles ni l'identité des autres clients |
| EF-85 | QR codes et scan | V1 | — | — |
| EF-86 | Regroupement / fractionnement de colis | V1 | — | — |

### Notifications et messagerie (§6.12)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-90 | Notifications dans l'application pour les 13 événements du §6.12 | MVP | 7.1 | — |
| EF-91 | E-mail transactionnel pour les mêmes événements, selon préférences | MVP | 7.2 | Envoi via file d'attente, avec nouvelles tentatives |
| EF-92 | Bouton « Écrire sur WhatsApp » (lien `wa.me` prérempli avec le n° de commande) | MVP | 7.3 | — |
| EF-93 | Envoi WhatsApp automatique via l'API Cloud officielle | V1 | 7.3 (adaptateur désactivé) | Activé seulement après validation Meta |
| EF-94 | Messagerie interne liée à une demande ou une commande | V1 | — | — |

### Confiance, litiges, administration (§6.13, §6.14, §6.17)
| ID | Exigence | Phase | Étape | Critère |
|---|---|---|---|---|
| EF-100 | Signalement d'un problème / ouverture de litige avec preuves | MVP | 8.3 | — |
| EF-101 | Réponse du commissionnaire, décision du support, historique, clôture | MVP | 8.3 | Un litige clôturé n'est modifiable que par un admin, avec audit |
| EF-102 | Évaluations après commande terminée | V1 | — | — |
| EF-103 | Console admin : vue globale, utilisateurs, commissionnaires, commandes, paiements, colis, litiges, villes, taux, audit | MVP | 8.1 | — |
| EF-104 | Approuver / suspendre un commissionnaire, avec motif et audit | MVP | 8.2 | — |
| EF-105 | Journal d'audit : acteur, date, objet, ancienne valeur, nouvelle valeur, motif | MVP | 1.4 | — |
| EF-106 | Catégories de produits interdites ou soumises à examen | V1 | — | — |
| EF-107 | Factures et reçus PDF | V1 | — | — |
| EF-108 | Export CSV des commandes et paiements pour le commissionnaire | MVP | 6.4 | — |
| EF-109 | Abonnements professionnels | Plus tard | — | — |

---

## 2. Exigences non fonctionnelles

| ID | Exigence | Mesure |
|---|---|---|
| ENF-01 | Temps de réponse | p95 < 2 s pour les opérations courantes (hors appels externes) |
| ENF-02 | Poids de page | Premier chargement < 300 Ko JS compressé ; utilisable en 3G |
| ENF-03 | Réseau instable | Brouillons sauvegardés localement ; requêtes d'écriture idempotentes (clé d'idempotence) |
| ENF-04 | Disponibilité | 99,5 % mensuel visé |
| ENF-05 | Sauvegardes | PostgreSQL quotidien + journaux WAL ; copie hors serveur ; restauration testée avant le pilote puis chaque mois |
| ENF-06 | Isolation multi-tenant | Gardes serveur + Row-Level Security ; un test automatique par table métier |
| ENF-07 | Sécurité | HTTPS, Argon2id, cookies `HttpOnly`/`Secure`/`SameSite`, CSRF, limitation de débit, validation par schéma (Zod), en-têtes de sécurité |
| ENF-08 | Données sensibles | Documents de vérification chiffrés ; logs sans données personnelles ni secrets |
| ENF-09 | Pagination | Toutes les listes paginées par curseur |
| ENF-10 | Accessibilité | Contraste AA, cibles tactiles ≥ 44 px, libellés visibles |
| ENF-11 | i18n | Toutes les chaînes dans des fichiers de traduction (FR seul au départ) |
| ENF-12 | Qualité | TypeScript strict, CI (lint + tests + build), migrations versionnées, `.env.example` |
| ENF-13 | Environnements | Développement, staging et production séparés |
| ENF-14 | Montants | Entiers en unité mineure + code ISO 4217 ; aucun flottant |
| ENF-15 | Traçabilité | Aucune suppression physique de devis, commandes, paiements, mouvements de colis |

---

## 3. Couverture des critères d'acceptation du cahier (§15)

| Scénario §15 | Exigences |
|---|---|
| Client ne voit pas les commandes d'un autre | ENF-06, EF-84 |
| Commissionnaire ne voit pas les données d'un autre | ENF-06, EF-41 |
| Employé limité à ses actions | EF-11 |
| Suspension auditée | EF-104, EF-105 |
| Lien valide reconnu / non pris en charge → saisie manuelle | EF-30, EF-33 |
| URL locale bloquée | EF-31 |
| Prix indicatif et daté | EF-32 |
| Correction variantes/quantités | EF-34 |
| Plusieurs devis séparés et comparables | EF-50, EF-52 |
| Acceptation liée à la version exacte | EF-60 |
| Modification de prix approuvée | EF-62 |
| Paiement direct en attente ≠ confirmé | EF-71 |
| Confirmation trace l'employé et la date | EF-72 |
| Webhook prestataire vérifié et idempotent | V1 (EF-76) |
| Paiement échoué ne déclenche pas l'achat | EF-61 (statut opérationnel bloqué tant que non payé) |
| Remboursement = événement distinct | EF-74 |
| Commande sur plusieurs colis / colis multi-articles | EF-81 |
| Client ne voit pas les articles d'un autre | EF-84 |
| Mouvement horodaté | EF-83 |
| QR code ouvre le bon colis | V1 (EF-85) |
| Litiges | EF-100, EF-101 |
