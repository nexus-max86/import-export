# CAHIER DES CHARGES — PLATEFORME D’ACHAT INTERNATIONAL ET DE GESTION D’IMPORTATION EN RDC

**Version :** 1.0 — Base de conception produit  
**Date :** 20 novembre 2026  
**Zone pilote :** Lubumbashi, Likasi, Kasumbalesa et Kipushi  
**Statut :** Cahier des charges fonctionnel et technique initial  
**Nom du produit :** provisoire — à définir

---

## 1. Résumé exécutif

Le produit est une plateforme numérique qui simplifie l’achat de produits sur des marketplaces internationales (notamment SHEIN, Pinduoduo, Alibaba, AliExpress, Amazon, eBay, 1688, Taobao, Temu et autres plateformes compatibles) pour les particuliers et les professionnels situés en République démocratique du Congo.

La plateforme réunit trois activités :

1. **Marketplace de commissionnaires :** les clients peuvent choisir un commissionnaire indépendant ou une entreprise d’importation selon ses tarifs, services, évaluations et performances.
2. **Outil SaaS professionnel :** chaque commissionnaire dispose d’un espace de gestion de ses clients, demandes, devis, achats, colis, expéditions, paiements et bénéfices.
3. **Service d’importation propre à l’opérateur de la plateforme :** l’entreprise propriétaire peut proposer ses propres services d’achat et de livraison, en concurrence transparente avec les autres commissionnaires.

Le produit doit être conçu comme une plateforme multi-acteurs, multi-commissionnaires et multi-villes, avec une architecture extensible. Il ne doit pas dépendre d’un seul site marchand ni d’une seule méthode d’importation des produits.

### 1.1 Proposition de valeur

Pour l’acheteur :
- Commander à l’international sans devoir maîtriser les plateformes étrangères.
- Coller un lien produit et obtenir une demande de devis structurée.
- Comparer plusieurs commissionnaires.
- Connaître les coûts estimés puis le prix confirmé avant de payer.
- Suivre les articles et colis à chaque étape.
- Recevoir des notifications et disposer d’un historique vérifiable.

Pour le commissionnaire :
- Centraliser les demandes reçues de ses clients.
- Émettre des devis professionnels.
- Organiser les achats auprès des vendeurs.
- Suivre les articles, colis, expéditions et livraisons.
- Réduire les erreurs de répartition entre clients.
- Suivre ses paiements, coûts, marges et performances.

Pour l’administrateur :
- Superviser la marketplace.
- Vérifier les professionnels.
- Gérer les litiges, signalements, commissions et abonnements.
- Suivre l’activité par ville, plateforme d’origine et commissionnaire.
- Exploiter les données opérationnelles pour améliorer le service.

---

## 2. Décisions produit déjà validées

| Sujet | Décision |
|---|---|
| Modèle | Marketplace hybride |
| Professionnels | Commissionnaires indépendants et entreprises |
| Propre activité | La plateforme possède également son propre service d’importation |
| Paiement | Paiement direct au commissionnaire et paiement via la plateforme, selon les prestataires et validations réglementaires |
| Recherche | Vision d’un moteur de recherche universel multi-marketplaces |
| Première zone | Lubumbashi |
| Zones de lancement/extension initiale | Likasi, Kasumbalesa et Kipushi |
| Commandes | Un client peut travailler avec plusieurs commissionnaires |
| Comparaison | Le client peut comparer les profils, tarifs, services et évaluations des commissionnaires |
| Architecture | Application client, portail professionnel et console d’administration |
| Priorité initiale | MVP opérationnel avant l’intégration complète de tous les catalogues |

### 2.1 Principes non négociables

- Transparence des prix : aucun frais obligatoire ne doit être dissimulé.
- Aucune promesse de délai de livraison non confirmée.
- Aucune promesse de disponibilité d’un produit sans vérification.
- Séparation stricte des données entre commissionnaires.
- Traçabilité de chaque modification importante d’une commande ou d’un colis.
- Respect des conditions d’utilisation, licences et limites des API des marketplaces.
- Aucun scraping massif ou contournement de protections sans autorisation.
- Les paiements et fonds clients doivent être traités par des prestataires légalement habilités.
- Les litiges, remboursements et annulations doivent suivre des règles publiées.
- Les clients doivent comprendre la différence entre prix estimatif, devis confirmé et montant effectivement payé.

---

## 3. Périmètre et phases

Le moteur universel et l’affichage de catalogues complets sont des objectifs de produit à long terme. Ils ne doivent pas bloquer le lancement du MVP.

### 3.1 MVP — version pilote

Fonctionnalités indispensables :
- Inscription et connexion.
- Profils clients et professionnels.
- Vérification de base des commissionnaires.
- Import d’un produit par URL.
- Formulaire de saisie manuelle si l’extraction échoue.
- Création d’une demande de devis.
- Sélection d’un ou plusieurs commissionnaires.
- Réception et comparaison des devis.
- Acceptation ou refus d’un devis.
- Enregistrement des paiements directs et des preuves de paiement.
- Gestion des commandes et lignes de commande.
- Gestion des colis et association articles/clients/commandes.
- Suivi manuel des étapes logistiques.
- Notifications dans l’application et par e-mail/SMS/WhatsApp selon intégrations disponibles.
- Tableau de bord professionnel.
- Console d’administration.
- Gestion des villes et zones desservies.
- Historique et journal d’audit.

### 3.2 Version 1

- Connecteurs API officiels pour les marketplaces dont l’accès est autorisé.
- Recherche multi-marketplaces sur les sources compatibles.
- Comparaison des résultats.
- Paiement via prestataire intégré, sous réserve de disponibilité et conformité.
- Gestion des employés et permissions.
- QR codes pour colis et sacs/expéditions.
- Factures et reçus PDF.
- Gestion des litiges.
- Abonnements professionnels.
- Statistiques et rapports avancés.
- Calcul de frais logistiques configurables.

### 3.3 Versions ultérieures

- Import automatique de paniers lorsque les plateformes le permettent.
- Intégrations avec transporteurs et transitaires.
- Suivi automatique des numéros de tracking compatibles.
- Gestion d’entrepôts partenaires.
- Application mobile dédiée aux opérateurs d’entrepôt.
- Commandes groupées.
- Tarification logistique avancée par poids, volume, catégorie ou itinéraire.
- Programme de fidélité et parrainage.
- API publique/partenaires.
- Extension à d’autres villes et pays, après validation opérationnelle.

