# SwipeIt на сервере — инструкция администратора

SwipeIt — мобильное веб-приложение: вишлисты, «Че делать будем?», Тайный Санта. На сервере работают пять контейнеров Docker. Всё ставится и обновляется командами из этой инструкции, читать код не нужно.

Пометки у команд:

- **[CI]** — команда выполняется на каждый push в `main` в GitHub Actions (задача `deploy-smoke` в `.github/workflows/deploy.yml`) на чистой машине с пустой базой. Если она сломается, прогон станет красным.
- **[вручную]** — в CI её не выполнить (нужен ваш домен, хранилище или сервер). Проверьте один раз при установке.

## 1. Что внутри

| Контейнер  | Что делает                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `web`      | Отдаёт приложение и передаёт запросы `/v1/…` (вместе с WebSocket `/v1/ws`) и короткие ссылки `/s/…` в `api`. Порт 8080, HTTP |
| `api`      | Сервер приложения. **Строго одна копия**: часть состояния живёт в памяти процесса                                            |
| `migrate`  | Запускается перед `api`, обновляет схему базы и выходит. Так и должно быть: статус `Exited (0)`                              |
| `postgres` | База PostgreSQL 17. Порт наружу не открыт                                                                                    |
| `backup`   | Каждую ночь делает бэкап базы и фото                                                                                         |
| `caddy`    | Необязательный. HTTPS с сертификатом Let's Encrypt, если на сервере нет своего прокси (профиль `caddy`)                      |

Приложение и API живут на **одном адресе** (например `https://swipeit.example.kg`). Проксировать нужно только его.

Образы лежат в GitHub Container Registry:

- `ghcr.io/seitek2002/swipeit-api`;
- `ghcr.io/seitek2002/swipeit-web`.

Теги: `staging` — последний зелёный `main`; короткий хеш коммита (7 символов, например `3f9c2ab`) — конкретная версия.

## 2. Требования к серверу

- Linux x86-64 (Ubuntu 22.04/24.04, Debian 12 или похожий).
- Docker Engine 24+ и Docker Compose v2.20+. Проверить: `docker compose version`.
- Память — 2 ГБ, диск — 10 ГБ свободно (база, фото, 14 дней бэкапов и логов).
- Доступ в интернет: скачать образы с `ghcr.io` и `docker.io`; для внешних бэкапов — до хранилища.
- Порты:
  - 443 (и 80 для получения сертификата) — снаружи, на ваш прокси или на `caddy`;
  - 8080 — `web`, по умолчанию только на `127.0.0.1` (для вашего прокси);
  - 5432 (Postgres) **не открывается**.
- Домен или поддомен, который смотрит на сервер (запись `A`).

## 3. Установка

```sh
git clone --depth 1 https://github.com/Seitek2002/swipeit.git
cd swipeit/backend/deploy
cp .env.example .env
```

Откройте `.env` и заполните. Каждая строка там объяснена. Обязательно:

- `POSTGRES_PASSWORD` — пароль базы, только латиница и цифры: `openssl rand -hex 24`;
- `PUBLIC_APP_URL` и `PUBLIC_SHARE_URL` — адрес продукта с `https://`, оба одинаковые;
- `OPS_TOKEN` — токен отчёта для владельца: `openssl rand -hex 24`.

Запуск **[CI]**:

```sh
docker compose up -d
docker compose ps
```

Первый запуск:

1. скачивает образы;
2. `migrate` создаёт таблицы в пустой базе;
3. стартуют `api`, `web` и `backup`.

Через полминуты у `api` и `web` статус `healthy`, у `migrate` — `Exited (0)`.

Проверка **[CI]**:

```sh
curl -s http://127.0.0.1:8080/v1/health
```

Ответ — JSON с `"app":"swipeit"` и `"commit":"<хеш>"`.

Если `docker compose up` пишет `denied` или `unauthorized` при скачивании образа — пакеты в GHCR закрыты. Попросите владельца открыть их (GitHub → Packages → пакет → Package settings → Change visibility → Public) или войдите токеном с правом `read:packages`: `docker login ghcr.io` **[вручную]**.

## 4. HTTPS и прокси

Выберите один из двух вариантов.

### Вариант А. Свой nginx (или другой прокси) на этом сервере

