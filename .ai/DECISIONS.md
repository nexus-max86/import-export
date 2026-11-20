# Décisions d'architecture CargoLink

Ne figurent ici que les décisions difficiles à défaire, surprenantes sans contexte, et résultant d'un vrai compromis.

## D1 — Isolation multi-tenant par Row-Level Security PostgreSQL, en plus des gardes serveur (20/11/2026)
- **Contexte** : la fuite de données entre commissionnaires concurrents est le risque n°1 (cahier §9.4, §15).
- **Décision** : chaque requête fixe `app.user_id` / `app.org_id` dans une transaction ; l'application se connecte avec un rôle sans `BYPASSRLS`.
- **Coût accepté** : chaque requête Prisma passe par une transaction ; les politiques SQL doivent être écrites et testées pour chaque table.
- **Alternative écartée** : filtrage applicatif seul (un oubli de `where` suffit à fuir).

## D2 — Sessions opaques en base plutôt que JWT (20/11/2026)
- **Décision** : cookie `HttpOnly` portant un jeton aléatoire ; hachage stocké en base.
- **Pourquoi** : révocation immédiate (« déconnecter tous les appareils », suspension d'un commissionnaire) ; une seule origine, donc pas besoin de jetons portables.

## D3 — Montants en entiers + devise ; taux figé dans chaque version de devis (20/11/2026)
- **Pourquoi** : pas d'erreurs d'arrondi ; un devis reste vérifiable même si le taux change (cahier §7.17).

## D4 — Client géré sans compte (20/11/2026)
- **Contexte** : les pilotes travaillent sur WhatsApp ; leurs clients n'auront pas tous un compte.
- **Décision** : `managed_customers` appartient à une organisation ; les demandes, commandes et paiements référencent un « client » qui est soit un utilisateur, soit un client géré. Réclamation du compte par lien d'invitation : le client géré est rattaché à l'utilisateur, l'historique est conservé.
- **Conséquence** : un même humain peut exister comme client géré chez deux commissionnaires différents ; ces fiches ne sont jamais fusionnées entre organisations (isolation).

## D5 — Application web installable (PWA) au lieu d'une application native au MVP (20/11/2026)
- **Pourquoi** : un seul code pour un développeur seul, pas de délai de publication, léger sur réseau instable.
- **Revoir si** : besoin de notifications push fiables en arrière-plan ou d'un usage hors ligne avancé après le pilote.
