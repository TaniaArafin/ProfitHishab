# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile -t profithishab-api .
# Run migrations:                  docker build -f apps/api/Dockerfile --target migrate -t profithishab-migrate .
# (nodebestpractices 8.1 multi-stage, 8.2 node not npm, 8.9 pinned tag, 6.13 non-root, 5.15 NODE_ENV)

FROM node:22.20.0-bookworm-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests first so dependency layers are cached until a package.json or the lockfile changes (8.8).
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS build
RUN npm ci --workspace @ph/shared --workspace @ph/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @ph/shared \
 && npm run prisma:generate -w @ph/api \
 && npm run build -w @ph/api

# Applies pending migrations, then exits. Has the Prisma CLI, which the runtime image does not.
FROM build AS migrate
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace @ph/shared --workspace @ph/api && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
