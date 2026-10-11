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

**There is no live path.** The `bypassCache` option and `/api/weather/buoys/live` are gone; `/api/weather/buoys/live` had no caller in the app, and an option that skips the cache is an invitation to skip it on the page that most needs it. `RaceHeader` polls the cached `/api/weather/buoys` on the same five-minute cadence, which is the honest shape of "auto-refresh": ask again as often as the window turns over, not more. Both buoy route handlers send `max-age=300` to match, down from 900 and 600 — an HTTP cache outliving the cache behind it only means a browser holding a response the server would happily have replaced, and for `RaceHeader`, whose own 25-minute staleness gate hides a reading it judges too old, a 15-minute browser cache could blank the header out on data that was available.

**The weather-model Cache Adapter is untouched.** Its swappable-backend note in `CONTEXT.md` still describes `services/weather/`; only the buoy services moved.

### Consequences

- The five-minute window is now enforced by Next, so tests assert against a stateful stand-in for the Data Cache (`services/buoys/__tests__/data-cache.ts`) rather than reaching into a `Map`.
- `/station/[buoyId]` anchors its chart's "now" to the reading's `fetchedAt` rather than a render clock, and the header's own ticking clock is where cache age shows.

  > **Amended by Amendment 2 (2026-09-16):** this bullet also said the route "prerenders both known stations and revalidates on the same window". It does neither now; see below.
- A deploy still empties the cache; the first request after one pays the fetch.

## Amendment 2 (2026-09-16): One window, not two in series

Amendment 1 left a station screen able to show a reading twice the Freshness Window old. The render cache and the Data Cache are separate caches with separate five-minute windows, and they compose additively: the HTML a reader gets can be five minutes old, and the reading baked into it can already have been five minutes old when that HTML was generated. Measured on a preview deployment at `x-vercel-cache: STALE`, `age: 364` — the sailor sees "Fetched 9 min ago" and refreshing changes nothing, because refreshing asks the render cache, not the buoy.

**`/station/[buoyId]` is server-rendered on demand.** `generateStaticParams` is gone. It was worth having when the render was the whole answer; it is not worth a second window in series. Two smaller reasons agree: a build without buoy access prerenders the screen *empty* and then serves that empty screen for five minutes, and the station list is not fixed — a third buoy would have needed a build to appear. The reading itself is still cached, so dropping the prerender costs a cache read per visit, not a fetch.

The segment's `export const revalidate = 300` went with it. With nothing prerendered there is no render to revalidate, and the buoy service passes its own window to `unstable_cache`, so the segment value governed nothing — verified against `next start`, which sends `Cache-Control: private, no-cache, no-store` for the route either way. Keeping it would have been a second, quieter copy of the number that no longer meant anything.

> This reverses an acceptance criterion of LAY-131, which asked for both stations prerendered. Recorded as the owner's call after seeing the two windows on the deployed preview.

**A station screen keeps itself current from the browser.** `useStationHistory` polls `/api/weather/buoys/history` — a dynamic route handler, so it reads the Data Cache directly and skips the render cache entirely. It asks on the window, when the tab regains focus, and when the sailor taps the refresh control beside the fetch age. It also asks twice more, five seconds apart, when the reading it got back is already past the window: that is exactly the case where the cache has just served what it had and started a refresh behind the request, so the fresh reading exists a moment later and goes to whoever asks next. Capped, because a refresh that keeps failing leaves `fetchedAt` where it was and an uncapped retry would poll forever.

This is not a bypass, and the "there is no live path" ruling above stands unchanged. Every one of those requests goes through the same Cached Fetch at the same window; what changed is how often the *screen* asks the cache, not how often the cache asks NDBC. The server render is now a seed rather than the last word, and a poll that fails or comes back without samples leaves the screen on what it already had — a chart on screen is worth more than the newest possible answer.

**Both buoy route handlers drop `max-age`**, replacing Amendment 1's `max-age=300`. A browser-held response is the one cache a refresh control cannot reach: `max-age=300` would have made a tap do nothing for five minutes, and would have doubled `RaceHeader`'s effective poll interval.