Проксируйте **весь домен** на `127.0.0.1:8080`. Для `/v1/ws` нужен `Upgrade` — это WebSocket. Пример **[вручную]**:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name swipeit.example.kg;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name swipeit.example.kg;

    ssl_certificate     /etc/letsencrypt/live/swipeit.example.kg/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/swipeit.example.kg/privkey.pem;

    # Фото желаний — до 2 МБ.
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket: живые обновления в приложении.
    location /v1/ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Сервер пингует соединение каждые 20 секунд.
        proxy_read_timeout 75s;
    }
}
```

Важно:

- **`X-Forwarded-For` обязателен.** По нему сервер видит настоящий IP человека: лимиты запросов считаются по нему. Без заголовка все люди — один адрес, и лимит заблокирует всех сразу.
- В `.env` оставьте `TRUST_PROXY=loopback,uniquelocal`: так сервер верит заголовку от прокси на этом сервере и от контейнера `web`.
- Прокси на **другой** машине:
  - в `.env` поставьте `WEB_BIND=0.0.0.0`;
  - закройте порт 8080 файрволом для всех, кроме прокси;
  - внешний адрес прокси допишите в `TRUST_PROXY` через запятую.
- Заголовок `Cross-Origin-Opener-Policy` на прокси **не добавляйте**: с ним не работает вход через Telegram.

### Вариант Б. Своего прокси нет — HTTPS сделает `caddy`

1. В `.env` задайте `SITE_ADDRESS=swipeit.example.kg` (домен без `https://`).
2. Откройте наружу порты 80 и 443.
3. Запустите с профилем **[вручную]**:

```sh
docker compose --profile caddy up -d
```

Caddy сам получит и будет продлевать сертификат. Дальше **все** команды `docker compose` в этом варианте пишите с `--profile caddy`, иначе `caddy` не обновится.

Проверка после настройки прокси **[вручную]**:

```sh
curl -s https://swipeit.example.kg/v1/health
```

## 5. Обновление

```sh
cd swipeit/backend/deploy
git pull
docker compose pull
docker compose up -d
```

- `git pull` обновляет этот файл, `docker-compose.yml` и скрипты бэкапа. Ваш `.env` не трогается.
- `docker compose pull` скачивает новые образы `staging` **[CI]**.
- `docker compose up -d` перезапускает изменившееся. Миграции применяются сами: `migrate` отрабатывает до старта `api` **[CI]**.

Новую версию видно в `/v1/health` — поле `commit` (и `startedAt` — когда сервер запустился).

После каждого обновления — дымовой тест: 10 человек проходят главные сценарии через ваш адрес (профили, вишлист, план, Санта, WebSocket), потом их профили удаляются. Около минуты.

```sh
docker compose exec api node dist/rehearsal.js --api https://swipeit.example.kg --people 10
```

- Код выхода `0` и «всё прошло» — обновление в порядке.
- Иначе в выводе — какой шаг упал. Откатитесь (§6) и сообщите владельцу.
- `--ops-token <OPS_TOKEN>` проверит заодно отчёт `/v1/ops/report`.

В CI то же самое выполняется на каждый push, через `web` **[CI]**. С вашим доменом — **[вручную]**.

## 6. Откат на прошлую версию

1. Узнайте прошлый тег. Это короткий хеш коммита: GitHub → Actions → прогон → `deploy-smoke` → «Тег», или GitHub → Packages → `swipeit-api`.
2. Запустите `api` с этим тегом **[CI]**:

   ```sh
   API_TAG=3f9c2ab docker compose up -d api
   curl -s http://127.0.0.1:8080/v1/health
   ```

   В ответе `"commit":"3f9c2ab"`.

3. Чтобы откат пережил следующий `docker compose up -d`, впишите тег в `.env`: `API_TAG=3f9c2ab`. Фронт откатывается так же, через `WEB_TAG`.

База при откате остаётся как есть. Изменения схемы только добавляют таблицы и столбцы, поэтому старая версия с новой базой работает. Вернуться на свежую версию: `API_TAG=staging` в `.env` и `docker compose up -d`.

## 7. Бэкапы

### Где лежат

Контейнер `backup` каждый день в `BACKUP_HOUR` (по умолчанию 03:00 по Бишкеку) кладёт в том Docker `swipeit_backups`:

- `/backups/daily/db-<дата>_<время>.dump` — база (сжатый формат `pg_dump`);
- `/backups/daily/uploads-<дата>_<время>.tar.gz` — фото желаний;
- `/backups/weekly/` — последний бэкап каждой недели.

