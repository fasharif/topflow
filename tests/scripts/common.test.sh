#!/usr/bin/env bash
# Unit tests of the helpers in common.sh that guard the test scripts: bash tests/scripts/common.test.sh
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

failures=0
check() {
  local expected="$1" url="$2" actual=remote
  if is_local_url "$url"; then actual=local; fi
  if [[ "$actual" == "$expected" ]]; then
    echo "ok      $expected  $url"
  else
    echo "FAILED  expected $expected, got $actual: $url"
    failures=$((failures + 1))
  fi
}

# The stacks the system tests start on a developer machine or a CI runner.
check local http://localhost:3000
check local http://localhost:3000/
check local http://127.0.0.1:54321
check local http://127.0.0.1:54321/auth/v1
check local 'http://[::1]:3000/docs-json'
check local http://host.docker.internal:3000
check local http://api.localhost:3000
check local HTTP://LOCALHOST:3000
check local http://localhost

# Anything else, including names that only start or end like a local one.
check remote https://topflow-demo.example
check remote https://abcdefgh.supabase.co
check remote http://localhost.example.com:3000
check remote http://127.0.0.1.nip.io:3000
check remote http://evil.example/localhost
check remote 'http://localhost@evil.example:3000'
check remote http://10.0.0.5:3000
check remote ''

if ((failures > 0)); then
  echo "$failures check(s) failed." >&2
  exit 1
fi
