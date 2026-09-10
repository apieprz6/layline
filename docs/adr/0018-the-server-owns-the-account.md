# ADR 0018: The Server Owns the Account, and the Client Only Learns When to Ask Again

## Status

Accepted

## Context

Four surfaces need to know who is signed in, in three different rendering contexts: the drawer's
account block, the **Auth Sheet** (which must close itself on success), the **Locked Entry** boat
screens, and server-side reads. Nothing in the codebase answers it. `lib/hooks/` holds only
`useTheme.ts`; there is no `createContext` call anywhere in `app/`, `components/`, `lib/` or
`services/`; `lib/supabase/client.ts` exists with **no importers at all**; `types/index.ts` has no
session-shaped type; and the only `supabase.auth` calls in the repo are `getUser()` in
`lib/supabase/middleware.ts:38`, whose result is discarded because the call exists purely to rotate
cookies, and two more in `app/api/preferences/route.ts`.

LAY-116 framed the choice as server-resolved-and-drilled versus a client context on
`onAuthStateChange` versus both. Four facts reframed it before any of the three could be weighed.

**The flash can only ever go one way.** A client-only provider starting empty renders *guest* state
first and then flips. It cannot do the reverse, because signed-in content requires a session the
client does not yet have. So the failure mode is "the owner sees their own locked screen for one
frame", which is cosmetic — not the data-integrity breach ADR 0015 forbids. The argument against a
client provider is much weaker than it looked.

**Unlocking needs a server round trip regardless.** The locked screens gate on data the client
cannot fetch until cookies exist, not on a boolean. A client context flipping to signed-in therefore
cannot unlock anything on its own. Server resolution is load-bearing whichever option wins.

**Giving up static rendering costs one page.** `/`, `/wind-data` and `/station/[buoyId]` already
carry `export const dynamic = 'force-dynamic'`. `/settings` is the only prerenderable page in the
app, and its tree (`AppLayout` → `SettingsContent`) is Client Components reading browser state, so
it renders almost nothing at build time.

**`AppLayout` is not a layout.** There is exactly one `layout.tsx` — the root, a Server Component
that wraps children in no providers — and `AppLayout` is a Client Component *imported by each page*
(`app/page.tsx:60`, `app/settings/page.tsx:6`, `app/wind-data/page.tsx:16`). Since a layout cannot
pass props to a page, a layout-level resolve could only reach it through a context. ADR 0016's
phrase "the app layout" describes something that does not exist yet as a Next layout.

A fifth fact arrived with the requirement for cross-tab sessions, and it points the opposite way from
the rest: see "Auth operations run in the browser" below.

## Decision

### The server resolves the Account, and it travels as a prop

A new `app/(app)/layout.tsx` — a Server Component — resolves the **Account** and renders
`<AppLayout account={…}>{children}</AppLayout>`. One resolve site, props the whole way down, and it
makes ADR 0016's "app layout" literally true for the first time.

It resolves with **`getClaims()`**, not `getUser()`: the middleware already spends a `getUser()`
network round trip on every request purely to rotate cookies, and `getClaims()` verifies the JWT
locally against a cached JWKS instead of adding a second one. Its return type has three arms —
data, error, and neither — and all three need handling.

`role` is read from `profiles`, never from a JWT claim, matching `public.is_admin()` in
`supabase/migrations/20260909190000_create_boat_storage_bucket.sql:17-30`, which is the only
server-side authorization predicate the repo has.

**No React context.** The value travels layout → `AppLayout` → `HamburgerMenu`, one hop each.

### The group is the routes that carry app chrome

`/`, `/wind-data`, `/settings`, and the boat routes when they land. `/station/[buoyId]` stays
outside it: ADR 0016 already settled that a detail route does not belong in the drawer, and
`StationLayout` is a slot component supplying its own `header` and `dock`, so the group's
`RaceHeader` would sit above the station's own. Nothing on a station screen is gated, so it needs no
Account.

### The client subscribes to learn *when*, never *who*

`AppLayout` subscribes to `onAuthStateChange` and calls `router.refresh()` inside a transition. It
never renders the client's copy of the session; the rendered **Account** is always the server prop.

This is not fastidiousness. A tab receiving a multi-tab broadcast is handed `event.data.session`
from the message payload rather than re-reading its own cookies
(`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:203`), so a client copy genuinely can
disagree with the cookie. Using it only as a trigger makes that unobservable.

### Auth operations run in the browser, because that is what makes cross-tab work

Cross-tab sessions are a requirement. `auth-js` implements multi-tab with **`BroadcastChannel`**, not
the `storage` event: `GoTrueClient.js:194-209` opens a channel keyed on `storageKey`, `:3927-3928`
posts every auth event to it, and receiving tabs re-emit locally with `broadcast: false` to avoid a
loop.

