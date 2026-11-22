# syntax=docker/dockerfile:1.7
# Images de production Konzia : api, web, migrate (même source, cibles différentes).
# Construction : docker build -f infra/deploy/Dockerfile --target api -t konzia-api .

# Image Node de base (surchargée seulement pour un build derrière un proxy d'entreprise).
ARG NODE_IMAGE=node:22.21-bookworm-slim
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @konzia/shared --filter @konzia/db build \
 && pnpm --filter @konzia/api build \
 && NODE_ENV=production pnpm --filter @konzia/web build
# Dépendances de production seulement, puis client Prisma généré pour ces dépendances.
RUN pnpm --filter @konzia/api deploy --prod --legacy /out/api \
 && cd /out/api/node_modules/@konzia/db \
 && /repo/packages/db/node_modules/.bin/prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @konzia/db deploy --legacy /out/db \
 && cd /out/db && ./node_modules/.bin/prisma generate

# --- API (NestJS) -------------------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production API_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "dist/main.js"]

# --- Web (Next.js, sortie autonome) -------------------------------------------------
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:3000/ -o /dev/null || exit 1
CMD ["node", "apps/web/server.js"]

# --- Migrations (tâche ponctuelle avant chaque déploiement) -------------------------
FROM base AS migrate
ENV NODE_ENV=production
WORKDIR /db
COPY --from=build --chown=node:node /out/db ./
USER node
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node scripts/enable-app-login.cjs"]
