# Konzia

Plateforme d'achat international et de gestion d'importation pour la RDC (pilote : Lubumbashi).
Clients, commissionnaires et administrateurs : demandes de devis, devis comparables, commandes, paiements directs, colis et suivi.

- Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md)
- Conception : [`docs/`](docs) (exigences, architecture, données, rôles, états, maquettes, backlog)
- Plan et avancement : [`plans/pending/konzia-mvp.md`](plans/pending/konzia-mvp.md)

## Prérequis

- Node.js 22 (`.nvmrc`) et pnpm 10 (`corepack enable`)
- PostgreSQL 16 et Redis 7, par Docker : `docker compose -f infra/docker-compose.yml up -d`

## Démarrer en local

```bash
cp .env.example .env          # puis ajustez si besoin
pnpm install
pnpm db:migrate               # applique les migrations sur konzia_dev
pnpm dev                      # web : http://localhost:3000 · API : http://localhost:3001/api/health
```

## Commandes

| Commande          | Rôle                                                           |
| ----------------- | -------------------------------------------------------------- |
| `pnpm dev`        | Lance le web (Next.js) et l'API (NestJS) en mode développement |
| `pnpm lint`       | ESLint sur tout le dépôt                                       |
| `pnpm typecheck`  | Vérification TypeScript de chaque paquet                       |
| `pnpm test`       | Tests (l'API utilise une vraie base `konzia_test` et Redis)    |
| `pnpm build`      | Build de production                                            |
| `pnpm db:migrate` | Crée/applique une migration en développement                   |
| `pnpm db:deploy`  | Applique les migrations (CI, production)                       |

## Structure

```
apps/web        Next.js (application installable) : espaces client, commissionnaire, admin
apps/api        NestJS (monolithe modulaire), préfixe /api
packages/shared Types, schémas et utilitaires communs (montants, rôles)
packages/db     Schéma Prisma, migrations et politiques RLS
infra/          Docker Compose local ; déploiement Hostinger (à venir, ticket #29)
```
