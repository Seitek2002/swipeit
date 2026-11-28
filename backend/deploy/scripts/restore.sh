#!/bin/sh
# Восстановление базы SwipeIt из бэкапа (BACKEND.md §10, B18).
#   docker compose exec backup sh /scripts/restore.sh <файл> [база]
#
# <файл> — /backups/daily/db-….dump (или зашифрованный …dump.enc из внешнего
# хранилища: тогда нужен BACKUP_ENCRYPT_KEY). [база] — куда восстановить, по
# умолчанию swipeit_restore. Рабочую базу скрипт не трогает и в неё
# восстанавливать отказывается: сначала проверяем копию рядом, потом, если
# надо, меняем базы местами (ADMIN.md, «Восстановление»).
#
# В конце печатает число строк в каждой таблице: восстановленная база рядом с
# рабочей.
set -eu

file=${1:-}
target=${2:-swipeit_restore}
live=${PGDATABASE:-swipeit}

if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Использование: restore.sh <файл .dump или .dump.enc> [база, по умолчанию swipeit_restore]" >&2
  echo "Бэкапы: ls -lh /backups/daily /backups/weekly" >&2
  exit 1
fi
case "$target" in
  "" | *[!a-z0-9_]*)
    echo "Имя базы — только строчная латиница, цифры и «_»: «$target»" >&2
    exit 1
    ;;
esac
if [ "$target" = "$live" ]; then
  echo "Отказ: $live — рабочая база. Восстановите в отдельную (по умолчанию swipeit_restore)." >&2
  exit 1
fi

tmp=""
cleanup() { if [ -n "$tmp" ]; then rm -f "$tmp"; fi; }
trap cleanup EXIT

case "$file" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPT_KEY:-}" ]; then
      echo "Файл зашифрован: задайте BACKUP_ENCRYPT_KEY в .env" >&2
      exit 1
    fi
    command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null
    tmp=$(mktemp /tmp/restore.XXXXXX)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
      -pass env:BACKUP_ENCRYPT_KEY -in "$file" -out "$tmp"
    file=$tmp
    ;;
esac

echo "Восстанавливаю $1 в базу $target…"
dropdb --if-exists --force "$target"
createdb "$target"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$target" "$file"

# Число строк во всех таблицах приложения и в журнале миграций.
COUNT_SQL="
select case when table_schema = 'public' then table_name
            else table_schema || '.' || table_name end,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) as c from %I.%I', table_schema, table_name),
          false, true, '')))[1]::text
from information_schema.tables
where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE'
order by 1"

restored=$(mktemp /tmp/restored.XXXXXX)
current=$(mktemp /tmp/current.XXXXXX)
psql --dbname="$target" -At -F '|' -c "$COUNT_SQL" >"$restored"
psql --dbname="$live" -At -F '|' -c "$COUNT_SQL" >"$current"

awk -F'|' -v a="$target" -v b="$live" '
  FNR == NR { r[$1] = $2; seen[$1] = 1; next }
  { l[$1] = $2; seen[$1] = 1 }
  END {
    n = 0
    for (t in seen) keys[++n] = t
    for (i = 1; i <= n; i++)
      for (j = i + 1; j <= n; j++)
        if (keys[j] < keys[i]) { x = keys[i]; keys[i] = keys[j]; keys[j] = x }
    printf "%-34s %14s %14s\n", "таблица", a, b
    diff = 0
    for (i = 1; i <= n; i++) {
      t = keys[i]
      x = (t in r) ? r[t] : "-"
      y = (t in l) ? l[t] : "-"
      mark = ""
      if (x != y) { diff++; mark = "  <- не совпадает" }
      printf "%-34s %14s %14s%s\n", t, x, y, mark
    }
    if (diff == 0) print "Расхождений нет: число строк совпадает во всех " n " таблицах"
    else print "Не совпадает в " diff " табл. Рабочая база живёт дальше: после бэкапа в ней могли появиться новые строки."
  }' "$restored" "$current"
rm -f "$restored" "$current"
