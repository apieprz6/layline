# In-Memory Cache for Buoy Data (No Database Persistence)

We cache successful buoy fetches in memory only, with no database persistence. This simplifies the initial implementation while deferring the decision of whether historical data is actually valuable.

## Context

Buoy data is fetched from free NDBC APIs with no rate limits. The PROJECT_PLAN mentions a `weather_snapshots` table for storing historical data. We need to decide whether to persist every successful fetch to the database or cache in-memory only.

## Decision

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