---

## 4. Utilisateurs, rôles et permissions

### 4.1 Visiteur
Peut :
- Consulter la présentation du service.
- Parcourir les commissionnaires publics.
- Voir les zones desservies et les explications du processus.
- Créer un compte.

Ne peut pas :
- Envoyer une demande.
- Voir des informations privées de commandes.
- Accéder aux tableaux de bord.

### 4.2 Client
Peut :
- Gérer son profil et ses coordonnées.
- Enregistrer plusieurs adresses de livraison.
- Coller un lien produit.
- Ajouter des variantes, tailles, couleurs, quantités et instructions.
- Ajouter plusieurs produits à une demande.
- Choisir un ou plusieurs commissionnaires.
- Recevoir et comparer des devis.
- Accepter, refuser ou demander une correction de devis.
- Consulter ses commandes, paiements et colis.
- Envoyer des messages liés à une commande.
- Signaler un problème et ouvrir un litige.
- Évaluer un commissionnaire après une commande terminée.

Ne peut pas :
- Voir les clients d’un commissionnaire.
- Voir les marges internes ou notes privées du commissionnaire.
- Modifier un paiement confirmé.
- Accéder aux commandes d’autres clients.

### 4.3 Commissionnaire indépendant
Peut :
- Créer un profil professionnel.
- Soumettre ses documents de vérification.
- Définir ses zones et services.
- Définir ses frais et règles commerciales.
- Recevoir des demandes qui lui sont adressées.
- Émettre, modifier et annuler un devis selon son statut.
- Convertir un devis accepté en commande.
- Gérer achats, articles, colis, expéditions et livraisons.
- Enregistrer des dépenses et paiements.
- Ajouter des preuves et documents.
- Gérer ses clients et communications.
- Inviter des employés selon son abonnement.
- Consulter ses statistiques et marges privées.
- Répondre aux évaluations et litiges.

Ne peut pas :
- Accéder aux données d’un autre commissionnaire.
- Modifier les évaluations ou preuves clients.
- Voir les informations internes de la plateforme non nécessaires à son activité.
- Modifier les transactions finalisées sans procédure de correction auditée.

### 4.4 Entreprise de commissionnement
Dispose des fonctionnalités du commissionnaire, avec en plus :
- Plusieurs utilisateurs/employés.
- Rôles internes personnalisés ou prédéfinis.
- Attribution des demandes aux agents.
- Gestion de plusieurs points de collecte ou agences.
- Rapports consolidés.
- Historique des actions des employés.
- Paramètres d’entreprise et identité de facturation.

### 4.5 Employés du commissionnaire

Rôles recommandés :
- **Administrateur d’entreprise :** tous les droits sur l’espace de son entreprise.
- **Commercial :** demandes, clients, devis et communications.
- **Acheteur :** commandes fournisseurs, coûts d’achat et preuves d’achat.
- **Agent logistique :** colis, poids, dimensions, expéditions et réceptions.
- **Comptable :** paiements, dépenses, factures et rapports financiers.
- **Livreur/agent de remise :** colis qui lui sont attribués et preuve de livraison.

Les permissions doivent être configurables par entreprise, avec des restrictions par défaut.

### 4.6 Administrateur de la plateforme
Peut :
- Gérer les utilisateurs, professionnels et entreprises.
- Vérifier, approuver, suspendre ou refuser un professionnel.
- Gérer les catégories, plateformes, villes et zones.
- Paramétrer les commissions et abonnements.
- Superviser les commandes et litiges selon les permissions.
- Consulter les transactions et journaux d’audit.
- Gérer les contenus, notifications et paramètres globaux.
- Consulter les statistiques globales.

### 4.7 Support client / modérateur
Accès limité :
- Consulter les informations nécessaires aux demandes de support.
- Traiter les signalements et litiges assignés.
- Ajouter des notes internes.
- Ne peut pas modifier librement les paiements ou les données financières.

### 4.8 Opérateur logistique de la plateforme
Si l’entreprise exploite ses propres opérations :
- Gère les colis de son propre service.
- Enregistre les réceptions, pesées, regroupements et départs.
- Scanne les QR codes.
- Ne doit pas accéder aux opérations privées des commissionnaires indépendants, sauf consentement ou nécessité de support dûment journalisée.

---

## 5. Parcours utilisateur principaux

### 5.1 Parcours client — commande par lien

1. Le client crée un compte ou se connecte.
2. Il colle l’URL d’un produit.
3. Le système valide le format du lien et identifie la marketplace si possible.
4. Le système tente une extraction autorisée des informations publiques : titre, image, prix affiché, devise, variantes et URL canonique.
5. Si l’extraction échoue, le client saisit les informations manuellement et peut joindre une capture d’écran.
6. Le client sélectionne la variante, la taille, la couleur, la quantité et ajoute une note.
7. Il ajoute d’autres articles si nécessaire.
8. Il choisit les commissionnaires à solliciter, ou utilise une option de mise en relation selon sa ville et son type de produit.
9. Les commissionnaires sélectionnés reçoivent la demande.
10. Chaque commissionnaire prépare son propre devis.
11. Le client compare les devis et leurs conditions.
12. Le client accepte un devis.
13. Une commande distincte est créée pour le commissionnaire retenu.
14. Le client choisit un mode de paiement disponible.
15. Le commissionnaire confirme la réception du paiement ou le prestataire confirme la transaction.
16. Le commissionnaire procède à l’achat et met à jour les étapes.
17. Les articles sont associés à un ou plusieurs colis.
18. Le client suit l’avancement jusqu’à la remise.
19. Le client confirme la réception ou ouvre un litige dans le délai prévu.
20. La commande est clôturée et le client peut laisser une évaluation.

### 5.2 Parcours client — plusieurs commissionnaires

- Une demande peut contenir plusieurs produits.
- Le client peut répartir les produits entre différents commissionnaires.
- Chaque devis accepté crée une commande indépendante.
- Chaque commande possède son propre prix, paiement, statut, colis et historique.
- Le panier global est une vue de regroupement et non une transaction unique.
- Les frais et délais de chaque commissionnaire sont affichés séparément.
- Aucun paiement ne doit être présenté comme couvrant plusieurs commissionnaires si le système ne peut pas garantir une ventilation fiable.

