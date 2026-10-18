# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/web/Dockerfile -t profithishab-web .
# Uses Next.js standalone output: only the files the server needs, no full node_modules.

FROM node:22.20.0-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @ph/shared --workspace @ph/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build -w @ph/shared && npm run build -w @ph/web

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
