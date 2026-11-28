# Образ web (auto-tasks-pm-4 S02): фронт продукта и API с одного адреса.
# Внутри — статика фронта (сборка remote с NEXT_PUBLIC_API_URL=same-origin,
# без NEXT_PUBLIC_BASE_PATH) и Caddy на порту 8080 по HTTP: он отдаёт статику
# и проксирует /v1 (вместе с WebSocket /v1/ws) и /s/ на api:4100.
#
# Собирается из корня репозитория (свой список исключений —
# Dockerfile.dockerignore рядом):
#   docker build -f backend/deploy/web/Dockerfile --build-arg CLIENT_BUILD=123 -t swipeit-web .
#
# Сборка фронта — на Debian (node:24-slim), как фронт в CI на ubuntu: в
# package-lock.json есть родные пакеты сборщика именно под glibc.

FROM node:24-slim AS build
WORKDIR /app
ENV HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --workspace frontend --workspace @swipeit/core --include-workspace-root
COPY packages/core packages/core
COPY catalog catalog
COPY frontend frontend
# Номер сборки фронта (B17) — номер прогона CI: по нему сервер говорит
# «Обнови приложение» (MIN_CLIENT_BUILD).
ARG CLIENT_BUILD=dev
ENV NEXT_PUBLIC_API_URL=same-origin \
    NEXT_PUBLIC_CLIENT_BUILD=$CLIENT_BUILD
# prebuild сам копирует каталог Товароведа в public/catalog (catalog:sync).
RUN npm run build -w frontend

FROM caddy:2-alpine
COPY backend/deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/out /srv
EXPOSE 8080
