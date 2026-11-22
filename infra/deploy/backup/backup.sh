#!/usr/bin/env bash
# Sauvegarde chiffrée de la base Konzia (ticket #30).
# pg_dump (format custom) | age (clé PUBLIQUE : le serveur ne peut pas relire ses sauvegardes)
# puis envoi vers R2 (rclone) et suppression des sauvegardes de plus de BACKUP_RETENTION_DAYS jours.
#
# Variables : KONZIA_ENV, PGHOST/PGUSER/PGPASSWORD/PGDATABASE, BACKUP_AGE_RECIPIENT (age1…),
#             BACKUP_REMOTE (ex. r2:konzia-backups, ou un dossier local pour un essai),
#             BACKUP_RETENTION_DAYS (30 par défaut).
set -euo pipefail

: "${KONZIA_ENV:?}" "${BACKUP_AGE_RECIPIENT:?}" "${BACKUP_REMOTE:?}" "${PGDATABASE:?}"
retention="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="konzia-${KONZIA_ENV}-${stamp}.dump.age"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

log() { printf '%s [sauvegarde %s] %s\n' "$(date -u +%FT%TZ)" "$KONZIA_ENV" "$*"; }

log "début : base ${PGDATABASE}"
pg_dump --format=custom --compress=6 --no-password | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$work/$name"
size="$(stat -c %s "$work/$name")"
if [ "$size" -lt 1024 ]; then
  log "ÉCHEC : fichier trop petit (${size} octets)"
  exit 1
fi
rclone copyto --no-traverse "$work/$name" "${BACKUP_REMOTE%/}/${KONZIA_ENV}/${name}"
log "envoyée : ${name} (${size} octets)"
rclone delete --min-age "${retention}d" "${BACKUP_REMOTE%/}/${KONZIA_ENV}/"
log "rétention appliquée : ${retention} jours"
