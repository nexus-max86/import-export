# Konzia — notes pour les sessions de développement

- Langue : documentation, interface et messages de commit en français.
- Conception de référence : `docs/01` à `docs/07`, `docs/glossaire.md`, décisions dans `.ai/DECISIONS.md`. Plan : `plans/pending/konzia-mvp.md` (tableau d'avancement à tenir à jour).
- Tickets GitHub #1–#31 (`nexus-max86/import-export`), un ticket = une étape du plan.

## Commandes (racine)

- Installer : `pnpm install` · Construire les paquets partagés d'abord : `pnpm --filter @konzia/shared --filter @konzia/db build`
- Vérifier avant chaque commit : `pnpm verify` (formatage, lint, types, build, tests). Ne jamais masquer son code de sortie par un `| grep`.
- Tests API : base `postgresql://konzia:konzia@localhost:5432/konzia_test`, Redis `redis://localhost:6379` (valeurs par défaut dans `apps/api/test/setup.ts`).

## Règles

- Montants en entiers (unité mineure) + devise ; jamais de flottants.
- Toute table métier : `organization_id`, `ENABLE ROW LEVEL SECURITY`, politiques et GRANT explicites pour `konzia_app` dans la migration, ajout à `apps/api/test/tenancy-tables.ts`.
- Données métier : toujours via `TenantDb.run(userId, tx => …)` (rôle `konzia_app`). `PrismaService` (rôle propriétaire) seulement pour l'authentification et les opérations système audités.
- Prisma avec le rôle applicatif : toujours un `select` explicite (droits par colonne, ex. `users`).
- Toute nouvelle table avec `org_customer_id` : l'ajouter à `ORG_CUSTOMER_REFERENCES` (`apps/api/src/customers/customers.service.ts`) pour la fusion lors d'une réclamation de compte.
- Pas de suppression physique des devis, commandes, paiements, mouvements de colis.
- Adaptateurs factices nommés `Fake…`, refusés en production.
- Versions : Next 15.5, NestJS 11, Prisma 6, TypeScript 5.9, Zod 4, Vitest 3 (voir D6).
