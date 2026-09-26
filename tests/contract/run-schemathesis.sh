#!/usr/bin/env bash
# Property-based API tests: Schemathesis (pinned container image) generates requests from the
# API's published OpenAPI description and checks every response against it. Three passes, each
# signed in as a throwaway account created for the run, so the demo accounts the browser journeys
# rely on are never changed:
#
#   customer  every operation, as a new customer with a saved address and one order (the ids are
#             supplied to the operations that need them); the back office and the trade portal
#             must refuse it
#   staff     the back office's read-only operations (GET /admin/...), as a new account that the
#             demo administrator promotes to Administrator. Back-office writes are not fuzzed: they
#             would change the shared demo catalogue, users and companies. The API end-to-end suite
#             covers them.
#   trade     the trade portal (/org/...), as the owner of a new company waiting for verification,
#             with its id in the x-organization-id header
#
# Triaged findings are handled in contract/schemathesis.toml (whole classes of finding) and one
# baseline per pass (contract/baseline*.json, single operations); the reasons are in
# docs/testing/BUGS-FOUND.md. Only new findings fail the run. After a deliberate change, record
# the new state with SCHEMATHESIS_UPDATE_BASELINE=1.
#
# Environment: E2E_API_URL (default http://localhost:3000); E2E_SUPABASE_URL,
# E2E_SUPABASE_PUBLISHABLE_KEY and E2E_SUPABASE_SECRET_KEY (read from `npx supabase status` when
# unset); E2E_DEMO_PASSWORD; SCHEMATHESIS_MAX_EXAMPLES (default 50), SCHEMATHESIS_SEED and
# SCHEMATHESIS_PASSES (default "customer staff trade"). The staff pass needs the API to run with
# STAFF_MFA_REQUIRED=false, as in the system tests.
set -euo pipefail
# shellcheck source=../scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/common.sh"

load_supabase_env
api="${E2E_API_URL:-http://localhost:3000}"
api="${api%/}"
api_from_container="$(from_container "$api")"
run="$(date +%s).$RANDOM"
# A test-only password for throwaway accounts on a local or CI stack.
password="Fuzz-account-2026"

# Signs in with Supabase Auth and prints the access token.
sign_in() {
  curl -sf -X POST "$E2E_SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $E2E_SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json_field access_token
}

# Creates a confirmed sign-in for a new account and prints its access token.
new_account() {
  local email="$1.$run@e2e.topflow.test" created
  created=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$E2E_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $E2E_SUPABASE_SECRET_KEY" -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Schemathesis $1\"}}")
  if [[ "$created" != 200 && "$created" != 201 ]]; then
    echo "Could not create the account $email in Supabase Auth ($created)." >&2
    return 1
  fi
  sign_in "$email" "$password" || { echo "Could not sign $email in at $E2E_SUPABASE_URL." >&2; return 1; }
}

# Calls the API as a signed-in account and prints one field of the JSON answer.
api_call() {
  local token="$1" method="$2" path="$3" body="$4" field="$5"
  curl -sf -X "$method" "$api$path" -H "Authorization: Bearer $token" -H 'content-type: application/json' \
    ${body:+-d "$body"} | json_field "$field"
}

