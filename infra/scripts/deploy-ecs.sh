#!/usr/bin/env bash
# Releases a version of TopFlow Hub to an environment built by infra/terraform, or rolls the
# environment back one step. Called by .github/workflows/deploy.yml with the environment's deploy
# role; it can also run from a workstation with the same permissions.
#
#   deploy-ecs.sh deploy   --environment staging --tag sha-1a2b3c4 [--registry ghcr.io/fasharif]
#   deploy-ecs.sh rollback --environment staging [--registry ghcr.io/fasharif]
#
# deploy
#   1. registers new revisions of the migrate, api and web task definitions with the new image tag;
#   2. runs the release step (environment preflight, then `prisma migrate deploy`) as a one-off
#      task and waits for it. If it fails, nothing else changes: the old version keeps serving;
#   3. updates the API service, waits until it is stable and checks that the new revision is the
#      one serving (the circuit breaker rolls a failed deployment back by itself);
#   4. does the same for the web service;
#   5. records the tags: previous = the old current, current = the new tag.
#
# rollback
#   Puts the previous release's images back on the API and web services, without the release step:
#   migrations are forward-only and additive (docs/OPERATIONS.md, section 3), so the previous
#   version runs on the newer schema. Then it swaps the recorded tags, so a second rollback returns
#   to the newer release.
#
# Requires the AWS CLI v2 and jq.
set -Eeuo pipefail

PROJECT="${PROJECT:-topflow-hub}"

usage() {
  cat <<'USAGE'
Usage: deploy-ecs.sh deploy   --environment staging|production --tag sha-<commit> [--registry REGISTRY]
       deploy-ecs.sh rollback --environment staging|production [--registry REGISTRY]
USAGE
}

fail() {
  echo "deploy: $*" >&2
  exit 1
}

say() { echo "deploy: $*"; }

summary() {
  echo "$*"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then echo "$*" >>"$GITHUB_STEP_SUMMARY"; fi
}

# The tag now serving, for the workflow's smoke test.
serving() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "release=$1" >>"$GITHUB_OUTPUT"; fi
}

action="${1:-}"
[[ "$action" == deploy || "$action" == rollback ]] || { usage >&2; exit 2; }
shift
environment="" tag="" registry="ghcr.io/fasharif"
while (($# > 0)); do
  case "$1" in
    --environment) environment="${2:-}"; shift 2 ;;
    --tag) tag="${2:-}"; shift 2 ;;
    --registry) registry="${2:-}"; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ "$environment" == staging || "$environment" == production ]] \
  || { echo "deploy: --environment must be staging or production" >&2; exit 2; }
if [[ "$action" == deploy && ! "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "deploy: --tag must be an image tag built by CI, such as sha-1a2b3c4" >&2
  exit 2
fi
for tool in aws jq; do
  command -v "$tool" >/dev/null || fail "$tool is not installed"
done

name="$PROJECT-$environment"
cluster="$name"
parameter_prefix="/$PROJECT/$environment/release"

get_release() {
  aws ssm get-parameter --name "$parameter_prefix/$1" --output json | jq -r '.Parameter.Value'
}

set_release() {
  aws ssm put-parameter --name "$parameter_prefix/$1" --value "$2" --type String --overwrite --output json >/dev/null
}

# Registers a copy of the family's latest task definition with a new image; prints the new ARN.
register_revision() {
  local app="$1" image="$2" input
  input="$(mktemp)"
  aws ecs describe-task-definition --task-definition "$name-$app" --output json \
    | jq --arg image "$image" '
        .taskDefinition
        | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
              .registeredAt, .registeredBy, .deregisteredAt)
        | .containerDefinitions[0].image = $image' >"$input"
  aws ecs register-task-definition --cli-input-json "file://$input" --output json \
    | jq -r '.taskDefinition.taskDefinitionArn'
  rm -f "$input"
}

run_release_step() {
  local definition="$1" network task_arn result exit_code
  network="$(aws ecs describe-services --cluster "$cluster" --services "$name-api" --output json \
    | jq -c '.services[0].networkConfiguration')"
  [[ -n "$network" && "$network" != null ]] || fail "could not read the network settings of $name-api"
  task_arn="$(aws ecs run-task --cluster "$cluster" --task-definition "$definition" --launch-type FARGATE \
    --count 1 --started-by "deploy-$tag" --network-configuration "$network" --output json \
    | jq -r '.tasks[0].taskArn // empty')"
  [[ -n "$task_arn" ]] || fail "ECS did not start the release step"
  say "release step started: $task_arn"
  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"
  result="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --output json)"
  exit_code="$(jq -r '.tasks[0].containers[0].exitCode // "none"' <<<"$result")"
  if [[ "$exit_code" != 0 ]]; then
    echo "deploy: the release step failed (exit code $exit_code: $(jq -r '.tasks[0].stoppedReason // "no reason given"' <<<"$result"))." >&2
    echo "deploy: last lines of /$PROJECT/$environment/migrate:" >&2
    aws logs get-log-events --log-group-name "/$PROJECT/$environment/migrate" \
      --log-stream-name "migrate/migrate/${task_arn##*/}" --limit 30 --output json 2>/dev/null \
      | jq -r '.events[].message' >&2 || true
    fail "nothing was changed; the running version keeps serving"
  fi
  say "release step finished: migrations are up to date"
}

roll_out() {
  local app="$1" definition="$2" primary
  say "updating $name-$app to ${definition##*/}"
  aws ecs update-service --cluster "$cluster" --service "$name-$app" --task-definition "$definition" --output json >/dev/null
  aws ecs wait services-stable --cluster "$cluster" --services "$name-$app"
  primary="$(aws ecs describe-services --cluster "$cluster" --services "$name-$app" --output json \
    | jq -r '.services[0].deployments[] | select(.status == "PRIMARY") | "\(.taskDefinition) \(.rolloutState)"')"
  [[ "$primary" == "$definition COMPLETED" ]] \
    || fail "the new $app version did not become healthy; ECS kept or restored the previous one ($primary)"
  say "$app is serving ${definition##*/}"
}

current="$(get_release current)"
previous="$(get_release previous)"

case "$action" in
  deploy)
    if [[ "$tag" == "$current" ]]; then
      summary "$tag is already the current $environment release; nothing to do."
      serving "$tag"
      exit 0
    fi
    say "deploying $tag to $environment (current: $current)"
    migrate_definition="$(register_revision migrate "$registry/$PROJECT-migrate:$tag")"
    api_definition="$(register_revision api "$registry/$PROJECT-api:$tag")"
    web_definition="$(register_revision web "$registry/$PROJECT-web:$tag")"
    run_release_step "$migrate_definition"
    roll_out api "$api_definition"
    roll_out web "$web_definition"
    set_release previous "$current"
    set_release current "$tag"
    summary "Deployed $tag to $environment (previous release: $current)."
    serving "$tag"
    ;;
  rollback)
    [[ -n "$previous" && "$previous" != none ]] || fail "no previous release is recorded for $environment"
    say "rolling $environment back from $current to $previous (no migrations run)"
    api_definition="$(register_revision api "$registry/$PROJECT-api:$previous")"
    web_definition="$(register_revision web "$registry/$PROJECT-web:$previous")"
    roll_out api "$api_definition"
    roll_out web "$web_definition"
    set_release previous "$current"
    set_release current "$previous"
    summary "Rolled $environment back to $previous (a second rollback returns to $current)."
    serving "$previous"
    ;;
esac