### 5.3 Parcours commissionnaire — traitement d’une demande

1. Notification d’une nouvelle demande.
2. Consultation des produits et variantes demandés.
3. Vérification du lien et de la disponibilité.
4. Saisie du prix fournisseur vérifié.
5. Saisie des frais locaux à l’origine.
6. Estimation du transport international.
7. Estimation des taxes/douanes si applicable, avec mention de la méthode et du caractère estimatif.
8. Saisie de la commission de service.
9. Saisie des frais de livraison locale.
10. Définition du délai estimé et de sa marge d’incertitude.
11. Envoi du devis détaillé.
12. Après acceptation et paiement, passage à l’achat.
13. Ajout des preuves d’achat et références.
14. Réception des articles et association aux colis.
15. Mise à jour des étapes logistiques.
16. Remise au client et clôture.

### 5.4 Parcours colis

Un colis doit être indépendant d’une commande unique : un colis peut contenir plusieurs articles de plusieurs commandes, et une commande peut être répartie sur plusieurs colis.

Étapes possibles :
- En attente d’achat.
- Acheté.
- En attente d’expédition vendeur.
- Expédié par le vendeur.
- Reçu à l’entrepôt d’origine.
- Contrôlé.
- Pesé et mesuré.
- Regroupé ou reconditionné.
- Prêt à l’expédition internationale.
- Expédié vers la RDC.
- En transit.
- Arrivé en RDC.
- En formalités douanières.
- Libéré.
- Arrivé au point de distribution.
- Prêt pour retrait/livraison.
- En cours de livraison locale.
- Livré.
- Anomalie / bloqué / perdu / endommagé.

Les étapes doivent être configurables par itinéraire et type de transport.

---

## 6. Modules fonctionnels détaillés

### 6.1 Authentification et comptes
- Inscription par téléphone et/ou e-mail.
- Vérification par OTP.
- Connexion sécurisée.
- Réinitialisation du mot de passe.
- Gestion des sessions et appareils.
- Déconnexion de tous les appareils.
- Authentification renforcée pour les administrateurs et professionnels.
- Acceptation des conditions générales et politique de confidentialité.
- Consentements séparés pour les notifications marketing.

### 6.2 Profils et adresses
Profil client :
- Nom affiché.
- Téléphone vérifié.
- E-mail facultatif.
- Ville et commune/quartier.
- Adresse de livraison.
- Instructions de livraison.
- Langue et préférences de notification.

Profil professionnel :
- Nom commercial.
- Type : indépendant ou entreprise.
- Coordonnées.
- Ville et zones desservies.
- Description des services.
- Plateformes prises en charge.
- Méthodes de transport.
- Tarifs ou politique de devis.
- Documents de vérification.
- Statut de vérification.
- Note et statistiques publiques.

Les documents sensibles doivent être chiffrés et accessibles uniquement aux rôles autorisés.

### 6.3 Importation de produit par URL
Le système doit :
- Accepter les URL HTTPS des plateformes autorisées.
- Détecter le domaine et la marketplace.
- Vérifier et normaliser l’URL.
- Bloquer les schémas dangereux et les domaines non autorisés.
- Éviter les requêtes serveur vers des adresses privées ou locales (protection SSRF).
- Utiliser un connecteur officiel lorsque disponible et autorisé.
- Stocker la source et la date de récupération.
- Afficher clairement les données non vérifiées ou anciennes.
- Permettre une correction manuelle.
- Conserver le lien source original pour le professionnel.

Données à extraire lorsque disponibles :
- Titre.
- Image principale.
- Galerie d’images, si autorisée.
- Prix affiché.
- Devise.
- Variante/option.
- Taille/couleur.
- Identifiant produit.
- Disponibilité, si confirmée.
- Frais ou conditions visibles.
- URL canonique.

**Règle importante :** l’extraction n’est pas une preuve de stock ni un prix garanti. Le commissionnaire doit vérifier le prix, la variante et la disponibilité avant d’émettre un devis ferme.

### 6.4 Moteur de recherche universel
Objectif : fournir une recherche unique sur plusieurs marketplaces compatibles.

Architecture attendue :
- Une interface de recherche commune.
- Un orchestrateur de recherche.
- Un connecteur indépendant par marketplace.
- Un format de résultat normalisé.
- Des délais d’attente et limites par connecteur.
- Un cache contrôlé.
- Une gestion des erreurs par source.
- Une indication claire de la marketplace et du lien source.

Chaque connecteur doit préciser :
- Mode d’accès : API officielle, flux partenaire, affiliation ou import URL.
- Autorisation et conditions d’utilisation.
- Champs disponibles.
- Limites de requêtes.
- Restrictions de stockage et d’affichage.
- Date de dernière vérification.

Résultats :
- Image, titre, prix et devise lorsque permis.
- Marketplace source.
- Lien vers la fiche originale.
- État de disponibilité uniquement si la source le confirme.
- Mention « prix indicatif » si le prix peut varier.

Ne jamais :
- Promettre l’accès à l’intégralité des catalogues.
- Copier durablement des contenus protégés sans autorisation.
- Contourner CAPTCHA, authentification, restrictions géographiques ou mesures anti-bot.
- Présenter un résultat non vérifié comme disponible à l’achat.

Si une source ne permet pas une recherche par API, proposer :
- Importation par URL.
- Saisie manuelle.
- Ajout d’une capture d’écran.
- Ouverture du site source dans le navigateur du client.

### 6.5 Demandes de devis
Une demande contient :
- Client.
- Produits et quantités.
- Variantes et instructions.
- Ville de destination.
- Commissionnaires sollicités.
- Date de création.
- Date limite éventuelle.
- Statut.
- Pièces jointes.

Statuts :
- Brouillon.
- Envoyée.
- Reçue par professionnel.
- En cours d’évaluation.
- Devis reçu.
- Devis partiellement reçu.
- Expirée.
- Annulée.
- Convertie en commande.

Un commissionnaire ne voit que les demandes qui lui sont adressées ou qui lui sont attribuées.

