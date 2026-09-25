#!/usr/bin/env bash
# Builds a backup in the nightly format (roles.sql, schema.sql and data.sql in an age-encrypted
# tar.gz) from a PostgreSQL container, so the restore drill can be proven without a hosted database
# or the real backup key. The nightly job dumps with `supabase db dump`; this uses pg_dump inside
# the container with the equivalent options, so the client always matches the server version.
#
#   infra/scripts/make-test-backup.sh --container NAME --database DB --recipient age1... --out FILE.tar.gz.age
set -Eeuo pipefail

usage() {
  echo "Usage: make-test-backup.sh --container NAME --database DB --recipient AGE_PUBLIC_KEY --out FILE.tar.gz.age [--user postgres]"
}

container="" database="" recipient="" out="" user="postgres"
while (($# > 0)); do
  case "$1" in
    --container) container="${2:?}"; shift 2 ;;
    --database) database="${2:?}"; shift 2 ;;
    --recipient) recipient="${2:?}"; shift 2 ;;
    --out) out="${2:?}"; shift 2 ;;
    --user) user="${2:?}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ -n "$container" && -n "$database" && -n "$recipient" && -n "$out" ]] || { usage >&2; exit 2; }
command -v age >/dev/null || { echo "age is not installed" >&2; exit 1; }

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Roles without passwords, and without the bootstrap superuser every PostgreSQL server already has
# (Supabase's role-only dump leaves out its reserved roles in the same way).
docker exec "$container" pg_dumpall --username "$user" --roles-only --no-role-passwords \
  | sed -E '/^(CREATE|ALTER) ROLE "?'"$user"'"?( |;)/d' >"$workdir/roles.sql"
docker exec "$container" pg_dump --username "$user" --dbname "$database" --schema-only >"$workdir/schema.sql"
# pg_dump warns that categories refers to itself (parent categories); the restore loads data with
# triggers and foreign-key checks off (session_replication_role = replica), as a real restore does.
docker exec "$container" pg_dump --username "$user" --dbname "$database" --data-only >"$workdir/data.sql"

for file in schema data; do
  [[ -s "$workdir/$file.sql" ]] || { echo "$file.sql is empty" >&2; exit 1; }
done

tar -czf - -C "$workdir" roles.sql schema.sql data.sql | age --recipient "$recipient" >"$out"
echo "Wrote $out ($(wc -c <"$out" | tr -d ' ') bytes)"
