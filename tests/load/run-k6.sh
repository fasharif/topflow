#!/usr/bin/env bash
# Runs the k6 load test (load/api-load.ts) in the pinned grafana/k6 container against the running
# API. A crossed threshold makes k6 exit with code 99, which fails this script.
#
#   K6_PROFILE=smoke (default)  one virtual user per scenario (three in all): functional check that
#                               fails on errors and failed checks, not on timings
#   K6_PROFILE=load             about five minutes of mixed traffic that fails on a missed p95
#                               target; for a quiet machine only
#
# Environment: E2E_API_URL (default http://localhost:3000), E2E_SUPABASE_URL and
# E2E_SUPABASE_PUBLISHABLE_KEY (read from `npx supabase status` when unset), E2E_DEMO_PASSWORD,
# and E2E_INTERNAL_API_SECRET to rate-limit each virtual user as its own shopper.
set -euo pipefail
# shellcheck source=../scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/common.sh"

profile="${K6_PROFILE:-smoke}"
summary="reports/k6/summary-$profile.json"
load_supabase_env
# The container runs as the calling user (TOOL_USER in common.sh), so the summary belongs to them.
prepare_reports k6
rm -f "$TESTS_DIR/$summary"

# Passed to the container by name only, so the password and the shared secret never appear on a
# command line, where other users of the machine could read them in the process list.
K6_PROFILE="$profile"
API_URL="$(from_container "${E2E_API_URL:-http://localhost:3000}")"
SUPABASE_URL="$(from_container "$E2E_SUPABASE_URL")"
SUPABASE_PUBLISHABLE_KEY="$E2E_SUPABASE_PUBLISHABLE_KEY"
CUSTOMER_EMAIL="$(demo_account_email customer)"
DEMO_PASSWORD="$(demo_password)"
INTERNAL_API_SECRET="${E2E_INTERNAL_API_SECRET:-}"
export K6_PROFILE API_URL SUPABASE_URL SUPABASE_PUBLISHABLE_KEY CUSTOMER_EMAIL DEMO_PASSWORD INTERNAL_API_SECRET

status=0
compose run --rm --no-deps \
  -e K6_PROFILE -e API_URL -e SUPABASE_URL -e SUPABASE_PUBLISHABLE_KEY \
  -e CUSTOMER_EMAIL -e DEMO_PASSWORD -e INTERNAL_API_SECRET \
  k6 run --summary-export "/$summary" api-load.ts || status=$?

if [[ -f "$TESTS_DIR/$summary" ]]; then
  # setup() returns no token, so the export (which repeats setup data) holds none. Refuse to keep a
  # report that does, rather than rewrite it: CI uploads this file as an artifact.
  if grep -Eq '"(accessToken|access_token)"|eyJhbGci' "$TESTS_DIR/$summary"; then
    echo "tests/$summary contains an access token; it was deleted. Check setup() in load/api-load.ts." >&2
    rm -f "$TESTS_DIR/$summary"
    exit 1
  fi
  echo "Summary: tests/$summary (Markdown table: node tests/scripts/k6-summary-table.mts tests/$summary)"
fi
exit "$status"
