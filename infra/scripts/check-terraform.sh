#!/usr/bin/env bash
# Static checks and tests of infra/terraform, all in containers, so neither a developer machine nor
# CI needs Terraform, tflint or Trivy installed. The same script runs locally and in
# .github/workflows/infra.yml.
#
#   0. every root's *.tf files are visible inside the containers (a mount Docker cannot read would
#      otherwise let every later step pass on an empty directory)
#   1. terraform fmt -check
#   2. terraform init (no backend) and validate, for every root and the module
#   3. terraform test, against a mocked AWS provider (no credentials); the number of passed runs
#      must equal the number of `run` blocks in the test files
#   4. tflint with the AWS ruleset
#   5. Trivy misconfiguration scan; any finding not explained next to its resource fails
#
# Terraform's working data (.terraform: modules and provider links) goes to a Docker volume, not
# into the working tree, where its container-only links could not be deleted from Windows.
#
# Environment: CACHE_PREFIX names the Docker volumes that cache providers, plugins, Terraform's
# working data and the Trivy database (default topflow-hub). GITHUB_TOKEN, when set, lifts
# GitHub's rate limit for the tflint plugin download.
set -Eeuo pipefail

TERRAFORM_IMAGE="${TERRAFORM_IMAGE:-public.ecr.aws/hashicorp/terraform:1.16.4}"
TFLINT_IMAGE="${TFLINT_IMAGE:-ghcr.io/terraform-linters/tflint:v0.64.0}"
TRIVY_IMAGE="${TRIVY_IMAGE:-ghcr.io/aquasecurity/trivy:0.74.0}"
cache="${CACHE_PREFIX:-topflow-hub}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
mount="$root"
# Git Bash on Windows: Docker needs a Windows path, and MSYS must not rewrite container paths.
if command -v cygpath >/dev/null; then
  mount="$(cygpath -w "$root")"
  export MSYS_NO_PATHCONV=1
fi

roots=(bootstrap environments/staging environments/production modules/hub)

terraform() {
  local dir="$1"
  shift
  docker run --rm --memory 1g --env TF_IN_AUTOMATION=1 --env TF_PLUGIN_CACHE_DIR=/plugins \
    --env TF_DATA_DIR="/tfdata/${dir//\//-}" --volume "$cache-terraform-data:/tfdata" \
    --volume "$cache-terraform-plugins:/plugins" --volume "$mount:/tf" --workdir "/tf/$dir" \
    "$TERRAFORM_IMAGE" "$@"
}

tflint() {
  docker run --rm --memory 512m --env TFLINT_PLUGIN_DIR=/plugins --env GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
    --volume "$cache-tflint-plugins:/plugins" --volume "$mount:/data" --workdir /data \
    "$TFLINT_IMAGE" "$@"
}

echo "== files visible to Docker"
for dir in "${roots[@]}"; do
  docker run --rm --entrypoint sh --volume "$mount:/tf:ro" "$TERRAFORM_IMAGE" \
    -c 'ls /tf/"$1"/*.tf >/dev/null 2>&1' sh "$dir" ||
    { echo "No *.tf files in $dir inside the container: Docker cannot read $root." >&2; exit 1; }
done

echo "== terraform fmt"
terraform . fmt -check -recursive -diff

for dir in "${roots[@]}"; do
  echo "== terraform validate: $dir"
  terraform "$dir" init -backend=false -input=false -lockfile=readonly -no-color >/dev/null
  terraform "$dir" validate -no-color
done

for dir in bootstrap modules/hub; do
  echo "== terraform test: $dir"
  expected="$(cat "$root/$dir"/tests/*.tftest.hcl | grep -c '^run "')"
  if ! output="$(terraform "$dir" test -no-color 2>&1)"; then
    echo "$output"
    exit 1
  fi
  echo "$output"
  grep -q "Success! $expected passed, 0 failed" <<<"$output" ||
    { echo "Expected $expected passed runs in $dir." >&2; exit 1; }
done

echo "== tflint"
tflint --init >/dev/null
tflint --recursive --format compact

echo "== trivy config"
docker run --rm --memory 1g --volume "$cache-trivy-cache:/root/.cache/trivy" --volume "$mount:/src:ro" \
  "$TRIVY_IMAGE" config --quiet --exit-code 1 --severity LOW,MEDIUM,HIGH,CRITICAL \
  --skip-dirs '**/.terraform' /src

echo "All Terraform checks passed."
