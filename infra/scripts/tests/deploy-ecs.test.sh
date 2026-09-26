#!/usr/bin/env bash
# Tests of deploy-ecs.sh against a fake AWS CLI (tests/fake-aws): the order of a release, a failed
# release step, deployments the circuit breaker rolled back (API or web app), rollbacks after a
# finished and an unfinished deploy, restarts, digest pinning, the first release of an environment
# and argument checks. Needs bash and jq; no AWS account.
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
  [[ -f "$work/out.log" ]] && sed 's/^/  out: /' "$work/out.log" >&2
  [[ -f "$FAKE_AWS_LOG" ]] && sed 's/^/  aws /' "$FAKE_AWS_LOG" >&2
  exit 1
}

# A fresh fake account whose services run the current release ($1), with $2 recorded as previous.
fresh() {
  export FAKE_AWS_STATE="$work/state-$RANDOM$RANDOM" FAKE_AWS_LOG="$work/calls-$RANDOM$RANDOM.log"
  mkdir -p "$FAKE_AWS_STATE"
  : >"$FAKE_AWS_LOG"
  printf '%s' "$1" >"$FAKE_AWS_STATE/param__topflow-hub_staging_release_current_"
  printf '%s' "$2" >"$FAKE_AWS_STATE/param__topflow-hub_staging_release_previous_"
  for app in api web migrate; do
    printf 'ghcr.io/fasharif/topflow-hub-%s:%s\n' "$app" "$1" >"$FAKE_AWS_STATE/image_topflow-hub-staging-${app}_1"
  done
  unset FAKE_MIGRATION_EXIT FAKE_ROLLOUT_STATE FAKE_FAILING_SERVICES FAKE_MIN_CAPACITY
}
release() { cat "$FAKE_AWS_STATE/param__topflow-hub_staging_release_$1_"; }
line_of() { grep -n -m1 -- "$1" "$FAKE_AWS_LOG" | cut -d: -f1; }
count() { grep -c -- "$1" "$FAKE_AWS_LOG" || true; }
image_of() { jq -r '.containerDefinitions[0].image' "$FAKE_AWS_STATE/registered_topflow-hub-staging-$1.json"; }
# The image of the revision a service serves.
serving_image() {
  local definition
  definition="$(cat "$FAKE_AWS_STATE/service_topflow-hub-staging-$1" 2>/dev/null || echo "x:1")"
  cat "$FAKE_AWS_STATE/image_topflow-hub-staging-$1_${definition##*:}"
}
# Makes a service serve a new revision with the given image, as a deploy that stopped half-way would.
serve() {
  local family="topflow-hub-staging-$1"
  echo 2 >"$FAKE_AWS_STATE/revision_$family"
  echo "$2" >"$FAKE_AWS_STATE/image_${family}_2"
  echo "arn:aws:ecs:ap-south-1:123456789012:task-definition/$family:2" >"$FAKE_AWS_STATE/service_$family"
}
run() { "$deploy" "$@" >"$work/out.log" 2>&1; }

# ── deploy ─────────────────────────────────────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
run deploy --environment staging --tag sha-2222222 || not_ok "a normal deploy succeeds"
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
[[ "$(serving_image api)" == *:sha-2222222 && "$(serving_image web)" == *:sha-2222222 ]] || not_ok "both services serve the new release"
ok "the new release is recorded as current and the old one as previous"

fresh sha-1111111 sha-0000000
GITHUB_OUTPUT="$work/github-output" "$deploy" deploy --environment staging --tag sha-3333333 >/dev/null
grep -qx 'release=sha-3333333' "$work/github-output" || not_ok "the serving release is a step output"
ok "the workflow learns which release to smoke-test"

# ── digests ────────────────────────────────────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
api_digest="sha256:$(printf 'a%.0s' {1..64})"
web_digest="sha256:$(printf 'b%.0s' {1..64})"
migrate_digest="sha256:$(printf 'c%.0s' {1..64})"
run deploy --environment staging --tag sha-2222222 --digest "api=$api_digest" --digest "web=$web_digest" --digest "migrate=$migrate_digest" \
  || not_ok "a deploy with digests succeeds"
[[ "$(image_of api)" == "ghcr.io/fasharif/topflow-hub-api:sha-2222222@$api_digest" ]] || not_ok "the API image is pinned to its digest"
[[ "$(image_of migrate)" == "ghcr.io/fasharif/topflow-hub-migrate:sha-2222222@$migrate_digest" ]] || not_ok "the release step is pinned too"
GITHUB_OUTPUT="$work/status-output" "$deploy" status --environment staging >"$work/out.log"
grep -qx 'api=sha-2222222' "$work/out.log" || not_ok "status reads the tag of a pinned image"
ok "verified digests pin every image, and the tag stays readable"

