#!/bin/sh
# Расписание бэкапов — главный процесс контейнера backup (docker-compose.yml).
# Раз в сутки в BACKUP_HOUR:00 по времени TZ (Бишкек) запускает backup.sh.
# Ошибка бэкапа не останавливает расписание: она видна в
#   docker compose logs backup
set -u

hour=${BACKUP_HOUR:-3}
case "$hour" in
  [0-9] | 1[0-9] | 2[0-3]) ;;
  *)
    echo "[backup] BACKUP_HOUR — час от 0 до 23, а не «$hour»" >&2
    exit 1
    ;;
esac

# docker stop — выходим сразу, а не через 10 секунд по kill.
trap 'exit 0' TERM INT

echo "[backup] Расписание: каждый день в $hour:00 (${TZ:-UTC}). Копии — в томе backups (/backups)."
if [ -z "${BACKUP_S3_BUCKET:-}" ] || [ -z "${BACKUP_ENCRYPT_KEY:-}" ]; then
  echo "[backup] ВНИМАНИЕ: внешнее хранилище не настроено (BACKUP_S3_BUCKET и BACKUP_ENCRYPT_KEY) — копии только на этом сервере."
fi

while true; do
  now=$(date +"%H %M %S" | awk '{ print $1 * 3600 + $2 * 60 + $3 }')
  secs=$(((hour * 3600 - now + 86400) % 86400))
  if [ "$secs" -lt 60 ]; then secs=$((secs + 86400)); fi
  sleep "$secs" &
  wait $!
  sh /scripts/backup.sh || echo "[backup] ОШИБКА: бэкап не удался (код $?) — смотрите строки выше"
done
