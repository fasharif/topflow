#!/usr/bin/env bash
# Property-based API tests: Schemathesis (pinned container image) generates requests from the
# API's published OpenAPI description and checks every response against it. It signs in as a
# throwaway customer created for the run through the Supabase admin API, so customer endpoints are
# exercised without changing the demo accounts the browser journeys rely on.
#
# Triaged findings are handled in contract/schemathesis.toml (whole classes of finding) and
# contract/baseline.json (single operations); the reasons are in docs/testing/BUGS-FOUND.md. Only
# new findings fail the run. After a deliberate change, record the new state with
# SCHEMATHESIS_UPDATE_BASELINE=1.
#
# Environment: E2E_API_URL (default http://localhost:3000); E2E_SUPABASE_URL,
# E2E_SUPABASE_PUBLISHABLE_KEY and E2E_SUPABASE_SECRET_KEY (read from `npx supabase status` when
# unset); SCHEMATHESIS_MAX_EXAMPLES (default 50) and SCHEMATHESIS_SEED.
set -euo pipefail
# shellcheck source=../scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/common.sh"

load_supabase_env
api_url="$(from_container "${E2E_API_URL:-http://localhost:3000}")"
email="fuzz.$(date +%s).$RANDOM@e2e.topflow.test"
# A test-only password for a throwaway account on a local or CI stack.
password="Fuzz-customer-2026"

created=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$E2E_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $E2E_SUPABASE_SECRET_KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Schemathesis Customer\"}}")
if [[ "$created" != 200 && "$created" != 201 ]]; then
  echo "Could not create the fuzzing account in Supabase Auth ($created)." >&2
  exit 1
fi
if ! token=$(curl -sf -X POST "$E2E_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $E2E_SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\"}" | json_field access_token); then
  echo "Could not sign the fuzzing account in at $E2E_SUPABASE_URL." >&2
  exit 1
fi

baseline=(--baseline baseline.json)
if [[ "${SCHEMATHESIS_UPDATE_BASELINE:-}" == 1 ]]; then baseline+=(--baseline-update --baseline-prune); fi

prepare_reports schemathesis
compose run --rm --no-deps schemathesis --config-file schemathesis.toml run "$api_url/docs-json" \
  --url "$api_url" \
  -H "Authorization: Bearer $token" \
  --checks all \
  --exclude-checks unsupported_method \
  --max-examples "${SCHEMATHESIS_MAX_EXAMPLES:-50}" \
  --seed "${SCHEMATHESIS_SEED:-20260926}" \
  --workers 2 \
  --request-retries 2 \
  --generation-database none \
  --report junit \
  --report-dir /reports/schemathesis \
  --coverage-format html \
  --coverage-report-html-path /reports/schemathesis/schema-coverage.html \
  "${baseline[@]}"
