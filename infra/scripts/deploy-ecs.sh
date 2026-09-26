#!/usr/bin/env bash
# Releases a version of TopFlow Hub to an environment built by infra/terraform, rolls it back or
# restarts it. Called by .github/workflows/deploy.yml with the environment's deploy role; it can
# also run from a workstation with the same permissions.
#
#   deploy-ecs.sh deploy   --environment staging --tag sha-1a2b3c4 [--digest APP=sha256:...]... [--registry REGISTRY]
#   deploy-ecs.sh rollback --environment staging [--tag sha-0a1b2c3] [--digest APP=sha256:...]... [--registry REGISTRY]
#   deploy-ecs.sh restart  --environment staging
#   deploy-ecs.sh status   --environment staging
#
# --digest pins an image to the digest the Deploy workflow verified (APP is api, web or migrate), so
# a tag that is moved later cannot change what a task definition runs.
#
# deploy
#   1. registers new revisions of the migrate, api and web task definitions with the new images;
#   2. runs the release step (environment preflight, then `prisma migrate deploy`) as a one-off
#      task and waits for it. If it fails, nothing else changes: the old version keeps serving;
#   3. updates the API service, waits until it is stable and checks that the new revision is the
#      one serving (the circuit breaker rolls a failed deployment back by itself);
#   4. does the same for the web service. If the web app fails, the API is put back on the revision
#      it served before, so both services run the same release again;
#   5. records the tags: previous = the old current, current = the new tag.
#   A service with no tasks (Terraform creates them with a desired count of 0, so nothing starts
#   before the first release step) is started with its auto scaling minimum.
#
# rollback
#   Without --tag, when both services run the recorded current release: puts the previous release's
#   images back on both, without the release step, and swaps the recorded tags, so a second
#   rollback returns to the newer release. When they do not (a deploy that stopped half-way, such
#   as a cancelled run), it puts the current release back on both and leaves the tags alone.
#   With --tag: puts that release on both services and records it as current.
#   Migrations are forward-only and additive (docs/OPERATIONS.md, section 3), so an older version
#   runs on the newer schema.
#
# restart
#   Starts new tasks of the revisions that are serving and waits until they are healthy, for
#   example after a secret changed in SSM: tasks read their secrets when they start.
#
# status
#   Prints the recorded releases, the release each service runs and what a rollback would restore.
#
# Requires bash 4+, the AWS CLI v2 and jq.
set -Eeuo pipefail

PROJECT="${PROJECT:-topflow-hub}"

usage() {
  cat <<'USAGE'
Usage: deploy-ecs.sh deploy   --environment staging|production --tag sha-<commit> [--digest APP=sha256:<hex>]... [--registry REGISTRY]
       deploy-ecs.sh rollback --environment staging|production [--tag sha-<commit>] [--digest APP=sha256:<hex>]... [--registry REGISTRY]
       deploy-ecs.sh restart  --environment staging|production
       deploy-ecs.sh status   --environment staging|production
USAGE
}

usage_error() {
  echo "deploy: $*" >&2
  exit 2
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

# A step output for the workflow (the tag now serving, for the smoke test; the status fields).
output() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "$1=$2" >>"$GITHUB_OUTPUT"; fi
}

action="${1:-}"
[[ "$action" =~ ^(deploy|rollback|restart|status)$ ]] || { usage >&2; exit 2; }
shift
environment="" tag="" registry="ghcr.io/fasharif"
declare -A digests=()
while (($# > 0)); do
  case "$1" in
    --environment) environment="${2:-}"; shift 2 ;;
    --tag) tag="${2:-}"; shift 2 ;;
    --registry) registry="${2:-}"; shift 2 ;;
    --digest)
      [[ "${2:-}" =~ ^(api|web|migrate)=(sha256:[0-9a-f]{64})$ ]] \
        || usage_error "--digest must look like api=sha256:<64 hex digits>, not '${2:-}'"
      digests[${BASH_REMATCH[1]}]="${BASH_REMATCH[2]}"
      shift 2
      ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ "$environment" == staging || "$environment" == production ]] || usage_error "--environment must be staging or production"