# Runs one pass: run_pass <name> <baseline file> [schemathesis options...]
failed=()
run_pass() {
  local name="$1" baseline="$2"
  shift 2
  local baseline_options=(--baseline "$baseline")
  if [[ "${SCHEMATHESIS_UPDATE_BASELINE:-}" == 1 ]]; then
    [[ -f "$TESTS_DIR/contract/$baseline" ]] || printf '{"format_version": 1, "entries": []}\n' > "$TESTS_DIR/contract/$baseline"
    baseline_options+=(--baseline-update --baseline-prune)
  fi
  echo "=== Schemathesis: $name pass ==="
  # schemathesis.toml reads FUZZ_ADDRESS_ID and FUZZ_ORDER_ID, so every pass needs them set.
  if ! compose run --rm --no-deps -e FUZZ_ADDRESS_ID -e FUZZ_ORDER_ID \
    schemathesis --config-file schemathesis.toml run "$api_from_container/docs-json" \
    --url "$api_from_container" \
    --checks all \
    --exclude-checks unsupported_method \
    --max-examples "${SCHEMATHESIS_MAX_EXAMPLES:-50}" \
    --seed "${SCHEMATHESIS_SEED:-20260926}" \
    --workers 2 \
    --request-retries 2 \
    --generation-database none \
    --report junit,json \
    --report-dir "/reports/schemathesis" \
    --report-junit-path "/reports/schemathesis/junit-$name.xml" \
    --report-json-path "/reports/schemathesis/run-$name.json" \
    --coverage-format html \
    --coverage-report-html-path "/reports/schemathesis/schema-coverage-$name.html" \
    "${baseline_options[@]}" \
    "$@"; then
    failed+=("$name")
  fi
}

prepare_reports schemathesis
passes="${SCHEMATHESIS_PASSES:-customer staff trade}"
# Placeholders for the passes that do not use them; the customer pass sets real ids.
export FUZZ_ADDRESS_ID=00000000-0000-4000-8000-000000000000 FUZZ_ORDER_ID=00000000-0000-4000-8000-000000000000

if [[ " $passes " == *" customer "* ]]; then
  token="$(new_account fuzz)"
  product="$(curl -sf "$api/catalog/products?pageSize=1&search=AX-EFS-002" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).items[0].id))')"
  address="$(api_call "$token" POST /me/addresses '{"label":"Fuzz","contactName":"Schemathesis","phoneNumber":"+971 50 555 0100","line1":"Villa 1, Street 2","area":"Al Barsha","city":"Dubai","emirate":"DUBAI"}' id)"
  order="$(api_call "$token" POST /me/orders "{\"items\":[{\"productId\":\"$product\",\"quantity\":1}],\"addressId\":\"$address\",\"paymentMethod\":\"CASH_ON_DELIVERY\"}" id)"
  # The saved address and the order are the only ones this customer has: the operations that read,
  # change or cancel them by id get real ids (schemathesis.toml reads these variables).
  export FUZZ_ADDRESS_ID="$address" FUZZ_ORDER_ID="$order"
  run_pass customer baseline.json -H "Authorization: Bearer $token"
fi

if [[ " $passes " == *" staff "* ]]; then
  token="$(new_account staff)"
  id="$(api_call "$token" GET /auth/me '' id)"
  admin="$(sign_in "$(demo_account_email admin)" "$(demo_password)")" ||
    { echo "Could not sign the demo administrator in; is the demo profile seeded?" >&2; exit 1; }
  api_call "$admin" PATCH "/admin/users/$id" '{"role":"ADMIN"}' role > /dev/null ||
    { echo "The demo administrator could not promote the staff account (is STAFF_MFA_REQUIRED=false?)." >&2; exit 1; }
  # Filters of different kinds are alternatives, so the writes are excluded explicitly.
  run_pass staff baseline-staff.json -H "Authorization: Bearer $token" \
    --include-path-regex '^/admin/' \
    --exclude-method POST --exclude-method PATCH --exclude-method DELETE
fi

if [[ " $passes " == *" trade "* ]]; then
  token="$(new_account trade)"
  organization="$(api_call "$token" POST /me/organizations "{\"name\":\"Fuzz Trading $run\",\"type\":\"CONTRACTOR\",\"tradeLicenseNumber\":\"FUZZ-$RANDOM\"}" memberships.0.organizationId)"
  run_pass trade baseline-trade.json -H "Authorization: Bearer $token" -H "x-organization-id: $organization" \
    --include-path-regex '^/org'
fi

if ((${#failed[@]} > 0)); then
  echo "Schemathesis found new failures in: ${failed[*]}" >&2
  exit 1
fi
