#!/bin/sh
# Runs once, when the PostgreSQL volume of docker-compose.prod.yml is first initialised.
#
# Supabase Auth (GoTrue) keeps its tables in the `auth` schema and manages them with its own
# migrations, as on a Supabase project. It gets a dedicated role that owns only that schema; the
# platform's tables in `public` stay with the API's role (see ADR-015).
set -eu

psql --variable ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set auth_password="$AUTH_DB_PASSWORD" --set database="$POSTGRES_DB" <<'SQL'
CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION PASSWORD :'auth_password';
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
GRANT CREATE, CONNECT ON DATABASE :"database" TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
SQL
