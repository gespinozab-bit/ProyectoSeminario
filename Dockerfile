FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --foreground-scripts --fetch-timeout=60000 --fetch-retries=1
COPY . .
# Prisma generation reads the URL configuration but does not connect to a database.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate
RUN npm run build

# Includes the CLI and tsx for explicit migration/seed operations, never exposed to HTTP.
FROM build AS tools
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
CMD ["npm", "run", "db:status"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM base AS api
ENV NODE_ENV=production PORT=3000 MEDIA_STORAGE_PATH=/app/storage/media
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared ./packages/shared
RUN mkdir -p /app/storage/media && chown -R node:node /app/storage
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
