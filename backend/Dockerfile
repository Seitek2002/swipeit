# Образ сервера (BACKEND.md §11.3). Собирается из корня репозитория:
#   docker build -f backend/Dockerfile -t swipeit-api .
# Пакет для администратора (compose, бэкапы, ADMIN.md) — задача B18.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Только сервер и общее ядро; скрипты установки (husky) в образе не нужны.
RUN npm ci --workspace backend --workspace @swipeit/core --include-workspace-root --ignore-scripts
COPY packages/core packages/core
COPY backend backend
RUN npm run build -w backend

FROM node:24-alpine
# Дни считаются по календарю Бишкека (§2.5).
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    TZ=Asia/Bishkek \
    CATALOG_DIR=/app/catalog
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/src/db/migrations backend/src/db/migrations
# Каталог того же коммита, что и фронт (§8).
COPY catalog/products.json catalog/activities.json catalog/meta.json catalog/
WORKDIR /app/backend
USER node
EXPOSE 4100
CMD ["node", "--enable-source-maps", "dist/server.js"]