Хранится 14 ежедневных и 8 еженедельных копий. Старые удаляются сами.

Список бэкапов **[CI]**:

```sh
docker compose exec backup ls -lh /backups/daily /backups/weekly
```

Бэкап прямо сейчас **[CI]**:

```sh
docker compose exec backup sh /scripts/backup.sh
```

Скопировать бэкап с сервера к себе **[вручную]**:

```sh
docker compose cp backup:/backups/daily/db-2026-12-01_030000.dump ./
```

Журнал бэкапов и ошибки:

```sh
docker compose logs backup
```

### Копия у другого провайдера (рекомендуется)

Пока копии только на этом сервере, в журнале `backup` каждый день предупреждение: сломается диск — пропадут и база, и бэкапы.

Чтобы включить внешнюю копию, заполните в `.env`:

- `BACKUP_ENCRYPT_KEY` — ключ шифрования (`openssl rand -hex 32`). **Сохраните его ещё где-то вне сервера**: без ключа копию не открыть;
- `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`;
- `BACKUP_S3_ENDPOINT` и `BACKUP_S3_REGION` — если хранилище не AWS (Cloudflare R2, Backblaze B2 и т. п.).

Дальше:

1. `docker compose up -d backup`;
2. проверка: `docker compose exec backup sh /scripts/backup.sh` — в конце строка «Зашифрованная копия выгружена» **[вручную]**.

Устроено так:

- Наружу уходит только зашифрованная копия (AES-256): `…/daily/db-….dump.enc` и `uploads-….tar.gz.enc`.
- Без ключа скрипт не выгружает ничего.
- Срок хранения во внешнем хранилище задайте правилом жизненного цикла самого хранилища, например удалять старше 60 дней.

### Проверочное восстановление — раз в месяц

Восстанавливает бэкап в **отдельную** базу `swipeit_restore`. Рабочую базу не трогает. **[CI]**

```sh
docker compose exec backup ls /backups/daily
docker compose exec backup sh /scripts/restore.sh /backups/daily/db-2026-12-01_030000.dump
```

В конце — таблица: число строк в каждой таблице восстановленной базы рядом с рабочей. Свежий бэкап даёт «Расхождений нет». Старый — небольшие расхождения: рабочая база живёт дальше. Результат запишите (дата, файл, итог).

Зашифрованная копия из внешнего хранилища:

1. скачайте файл `….dump.enc`;
2. положите в контейнер: `docker compose cp db-….dump.enc backup:/tmp/`;
3. `docker compose exec backup sh /scripts/restore.sh /tmp/db-….dump.enc` — нужен тот же `BACKUP_ENCRYPT_KEY` в `.env`. Расшифровка и восстановление — **[CI]**, скачивание из хранилища — **[вручную]**.

Убрать проверочную базу:

```sh
docker compose exec backup dropdb swipeit_restore
```

### Восстановление после аварии

Если рабочая база испорчена или потеряна **[CI]**:

```sh
# 1. Восстановить бэкап рядом и проверить таблицу чисел.
docker compose exec backup sh /scripts/restore.sh /backups/daily/db-2026-12-01_030000.dump

# 2. Остановить приложение.
docker compose stop api web

# 3. Поменять базы местами (старую не удаляем, пока всё не проверим).
docker compose exec backup psql -d postgres -c 'alter database swipeit rename to swipeit_old'
docker compose exec backup psql -d postgres -c 'alter database swipeit_restore rename to swipeit'

# 4. Вернуть фото из архива того же дня.
docker compose exec -T backup cat /backups/daily/uploads-2026-12-01_030000.tar.gz |
  docker compose run --rm --no-deps -T --entrypoint sh api -c 'tar -xzf - -C /data/uploads'

# 5. Запустить.
docker compose up -d
```

Если `POSTGRES_DB` в `.env` не `swipeit`, подставьте своё имя. Через несколько дней, когда всё проверено, удалите старую базу: `docker compose exec backup dropdb swipeit_old`.

## 8. Мониторинг

Внешний мониторинг (UptimeRobot, Better Stack или ваш) **[вручную]**:

- раз в минуту — `GET https://swipeit.example.kg/v1/health`;
- тревога — если ответ не `200`.

`503` значит: сервер жив, но не видит базу.

