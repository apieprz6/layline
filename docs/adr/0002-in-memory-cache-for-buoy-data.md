# In-Memory Cache for Buoy Data (No Database Persistence)

We cache successful buoy fetches in memory only, with no database persistence. This simplifies the initial implementation while deferring the decision of whether historical data is actually valuable.

## Context

Buoy data is fetched from free NDBC APIs with no rate limits. The PROJECT_PLAN mentions a `weather_snapshots` table for storing historical data. We need to decide whether to persist every successful fetch to the database or cache in-memory only.

## Decision

> **The mechanism below is superseded by Amendment 1 (2026-09-16).** The ruling that matters —
> *cache, don't persist* — is untouched; what changed is where the cache lives. The module-level
> `Map` was process-local, and on Vercel the next navigation lands on an instance that has never
> seen it.

Use in-memory cache only for Phase 2 (buoy data integration):

```typescript
const cache = {
  chii2: { data: {...}, fetchedAt: timestamp },
  45198: { data: {...}, fetchedAt: timestamp }
}
```

When a fetch fails, return cached data (if available) with appropriate staleness status. No database writes.

## Rationale

**Defer complexity until proven valuable:**
- Historical data tracking is a Phase 3 feature ("track which sources are most accurate")
- We don't yet know what granularity is useful (every fetch? hourly snapshots? race-time only?)
- In-memory cache solves the immediate need: graceful degradation on fetch failures

**Low cost of deferral:**
- Can add database persistence later without changing the service interface
- NDBC data is freely available historically via their archives if we need to backfill
- Memory-only cache survives long enough for typical usage (hours between deploys)

**Reduced operational overhead:**
- No database writes on every fetch (every 15 minutes = ~3k writes/month)
- No need for data cleanup/retention policies yet
- Simpler code for Phase 2

## Consequences

- Cached data lost on deployment/restart (acceptable for now)
- Cannot analyze historical accuracy trends yet (deferred to Phase 3)
- Simplified Phase 2 implementation
- Will need migration to add persistence when historical tracking is prioritized

## Amendment 1 (2026-09-16): The cache is Next's Data Cache, and there is no bypass

**Buoy reads go through `unstable_cache` at a five-minute Freshness Window, not a module-level `Map`.** Same decision, working host: the Data Cache is shared across serverless instances, so the sailor who checks the dashboard on the dock and again on the walk out gets the second read for free even though the two requests never touch the same process. Nothing is written to Supabase, so the original ruling stands.

**A failed read is never cached.** The cached callback throws on a dead NDBC fetch or an empty Purdue query and the wrapper shapes the rejection into the `error` status afterwards, because `unstable_cache` stores only what a callback returns. Cache a failure and every visitor eats it for five minutes; this way the next request retries live.

Note that the Decision above promised more than the `Map` delivered: it never returned a stale reading when a fetch failed, because it consulted the cache *before* fetching and shaped an error on a miss. That is unchanged here. What the graceful-degradation clause actually rests on now is the Data Cache serving an entry it has, and the **Data Status** ladder in `CONTEXT.md` labelling a reading by its own age — not by anything the cache does on failure.

**There is no live path.** The `bypassCache` option and `/api/weather/buoys/live` are gone; `/api/weather/buoys/live` had no caller in the app, and an option that skips the cache is an invitation to skip it on the page that most needs it. `RaceHeader` polls the cached `/api/weather/buoys` on the same five-minute cadence, which is the honest shape of "auto-refresh": ask again as often as the window turns over, not more.

**The weather-model Cache Adapter is untouched.** Its swappable-backend note in `CONTEXT.md` still describes `services/weather/`; only the buoy services moved.

### Consequences

- The five-minute window is now enforced by Next, so tests assert against a stateful stand-in for the Data Cache (`services/buoys/__tests__/data-cache.ts`) rather than reaching into a `Map`.
- `/station/[buoyId]` prerenders both known stations and revalidates on the same window, which means its chart anchors "now" to the reading's `fetchedAt` rather than a render clock — there is no request clock on a prerender, and the header's own ticking clock is where cache age shows.
- A deploy still empties the cache; the first request after one pays the fetch.