### 6.6 Devis et tarification
Chaque devis doit détailler :
- Prix des produits.
- Quantités.
- Livraison locale chez le vendeur/entrepôt, si applicable.
- Frais de service du commissionnaire.
- Transport international estimé.
- Frais de manutention/entrepôt.
- Taxes et douanes estimées, si elles sont connues.
- Livraison locale en RDC.
- Assurance facultative, si proposée par un partenaire.
- Réductions.
- Total et devise.
- Taux de change utilisé et date.
- Validité du devis.
- Délai estimé et hypothèses.
- Conditions d’annulation et de remboursement.

Le système doit distinguer :
- **Estimation :** indicative, non engageante.
- **Devis confirmé :** prix proposé pour une durée donnée.
- **Montant final :** montant réellement facturé après coûts vérifiés et règles de variation acceptées.

Toute modification après acceptation doit créer une version de devis ou un ajustement approuvé par le client. L’historique précédent doit rester consultable.

### 6.7 Commandes
Une commande est créée après acceptation d’un devis.

Informations :
- Numéro unique lisible.
- Client.
- Commissionnaire responsable.
- Devis accepté et version.
- Lignes de commande.
- Montants et devise.
- Mode de paiement.
- Statut de paiement.
- Statut opérationnel.
- Dates clés.
- Historique.
- Documents et preuves.

Statuts opérationnels recommandés :
- En attente de paiement.
- Paiement à confirmer.
- Payée.
- Achat en cours.
- Partiellement achetée.
- Achetée.
- En préparation logistique.
- En transport.
- Arrivée au point de distribution.
- Prête pour retrait/livraison.
- Terminée.
- Annulée.
- En litige.

Les statuts de paiement doivent être séparés des statuts opérationnels.

### 6.8 Gestion des achats fournisseurs
- Enregistrer le vendeur/la boutique source.
- Enregistrer la plateforme.
- Référence de commande fournisseur.
- Date d’achat.
- Montant réel et devise.
- Taux de change et frais de conversion.
- Preuve d’achat.
- Numéro de suivi vendeur.
- Articles concernés.
- Quantités achetées/reçues/manquantes.
- Retours ou remboursements fournisseur.

Les coordonnées privées du fournisseur ne doivent pas être communiquées automatiquement au client final. La plateforme ne doit toutefois pas falsifier les documents ni masquer les informations légalement requises.

### 6.9 Gestion des colis et entrepôts
Entités à gérer :
- Colis.
- Articles contenus.
- Entrepôt/point de réception.
- Expédition.
- Conteneur ou lot de transport, si applicable.
- Événements de suivi.

Fonctionnalités :
- Création d’un colis.
- Génération d’un identifiant unique.
- QR code et code-barres.
- Scan à la réception.
- Association/dissociation d’articles avec journal d’audit.
- Photos à la réception.
- Poids réel.
- Dimensions.
- Poids volumétrique calculé selon le facteur configuré par transporteur.
- État de l’emballage.
- Anomalies.
- Regroupement de plusieurs colis.
- Fractionnement d’un colis.
- Calcul de frais selon règles configurables.
- Historique complet des mouvements.

Le système doit permettre qu’un colis contienne des articles de plusieurs clients, avec séparation logique stricte des droits d’accès.

### 6.10 Expéditions et suivi
- Enregistrer le mode de transport : aérien, maritime, routier ou autre.
- Origine et destination.
- Transporteur/transitaire.
- Référence d’expédition.
- Numéro de suivi.
- Date de départ estimée/réelle.
- Date d’arrivée estimée/réelle.
- Coût et devise.
- Événements de suivi.
- Documents associés.
- Retards et anomalies.

Le suivi automatique dépendra des API ou services du transporteur. À défaut, mise à jour manuelle par l’opérateur.

### 6.11 Paiements et portefeuille de suivi
La plateforme doit gérer les enregistrements financiers, sans nécessairement détenir les fonds.

Modes possibles à étudier avec des prestataires actifs en RDC :
- Mobile Money.
- Carte bancaire.
- Virement.
- Paiement en espèces au point autorisé.
- Paiement direct au commissionnaire.

Pour chaque paiement :
- Identifiant interne.
- Commande concernée.
- Payeur et bénéficiaire.
- Montant et devise.
- Méthode.
- Référence du prestataire.
- Statut.
- Date.
- Frais.
- Preuve.
- Historique des événements.

Statuts :
- Initié.
- En attente.
- Confirmé par prestataire.
- À vérifier manuellement.
- Échoué.
- Expiré.
- Remboursé partiellement.
- Remboursé.
- Contesté.

**Paiement direct :**
- L’application affiche les instructions du commissionnaire.
- Le client transmet une référence ou preuve.
- Le commissionnaire confirme ou refuse avec motif.
- La plateforme conserve un journal de confirmation.
- Le badge « payé » ne doit pas être attribué sur simple déclaration du client.

**Paiement via plateforme :**
- Utiliser un prestataire agréé et une solution de paiement marketplace/split settlement si disponible.
- Vérifier l’identité/KYC des bénéficiaires selon les exigences du prestataire.
- Ne jamais conserver les numéros de carte.
- Ne jamais créer un portefeuille de monnaie électronique maison sans autorisation appropriée.
- Ne jamais annoncer un séquestre/escrow si le prestataire et le cadre légal ne le permettent pas.
- Prévoir rapprochement, remboursements, chargebacks et gestion des paiements échoués.

### 6.12 Notifications et messagerie
Canaux selon consentement et disponibilité :
- Notifications push.
- E-mail.
- SMS.
- WhatsApp via intégration officielle.

Événements :
- Demande envoyée.
- Nouveau devis.
- Devis bientôt expiré.
- Paiement à confirmer.
- Paiement confirmé.
- Achat effectué.
- Article reçu à l’entrepôt.
- Colis expédié.
- Colis arrivé.
- Colis disponible.
- Livraison en cours.
- Commande terminée.
- Litige mis à jour.

La messagerie doit être liée à une demande ou une commande. Les pièces jointes doivent être contrôlées et limitées en taille/type.

### 6.13 Évaluations et confiance
- Seuls les clients ayant une commande terminée peuvent évaluer.
- Note globale et critères : communication, transparence, respect des délais annoncés, état des articles, résolution des problèmes.
- Commentaire modéré selon une politique publiée.
- Droit de réponse du professionnel.
- Détection des évaluations suspectes.
- Signalement d’un profil.
- Historique des suspensions et vérifications accessible uniquement aux rôles autorisés.

