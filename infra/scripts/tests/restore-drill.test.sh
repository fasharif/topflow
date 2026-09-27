#!/usr/bin/env bash
# End-to-end test of the restore drill with a synthetic backup and a throwaway key: it backs up a
# migrated and seeded database in the nightly format, then checks that the drill restores it, and
# that a wrong key, a damaged file and a missing table each make it fail.
#
#   infra/scripts/tests/restore-drill.test.sh --container SOURCE_CONTAINER --database DB [--image postgres:17]
#
# RESTORE_DRILL_PREFIX, when set, names the drill's disposable containers, as in restore-drill.sh.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts="$(dirname "$here")"
container="" database="" image="postgres:17"
while (($# > 0)); do
  case "$1" in
    --container) container="${2:?}"; shift 2 ;;
    --database) database="${2:?}"; shift 2 ;;
    --image) image="${2:?}"; shift 2 ;;
    *) echo "Usage: restore-drill.test.sh --container NAME --database DB [--image IMAGE]" >&2; exit 2 ;;
  esac
done
[[ -n "$container" && -n "$database" ]] || { echo "--container and --database are required" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
passed=0
ok() { passed=$((passed + 1)); echo "ok $passed - $1"; }
not_ok() { echo "not ok - $1" >&2; exit 1; }

# Expects the drill to fail with a message matching $1; the remaining arguments go to the drill.
expect_failure() {
  local pattern="$1"
  shift
  if "$scripts/restore-drill.sh" "$@" >"$work/out.log" 2>&1; then
    cat "$work/out.log" >&2
    not_ok "the drill should have failed ($pattern)"
  fi
  grep -Eq "$pattern" "$work/out.log" || { cat "$work/out.log" >&2; not_ok "expected an error matching: $pattern"; }
}

age-keygen -o "$work/key.txt" 2>/dev/null
recipient="$(age-keygen -y "$work/key.txt")"
"$scripts/make-test-backup.sh" --container "$container" --database "$database" \
  --recipient "$recipient" --out "$work/backup.tar.gz.age"
ok "a synthetic backup is written in the nightly format"

# The tables the demo seed fills. The drill's default list also requires audit_logs, which a live
# database always has but a freshly migrated and seeded one (CI's source) does not.
seeded_tables="users,organizations,products,quote_requests,quotations,orders"
"$scripts/restore-drill.sh" --backup "$work/backup.tar.gz.age" --identity "$work/key.txt" \
  --image "$image" --require "$seeded_tables" --report "$work/report.md"
grep -q '^### Restore drill: passed' "$work/report.md" || not_ok "the report is missing"
grep -Eq '^\| \*\*Total\*\* \| \*\*[0-9]+\.[0-9]\*\* \|$' "$work/report.md" || not_ok "the report has no total time"
ok "the drill restores the backup, matches every row count and reports the time"

age-keygen -o "$work/other-key.txt" 2>/dev/null
expect_failure 'could not decrypt' --backup "$work/backup.tar.gz.age" --identity "$work/other-key.txt" --image "$image"
ok "a different key cannot read the backup"

size=$(wc -c <"$work/backup.tar.gz.age")
head -c $((size / 2)) "$work/backup.tar.gz.age" >"$work/damaged.tar.gz.age"
expect_failure 'could not decrypt' --backup "$work/damaged.tar.gz.age" --identity "$work/key.txt" --image "$image"
ok "a damaged backup is refused"

expect_failure 'no rows restored for: no_such_table' --backup "$work/backup.tar.gz.age" --identity "$work/key.txt" \
  --image "$image" --require users,no_such_table
ok "a table the backup does not contain fails the drill"

expect_failure 'Usage' --backup "$work/backup.tar.gz.age"
ok "a missing key is a usage error"

leftover="$(docker ps --all --quiet --filter "name=${RESTORE_DRILL_PREFIX:-topflow-restore-drill}-")"
[[ -z "$leftover" ]] || not_ok "restore containers were left behind: $leftover"
ok "every disposable container was removed"

echo "All $passed restore drill tests passed."
