# TopFlow Hub API (NestJS). Two images from one build, both built from the repository root:
#
#   docker build -f apps/api/Dockerfile --target api     -t topflow-hub-api .
#   docker build -f apps/api/Dockerfile --target migrate -t topflow-hub-migrate .
#
# `api` serves the REST API. `migrate` runs the release step once per deployment, before the new
# version receives traffic: it validates the environment exactly as the API does at boot, then
# applies pending Prisma migrations. The Prisma CLI weighs several times more than the API itself,
# so it lives only in the image that needs it. A third target, `seed`, loads demo data into a local
# stack (docker-compose.prod.yml, profile "demo"); it carries the build toolchain and is never pushed.
#
# Both images run as the unprivileged `node` user without npm, and start from the ECR Public
# mirror of the Docker Official Node.js image (no Docker Hub pull limits), pinned by digest. There
# is no `# syntax=` line: BuildKit's built-in Dockerfile frontend supports everything used here
# (RUN --mount, COPY --chmod), so no frontend image is pulled from Docker Hub.

# The base image, pinned by tag and digest, on a literal FROM line so Dependabot can update both
# (it does not read images from build arguments). Every other stage starts from this one.
FROM public.ecr.aws/docker/library/node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS node-base

# ── Prune the monorepo to the workspaces each image needs ────────────────────────────────────
FROM node-base AS prune
ARG TURBO_VERSION=2.10.12
WORKDIR /repo
COPY . .
# out/*/json holds only manifests and a pruned lockfile, so the install layers stay cached until
# dependencies change; out/*/full holds the sources.
RUN npx --yes "turbo@${TURBO_VERSION}" prune @topflow/api --docker --out-dir out/api \
 && npx --yes "turbo@${TURBO_VERSION}" prune @topflow/database --docker --out-dir out/database

# ── Compile the API and trace the files it loads at runtime ─────────────────────────────────
FROM node-base AS build
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=prune /repo/out/api/json/ ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund
COPY --from=prune /repo/out/api/full/ ./
# trace-runtime.mjs copies only the files the compiled API loads, then proves the copy can load
# every module and render a PDF.
RUN npx turbo run build --filter=@topflow/api \
 && node apps/api/scripts/trace-runtime.mjs /runtime

# ── Production dependencies of @topflow/database: the Prisma CLI and its schema engine ──────
FROM node-base AS migrate-deps
WORKDIR /repo
COPY --from=prune /repo/out/database/json/ ./
# `prisma migrate deploy` needs neither the generated-client runtime nor TypeScript (an optional
# peer); dropping them saves about 100 MB. The release step in CI proves the rest is complete.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --no-audit --no-fund \
 && rm -rf node_modules/@prisma/client node_modules/typescript

# ── Common runtime base ──────────────────────────────────────────────────────────────────────
FROM node-base AS base
ARG APP_VERSION=dev
# Neither image needs npm, npx, corepack or yarn at runtime; removing them also removes their
# bundled dependencies from the vulnerability surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
# NO_COLOR: NestJS colours its log lines unless told not to, and escape codes in CloudWatch Logs
# would get in the way of the error-log metric filter and of queries.
ENV NODE_ENV=production \
    NO_COLOR=1 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --chmod=0755 apps/api/docker/entrypoint.sh /usr/local/bin/topflow-api
ENTRYPOINT ["/usr/local/bin/topflow-api"]

# ── Release step image ───────────────────────────────────────────────────────────────────────
FROM base AS migrate
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="topflow-hub-migrate" \
      org.opencontainers.image.description="TopFlow Hub release step: environment preflight and Prisma migrations (portfolio project, not Top Flow's official system)" \
      org.opencontainers.image.source="https://github.com/fasharif/topflow" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}"
# Files stay owned by root: the `node` user can read them but not change them.
COPY --from=migrate-deps /repo/ ./
COPY --from=build /runtime/ ./
COPY --from=build /repo/packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY --from=build /repo/packages/database/prisma/schema.prisma ./packages/database/prisma/schema.prisma
COPY --from=build /repo/packages/database/prisma/migrations ./packages/database/prisma/migrations
USER node
CMD ["release"]

# ── Demo data loader (local stacks only; never pushed) ─────────────────────────────────────
# The seed script needs the development toolchain (tsx), so it runs from the build stage.
FROM build AS seed
WORKDIR /repo/packages/database
USER node
ENTRYPOINT []
CMD ["npx", "prisma", "db", "seed"]

# ── API image (default target) ───────────────────────────────────────────────────────────────
FROM base AS api
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="topflow-hub-api" \
      org.opencontainers.image.description="TopFlow Hub REST API, NestJS (portfolio project, not Top Flow's official system)" \
      org.opencontainers.image.source="https://github.com/fasharif/topflow" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV PORT=3000
COPY --from=build /runtime/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["serve"]
