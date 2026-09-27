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
# The passes create accounts (one of them an Administrator), a company, an address and an order on
# the stack under test, so the script runs only against a stack on this machine (localhost,
# 127.0.0.1, [::1] or host.docker.internal) unless SCHEMATHESIS_ALLOW_REMOTE=1. The throwaway
# accounts get a random password that is never printed, and on exit, even after a failure, they are
# deactivated through the API (the promoted one is demoted first) and their sign-ins are deleted
# from Supabase Auth. The companies, addresses and orders they created stay.
#
# Triaged findings are handled in contract/schemathesis.toml (whole classes of finding) and one
# baseline per pass (contract/baseline*.json, single operations); the reasons are in
# docs/testing/BUGS-FOUND.md. Only new findings fail the run. After a deliberate change, record
# the new state with SCHEMATHESIS_UPDATE_BASELINE=1.
#
# Environment: E2E_API_URL (default http://localhost:3000); E2E_SUPABASE_URL,
# E2E_SUPABASE_PUBLISHABLE_KEY and E2E_SUPABASE_SECRET_KEY (read from `npx supabase status` when
# unset); E2E_DEMO_PASSWORD; SCHEMATHESIS_MAX_EXAMPLES (default 50), SCHEMATHESIS_SEED and
# SCHEMATHESIS_PASSES (default "customer staff trade"); SCHEMATHESIS_ALLOW_REMOTE. The staff pass
# needs the API to run with STAFF_MFA_REQUIRED=false, as in the system tests.
set -euo pipefail
# shellcheck source=../scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/common.sh"

load_supabase_env
api="${E2E_API_URL:-http://localhost:3000}"
api="${api%/}"
if [[ "${SCHEMATHESIS_ALLOW_REMOTE:-}" != 1 ]]; then
  for url in "$api" "$E2E_SUPABASE_URL"; do
    if ! is_local_url "$url"; then
      echo "Refusing to fuzz $url: the passes create an Administrator and other throwaway data on the stack under test." >&2
      echo "Run them against a local stack, or set SCHEMATHESIS_ALLOW_REMOTE=1 for a disposable remote one." >&2
      exit 1
    fi
  done
fi
api_from_container="$(from_container "$api")"
run="$(date +%s).$RANDOM"
# A new random password for this run's throwaway accounts; it is never printed.
password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')"

# Signs in with Supabase Auth and prints the access token. The JSON body is built by node from the
# environment and sent on stdin, so any password works and none appears in a process list.
sign_in() {
  SIGN_IN_EMAIL="$1" SIGN_IN_PASSWORD="$2" node -e \
    'process.stdout.write(JSON.stringify({ email: process.env.SIGN_IN_EMAIL, password: process.env.SIGN_IN_PASSWORD }))' |
    curl -sf -X POST "$E2E_SUPABASE_URL/auth/v1/token?grant_type=password" \
      -H "apikey: $E2E_SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' --data-binary @- |
    json_field access_token
}

# Throwaway accounts of this run (Supabase user ids, which are also the API's account ids).
accounts=()

# Creates a confirmed sign-in for a new account and sets `token` to its access token.
new_account() {
  local email="$1.$run@e2e.topflow.test" response status
  response="$(ACCOUNT_EMAIL="$email" ACCOUNT_PASSWORD="$password" ACCOUNT_NAME="Schemathesis $1" node -e \
    'process.stdout.write(JSON.stringify({ email: process.env.ACCOUNT_EMAIL, password: process.env.ACCOUNT_PASSWORD, email_confirm: true, user_metadata: { full_name: process.env.ACCOUNT_NAME } }))' |
    curl -s -w '\n%{http_code}' -X POST "$E2E_SUPABASE_URL/auth/v1/admin/users" \
      -H "apikey: $E2E_SUPABASE_SECRET_KEY" -H 'content-type: application/json' --data-binary @-)"
  status="${response##*$'\n'}"
  if [[ "$status" != 200 && "$status" != 201 ]]; then
    echo "Could not create the account $email in Supabase Auth ($status)." >&2
    return 1
  fi
  accounts+=("$(printf '%s' "${response%$'\n'*}" | json_field id)")
  token="$(sign_in "$email" "$password")" || { echo "Could not sign $email in at $E2E_SUPABASE_URL." >&2; return 1; }
}

