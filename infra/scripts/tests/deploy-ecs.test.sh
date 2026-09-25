#!/usr/bin/env bash
# Tests of deploy-ecs.sh against a fake AWS CLI (tests/fake-aws): the order of a release, a failed
# release step, a deployment the circuit breaker rolled back, the one-step rollback and argument
# checks. Needs bash and jq; no AWS account.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(dirname "$here")/deploy-ecs.sh"
passed=0

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
cp "$here/fake-aws" "$work/bin/aws"
chmod +x "$work/bin/aws"
export PATH="$work/bin:$PATH"

ok() { passed=$((passed + 1)); echo "ok $passed - $1"; }
not_ok() {
  echo "not ok - $1" >&2
  [[ -f "$FAKE_AWS_LOG" ]] && sed 's/^/  aws /' "$FAKE_AWS_LOG" >&2
  exit 1
}

# A fresh fake account with the given current and previous release tags.
fresh() {
  export FAKE_AWS_STATE="$work/state-$RANDOM" FAKE_AWS_LOG="$work/calls-$RANDOM.log"
  mkdir -p "$FAKE_AWS_STATE"
  : >"$FAKE_AWS_LOG"
  printf '%s' "$1" >"$FAKE_AWS_STATE/param__topflow-hub_staging_release_current_"
  printf '%s' "$2" >"$FAKE_AWS_STATE/param__topflow-hub_staging_release_previous_"
  unset FAKE_MIGRATION_EXIT FAKE_ROLLOUT_STATE
}
release() { cat "$FAKE_AWS_STATE/param__topflow-hub_staging_release_$1_"; }
line_of() { grep -n -m1 -- "$1" "$FAKE_AWS_LOG" | cut -d: -f1; }
count() { grep -c -- "$1" "$FAKE_AWS_LOG" || true; }
image_of() { jq -r '.containerDefinitions[0].image' "$FAKE_AWS_STATE/registered_topflow-hub-staging-$1.json"; }

# ── deploy ─────────────────────────────────────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
"$deploy" deploy --environment staging --tag sha-2222222 >"$work/out.log" || not_ok "a normal deploy succeeds"
[[ "$(image_of migrate)" == ghcr.io/fasharif/topflow-hub-migrate:sha-2222222 ]] || not_ok "the release step uses the new migrate image"
[[ "$(image_of api)" == ghcr.io/fasharif/topflow-hub-api:sha-2222222 ]] || not_ok "the API gets the new image"
[[ "$(image_of web)" == ghcr.io/fasharif/topflow-hub-web:sha-2222222 ]] || not_ok "the web app gets the new image"
ok "a deploy registers new task definitions with the new images"

jq -e 'has("taskDefinitionArn") or has("revision") or has("status") or has("registeredAt") or has("compatibilities") | not' \
  "$FAKE_AWS_STATE/registered_topflow-hub-staging-api.json" >/dev/null || not_ok "read-only fields are removed before registering"
jq -e '.cpu == "512" and .family == "topflow-hub-staging-api"' "$FAKE_AWS_STATE/registered_topflow-hub-staging-api.json" >/dev/null \
  || not_ok "everything else of the task definition is kept"
ok "a new revision copies the current task definition without its read-only fields"

run_task=$(line_of "ecs run-task")
first_update=$(line_of "ecs update-service")
api_update=$(line_of "update-service --cluster topflow-hub-staging --service topflow-hub-staging-api")
web_update=$(line_of "update-service --cluster topflow-hub-staging --service topflow-hub-staging-web")
[[ -n "$run_task" && "$run_task" -lt "$first_update" ]] || not_ok "migrations run before any service changes"
[[ "$api_update" -lt "$web_update" ]] || not_ok "the API is updated before the web app"
grep -q -- '--network-configuration {"awsvpcConfiguration":{"subnets":\["subnet-a","subnet-b"\]' "$FAKE_AWS_LOG" \
  || not_ok "the release step runs in the API service's subnets"