# ── a failing release step ─────────────────────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
export FAKE_MIGRATION_EXIT=1
if run deploy --environment staging --tag sha-2222222; then not_ok "a failed release step fails the deploy"; fi
grep -q "the release step failed (exit code 1" "$work/out.log" || not_ok "the failure is explained"
grep -q "P1001: Can't reach database server" "$work/out.log" || not_ok "the release step's log is shown"
[[ "$(count "ecs update-service")" == 0 ]] || not_ok "no service changes after a failed release step"
[[ "$(release current)" == sha-1111111 ]] || not_ok "the recorded release stays"
ok "a failed release step stops the deploy before any service changes"

# ── the circuit breaker rolled the API back ────────────────────────────────────────────────────
fresh sha-1111111 sha-0000000
export FAKE_FAILING_SERVICES=topflow-hub-staging-api
if run deploy --environment staging --tag sha-2222222; then not_ok "an unhealthy API fails the deploy"; fi
grep -q "the new api version did not become healthy" "$work/out.log" || not_ok "the failure names the API"
[[ "$(count "service topflow-hub-staging-web")" == 0 ]] || not_ok "the web app is left alone"
[[ "$(release current)" == sha-1111111 ]] || not_ok "the recorded release stays"
ok "an API that never becomes healthy fails the deploy and leaves the web app alone"

# ── the circuit breaker rolled the web app back: the API goes back too ─────────────────────────
fresh sha-1111111 sha-0000000
export FAKE_FAILING_SERVICES=topflow-hub-staging-web
if run deploy --environment staging --tag sha-2222222; then not_ok "an unhealthy web app fails the deploy"; fi
grep -q "the API was put back on topflow-hub-staging-api:1: both services run sha-1111111 again" "$work/out.log" \
  || not_ok "the failure says both services run the current release again"
[[ "$(serving_image api)" == ghcr.io/fasharif/topflow-hub-api:sha-1111111 ]] || not_ok "the API serves the current release again"
[[ "$(serving_image web)" == ghcr.io/fasharif/topflow-hub-web:sha-1111111 ]] || not_ok "the web app serves the current release"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == sha-0000000 ]] || not_ok "the recorded releases stay"
ok "when the web app fails, the API returns to its previous revision and the releases stay recorded"

unset FAKE_FAILING_SERVICES
GITHUB_OUTPUT="$work/status-output" "$deploy" status --environment staging >"$work/out.log"
grep -qx 'rollback_target=sha-0000000' "$work/out.log" || not_ok "after the API returned, a rollback goes one release back, not two"
ok "the environment is consistent again: a rollback would go one release back"

# ── rollback ───────────────────────────────────────────────────────────────────────────────────
fresh sha-2222222 sha-1111111
run rollback --environment staging || not_ok "a rollback succeeds"
[[ "$(image_of api)" == ghcr.io/fasharif/topflow-hub-api:sha-1111111 ]] || not_ok "the API gets the previous image"
[[ "$(image_of web)" == ghcr.io/fasharif/topflow-hub-web:sha-1111111 ]] || not_ok "the web app gets the previous image"
[[ "$(count "ecs run-task")" == 0 ]] || not_ok "a rollback runs no migrations"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == sha-2222222 ]] || not_ok "the releases are swapped"
ok "a rollback restores the previous images in one step, without migrations"

fresh sha-2222222 none
if run rollback --environment staging; then not_ok "a rollback without a previous release fails"; fi
grep -q "nothing to roll back to: no release is recorded for staging" "$work/out.log" || not_ok "the failure is explained"
ok "a rollback needs a recorded previous release"

# A deploy that stopped after the API (a cancelled run): the API runs the new release, the web app
# the old one, and the recorded current release is still the old one.
fresh sha-1111111 sha-0000000
serve api ghcr.io/fasharif/topflow-hub-api:sha-2222222
GITHUB_OUTPUT="$work/status-output" "$deploy" status --environment staging >"$work/out.log"
for expected in api=sha-2222222 web=sha-1111111 rollback_target=sha-1111111; do
  grep -qx "$expected" "$work/out.log" || not_ok "status explains the half-finished deploy ($expected)"
