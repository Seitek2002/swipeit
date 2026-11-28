#!/bin/sh
# Бэкап SwipeIt (BACKEND.md §10, B18). Запускается в контейнере backup:
#   - сам, раз в сутки (scripts/backup-loop.sh);
#   - вручную: docker compose exec backup sh /scripts/backup.sh
#
# Что делает:
#   1. База — pg_dump в сжатом формате: /backups/daily/db-<дата>.dump.
#   2. Фото — архив тома uploads: /backups/daily/uploads-<дата>.tar.gz.
#   3. Копия недели — /backups/weekly/ (последний бэкап каждой недели).
#   4. Удаляет старые: 14 ежедневных и 8 еженедельных (BACKUP_KEEP_*).
#   5. Если заданы BACKUP_S3_BUCKET и BACKUP_ENCRYPT_KEY — шифрует копию и
#      выгружает её в хранилище другого провайдера. Без них — только на этом
#      сервере, и в логе предупреждение.
#
# Подключение к базе — переменные PGHOST, PGUSER, PGPASSWORD, PGDATABASE
# (их задаёт docker-compose.yml).
set -eu

DIR=/backups
KEEP_DAILY=${BACKUP_KEEP_DAILY:-14}
KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-8}

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Удалить всё, кроме KEEP самых новых файлов с этим началом имени.
prune() {
  ls -1 "$1"/"$2"-* 2>/dev/null | sort -r | tail -n +"$(($3 + 1))" |
    while read -r old; do
      rm -f "$old"
      log "Удалён старый: $old"
    done
}

# Нужная программа есть в образе или ставится из репозитория Alpine.
need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  log "Ставлю $2…"
  apk add --no-cache "$2" >/dev/null
}

stamp=$(date +%Y-%m-%d_%H%M%S)
week=$(date +%G-W%V)
mkdir -p "$DIR/daily" "$DIR/weekly"

db="$DIR/daily/db-$stamp.dump"
pg_dump --format=custom --compress=6 --file="$db.part"
mv "$db.part" "$db"
log "База: $db ($(du -h "$db" | cut -f1))"

uploads="$DIR/daily/uploads-$stamp.tar.gz"
tar -czf "$uploads.part" -C /uploads .
mv "$uploads.part" "$uploads"
log "Фото: $uploads ($(du -h "$uploads" | cut -f1))"

# Жёсткая ссылка, а не копия: место на диске не удваивается, а файл недели
# остаётся, когда ежедневный удалят.
ln -f "$db" "$DIR/weekly/db-$week.dump"
ln -f "$uploads" "$DIR/weekly/uploads-$week.tar.gz"

prune "$DIR/daily" db "$KEEP_DAILY"
prune "$DIR/daily" uploads "$KEEP_DAILY"
prune "$DIR/weekly" db "$KEEP_WEEKLY"
prune "$DIR/weekly" uploads "$KEEP_WEEKLY"

if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
  log "ВНИМАНИЕ: копии только на этом сервере (BACKUP_S3_BUCKET не задан). Сломается диск — пропадут и база, и бэкапы."
  exit 0
fi
if [ -z "${BACKUP_ENCRYPT_KEY:-}" ]; then
  log "ВНИМАНИЕ: выгрузка выключена — без BACKUP_ENCRYPT_KEY личные данные к другому провайдеру не отправляем. Копии только на этом сервере."
  exit 0
fi

need openssl openssl
need aws aws-cli
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
target="s3://$BACKUP_S3_BUCKET/${BACKUP_S3_PREFIX:-swipeit}/daily"
for file in "$db" "$uploads"; do
  # Шифрование — AES-256, ключ из BACKUP_ENCRYPT_KEY. Расшифровать:
  # openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPT_KEY -in <файл>.enc -out <файл>
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -pass env:BACKUP_ENCRYPT_KEY -in "$file" -out "$file.enc"
  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    aws s3 cp --only-show-errors --endpoint-url "$BACKUP_S3_ENDPOINT" \
      "$file.enc" "$target/$(basename "$file").enc"
  else
    aws s3 cp --only-show-errors "$file.enc" "$target/$(basename "$file").enc"
  fi
  rm -f "$file.enc"
done
log "Зашифрованная копия выгружена: $target/"