> **Amended by Amendment 3 (2026-09-16):** this shipped as `max-age=0, s-maxage=300, must-revalidate`, on the reasoning that `s-maxage` "keeps the edge shield" while the browser always asks. That was wrong in exactly the way the rest of this amendment is about — see below.

### Consequences

- Every route in the app is now `ƒ`; nothing is prerendered but `/_not-found`.
- A station screen makes one cache read on arrival and one every five minutes it stays open, up from one per five minutes across all readers of that station. Still no additional NDBC traffic.
- The refresh control's tap target is padding pulled back out with a negative margin, so the metadata row's height is unchanged and the skeleton header in `loading.tsx` still measures the same — held to a pixel by `e2e/loading-skeletons.spec.ts`.
- Server-side invalidation from the Purdue poller (`revalidateTag`) would shorten the window further and is not done here; it is the natural next step for a reading the app itself writes.

## Amendment 3 (2026-09-16): A cache in front of the handler is another window, and asking is not refreshing

Amendment 2 moved the second window rather than removing it. `s-maxage=300` on the buoy route handlers put it at the CDN: a poll, a stale-retry and a tap on refresh were all answered from Vercel's edge with a byte-identical response and the function never ran. Measured on a preview at `x-vercel-cache: HIT`, `age: 34`, same `fetchedAt` — the refresh control did nothing whatsoever, and neither did the retries that were supposed to catch a stale serve. The reasoning that produced it ("`s-maxage` is a free shield") is the trap: any window in front of the Data Cache **composes with** it instead of replacing it.

**Both buoy route handlers send `Cache-Control: no-store`.** Nothing caches in front of them, browser or CDN. The Data Cache is the shield and it is the only one; these handlers run per request and read it, which costs a cache read, not an NDBC fetch. That is the whole distinction the "no live path" ruling turns on, and it is cheap enough to spend on every request.

**A tap on refresh expires the stored reading before reading again.** This is the other half of why the control looked broken, and it would have survived the CDN fix: inside the window every read is handed the same stored reading with the same `fetchedAt`, so a tap that only read could not change the screen and could not stop the fetch age climbing. Reading harder was never going to help. `POST /api/weather/buoys/refresh?buoyId=…` calls `revalidateTag(tag, { expire: 0 })` through `purgeBuoyHistory`, then the client reads again and gets a fetch.

The two history entries are tagged per station (`buoy-history-ndbc`, `buoy-history-purdue`) so a tap on one screen does not spend the other station's reading.

**This is still not a live path.** `bypassCache` read *around* the cache and stored nothing, so its caller got a private answer nobody else benefited from and every subsequent reader paid again. A purge leaves the next read going through the same Cached Fetch, which stores what it gets and shares it — `services/buoys/__tests__/ndbc.test.ts` asserts exactly that, that the read after a purged read is a hit. Everything that does not ask is still governed by the window.

**A floor of thirty seconds** guards the purge: if the stored reading is newer than that, the route answers `{ purged: false }` and nothing is expired. NDBC publishes every ten minutes, so this is not about missing samples — it is a bound on how often a human holding the button can make us reach a public service. Short enough that a deliberate tap nearly always does refetch, which is what makes the control feel like it works.

### Consequences

- Every buoy API request now runs the function. At this app's traffic that is negligible, and it is the price of there being one window rather than two.
- A tap can reach NDBC, which no automatic path can. Bounded by the thirty-second floor per station, and only while someone is actively asking.
- `services/buoys/__tests__/data-cache.ts` models `revalidateTag` too, and rejects any profile but `{ expire: 0 }` — the second argument is Next 16's, and it says how long a marked-stale entry may still be served, so getting it wrong purges on paper only.
- `e2e/station-refresh.spec.ts` exists because this class of bug is invisible to jsdom: the control passed every unit test while a cache in front of the handler meant the tap never reached the code under test. What had to be asserted was a sequence of real requests from a real click.
- The Purdue poller calling `purgeBuoyHistory` is now a two-line change rather than a design question. Still not done, and still wants a row-count check so a duplicate upsert does not purge for nothing.
