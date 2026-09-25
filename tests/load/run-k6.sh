#!/usr/bin/env bash
# Runs the k6 load test (load/api-load.ts) in the pinned grafana/k6 container against the running
# API. A missed p95 threshold makes k6 exit with code 99, which fails this script.
#
#   K6_PROFILE=smoke (default)  one virtual user: functional check of the script and thresholds
#   K6_PROFILE=load             about five minutes of mixed traffic, for a quiet machine only
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
prepare_reports k6

status=0
compose run --rm --no-deps \
  -e K6_PROFILE="$profile" \
  -e API_URL="$(from_container "${E2E_API_URL:-http://localhost:3000}")" \
  -e SUPABASE_URL="$(from_container "$E2E_SUPABASE_URL")" \
  -e SUPABASE_PUBLISHABLE_KEY="$E2E_SUPABASE_PUBLISHABLE_KEY" \
  -e DEMO_PASSWORD="${E2E_DEMO_PASSWORD:-TopFlow2026!}" \
  -e INTERNAL_API_SECRET="${E2E_INTERNAL_API_SECRET:-}" \
  k6 run --summary-export "/$summary" api-load.ts || status=$?

# The export repeats setup() data, which includes the customer's access token: keep it out of reports.
if [[ -f "$TESTS_DIR/$summary" ]]; then
  node -e 'const fs = require("fs"); const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); delete s.setup_data; fs.writeFileSync(process.argv[1], JSON.stringify(s, null, 2));' "$TESTS_DIR/$summary"
  echo "Summary: tests/$summary (Markdown table: node tests/scripts/k6-summary-table.mts tests/$summary)"
fi
exit "$status"
