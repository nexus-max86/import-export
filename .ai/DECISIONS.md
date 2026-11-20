# Décisions d'architecture Konzia

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

## D6 — Versions majeures des dépendances (20/11/2026)

- **Décision** : Next.js 15.5, NestJS 11, Prisma 6.19, TypeScript 5.9, Zod 4, Vitest 3, ESLint 9, versions exactes épinglées.
- **Pourquoi** : des versions majeures plus récentes existent (Next 16, NestJS 12, Prisma 7, TypeScript 7), mais ces lignes sont stables, encore maintenues et bien connues ; un développeur seul gagne à limiter les surprises pendant le MVP.
- **Revoir** : après le pilote, monter une dépendance majeure à la fois, CI verte à chaque étape.

## D7 — Adresse d'un client géré portée par sa fiche ; fusion à la réclamation (20/11/2026)

- **Décision** : un client géré a son adresse directement sur `org_customers` (ville, commune, adresse, repère). La table `addresses` reste strictement personnelle (RLS par utilisateur). Quand un client réclame sa fiche alors qu'il en avait déjà une chez ce commissionnaire (créée à l'inscription), la fiche d'inscription est marquée `merged` et ses références sont réaffectées à la fiche réclamée, qui porte l'historique.
- **Pourquoi** : éviter qu'un commissionnaire puisse lire ou modifier le carnet d'adresses personnel d'un client ; garder un seul dossier client par commissionnaire.
- **Coût** : chaque table qui référence `org_customer_id` doit être déclarée dans `ORG_CUSTOMER_REFERENCES`.
