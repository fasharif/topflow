# shellcheck shell=bash
# Shared settings for the container-based test tools, sourced by the run-*.sh scripts.

# Git Bash on Windows rewrites arguments that look like paths (/load/…) unless told not to.
export MSYS_NO_PATHCONV=1

# Docker on Windows needs C:/… paths; `pwd -W` gives them in Git Bash and fails elsewhere.
native_pwd() { pwd -W 2>/dev/null || pwd; }
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && native_pwd)"
REPO_DIR="$(cd "$TESTS_DIR/.." && native_pwd)"
export TESTS_DIR REPO_DIR

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
