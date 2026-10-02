# TopFlow Hub web app (Next.js standalone server). Build from the repository root:
#
#   docker build -f apps/web/Dockerfile -t topflow-hub-web .
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_DEMO_MODE=true -t topflow-hub-web-demo .
#
# One image serves every environment. NEXT_PUBLIC_* variables are deliberately absent at build
# time, so Next.js does not inline them: the server reads NEXT_PUBLIC_SUPABASE_URL,
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and NEXT_PUBLIC_SITE_URL from its environment at runtime
# (Supabase runs only on the server, ADR-013). The exception is NEXT_PUBLIC_DEMO_MODE, which a
# client component reads: the build argument of the same name is always inlined, `false` unless
# set, so a demo image is a separate build (the second command above, ADR-021) and setting the
# variable on a running container changes nothing. A value other than true or false fails the
# build. See ADR-023 in docs/DECISIONS.md.
#
# Runs as the unprivileged `node` user without npm, from the ECR Public mirror of the Docker
# Official Node.js image (no Docker Hub pull limits), pinned by digest. There is no `# syntax=`
# line: BuildKit's built-in Dockerfile frontend supports everything used here (RUN --mount), so
# no frontend image is pulled from Docker Hub.

# The base image, pinned by tag and digest, on a literal FROM line so Dependabot can update both
# (it does not read images from build arguments). Every other stage starts from this one.
FROM public.ecr.aws/docker/library/node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS node-base

FROM node-base AS prune
ARG TURBO_VERSION=2.10.12
WORKDIR /repo
COPY . .
RUN npx --yes "turbo@${TURBO_VERSION}" prune web --docker

FROM node-base AS build
ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund
COPY --from=prune /repo/out/full/ ./
# Declared after the install, so a demo build reuses the cached dependencies. turbo.json passes
# NEXT_PUBLIC_* through to the build and includes it in the cache key.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
RUN npx turbo run build --filter=web

FROM node-base AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="topflow-hub-web" \
      org.opencontainers.image.description="TopFlow Hub storefront, trade portal and back office, Next.js (portfolio project, not Top Flow's official system)" \
      org.opencontainers.image.source="https://github.com/fasharif/topflow" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}"
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
# The server, its traced dependencies, static assets and public files stay owned by root. Only the
# cache directory (fetch cache, optimised images) is writable, so a deployment can also mount it
# as the only writable path of a read-only root filesystem.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