Изнутри: `docker compose ps` — у `api` и `web` должно быть `healthy`. Docker сам перезапускает упавший контейнер (`restart: unless-stopped`).

## 9. Отчёт для владельца

Владелец следит за живым прогоном по отчёту: воронка, «что сейчас», ошибки.

Из консоли сервера **[CI]**:

```sh
docker compose exec api node dist/funnel.js --days 7 --live
```

- `--days N` — за сколько дней;
- `--since 2026-12-01` — считать с этой даты;
- `--live` — раздел «Сейчас».

Пометить профиль команды, чтобы его шаги не попадали в воронку **[CI]**:

```sh
docker compose exec api node dist/funnel-team.js <код короткой ссылки>
```

Код — из ссылки на вишлист этого человека, `…/s/<код>`. Снять пометку — то же с `--undo`.

Тот же отчёт по HTTPS — без консоли **[CI]**:

```sh
curl -s -H "Authorization: Bearer <OPS_TOKEN>" https://swipeit.example.kg/v1/ops/report
```

- Без `OPS_TOKEN` в `.env` или с неверным токеном — ответ `404`, как будто адреса нет.
- Не чаще 10 раз в минуту.

## 10. Staging — это «боевой» сервер для офиса

На этом сервере коллеги проходят настоящие сценарии со своими данными:

- **базу не сбрасывайте и тома не удаляйте**. Команда `docker compose down -v` удаляет базу, фото и бэкапы — не используйте её;
- обновление и откат — как в §5 и §6, данные при этом сохраняются;
- нагрузочный тест (B20) — только отдельным проектом со своей базой, рядом, а не в рабочем:

  ```sh
  cp .env .env.load    # поменяйте WEB_PORT, например на 8090
  docker compose -p swipeit-load --env-file .env.load up -d
  docker compose -p swipeit-load down -v     # после теста
  ```

  `-p swipeit-load` даёт свои контейнеры и тома, рабочие не задеты **[вручную]**.

## 11. Логи и частые вопросы

Логи:

- `docker compose logs -f api` — журнал сервера;
- `docker compose logs migrate` — что сделали миграции.

Docker хранит до 14 файлов по 20 МБ на контейнер. При обычной нагрузке это около двух недель. В логах есть IP-адреса, дольше их хранить не нужно.

По коду ошибки от человека. В тосте с ошибкой приложение показывает код из 8 символов — это начало `requestId` запроса. Найти этот запрос в журнале **[вручную]**:

```sh
docker compose logs api --since 24h | grep <код>
```

Последние ответы `INTERNAL` видны и в отчёте `/v1/ops/report` (§9).

Частые вопросы:

- **`api` не стартует, `migrate` — `Exited (1)`.** Смотрите `docker compose logs migrate`. Обычно неверный `POSTGRES_PASSWORD` после первого запуска: пароль базы задаётся один раз при создании тома.
- **`api` пишет «Неверные переменные окружения».** В сообщении названа переменная — исправьте её в `.env`, затем `docker compose up -d`.
- **В журнале `api` предупреждение про `TRUST_PROXY`.** Задайте его, как в §4.
- **Ссылки в превью ведут не туда.** Проверьте `PUBLIC_APP_URL` и `PUBLIC_SHARE_URL`.

Внешний Postgres вместо контейнера: создайте рядом `docker-compose.override.yml` и задайте в нём `DATABASE_URL` для сервисов `api` и `migrate` **[вручную]**.

Замер задержки из Бишкека (B18): с компьютера в Бишкеке **[вручную]**

```sh
for i in $(seq 10); do curl -o /dev/null -s -w '%{time_total}\n' https://swipeit.example.kg/v1/health; done
```

Медиану передайте владельцу.

## 12. Вопросы администратору

Ответьте владельцу до первого развёртывания:

1. Есть ли на сервере Docker с Compose v2?
2. Есть ли свой прокси (nginx и т. п.) и кто выпускает сертификаты? Если нет — подойдёт вариант Б (`caddy`)?
3. Postgres — контейнер из этого пакета или отдельный сервер базы?
4. Какой домен или поддомен?
5. Куда класть внешние бэкапы: какое хранилище у другого провайдера?
6. Кто получает письма о падении (мониторинг §8)?
7. Кто сможет запускать `docker compose exec` для отчёта владельцу (§9)?
8. Можно ли открыть `/v1/ops/report` наружу с токеном?