Badges :
- Profil vérifié.
- Nouveau professionnel.
- Professionnel bien évalué.
- Professionnel recommandé, selon des critères transparents.

Ne pas acheter ni fabriquer des évaluations.

### 6.14 Litiges, retours et remboursements
Motifs possibles :
- Produit non conforme.
- Mauvaise taille/couleur.
- Article manquant.
- Colis endommagé.
- Retard important.
- Commande non achetée.
- Paiement contesté.
- Désaccord sur frais supplémentaires.

Processus :
1. Client ouvre un dossier et fournit les preuves.
2. Commissionnaire répond dans un délai défini.
3. Support examine les informations.
4. Une décision est prise selon les conditions acceptées.
5. Ajustement/remboursement est enregistré si applicable.
6. Le dossier est clôturé avec motif et historique.

La politique doit préciser les cas où le retour est possible ou impossible, les délais de réclamation, les responsabilités du vendeur, du commissionnaire, du transporteur et de la plateforme. Ne pas promettre un remboursement si le montant n’est pas recouvrable ou si les conditions ne le prévoient pas.

### 6.15 Facturation et documents
- Devis PDF.
- Reçu de paiement.
- Facture de service.
- Bon de réception.
- Fiche colis.
- Bordereau de remise.
- Rapport de commande.
- Relevé professionnel.
- Export CSV/XLSX des opérations.

Les documents doivent afficher clairement l’émetteur, le client, les montants, la devise, la date, les références et les conditions applicables. La conformité fiscale doit être validée localement.

### 6.16 Abonnements professionnels
Offres indicatives à tester, non définitives :
- **Starter :** profil, volume limité de demandes et fonctions essentielles.
- **Business :** plus de commandes, rapports, automatisations et employés limités.
- **Pro :** gestion avancée des colis, employés et exports.
- **Enterprise :** multi-agences, rôles avancés, assistance et intégrations.

Le prix et les limites seront décidés après entretiens avec les commissionnaires. Prévoir période d’essai, renouvellement, suspension et facturation.

### 6.17 Console d’administration
Écrans :
- Vue d’ensemble.
- Utilisateurs.
- Commissionnaires et vérifications.
- Entreprises et employés.
- Demandes et commandes.
- Paiements et rapprochements.
- Colis et expéditions.
- Litiges.
- Évaluations et signalements.
- Plateformes et connecteurs.
- Villes et zones.
- Commissions et abonnements.
- Notifications et contenus.
- Journaux d’audit.
- Paramètres système.

Toute action sensible doit être journalisée avec acteur, date, objet, ancienne valeur, nouvelle valeur et motif.

---

## 7. Règles métier essentielles

1. Un client peut solliciter plusieurs commissionnaires pour une même demande.
2. Chaque devis appartient à un seul commissionnaire.
3. Chaque devis accepté crée une commande distincte.
4. Une commande appartient à un seul commissionnaire responsable.
5. Une commande peut contenir plusieurs lignes de produits.
6. Une ligne peut être achetée en plusieurs fois ou reçue partiellement.
7. Une commande peut être répartie dans plusieurs colis.
8. Un colis peut contenir des articles provenant de plusieurs commandes, si l’opération logistique le permet.
9. L’accès aux informations d’un colis doit être filtré par client et par commissionnaire.
10. Les coûts réels et les prix facturés doivent être stockés séparément.
11. Les paiements ne doivent jamais être confondus avec les statuts de livraison.
12. Toute modification de prix après acceptation exige un ajustement documenté et accepté.
13. Les devis expirés ne peuvent pas être acceptés sans réactivation.
14. Les évaluations ne sont possibles qu’après une commande terminée.
15. Les actions administratives sensibles doivent être auditées.
16. Les devis, paiements, commandes et mouvements de colis ne doivent pas être supprimés physiquement après finalisation ; utiliser des statuts d’annulation/archivage.
17. Les taux de change doivent conserver leur source, leur date et leur valeur au moment du calcul.
18. Le système doit gérer USD et CDF dès le MVP ; CNY peut être ajouté comme devise d’achat et d’affichage interne.
19. Le prix affiché sur un site tiers peut changer ; il ne doit pas être considéré comme prix final.
20. Les frais douaniers doivent être saisis ou estimés selon des règles validées ; ne pas les inventer automatiquement.

---

## 8. Villes, zones et logistique RDC

Le lancement opérationnel cible :
- Lubumbashi.
- Likasi.
- Kasumbalesa.
- Kipushi.

Chaque ville doit pouvoir disposer de :
- Quartiers/communes ou zones de service.
- Modes de remise : retrait, livraison locale ou point partenaire.
- Frais configurables.
- Délais indicatifs.
- Commissionnaires actifs.
- Points de collecte vérifiés.

La plateforme doit être conçue pour ajouter ensuite d’autres villes sans modifier le cœur du système.

Les itinéraires internationaux, points d’entrée, transitaires et règles douanières doivent être configurables. Ne pas coder en dur un seul itinéraire Chine-RDC.

---

## 9. Architecture technique recommandée

### 9.1 Applications

**Application client**
- Mobile-first.
- Android prioritaire pour le pilote, avec possibilité iOS.
- Web responsive possible pour faciliter le lancement.

**Portail professionnel**
- Application web responsive.
- Utilisable sur ordinateur, tablette et téléphone.
- Tableaux de bord, commandes, colis, clients, finances.

**Console administrateur**
- Application web séparée ou zone sécurisée du portail.
- Accès MFA obligatoire pour les administrateurs.

### 9.2 Stack suggérée

- Mobile : React Native + Expo.
- Web : Next.js + TypeScript.
- Backend : NestJS + TypeScript.
- API : REST documentée avec OpenAPI ; webhooks pour événements.
- Base de données : PostgreSQL.
- ORM : Prisma ou Drizzle (choisir un seul).
- Cache et tâches : Redis + BullMQ.
- Fichiers : stockage objet compatible S3, par exemple Cloudflare R2 ou équivalent.
- Notifications push : Firebase Cloud Messaging.
- Observabilité : logs structurés, suivi d’erreurs et métriques.
- Déploiement : conteneurs Docker sur VPS/cloud fiable, environnements séparés.
- Automatisation : n8n pour notifications et tâches non critiques, pas comme source principale de vérité transactionnelle.