ok "the release step runs first, then the API, then the web app"

[[ "$(release current)" == sha-2222222 && "$(release previous)" == sha-1111111 ]] || not_ok "the releases are recorded"
ok "the new release is recorded as current and the old one as previous"

fresh sha-1111111 sha-0000000
GITHUB_OUTPUT="$work/github-output" "$deploy" deploy --environment staging --tag sha-3333333 >/dev/null
grep -qx 'release=sha-3333333' "$work/github-output" || not_ok "the serving release is a step output"
ok "the workflow learns which release to smoke-test"

# ── a failing release step ─────────────────────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
export FAKE_MIGRATION_EXIT=1
if "$deploy" deploy --environment staging --tag sha-2222222 >"$work/out.log" 2>&1; then not_ok "a failed release step fails the deploy"; fi
grep -q "the release step failed (exit code 1" "$work/out.log" || not_ok "the failure is explained"
grep -q "P1001: Can't reach database server" "$work/out.log" || not_ok "the release step's log is shown"
[[ "$(count "ecs update-service")" == 0 ]] || not_ok "no service changes after a failed release step"
[[ "$(release current)" == sha-1111111 ]] || not_ok "the recorded release stays"
ok "a failed release step stops the deploy before any service changes"

# ── the circuit breaker rolled the API back ────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
export FAKE_ROLLOUT_STATE=FAILED
if "$deploy" deploy --environment staging --tag sha-2222222 >"$work/out.log" 2>&1; then not_ok "an unhealthy release fails the deploy"; fi
grep -q "the new api version did not become healthy" "$work/out.log" || not_ok "the failure names the API"
[[ "$(count "service topflow-hub-staging-web")" == 0 ]] || not_ok "the web app is left alone"
[[ "$(release current)" == sha-1111111 ]] || not_ok "the recorded release stays"
ok "a release that never becomes healthy fails the deploy and leaves the web app alone"

# ── nothing to do ──────────────────────────────────────────────────────────────────────────────
fresh sha-2222222 sha-1111111
"$deploy" deploy --environment staging --tag sha-2222222 >"$work/out.log" || not_ok "deploying the current release succeeds"
grep -q "already the current staging release" "$work/out.log" || not_ok "it says so"
[[ "$(count "ecs ")" == 0 ]] || not_ok "no ECS calls"
ok "deploying the current release again changes nothing"

# ── rollback ───────────────────────────────────────────────────────────────────────────────────
fresh sha-2222222 sha-1111111
"$deploy" rollback --environment staging >"$work/out.log" || not_ok "a rollback succeeds"
[[ "$(image_of api)" == ghcr.io/fasharif/topflow-hub-api:sha-1111111 ]] || not_ok "the API gets the previous image"
[[ "$(image_of web)" == ghcr.io/fasharif/topflow-hub-web:sha-1111111 ]] || not_ok "the web app gets the previous image"
[[ "$(count "ecs run-task")" == 0 ]] || not_ok "a rollback runs no migrations"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == sha-2222222 ]] || not_ok "the releases are swapped"
ok "a rollback restores the previous images in one step, without migrations"

fresh sha-2222222 none
if "$deploy" rollback --environment staging >"$work/out.log" 2>&1; then not_ok "a rollback without a previous release fails"; fi
grep -q "no previous release is recorded for staging" "$work/out.log" || not_ok "the failure is explained"
ok "a rollback needs a recorded previous release"

# ── arguments ──────────────────────────────────────────────────────────────────────────────────
expect_usage() {
  local status=0
  "$deploy" "$@" >"$work/out.log" 2>&1 || status=$?
  [[ "$status" == 2 ]] || not_ok "exit code 2 for: $*"
}
expect_usage deploy --environment staging --tag latest
expect_usage deploy --environment dev --tag sha-2222222
expect_usage promote --environment staging
ok "unknown actions, environments and tags are usage errors"

echo "All $passed deploy tests passed."
