#!/usr/bin/env bash
#
# Run LAY-92's 17 storage checks.
#
#   scripts/verify-boat-storage.sh          # the local stack, keys read from supabase status
#
# Against a hosted project, set the three variables yourself (Project Settings -> API):
#
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... scripts/verify-boat-storage.sh
#
# Unlike the SQL suite this one really writes to Storage: it uploads, moves and deletes, and
# creates two throwaway users. It cleans up after itself, but there is no ROLLBACK for bytes.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "==> local: reading keys from supabase status"
    # API_URL, PUBLISHABLE_KEY and SERVICE_ROLE_KEY, which the script also accepts by those
    # names. Anything already exported wins.
    eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY|SERVICE_ROLE_KEY)=')" || {
        echo "no local stack. Start it with: npx supabase start" >&2
        exit 1
    }
    export API_URL PUBLISHABLE_KEY SERVICE_ROLE_KEY
else
    echo "==> hosted: $SUPABASE_URL"
fi

exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$HERE/verify-boat-storage.mjs"