Cookies do not impede this. `BroadcastChannel` is storage-agnostic, cookies are shared across tabs
by nature, and cookie storage is not optional anyway — `createBrowserClient` builds storage from
`createStorageFromOptions` and ignores any `auth.storage` passed to it. What cookies lack is a change
event, and the one that exists (`CookieStore`) is Chromium-only, so it is no use on the iOS Safari
this app primarily targets.

But **the broadcast is emitted only by the SDK instance that performed the write.** Routing sign in,
sign up and sign out through Server Actions would emit nothing — not even to the tab that acted. So
cross-tab requires the operations to run through `createBrowserClient`. `autoRefreshToken` comes with
that, which also rotates an idle tab's expired access token without waiting for a navigation
(`jwt_expiry` is 3600).

### Refresh only when the identity actually changes

`onAuthStateChange` fires `INITIAL_SESSION` on mount and `TOKEN_REFRESHED` roughly hourly.
Refreshing on either would re-render on every page load and every rotation — and `/` is
`force-dynamic`, so each one refetches weather against the cost budget in `AGENTS.md`. The handler
ignores `INITIAL_SESSION` and same-user `TOKEN_REFRESHED`.

### The sheet holds until the screen behind it is correct

For email/password: await `signInWithPassword`, then `router.refresh()` inside `useTransition`, and
close when the transition settles. The sailor never sees a half-updated screen — the same instinct
ADR 0015 applied when it banned partial data behind a lock. OAuth navigates away and returns through
`/auth/callback`, so there is no sheet left to hold.

### Sign out leaves the sailor where they are

No relocation. A signed-in owner who signs out on `/boat-performance` watches it lock behind them,
and that screen is already designed, already carries an invitation, and dead-ends nowhere (ADR
0015). Relocating is precisely what ADR 0016 rejected for the sign-*in* case, and it would also
discard the screen the sailor had chosen. Only the two boat routes are affected.

## Consequences

- **`CONTEXT.md` gains an **Account** entry**, defined as an email plus exactly one **Profile**, with
  `null` meaning **Guest**. `Session` is recorded as a term to avoid, because it already means
  Supabase's tokens, and `viewer` cannot be reused for "the current user" since ADR 0017 made it a
  **Role**.
- **`/settings` loses static prerendering.** Accepted: it is the only page that had it, and its tree
  is Client Components either way.
- **The three pages stop importing `AppLayout`**; the group layout renders it instead.
- **Station screens get no cross-tab refresh**, since the subscription lives in `AppLayout`. Harmless
  — they show public weather and gate nothing.
- **This is the repo's first browser Supabase client, and its first `onAuthStateChange`.** Nothing
  currently mocks `@supabase/ssr` in tests; only `@supabase/supabase-js` and `@/lib/supabase/service`
  are mocked anywhere. The drawer's own tests stay prop-driven and need no mock, which is part of why
  the Account is a prop.
- **One `profiles` select per request** in the group layout. A custom access token hook could embed
  `display_name` and `role` in the JWT and remove it, at the cost of claims that stay stale until the
  token rotates; not taken, and `is_admin()` reads the table anyway.
- **`types/index.ts:121` still reads `'admin' | 'user'`** and `Profile.role` is still nullable, both
  contrary to ADR 0017. The build applies that rename and the `NOT NULL` alongside this.
- **The middleware matcher already covers the future `/auth/*` routes** — it excludes only
  `_next/static`, `_next/image`, `favicon.ico` and image extensions. The `middleware.ts` → `proxy.ts`
  rename that Next 16 wants is a separate chore and deliberately not bundled here.

## Alternatives considered

- **A client-only provider on `onAuthStateChange`.** Rejected: it cannot unlock a screen, because
  unlocking needs data only the server can fetch, and it duplicates a fact the server already had.
- **Resolving in each page and passing down.** Rejected: three call sites today and a fourth easy to
  forget when the boat screens land.
- **Root layout resolve plus a context.** The only way to get one resolve site without a route
  group, but it introduces the repo's first provider and forces a new mock into every drawer test.
- **Server Actions for every auth operation, plus our own `BroadcastChannel`.** Genuinely tempting:
  it keeps zero client-side Supabase and no client session copy at all. Rejected because it
  hand-rolls a parallel copy of a mechanism the SDK already ships, and this repo already carries
  exactly that wound — the theme's blocking inline script in `app/layout.tsx:9-35` reimplements the
  sun math, the storage key and the coordinates that `useTheme.ts` also holds, and the two can drift.
  A second one is worse here than elsewhere, because no browser or production build exists in the
  agent environment to exercise it.
- **Moving the session off cookies to get cross-tab.** Rejected on two counts: the server could no
  longer read it, which removes every server-resolved decision above, and `@supabase/ssr` overrides
  the storage option regardless. Cookies were never what blocked cross-tab.
- **Middleware injecting the user into request headers.** It would reuse the `getUser()` call already
  being made, but it couples the app's data flow to a file convention Next 16 is in the middle of
  renaming, and `display_name` still needs a database read.
