#!/usr/bin/env bash
# Timed restore drill for the encrypted nightly database backups (.github/workflows/backup.yml).
#
# Decrypts a backup with age, restores it into a disposable PostgreSQL container exactly as
# docs/OPERATIONS.md (section 4) describes, checks that every table holds as many rows as the dump
# contains, and reports how long each step took. Nothing outside the throwaway container is touched,
# and the container is removed afterwards (unless --keep).
#
#   infra/scripts/restore-drill.sh --backup topflow-hub-db-<timestamp>.tar.gz.age \
#     --identity topflow-hub-backup-key.txt [--image IMAGE] [--require users,orders] [--report drill.md]
#
# Requirements: bash 5, docker, age, tar, awk.
set -Eeuo pipefail

readonly DEFAULT_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.167"
readonly DEFAULT_REQUIRED="users,organizations,products,quote_requests,quotations,orders,audit_logs"

usage() {
  cat <<'USAGE'
Usage: restore-drill.sh --backup FILE.tar.gz.age --identity KEY.txt [options]

  --backup FILE     encrypted backup produced by the nightly workflow
  --identity FILE   age private key (the offline half of BACKUP_AGE_RECIPIENT)
  --image IMAGE     PostgreSQL image to restore into. Default: the Supabase Postgres image
                    (Supabase dumps expect its roles and extensions); plain dumps can use postgres:17
  --db-user USER    database user for the restore (default: postgres)
  --require LIST    comma-separated tables that must hold rows (default: the platform's core
                    tables; "" checks none)
  --report FILE     also write the result as Markdown to FILE
  --keep            keep the restored container for inspection
  -h, --help        show this help

Environment: RESTORE_DRILL_IMAGE sets the default image; RESTORE_DRILL_PREFIX names the disposable
container (default topflow-restore-drill), so parallel runs on a shared Docker host stay apart.
USAGE
}

fail() {
  echo "restore drill: $*" >&2
  exit 1
}

backup="" identity="" image="${RESTORE_DRILL_IMAGE:-$DEFAULT_IMAGE}" db_user="postgres"
required="$DEFAULT_REQUIRED" report="" keep=false
while (($# > 0)); do
  case "$1" in
    --backup) backup="${2:?--backup needs a file}"; shift 2 ;;
    --identity) identity="${2:?--identity needs a file}"; shift 2 ;;
    --image) image="${2:?--image needs an image}"; shift 2 ;;
    --db-user) db_user="${2:?--db-user needs a name}"; shift 2 ;;
    --require) required="${2?--require needs a list}"; shift 2 ;;
    --report) report="${2:?--report needs a file}"; shift 2 ;;
    --keep) keep=true; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[[ -n "$backup" && -n "$identity" ]] || { usage >&2; exit 2; }
[[ -f "$backup" ]] || fail "backup file $backup does not exist"
[[ -f "$identity" ]] || fail "identity file $identity does not exist"
for tool in docker age tar awk; do
  command -v "$tool" >/dev/null || fail "$tool is not installed (age: https://github.com/FiloSottile/age, or 'apt-get install age')"
done
((BASH_VERSINFO[0] >= 5)) || fail "bash 5 or later is required (for EPOCHREALTIME)"

# Milliseconds since the epoch, from bash's microsecond clock.
now_ms() {
  local micros="${EPOCHREALTIME/[.,]/}"
  echo $((micros / 1000))
}
seconds() { printf '%d.%01d' $(($1 / 1000)) $((($1 % 1000) / 100)); }