Le choix final doit tenir compte du budget, de la disponibilité des développeurs, des coûts d’hébergement et de la facilité de maintenance.

### 9.3 Architecture logique

Composants :
1. API Gateway / Backend API.
2. Service d’authentification et d’autorisations.
3. Service utilisateurs et organisations.
4. Service catalogue et connecteurs marketplace.
5. Service demandes et devis.
6. Service commandes et achats.
7. Service colis et expéditions.
8. Service paiements et rapprochement.
9. Service notifications.
10. Service évaluations et litiges.
11. Service abonnements et commissions.
12. Service administration et audit.

Pour le MVP, un **monolithe modulaire** est recommandé plutôt que des microservices prématurés. Les modules doivent avoir des frontières claires afin de pouvoir être séparés plus tard si le volume le justifie.

### 9.4 Multi-tenant
Chaque commissionnaire ou entreprise constitue un tenant logique.
- Toutes les données professionnelles portent un `organization_id` ou `commissioner_id`.
- Les requêtes doivent appliquer le contrôle d’accès côté serveur.
- Ne jamais compter sur le filtrage de l’interface uniquement.
- Tests automatiques obligatoires contre les accès inter-commissionnaires.
- Les administrateurs globaux disposent de permissions spécifiques et auditées.

### 9.5 API et intégrations
Prévoir des adaptateurs pour :
- Marketplaces.
- Prestataires de paiement.
- SMS/e-mail/WhatsApp.
- Transporteurs et transitaires.
- Taux de change.
- Stockage de documents.

Chaque intégration doit être isolée derrière une interface interne afin de pouvoir remplacer un fournisseur sans réécrire les modules métier.

---

## 10. Modèle de données — entités principales

Le modèle détaillé sera conçu avec migrations versionnées. Entités minimales :

### Identité et organisations
- `users`
- `user_profiles`
- `user_addresses`
- `organizations`
- `organization_members`
- `roles`
- `permissions`
- `organization_verifications`
- `sessions`
- `consents`

### Marketplace et produits
- `marketplaces`
- `marketplace_connectors`
- `product_imports`
- `product_snapshots`
- `product_variants`
- `product_images`
- `categories`
- `search_queries`
- `search_results_cache`

### Demandes et devis
- `quote_requests`
- `quote_request_items`
- `quote_request_commissioners`
- `quotes`
- `quote_versions`
- `quote_items`
- `quote_adjustments`

### Commandes et achats
- `orders`
- `order_items`
- `supplier_orders`
- `supplier_order_items`
- `purchase_proofs`
- `order_status_events`

### Logistique
- `warehouses`
- `parcels`
- `parcel_items`
- `parcel_events`
- `shipments`
- `shipment_parcels`
- `tracking_events`
- `delivery_tasks`
- `delivery_proofs`

### Finances
- `payments`
- `payment_events`
- `refunds`
- `expenses`
- `commissions`
- `commission_rules`
- `exchange_rates`
- `invoices`
- `receipts`
- `payouts` (uniquement si modèle de versement prestataire disponible)

### Confiance et support
- `reviews`
- `review_responses`
- `disputes`
- `dispute_messages`
- `support_tickets`
- `reports`
- `audit_logs`
- `notifications`
- `notification_preferences`

### Abonnements
- `plans`
- `subscriptions`
- `subscription_invoices`
- `usage_counters`

Toutes les entités financières doivent conserver devise, montant, dates et références externes nécessaires à l’audit.

---

## 11. Sécurité, confidentialité et conformité

Exigences minimales :
- HTTPS partout.
- Chiffrement au repos pour les données et documents sensibles.
- Hachage moderne des mots de passe.
- MFA pour administrateurs et recommandé pour professionnels.
- Contrôle d’accès par rôle et par organisation.
- Limitation de débit et protection contre les attaques automatisées.
- Validation stricte des entrées.
- Protection SSRF pour les liens importés.
- Protection XSS, CSRF et injections SQL.
- Gestion sécurisée des secrets et clés API.
- Sauvegardes automatiques et tests de restauration.
- Journalisation des actions sensibles.
- Politique de conservation et suppression des données.
- Procédure de réponse aux incidents.
- Tests de sécurité avant lancement.

Données personnelles :
- Collecter uniquement ce qui est nécessaire.
- Expliquer pourquoi les données sont collectées.
- Permettre la correction des informations.
- Restreindre l’accès aux documents d’identité.
- Ne pas exposer l’identité ou les coordonnées du client au vendeur tiers sans nécessité.
- Ne pas promettre un anonymat absolu : le commissionnaire peut avoir besoin d’informations de livraison et le vendeur peut voir les informations nécessaires à l’expédition vers l’entrepôt.
- Définir les responsabilités du responsable de traitement et des sous-traitants.

Conformité à vérifier avec des professionnels locaux :
- Protection des données personnelles applicable en RDC.
- Obligations commerciales et fiscales.
- Règles applicables aux paiements et à la collecte de fonds.
- Obligations KYC/AML du prestataire de paiement.
- Réglementation douanière et importation.
- Conditions de vente, retours et garanties.
- Obligations relatives aux produits réglementés ou interdits à l’importation.

La plateforme doit prévoir des catégories de produits interdites ou soumises à vérification, avec possibilité de blocage ou d’examen manuel.

---

## 12. UX/UI — principes d’expérience

Direction :
- Interface moderne, rapide, rassurante et simple.
- Français comme langue initiale.
- Architecture prête pour anglais et autres langues.
- USD et CDF visibles ; CNY utilisé pour les coûts d’achat si nécessaire.
- Mobile-first, réseau parfois instable.
- États de chargement, erreurs et absence de résultat explicites.
- Formulaires courts avec sauvegarde de brouillon.
- Accessibilité : contraste, tailles de texte et zones tactiles suffisantes.

### 12.1 Navigation client
- Accueil.
- Rechercher.
- Importer un lien.
- Mes demandes/devis.
- Mes commandes.
- Mes colis.
- Profil.

