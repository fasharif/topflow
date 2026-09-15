# syntax=docker/dockerfile:1.7
#
# Production image for @topflow/api.
# `turbo prune` extracts only the workspaces the API depends on (shared, database), so the
# web and mobile apps never enter the build context of this image.

ARG NODE_VERSION=24

# ── 1. Prune the monorepo ────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS pruner
WORKDIR /repo
COPY . .
RUN npx --yes turbo@2 prune @topflow/api --docker

# ── 2. Install dependencies and build ────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS builder
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# Dependency layer: only package manifests + lockfile, cached until they change.
COPY --from=pruner /repo/out/json/ .
RUN npm ci --no-audit --no-fund

COPY --from=pruner /repo/out/full/ .
RUN npx turbo run build --filter=@topflow/api... \
  && npm prune --omit=dev --no-audit --no-fund

# ── 3. Runtime ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runner
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=true
WORKDIR /repo
COPY --from=builder --chown=node:node /repo ./
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Release, then start. `npm run release` validates the environment before applying pending
# migrations (guarded by Prisma's advisory lock). Railway runs the release as a pre-deploy step
# instead (see railway.json), so a failed release never replaces the running deployment.
CMD ["sh", "-c", "npm run release && exec node apps/api/dist/main.js"]