case "$action" in
  deploy)
    [[ "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]] || usage_error "--tag must be an image tag built by CI, such as sha-1a2b3c4"
    ;;
  rollback)
    [[ -z "$tag" || "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]] || usage_error "--tag must be an image tag built by CI, such as sha-1a2b3c4"
    ;;
  restart | status)
    [[ -z "$tag" && ${#digests[@]} == 0 ]] || usage_error "$action takes no --tag or --digest"
    ;;
esac
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

# registry/topflow-hub-APP:TAG, pinned to the verified digest when one was given.
image_ref() {
  local app="$1" release="$2" ref
  ref="$registry/$PROJECT-$app:$release"
  if [[ -n "${digests[$app]:-}" ]]; then ref+="@${digests[$app]}"; fi
  echo "$ref"
}

describe_service() {
  aws ecs describe-services --cluster "$cluster" --services "$name-$1" --output json
}

# The task definition of the service's primary deployment: the revision that serves.
serving_definition() {
  local definition
  definition="$(describe_service "$1" | jq -r '[.services[0].deployments[] | select(.status == "PRIMARY")][0].taskDefinition // empty')"
  [[ -n "$definition" ]] || fail "could not read the serving revision of $name-$1"
  echo "$definition"
}

# The release tag of a task definition's image (registry/name:tag, optionally @sha256:...).
release_of() {
  aws ecs describe-task-definition --task-definition "$1" --output json \
    | jq -r '.taskDefinition.containerDefinitions[0].image | sub("@sha256:[0-9a-f]+$"; "") | sub("^.*:"; "")'
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
  local definition="$1" started_by="$2" network task_arn result exit_code
  network="$(describe_service api | jq -c '.services[0].networkConfiguration')"
  [[ -n "$network" && "$network" != null ]] || fail "could not read the network settings of $name-api"
  task_arn="$(aws ecs run-task --cluster "$cluster" --task-definition "$definition" --launch-type FARGATE \
    --count 1 --started-by "$started_by" --network-configuration "$network" --output json \
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

# Puts a service on a task definition (with --force, starts new tasks of it) and waits until that
# revision serves. Returns 1, without exiting, when ECS kept or restored another revision, so the
# caller can put things back. `set -e` does not apply inside a function called with `||`, so every
# command checks its own result.
roll_out() {
  local app="$1" definition="$2" force="${3:-}" service="$name-$1" desired minimum primary
  local args=(--cluster "$cluster" --service "$service" --task-definition "$definition")
  [[ "$force" == --force ]] && args+=(--force-new-deployment)
  desired="$(describe_service "$app" | jq -r '.services[0].desiredCount')" || return 1
  if [[ "$desired" == 0 ]]; then
    minimum="$(aws application-autoscaling describe-scalable-targets --service-namespace ecs \
      --resource-ids "service/$cluster/$service" --output json | jq -r '.ScalableTargets[0].MinCapacity // 1')" || return 1
    args+=(--desired-count "$minimum")
    say "$app has no tasks yet: starting $minimum (its auto scaling minimum)"
  fi
  say "updating $service to ${definition##*/}${force:+ (new tasks)}"
  aws ecs update-service "${args[@]}" --output json >/dev/null || return 1
  if ! aws ecs wait services-stable --cluster "$cluster" --services "$service"; then
    echo "deploy: $service did not become stable in time" >&2
    return 1
  fi
  primary="$(describe_service "$app" \
    | jq -r '.services[0].deployments[] | select(.status == "PRIMARY") | "\(.taskDefinition) \(.rolloutState)"')" || return 1
  if [[ "$primary" != "$definition COMPLETED" ]]; then
    echo "deploy: the new $app version did not become healthy; ECS kept or restored the previous one ($primary)" >&2
    return 1
  fi
  say "$app is serving ${definition##*/}"
}

current="$(get_release current)"
previous="$(get_release previous)"

# The release each service runs, and what a rollback without --tag restores.
serving_releases() {
  local api_definition web_definition
  api_definition="$(serving_definition api)"
  web_definition="$(serving_definition web)"
  api_release="$(release_of "$api_definition")"
  web_release="$(release_of "$web_definition")"
  if [[ "$api_release" != "$current" || "$web_release" != "$current" ]]; then
    rollback_target="$current"
    rollback_reason="the services do not both run the recorded current release $current (api: $api_release, web: $web_release), so the last deploy did not finish"
  else
    rollback_target="$previous"
    rollback_reason="both services run $current"
  fi
}

case "$action" in
  deploy)
    if [[ "$tag" == "$current" ]]; then
      summary "$tag is already the current $environment release; nothing to do (restart starts new tasks of it)."
      output release "$tag"
      exit 0
    fi
    say "deploying $tag to $environment (current: $current)"
    api_before="$(serving_definition api)"
    migrate_definition="$(register_revision migrate "$(image_ref migrate "$tag")")"
    api_definition="$(register_revision api "$(image_ref api "$tag")")"
    web_definition="$(register_revision web "$(image_ref web "$tag")")"
    run_release_step "$migrate_definition" "deploy-$tag"
    roll_out api "$api_definition" \
      || fail "the API stays on ${api_before##*/} and the web app was not changed; $current keeps serving"
    if ! roll_out web "$web_definition"; then
      if roll_out api "$api_before"; then
        fail "the web app did not become healthy, so the API was put back on ${api_before##*/}: both services run $current again. The migrations of $tag stay applied (they are additive)."
      fi
      fail "the web app did not become healthy, and putting the API back on ${api_before##*/} failed too. Run the rollback action: it puts $current back on both services."
    fi
    set_release previous "$current"
    set_release current "$tag"
    summary "Deployed $tag to $environment (previous release: $current)."
    output release "$tag"
    ;;

  rollback)
    serving_releases
    if [[ -n "$tag" ]]; then
      target="$tag"
      say "rolling $environment to $tag as asked (api: $api_release, web: $web_release; no migrations run)"
    else
      target="$rollback_target"
      [[ -n "$target" && "$target" != none ]] || fail "nothing to roll back to: no release is recorded for $environment ($rollback_reason)"
      say "$rollback_reason: rolling $environment to $target (no migrations run)"
    fi
    api_definition="$(register_revision api "$(image_ref api "$target")")"
    web_definition="$(register_revision web "$(image_ref web "$target")")"
    roll_out api "$api_definition" \
      || fail "the API did not become healthy on $target and runs $api_release again; the web app was not changed"
    roll_out web "$web_definition" \
      || fail "the web app did not become healthy on $target and runs $web_release, while the API runs $target. Run rollback --tag $target to try again, or rollback to put $current back on both."
    if [[ "$target" != "$current" ]]; then
      set_release previous "$current"
      set_release current "$target"
      summary "Rolled $environment back to $target (a rollback without --tag returns to $current)."
    else
      summary "Put $current back on both $environment services; the recorded releases are unchanged."
    fi
    output release "$target"
    ;;

  restart)
    [[ "$current" != none ]] || fail "nothing has been released to $environment yet"
    for app in api web; do
      definition="$(serving_definition "$app")"
      roll_out "$app" "$definition" --force || fail "new $app tasks did not become healthy; ECS keeps the ones that were running"
    done
    summary "Restarted the $environment services on $current."
    output release "$current"
    ;;

  status)
    serving_releases
    for field in current previous; do
      echo "$field=${!field}"
      output "$field" "${!field}"
    done
    echo "api=$api_release"
    echo "web=$web_release"
    echo "rollback_target=$rollback_target"
    output api "$api_release"
    output web "$web_release"
    output rollback_target "$rollback_target"
    ;;
esac
