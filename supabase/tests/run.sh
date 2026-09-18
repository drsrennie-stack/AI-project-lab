#!/usr/bin/env bash
# Runs the database acceptance tests against a throwaway local Postgres 16.
# Usage: PGHOST=/tmp/pgtest PGPORT=54329 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists lab_test" -c "create database lab_test" >/dev/null
for f in tests/00_supabase_stub.sql migrations/000*.sql seed.sql tests/01_acceptance.sql; do
  $P -d lab_test -f "$f" 2>&1 | grep -v -e "wal_level" -e "HINT" -e "as_user" -e "^-*$" -e "^ *$" -e "(1 row)" -e "set_config" -e "join_lab" -e "^ [0-9a-f-]\{36\}$" || true
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "FAILED in $f"; exit 1; }
done
