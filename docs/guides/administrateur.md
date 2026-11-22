# Konzia — Guide de l'administrateur

Pour l'équipe Konzia. La console d'administration est à l'adresse **app.konzia.app/admin**.

> **Chaque consultation** de données d'un commissionnaire ou d'un client est enregistrée dans le journal d'audit, à votre nom. N'ouvrez que ce dont vous avez besoin.

## Accès

- Un compte devient administrateur **uniquement** par la commande serveur `promote-admin.cjs` (voir `deploiement.md` § 7). Aucun écran ne le permet.
- **Double authentification obligatoire** : à la première visite, **Activer la double authentification**. Saisissez la clé dans Google Authenticator ou Aegis, puis le code à 6 chiffres. Le code est redemandé à chaque nouvel appareil et toutes les 12 heures.
- Téléphone perdu : un autre administrateur ne peut pas réinitialiser la MFA par l'écran. Il faut passer par le serveur (à faire avec le responsable technique).

## Tous les jours (5 minutes)

1. **Vue globale** : dossiers à vérifier, litiges ouverts, paiements en attente depuis longtemps.
2. **Taux** : publiez le taux USD → CDF du jour (et USD → CNY si besoin). Le taux publié sert aux paiements en francs congolais et aux nouveaux devis. Les devis déjà envoyés gardent leur taux.

## Vérifier un commissionnaire (écran 10)

**Commissionnaires → Afficher : Dossiers à vérifier**, puis ouvrez la fiche.
- **Ouvrir** chaque pièce : le RCCM, et la pièce d'identité du responsable.
- Contrôlez que le nom du RCCM correspond au nom commercial et au responsable. Vérifiez aussi que la pièce est lisible et en cours de validité.
- **Approuver**, ou **Refuser…** avec un motif clair. Le motif est envoyé au commissionnaire, qui peut corriger et renvoyer son dossier.

## Suspendre

- **Commissionnaire** (fraude, plaintes répétées) : **Suspendre…** avec motif. Il disparaît de l'annuaire et ne peut plus agir. Ses clients voient toujours leurs commandes en cours. **Réactiver…** quand c'est réglé.
- **Utilisateur** : **Utilisateurs → Suspendre…**. Il est déconnecté de tous ses appareils sur-le-champ.

## Litiges

**Litiges** (cochez « Seulement les litiges en cours ») :
1. Lisez la description, les photos et la réponse du commissionnaire. Posez des questions dans le fil si besoin : vous signez « Support Konzia ».
2. **Rendre la décision** : écrivez-la clairement (qui fait quoi, quand). Elle est visible des deux parties.
3. Une fois la décision appliquée (remboursement enregistré, article échangé), **Clore le litige**.
4. Un litige clos ne se modifie plus. En cas d'élément nouveau : **Rouvrir le litige**, avec un motif.

## Villes et zones

**Villes** : Lubumbashi est active pour le pilote. Pour ouvrir Likasi, Kasumbalesa ou Kipushi : activez la ville et ses communes. Aucun changement de code n'est nécessaire.

## Chaque mois

- **Test de restauration** d'une sauvegarde (`deploiement.md` § 8) : notez la date et le résultat.
- Parcourez le **Journal** : recherchez `admin.` pour relire les actions de l'équipe, et `payment.refunded` pour les remboursements.
- Vérifiez l'espace disque du serveur.

## Ce que vous ne pouvez pas faire, par conception

- Modifier un paiement confirmé, un devis envoyé ou un événement de suivi : on corrige par un nouvel enregistrement (remboursement, nouvelle version, correction).
- Supprimer une commande, un paiement, un colis ou un litige.
- Voir le mot de passe d'un utilisateur.
