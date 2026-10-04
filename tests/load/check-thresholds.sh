#!/usr/bin/env bash
# Checks, without a running stack, that the k6 load profile turns every p95 target in
# load/targets.json into a threshold that fails the run (scripts/k6-thresholds.mts). CI runs this
# because it runs only the smoke profile, whose timings are not gated.
set -euo pipefail
# shellcheck source=../scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/common.sh"

compose run --rm --no-deps -T k6 inspect -e K6_PROFILE=load api-load.ts |
  node "$TESTS_DIR/scripts/k6-thresholds.mts"
