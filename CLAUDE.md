# Konzia — notes pour les sessions de développement

- Langue : documentation, interface et messages de commit en français.
- Conception de référence : `docs/01` à `docs/07`, `docs/glossaire.md`, décisions dans `.ai/DECISIONS.md`. Plan : `plans/pending/konzia-mvp.md` (tableau d'avancement à tenir à jour).
- Tickets GitHub #1–#31 (`nexus-max86/import-export`), un ticket = une étape du plan.

## Commandes (racine)

- Installer : `pnpm install` · Construire les paquets partagés d'abord : `pnpm --filter @konzia/shared --filter @konzia/db build`
- Vérifier : `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Tests API : base `postgresql://konzia:konzia@localhost:5432/konzia_test`, Redis `redis://localhost:6379` (valeurs par défaut dans `apps/api/test/setup.ts`).

## Règles

- Montants en entiers (unité mineure) + devise ; jamais de flottants.
- Toute table métier : `organization_id`, politique RLS et test inter-tenant.
- Pas de suppression physique des devis, commandes, paiements, mouvements de colis.
- Adaptateurs factices nommés `Fake…`, refusés en production.
- Versions : Next 15.5, NestJS 11, Prisma 6, TypeScript 5.9, Zod 4, Vitest 3 (voir D6).