### 12.2 Navigation commissionnaire
- Vue d’ensemble.
- Demandes.
- Devis.
- Commandes.
- Achats.
- Colis.
- Expéditions.
- Clients.
- Finances.
- Rapports.
- Équipe.
- Paramètres.

### 12.3 Navigation administrateur
- Vue globale.
- Utilisateurs.
- Professionnels.
- Commandes.
- Paiements.
- Logistique.
- Litiges.
- Connecteurs.
- Abonnements.
- Configuration.
- Audit.

Éviter les écrans surchargés. Les actions principales doivent être visibles et les opérations complexes guidées par étapes.

---

## 13. Exigences non fonctionnelles

- Temps de réponse cible : moins de 2 secondes pour les opérations courantes hors appels externes.
- Recherche externe : résultats partiels acceptés avec indication des sources lentes/indisponibles.
- Disponibilité cible MVP : 99,5 % mensuel, sous réserve du budget d’infrastructure.
- Sauvegarde quotidienne au minimum, avec fréquence renforcée pour données transactionnelles.
- Restauration testée régulièrement.
- Support des connexions mobiles instables.
- Pagination pour toutes les listes importantes.
- Exports pour les professionnels.
- Architecture évolutive.
- Journalisation et monitoring.
- Tests unitaires, intégration et parcours critiques.
- Environnements développement, staging et production séparés.

---

## 14. Indicateurs de performance (KPI)

Marketplace :
- Nombre de clients inscrits.
- Nombre de clients actifs.
- Demandes créées.
- Taux de demandes recevant au moins un devis.
- Taux d’acceptation des devis.
- Valeur totale des commandes.
- Taux de commandes terminées.

Commissionnaires :
- Professionnels inscrits et vérifiés.
- Délai moyen de réponse aux demandes.
- Taux de devis acceptés.
- Taux de livraison dans le délai annoncé.
- Taux de litiges.
- Note moyenne.

Logistique :
- Nombre de colis reçus.
- Délai moyen par étape.
- Colis en retard.
- Colis endommagés ou manquants.
- Temps entre arrivée et remise au client.

Finances :
- Volume de paiements enregistrés.
- Paiements échoués.
- Remboursements.
- Commission nette de la plateforme.
- Revenu d’abonnement.
- Coût opérationnel par commande.

Les KPI doivent être calculés à partir d’événements et de données cohérents, pas à partir de valeurs saisies arbitrairement dans les tableaux de bord.

---

## 15. Tests et critères d’acceptation

Le MVP n’est accepté que si les scénarios suivants réussissent :

### Compte et permissions
- Un client ne peut pas voir les commandes d’un autre client.
- Un commissionnaire ne peut pas consulter les données d’un autre commissionnaire.
- Un employé ne peut effectuer que les actions autorisées.
- Un administrateur peut suspendre un professionnel et l’action est auditée.

### Import de produit
- Un lien valide d’une source prise en charge est reconnu.
- Un lien non pris en charge propose une saisie manuelle.
- Une URL malveillante ou locale est bloquée.
- Le prix importé est marqué comme indicatif et daté.
- Le client peut corriger les variantes et quantités.

### Devis et commandes
- Plusieurs commissionnaires peuvent répondre à une même demande.
- Les devis sont séparés et comparables.
- L’acceptation d’un devis crée une commande liée à sa version exacte.
- Une modification de prix exige une approbation.
- Les commandes de commissionnaires différents restent séparées.

### Paiements
- Un paiement direct en attente n’est pas marqué comme confirmé.
- Une confirmation manuelle conserve l’identité de l’employé et la date.
- Un webhook prestataire est vérifié et idempotent.
- Un paiement échoué ne déclenche pas l’achat automatiquement.
- Un remboursement est enregistré comme événement distinct.

### Colis
- Une commande peut être répartie dans plusieurs colis.
- Un colis peut regrouper plusieurs articles.
- Les droits d’accès empêchent un client de voir les articles d’un autre client.
- Chaque mouvement crée un événement horodaté.
- Un QR code permet d’ouvrir le bon colis pour un utilisateur autorisé.

### Litiges
- Un client peut ouvrir un litige dans les conditions définies.
- Les preuves sont stockées de manière sécurisée.
- Chaque décision est historisée.
- Un litige clôturé ne peut être modifié que par une procédure autorisée et auditée.

### Qualité
- Tests mobiles sur Android.
- Tests réseau lent/intermittent.
- Tests de restauration des sauvegardes.
- Tests de sécurité et de séparation multi-tenant.
- Tests de charge adaptés au volume pilote.

---

## 16. Plan de réalisation recommandé

### Phase 0 — Validation terrain
Durée indicative : 1 à 2 semaines.
- Interviewer 10 à 15 commissionnaires à Lubumbashi.
- Observer leur processus réel.
- Identifier les méthodes de transport et de paiement utilisées.
- Mesurer les problèmes les plus fréquents.
- Tester la volonté de payer pour un outil SaaS.
- Identifier 5 à 10 professionnels pilotes.
- Valider les zones de collecte et livraison.

Livrable : synthèse de recherche et décisions produit ajustées.

### Phase 1 — Conception
Durée indicative : 1 à 2 semaines.
- Parcours UX.
- Maquettes des écrans.
- Modèle de données.
- Architecture technique.
- Politique de rôles et permissions.
- Règles de tarification.
- Spécification API.

Livrables : maquettes, diagrammes, backlog et spécification technique.

### Phase 2 — MVP
Durée indicative : à estimer après choix de l’équipe.
- Authentification.
- Profils.
- Demandes et devis.
- Commandes.
- Import URL basique.
- Dashboard commissionnaire.
- Gestion manuelle des colis.
- Notifications.
- Administration.

### Phase 3 — Pilote opérationnel
- Déploiement limité à Lubumbashi.
- Formation de 5 à 10 commissionnaires.
- Suivi hebdomadaire des retours.
- Correction des erreurs.
- Mesure des KPI.
- Validation du modèle de paiement.

### Phase 4 — Extension
- Likasi, Kasumbalesa et Kipushi.
- Connecteurs marketplace supplémentaires.
- Paiements intégrés selon disponibilité.
- QR codes et suivi logistique amélioré.
- Abonnements et rapports avancés.

### Phase 5 — Échelle
- Autres villes.
- Partenaires logistiques.
- Automatisation des suivis.
- Optimisation du moteur de recherche.
- Application opérateur et outils d’entrepôt.

