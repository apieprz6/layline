#!/usr/bin/env bash
#
# Run the race archive / Boat Setup schema checks.
#
#   scripts/verify-race-archive-schema.sh                 # the local stack
#   scripts/verify-race-archive-schema.sh "$DB_URL"       # a hosted project
#   DATABASE_URL=... scripts/verify-race-archive-schema.sh
#
# For a hosted project, use the session pooler or direct connection string from
# Project Settings -> Database (the transaction pooler will not do: the suite is one
# transaction with SET LOCAL ROLE and SET CONSTRAINTS in it).
#
# The suite ends in ROLLBACK, so it is safe against a project holding real races. It exits
# non-zero when any check fails.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE="$HERE/verify-race-archive-schema.sql"

DB="${1:-${DATABASE_URL:-}}"

if [[ -n "$DB" ]]; then
    echo "==> hosted: ${DB%%\?*}"
    exec psql "$DB" -v ON_ERROR_STOP=1 -f "$SUITE"
fi

# Local stack. Reached through the container so no local psql is needed.
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_layline}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "no local database container ($CONTAINER). Start it with: npx supabase start" >&2
    echo "or pass a connection string: scripts/verify-race-archive-schema.sh \"\$DB_URL\"" >&2
    exit 1
fi

echo "==> local: $CONTAINER"
exec docker exec -i "$CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$SUITE"
