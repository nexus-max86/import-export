#!/usr/bin/env bash
# Test de restauration (ticket #30) : récupère la dernière sauvegarde (ou celle passée en argument),
# la déchiffre avec la clé PRIVÉE age (jamais sur le serveur), la restaure dans une base VIDE
# et vérifie son contenu. La base de test est supprimée à la fin (KEEP=1 pour la garder).
#
#   AGE_IDENTITY_FILE=~/konzia-backup.key BACKUP_REMOTE=r2:konzia-backups KONZIA_ENV=production \
#   PGHOST=… PGUSER=… PGPASSWORD=… ./restore-test.sh [fichier.dump.age]
set -euo pipefail

: "${AGE_IDENTITY_FILE:?clé privée age requise}"
target_db="${RESTORE_DB:-konzia_restore_test}"
work="$(mktemp -d)"
cleanup() {
  rm -rf "$work"
  if [ "${KEEP:-0}" != "1" ]; then dropdb --if-exists "$target_db" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
say() { printf '• %s\n' "$*"; }

if [ $# -ge 1 ]; then
  src="$1"
  cp "$src" "$work/backup.dump.age"
else
  : "${BACKUP_REMOTE:?}" "${KONZIA_ENV:?}"
  latest="$(rclone lsf --files-only "${BACKUP_REMOTE%/}/${KONZIA_ENV}/" | sort | tail -n 1)"
  [ -n "$latest" ] || { echo "Aucune sauvegarde trouvée."; exit 1; }
  src="${BACKUP_REMOTE%/}/${KONZIA_ENV}/${latest}"
  rclone copyto "$src" "$work/backup.dump.age"
fi
say "sauvegarde : ${src}"

age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$work/backup.dump" "$work/backup.dump.age"
say "déchiffrée ($(stat -c %s "$work/backup.dump") octets)"

dropdb --if-exists "$target_db"
createdb "$target_db"
# Le rôle applicatif est global au serveur : on le crée s'il manque (sans droit de connexion).
psql -q -d "$target_db" -c "DO \$\$ BEGIN CREATE ROLE konzia_app NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
pg_restore --exit-on-error --no-owner --role="${PGUSER:-konzia}" -d "$target_db" "$work/backup.dump"
say "restaurée dans la base vide « ${target_db} »"

q() { psql -At -d "$target_db" -c "$1"; }
migrations="$(q 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
tables="$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
rls="$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity")"
users="$(q 'SELECT count(*) FROM users')"
orders="$(q 'SELECT count(*) FROM orders')"
payments="$(q 'SELECT count(*) FROM payments')"
audit="$(q 'SELECT count(*) FROM audit_logs')"
say "migrations appliquées : ${migrations} · tables : ${tables} (dont ${rls} avec RLS)"
say "utilisateurs : ${users} · commandes : ${orders} · paiements : ${payments} · journal : ${audit}"

[ "$migrations" -gt 0 ] && [ "$tables" -gt 30 ] && [ "$rls" -gt 30 ] || {
  echo "ÉCHEC : la base restaurée est incomplète."
  exit 1
}
echo "RESTAURATION RÉUSSIE"