Les durées sont indicatives. Le planning réel dépendra de la taille de l’équipe, des intégrations externes, du budget et des validations réglementaires.

---

## 17. Risques majeurs et mesures de réduction

| Risque | Impact | Mesure |
|---|---|---|
| API marketplace indisponible ou restreinte | Catalogue incomplet | Connecteurs indépendants, import URL, saisie manuelle |
| Prix et stocks qui changent | Devis erroné | Vérification humaine avant devis ferme |
| Paiement non confirmé | Perte financière | Webhooks, rapprochement, confirmation auditée |
| Commissionnaire frauduleux | Perte de confiance | Vérification, évaluations, signalements, suspension |
| Colis mal attribué | Litige/perte | QR code, scans, journal des mouvements |
| Frais douaniers variables | Prix final différent | Estimation clairement indiquée et validation |
| Réseau mobile instable | Abandon | Interface légère, brouillons, reprise des opérations |
| Dépendance à un seul transporteur | Blocage | Plusieurs partenaires et saisie manuelle |
| Fuite de données | Risque juridique et réputationnel | Contrôle d’accès, chiffrement, audit, tests |
| Modèle financier non rentable | Échec commercial | Pilote, entretiens, mesure du coût par commande |

---

## 18. Décisions à confirmer avant le développement

Ces éléments ne doivent pas être inventés par l’agent de développement. Ils doivent être proposés avec options et validés par le propriétaire du produit :

1. Nom, identité visuelle et domaine.
2. Langues initiales.
3. Pourcentage de commission de la plateforme.
4. Tarifs des abonnements.
5. Règles de remboursement et délais de litige.
6. Prestataires de paiement réellement accessibles en RDC.
7. Modes de livraison et partenaires par ville.
8. Politique de conversion USD/CDF/CNY.
9. Politique de frais douaniers et responsabilités.
10. Catégories de produits interdites ou soumises à validation.
11. Documents nécessaires pour vérifier les commissionnaires.
12. Modèle de paiement intégré et capacité éventuelle de split settlement.
13. Conditions contractuelles entre la plateforme, les commissionnaires et les clients.
14. Politique de conservation des documents et données.

---

## 19. Instructions impératives à l’agent IA de développement

Tu agis comme une équipe senior composée d’un product manager, architecte logiciel, UX designer, développeur full-stack, spécialiste sécurité et ingénieur QA.

### Ta mission
Concevoir et développer progressivement la plateforme décrite dans ce document. Ne réduis pas le produit à une simple boutique en ligne. Le cœur est la relation entre clients, commissionnaires, achats fournisseurs, commandes, colis, paiements et suivi.

### Méthode de travail obligatoire
1. Lire intégralement le cahier des charges.
2. Produire une liste des exigences fonctionnelles et non fonctionnelles.
3. Identifier les ambiguïtés et poser les questions bloquantes avant de coder.
4. Proposer une architecture et justifier les choix.
5. Produire le schéma de base de données et les diagrammes de flux.
6. Définir les rôles et permissions.
7. Créer un backlog découpé en tâches testables.
8. Concevoir les maquettes avant d’implémenter les interfaces majeures.
9. Développer par modules.
10. Écrire les tests au fur et à mesure.
11. Documenter les API, variables d’environnement, migrations et procédures de déploiement.
12. Ne jamais simuler une intégration externe comme si elle était réellement opérationnelle.
13. Utiliser des adaptateurs mockés uniquement en développement et les marquer clairement.
14. Vérifier les permissions côté serveur.
15. Ne jamais mettre de secrets ou clés API dans le code client ou le dépôt.
16. Fournir à chaque étape un résumé des éléments réalisés, des tests exécutés, des limites connues et des prochaines tâches.

### Priorités de développement
Ordre recommandé :
1. Authentification et organisations.
2. Permissions multi-tenant.
3. Profils et vérification des commissionnaires.
4. Import de produits par URL et saisie manuelle.
5. Demandes de devis.
6. Devis et comparaison.
7. Commandes et achats.
8. Paiements enregistrés et rapprochement.
9. Colis et événements logistiques.
10. Notifications.
11. Administration.
12. Connecteurs API officiels.
13. Paiements intégrés.
14. Abonnements et fonctionnalités avancées.

### Exigences de qualité du code
- TypeScript strict.
- Validation des entrées avec schémas.
- Gestion centralisée des erreurs.
- Migrations versionnées.
- Tests automatisés.
- Logs sans données sensibles.
- Idempotence des webhooks et opérations financières.
- Documentation de démarrage local.
- Fichier `.env.example` sans secrets.
- CI avec lint, tests et build.
- Pas de données sensibles réelles dans les fixtures.
- Pas de dépendance à des données mockées en production.

### Livrables attendus de l’agent
- Architecture technique documentée.
- Diagrammes des parcours et des états.
- Schéma relationnel de base de données.
- Maquettes UI.
- Dépôt de code structuré.
- API documentée.
- Tests.
- Documentation d’installation.
- Guide administrateur.
- Guide commissionnaire.
- Plan de déploiement et de sauvegarde.
- Liste des intégrations réellement validées et de celles restant à obtenir.

---

## 20. Définition du succès du MVP

Le MVP est considéré comme prêt pour un pilote lorsque :

- Un client peut importer un produit par lien ou le saisir manuellement.
- Il peut solliciter plusieurs commissionnaires.
- Les commissionnaires peuvent envoyer des devis détaillés.
- Le client peut comparer et accepter un devis.
- Une commande distincte est créée pour le commissionnaire choisi.
- Le paiement est enregistré avec un statut fiable.
- Le commissionnaire peut enregistrer l’achat.
- Les articles peuvent être répartis dans des colis.
- Le client peut suivre les étapes logistiques.
- Les notifications essentielles fonctionnent.
- L’administrateur peut vérifier et superviser les professionnels.
- Les données des commissionnaires sont isolées.
- Les parcours critiques sont testés.
- Les limites des intégrations externes sont affichées honnêtement.

**Principe final :** lancer un système fiable qui résout réellement le travail quotidien des commissionnaires et les inquiétudes des acheteurs, puis étendre progressivement le catalogue universel, les paiements et la couverture géographique.
