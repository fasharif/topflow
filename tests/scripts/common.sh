# shellcheck shell=bash
# Shared settings for the container-based test tools, sourced by the run-*.sh scripts.

# Git Bash on Windows rewrites arguments that look like paths (/load/…) unless told not to.
export MSYS_NO_PATHCONV=1

# Docker on Windows needs C:/… paths; `pwd -W` gives them in Git Bash and fails elsewhere.
native_pwd() { pwd -W 2>/dev/null || pwd; }
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && native_pwd)"
REPO_DIR="$(cd "$TESTS_DIR/.." && native_pwd)"
export TESTS_DIR REPO_DIR

# User the tool containers run as (compose.yaml). On Linux with a rootful Docker engine, such as a
# GitHub runner, a report written as root belongs to root and the calling user cannot change or
# remove it, so the containers run as the calling user. Docker Desktop (Windows, macOS) maps file
# ownership itself and refuses bind mounts to unknown users, so there they run as root. Set
# TOOL_USER to override, for example for rootless Docker.
if [[ -z "${TOOL_USER:-}" ]]; then
  case "$(uname -s)" in
    Linux) TOOL_USER="$(id -u):$(id -g)" ;;
    *) TOOL_USER="0:0" ;;
  esac
fi
export TOOL_USER

# URL of a service on the host, as a tool container reaches it.
from_container() {
  printf '%s' "$1" | sed -e 's#//localhost:#//host.docker.internal:#' -e 's#//127\.0\.0\.1:#//host.docker.internal:#'
}

compose() {
  docker compose --project-directory "$TESTS_DIR" -f "$TESTS_DIR/compose.yaml" "$@"
}

prepare_reports() {
  mkdir -p "$TESTS_DIR/reports/$1"
}

json_field() {
  node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => { const v = JSON.parse(s)[process.argv[1]]; if (v === undefined) process.exit(1); console.log(v); });' "$1"
}

# Address of a published demo account (@topflow/shared, DEMO_ACCOUNTS) by its local part, such as
# `customer`. Needs the shared package built (npm run build -w @topflow/shared).
demo_account_email() {
  (cd "$REPO_DIR" && node -e 'const { DEMO_ACCOUNTS } = require("@topflow/shared"); const a = DEMO_ACCOUNTS.find((x) => x.email.startsWith(process.argv[1] + "@")); if (!a) process.exit(1); console.log(a.email);' "$1") ||
    { echo "No demo account \"$1\" in @topflow/shared: build it with npm run build -w @topflow/shared." >&2; return 1; }
}

# Password of the seeded demo accounts: E2E_DEMO_PASSWORD, else SEED_DEMO_PASSWORD, else the
# published demo password from @topflow/shared.
demo_password() {
  if [[ -n "${E2E_DEMO_PASSWORD:-${SEED_DEMO_PASSWORD:-}}" ]]; then
    printf '%s\n' "${E2E_DEMO_PASSWORD:-$SEED_DEMO_PASSWORD}"
    return
  fi
  (cd "$REPO_DIR" && node -e 'console.log(require("@topflow/shared").DEMO_ACCOUNT_PASSWORD)')
}

# Reads the Supabase URL and keys from the local stack (npx supabase status) unless they are set.
load_supabase_env() {
  if [[ -n "${E2E_SUPABASE_PUBLISHABLE_KEY:-}" && -n "${E2E_SUPABASE_SECRET_KEY:-}" ]]; then
    E2E_SUPABASE_URL="${E2E_SUPABASE_URL:-http://127.0.0.1:54321}"
    return
  fi
  local status
  if ! status="$(cd "$REPO_DIR" && npx --no-install supabase status -o env 2>/dev/null)"; then
    echo "Set E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY and E2E_SUPABASE_SECRET_KEY, or start the local stack with npm run supabase:start." >&2
    exit 1
  fi
  value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
  E2E_SUPABASE_URL="${E2E_SUPABASE_URL:-$(value API_URL)}"
  E2E_SUPABASE_PUBLISHABLE_KEY="${E2E_SUPABASE_PUBLISHABLE_KEY:-$(value PUBLISHABLE_KEY)}"
  E2E_SUPABASE_SECRET_KEY="${E2E_SUPABASE_SECRET_KEY:-$(value SECRET_KEY)}"
}
