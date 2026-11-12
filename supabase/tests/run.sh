#!/usr/bin/env bash
# Runs every migration on a throwaway local database, then each *.test.sql
# file here. Needs a local Postgres you can reach as a superuser, e.g. a
# scratch cluster:
#   initdb -D /tmp/pg -U postgres --auth=trust
#   pg_ctl -D /tmp/pg -o "-p 54329 -k '' -c listen_addresses=127.0.0.1" start
# Then: supabase/tests/run.sh   (PGPORT etc. override the defaults below)
#
# pg_cron and pg_net don't exist locally, so 0004's two "create extension"
# lines fail; stubs.sql stands in for them and the rest of 0004 runs.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
DB=${TEST_DB:-linestepper_test}
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/stubs.sql
for f in supabase/migrations/*.sql; do
  out=$(psql -q -d "$DB" -f "$f" 2>&1 | grep -E 'ERROR' | grep -v 'extension control file' || true)
  if [ -n "$out" ]; then echo "$f:"; echo "$out"; exit 1; fi
done
status=0
for t in supabase/tests/*.test.sql; do
  if psql -q -d "$DB" -v ON_ERROR_STOP=1 -tA -f "$t"; then :; else echo "FAILED: $t"; status=1; fi
done
exit $status
