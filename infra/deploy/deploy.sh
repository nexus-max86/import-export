#!/usr/bin/env bash
# Déploiement en une commande (ticket #29) :
#   ./deploy.sh staging    <tag>     (ex. le SHA du commit, image construite par GitHub Actions)
#   ./deploy.sh production <tag>
# Étapes : images → base et Redis → migrations (avant l'API) → API, web, sauvegardes → contrôle
# de santé. En cas d'échec du contrôle, la version précédente est indiquée pour revenir en arrière.
# Les migrations ne reviennent jamais en arrière : elles sont écrites pour rester compatibles.
set -euo pipefail

env="${1:?usage : deploy.sh <production|staging> <tag>}"
tag="${2:?usage : deploy.sh <production|staging> <tag>}"
case "$env" in production | staging) ;; *) echo "Environnement inconnu : $env"; exit 2 ;; esac
[[ "$tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "Tag invalide : $tag"; exit 2; }

home="${KONZIA_HOME:-/opt/konzia}"
envfile="${home}/${env}.env"
[ -f "$envfile" ] || { echo "Fichier d'environnement absent : $envfile"; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"

export KONZIA_ENV="$env" IMAGE_TAG="$tag" KONZIA_ENV_FILE="$envfile"
compose() { docker compose -p "konzia-${env}" --env-file "$envfile" -f "${here}/compose.yml" "$@"; }

docker network inspect konzia-edge >/dev/null 2>&1 || docker network create konzia-edge >/dev/null

if [ "${SKIP_PULL:-0}" != "1" ]; then
  echo "→ Téléchargement des images ${tag}"
  compose --profile tools pull --quiet api web migrate backup
fi

# Le conteneur postgres n'existe qu'avec COMPOSE_PROFILES=local-db ; sinon la base est externe (Neon…).
if compose config --services | grep -qx postgres; then
  echo "→ Base de données et Redis"
  compose up -d --wait postgres redis
else
  echo "→ Redis (base de données externe)"
  compose up -d --wait redis
fi

echo "→ Migrations"
compose --profile tools run --rm migrate

echo "→ API, web, sauvegardes"
compose up -d --remove-orphans --wait --wait-timeout 120 api web backup

previous="$(cat "${home}/${env}.version" 2>/dev/null || true)"
echo "$tag" > "${home}/${env}.version"
[ -n "$previous" ] && echo "$previous" > "${home}/${env}.previous"
echo "✓ ${env} déployé en version ${tag}${previous:+ (précédente : ${previous})}"