# Deactivates this run's accounts through the API (demoting the promoted one) and deletes their
# sign-ins from Supabase Auth. Runs on every exit; a step that fails is reported, not fatal.
clean_up_accounts() {
  local status=$? admin id removed=0
  set +e
  if ((${#accounts[@]} > 0)); then
    if admin="$(sign_in "$(demo_account_email admin)" "$(demo_password)")"; then
      for id in "${accounts[@]}"; do
        api_call "$admin" PATCH "/admin/users/$id" '{"role":"CUSTOMER","isActive":false}' id > /dev/null ||
          echo "Could not deactivate the throwaway account $id; deactivate it in the back office." >&2
      done
    else
      echo "Could not sign the demo administrator in to deactivate the throwaway accounts: ${accounts[*]}" >&2
    fi
    for id in "${accounts[@]}"; do
      if curl -sf -o /dev/null -X DELETE "$E2E_SUPABASE_URL/auth/v1/admin/users/$id" -H "apikey: $E2E_SUPABASE_SECRET_KEY"; then
        removed=$((removed + 1))
      else
        echo "Could not delete the throwaway sign-in $id from Supabase Auth." >&2
      fi
    done
    echo "Deactivated the throwaway accounts and deleted $removed of ${#accounts[@]} sign-in(s)."
  fi
  exit "$status"
}
trap clean_up_accounts EXIT

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
  new_account fuzz
  product="$(curl -sf "$api/catalog/products?pageSize=1&search=AX-EFS-002" | json_field items.0.id)"
  address="$(api_call "$token" POST /me/addresses '{"label":"Fuzz","contactName":"Schemathesis","phoneNumber":"+971 50 555 0100","line1":"Villa 1, Street 2","area":"Al Barsha","city":"Dubai","emirate":"DUBAI"}' id)"
  order="$(api_call "$token" POST /me/orders "{\"items\":[{\"productId\":\"$product\",\"quantity\":1}],\"addressId\":\"$address\",\"paymentMethod\":\"CASH_ON_DELIVERY\"}" id)"
  # The saved address and the order are the only ones this customer has: the operations that read,
  # change or cancel them by id get real ids (schemathesis.toml reads these variables).
  export FUZZ_ADDRESS_ID="$address" FUZZ_ORDER_ID="$order"
  run_pass customer baseline.json -H "Authorization: Bearer $token"
fi

if [[ " $passes " == *" staff "* ]]; then
  new_account staff
  id="${accounts[${#accounts[@]} - 1]}"
  admin="$(sign_in "$(demo_account_email admin)" "$(demo_password)")" ||
    { echo "Could not sign the demo administrator in; is the demo profile seeded?" >&2; exit 1; }
  # The first authenticated call creates the API account that the administrator then promotes.
  api_call "$token" GET /auth/me '' id > /dev/null
  api_call "$admin" PATCH "/admin/users/$id" '{"role":"ADMIN"}' role > /dev/null ||
    { echo "The demo administrator could not promote the staff account (is STAFF_MFA_REQUIRED=false?)." >&2; exit 1; }
  # Filters of different kinds are alternatives, so the writes are excluded explicitly.
  run_pass staff baseline-staff.json -H "Authorization: Bearer $token" \
    --include-path-regex '^/admin/' \
    --exclude-method POST --exclude-method PATCH --exclude-method DELETE
fi

if [[ " $passes " == *" trade "* ]]; then
  new_account trade
  organization="$(api_call "$token" POST /me/organizations "{\"name\":\"Fuzz Trading $run\",\"type\":\"CONTRACTOR\",\"tradeLicenseNumber\":\"FUZZ-$RANDOM\"}" memberships.0.organizationId)"
  run_pass trade baseline-trade.json -H "Authorization: Bearer $token" -H "x-organization-id: $organization" \
    --include-path-regex '^/org'
fi

if ((${#failed[@]} > 0)); then
  echo "Schemathesis found new failures in: ${failed[*]}" >&2
  exit 1
fi
