#!/usr/bin/env bash
# Planificateur minimal : une sauvegarde par jour à BACKUP_TIME (HHMM, UTC), sans dépendre de cron
# (les variables d'environnement restent disponibles). Une sauvegarde est aussi faite au démarrage
# si RUN_ON_START=1.
set -uo pipefail
when="${BACKUP_TIME:-0015}"
[ "${RUN_ON_START:-0}" = "1" ] && /usr/local/bin/backup.sh
echo "Sauvegarde planifiée chaque jour à ${when:0:2}:${when:2:2} UTC."
last=""
while true; do
  now="$(date -u +%H%M)"
  today="$(date -u +%F)"
  if [ "$now" = "$when" ] && [ "$last" != "$today" ]; then
    /usr/local/bin/backup.sh || echo "Sauvegarde en échec : voir le message ci-dessus."
    last="$today"
  fi
  sleep 20
done