workdir="$(mktemp -d)"
container="${RESTORE_DRILL_PREFIX:-topflow-restore-drill}-$$-$RANDOM"
password="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
# shellcheck disable=SC2317,SC2329 # called by the EXIT trap below (SC2317 before ShellCheck 0.11, SC2329 since)
cleanup() {
  if [[ "$keep" == false ]]; then
    docker rm --force "$container" >/dev/null 2>&1 || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT

psql_in_container() {
  docker exec --env PGPASSWORD="$password" "$container" \
    psql --no-psqlrc --quiet --host 127.0.0.1 --username "$db_user" --dbname postgres --set ON_ERROR_STOP=1 "$@"
}

started=$(now_ms)
echo "Restore drill: $(basename "$backup") into $image"

# 1. Decrypt and unpack. age refuses a wrong key or a damaged file.
step=$(now_ms)
age --decrypt --identity "$identity" "$backup" | tar -xzf - -C "$workdir" \
  || fail "could not decrypt and unpack $backup (wrong key, or a damaged file)"
for file in roles schema data; do
  [[ -f "$workdir/$file.sql" ]] || fail "the backup has no $file.sql"
done
[[ -s "$workdir/schema.sql" && -s "$workdir/data.sql" ]] || fail "schema.sql or data.sql is empty"
decrypt_ms=$(($(now_ms) - step))

# Rows per table in the dump: COPY blocks hold one row per line up to a line with "\.".
awk '
  /^COPY [^ ]+ .* FROM stdin;$/ { name = $2; gsub(/"/, "", name); rows = 0; copying = 1; next }
  copying && $0 == "\\." { split(name, part, "."); print part[1] "\t" part[2] "\t" rows; copying = 0; next }
  copying { rows++ }
' "$workdir/data.sql" >"$workdir/expected.tsv"
[[ -s "$workdir/expected.tsv" ]] || fail "data.sql contains no table data (no COPY sections)"

# 2. A disposable server with no published ports.
step=$(now_ms)
docker run --detach --name "$container" --memory 1g --env POSTGRES_PASSWORD="$password" "$image" >/dev/null
for _ in $(seq 1 120); do
  if docker exec "$container" pg_isready --quiet --host 127.0.0.1 --username "$db_user" 2>/dev/null \
    && psql_in_container --command 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
psql_in_container --command 'SELECT 1' >/dev/null || fail "the restore server in $image did not start within 120 s"
start_ms=$(($(now_ms) - step))

# 3. Restore in one transaction, as docs/OPERATIONS.md describes for a real restore.
step=$(now_ms)
docker exec "$container" mkdir -p /tmp/restore
# No --quiet: older Docker CLIs (Debian 12's 20.10, for example) reject it. Newer ones report each
# copy on stderr, which is kept for the error message.
for file in roles schema data; do
  copied="$(docker cp "$workdir/$file.sql" "$container:/tmp/restore/$file.sql" 2>&1)" ||
    fail "could not copy $file.sql into the restore container: $copied"
done
psql_in_container --single-transaction \
  --file /tmp/restore/roles.sql --file /tmp/restore/schema.sql \
  --command 'SET session_replication_role = replica' --file /tmp/restore/data.sql >/dev/null \
  || fail "the restore failed (see the psql error above)"
restore_ms=$(($(now_ms) - step))

# 4. Every table must hold exactly the rows the dump contains.
step=$(now_ms)
query=""
while IFS=$'\t' read -r schema table _; do
  query+="${query:+ UNION ALL }SELECT '$schema', '$table', count(*) FROM \"$schema\".\"$table\""
done <"$workdir/expected.tsv"
psql_in_container --tuples-only --no-align --field-separator=$'\t' --command "$query" | sort >"$workdir/actual.tsv"
sort "$workdir/expected.tsv" >"$workdir/expected.sorted.tsv"
mismatches="$(diff "$workdir/expected.sorted.tsv" "$workdir/actual.tsv" || true)"
[[ -z "$mismatches" ]] || fail "row counts differ after the restore (< dump, > database):"$'\n'"$mismatches"

missing=()
IFS=',' read -r -a wanted <<<"$required"
for table in "${wanted[@]}"; do
  [[ -z "$table" ]] && continue
  awk -F'\t' -v t="$table" '$2 == t && $3 > 0 { found = 1 } END { exit !found }' "$workdir/expected.tsv" || missing+=("$table")
done
((${#missing[@]} == 0)) || fail "no rows restored for: ${missing[*]}"
verify_ms=$(($(now_ms) - step))
total_ms=$(($(now_ms) - started))

tables=$(wc -l <"$workdir/expected.tsv" | tr -d ' ')
rows=$(awk -F'\t' '{ sum += $3 } END { print sum + 0 }' "$workdir/expected.tsv")
size=$(wc -c <"$backup" | tr -d ' ')
summary="$(
  cat <<REPORT
### Restore drill: passed

Backup \`$(basename "$backup")\` ($size bytes), restored into \`$image\`: $tables tables, $rows rows, every count matches the dump.

| Step | Seconds |
| --- | --- |
| Decrypt and unpack | $(seconds "$decrypt_ms") |
| Start a disposable PostgreSQL | $(seconds "$start_ms") |
| Restore (one transaction) | $(seconds "$restore_ms") |
| Verify row counts | $(seconds "$verify_ms") |
| **Total** | **$(seconds "$total_ms")** |
REPORT
)"
echo "$summary"
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && echo "$summary" >>"$GITHUB_STEP_SUMMARY"
[[ -n "$report" ]] && echo "$summary" >"$report"
[[ "$keep" == true ]] && echo "Kept container $container (remove it with: docker rm -f $container)"
exit 0