done
grep -qx 'rollback_target=sha-1111111' "$work/status-output" || not_ok "the rollback target is a step output"
run rollback --environment staging || not_ok "a rollback after an unfinished deploy succeeds"
grep -q "the last deploy did not finish" "$work/out.log" || not_ok "it says why"
[[ "$(serving_image api)" == ghcr.io/fasharif/topflow-hub-api:sha-1111111 ]] || not_ok "the API returns to the current release"
[[ "$(serving_image web)" == ghcr.io/fasharif/topflow-hub-web:sha-1111111 ]] || not_ok "the web app runs the current release"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == sha-0000000 ]] || not_ok "the recorded releases stay"
ok "after an unfinished deploy, a rollback puts the current release back on both services, not an older one"

fresh sha-3333333 sha-2222222
run rollback --environment staging --tag sha-1111111 || not_ok "a rollback to a named release succeeds"
[[ "$(serving_image api)" == *:sha-1111111 && "$(serving_image web)" == *:sha-1111111 ]] || not_ok "both services run the named release"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == sha-3333333 ]] || not_ok "the named release is recorded as current"
[[ "$(count "ecs run-task")" == 0 ]] || not_ok "no migrations"
ok "rollback --tag returns both services to a named release"

# ── restart ────────────────────────────────────────────────────────────────────────────────────
fresh sha-2222222 sha-1111111
GITHUB_OUTPUT="$work/github-output-restart" run restart --environment staging || not_ok "a restart succeeds"
[[ "$(count "update-service --cluster topflow-hub-staging --service topflow-hub-staging-api --task-definition arn:aws:ecs:ap-south-1:123456789012:task-definition/topflow-hub-staging-api:1 --force-new-deployment")" == 1 ]] \
  || not_ok "the API gets new tasks of the revision it serves"
[[ "$(sort "$FAKE_AWS_STATE/restarted" | tr '\n' ' ')" == "topflow-hub-staging-api topflow-hub-staging-web " ]] || not_ok "both services restart"
[[ "$(count "register-task-definition")" == 0 && "$(count "ecs run-task")" == 0 ]] || not_ok "no new revisions, no migrations"
[[ "$(release current)" == sha-2222222 && "$(release previous)" == sha-1111111 ]] || not_ok "the recorded releases stay"
ok "a restart starts new tasks of the serving revisions, for example after a secret changed"

# ── the first release of a new environment ─────────────────────────────────────────────────────
fresh none none
for app in api web; do echo 0 >"$FAKE_AWS_STATE/desired_topflow-hub-staging-$app"; done
export FAKE_MIN_CAPACITY=2
run deploy --environment staging --tag sha-1111111 || not_ok "the first deploy succeeds"
grep -q -- "--service topflow-hub-staging-api --task-definition .*:2 --desired-count 2" "$FAKE_AWS_LOG" \
  || not_ok "the API starts with its auto scaling minimum"
[[ "$(cat "$FAKE_AWS_STATE/desired_topflow-hub-staging-web")" == 2 ]] || not_ok "the web app starts too"
[[ "$(line_of "ecs run-task")" -lt "$(line_of "desired-count")" ]] || not_ok "no task starts before the release step"
[[ "$(release current)" == sha-1111111 && "$(release previous)" == none ]] || not_ok "the first release is recorded"
ok "the first release migrates, then starts the services Terraform created without tasks"

# ── nothing to do ──────────────────────────────────────────────────────────────────────────────
fresh sha-2222222 sha-1111111
run deploy --environment staging --tag sha-2222222 || not_ok "deploying the current release succeeds"
grep -q "already the current staging release" "$work/out.log" || not_ok "it says so"
[[ "$(count "ecs ")" == 0 ]] || not_ok "no ECS calls"
ok "deploying the current release again changes nothing"

# ── arguments ──────────────────────────────────────────────────────────────────────────────────
expect_usage() {
  local status=0
  "$deploy" "$@" >"$work/out.log" 2>&1 || status=$?
  [[ "$status" == 2 ]] || not_ok "exit code 2 for: $*"
}
expect_usage deploy --environment staging --tag latest
expect_usage deploy --environment dev --tag sha-2222222
expect_usage deploy --environment staging --tag sha-2222222 --digest api=sha256:1234
expect_usage deploy --environment staging --tag sha-2222222 --digest worker=sha256:"$(printf 'a%.0s' {1..64})"
expect_usage rollback --environment staging --tag develop
expect_usage restart --environment staging --tag sha-2222222
expect_usage promote --environment staging
ok "unknown actions, environments, tags and malformed digests are usage errors"

echo "All $passed deploy tests passed."
