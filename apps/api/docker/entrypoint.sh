#!/bin/sh
# Entry point of the API container images (apps/api/Dockerfile).
#
#   serve      run the API (default command of the topflow-hub-api image)
#   release    validate the environment, then apply pending database migrations (default command
#              of the topflow-hub-migrate image). Run it once per release, before the new version
#              receives traffic: the `migrate` service in docker-compose.prod.yml, a one-off ECS
#              task in .github/workflows/deploy.yml.
#   preflight  validate the environment only
#
# Any other command runs as given, for example `sh` when debugging.
set -eu

APP_DIR=/app
PRISMA_CLI="$APP_DIR/node_modules/prisma/build/index.js"

preflight() {
  node "$APP_DIR/apps/api/dist/preflight.js"
}

case "${1:-serve}" in
  serve)
    exec node "$APP_DIR/apps/api/dist/main.js"
    ;;
  release)
    if [ ! -f "$PRISMA_CLI" ]; then
      echo "The release step runs from the topflow-hub-migrate image, which contains the Prisma CLI." >&2
      exit 64
    fi
    preflight
    # Prisma reads prisma.config.ts from the working directory; it prefers DIRECT_URL (a session
    # connection) and falls back to DATABASE_URL.
    cd "$APP_DIR/packages/database"
    exec node "$PRISMA_CLI" migrate deploy
    ;;
  preflight)
    preflight
    ;;
  *)
    exec "$@"
    ;;
esac
