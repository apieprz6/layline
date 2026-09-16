#!/usr/bin/env bash
#
# Four checks on what a Storage `move` does to an object's timestamps — the fact the sweeper's
# `recordings/` grace window rests on (ADR 0022).
#
#   scripts/verify-storage-move-timestamps.sh
#
# Against a hosted project, set the two variables yourself (Project Settings -> API):
#
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
#       scripts/verify-storage-move-timestamps.sh
#
# It really writes: one object uploaded, moved and deleted. Everything is namespaced by a fresh uuid,
# so it is safe against a project holding real recordings, but there is no ROLLBACK for bytes.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "==> local: reading keys from supabase status"
    # API_URL and SERVICE_ROLE_KEY, which the script also accepts by those names. Captured first and
    # tested for emptiness rather than eval'd straight: `eval ""` succeeds, so a missing CLI would
    # otherwise look like a successful read of nothing.
    STATUS_ENV="$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=' || true)"

    if [[ -n "$STATUS_ENV" ]]; then
        eval "$STATUS_ENV"
        export API_URL SERVICE_ROLE_KEY
    else
        # No CLI, or no permission to reach the containers — which is the case in the agent
        # container, where `supabase status` needs docker and docker needs sudo. The stack itself
        # is still reachable, so fall back to the local defaults and mint a token from the default
        # JWT secret, which is what `supabase start` uses locally and only locally.
        echo "==> no supabase CLI: trying the default local stack on 127.0.0.1:54321"
        export API_URL="http://127.0.0.1:54321"
        export SUPABASE_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
    fi
else
    echo "==> hosted: $SUPABASE_URL"
fi

exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$HERE/verify-storage-move-timestamps.mjs"
