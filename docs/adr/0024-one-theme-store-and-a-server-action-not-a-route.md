# ADR 0024: One Theme Store Per Tab, And A Server Action Where A Route Was Planned

## Status

Accepted. Supersedes the transport LAY-52 specified. Closes the drift ADR 0018 predicted in
`useTheme`.

## Context

The theme preference — `auto`, `solar` or `nightvision`, where `auto` follows civil twilight at Navy
Pier — was held in `useState` inside `useTheme`, seeded once from `localStorage` per instance. Two
instances were live: `AppLayout`, which called `useTheme()` and threw the result away purely for its
DOM side effect, and `SettingsContent`, which called it for `setPreference`.

Nothing connected them. Each instance wrote the same global — `theme-nightvision` on
`document.documentElement` — and any instance still holding `auto` ran a 60-second interval
re-resolving against sun times. So a sailor who chose Night Vision on `/settings` kept it until the
tab survived a dawn, at which point the chrome's stale `auto` instance re-resolved and **removed the
class** (LAY-128). The mirror case broke at dusk. A reload always healed it, because the blocking
script in `app/layout.tsx` reads storage on first paint — making this precisely a long-lived-tab
defect, which is the mobile usage the app is built for. LAY-124 widened it from "reachable by sitting
on `/settings`" to "permanent", because the chrome stopped remounting on navigation.

Onto that, LAY-52 asked for a third writer: the preference stored on the sailor's **Profile**, so a
choice made on the phone is there on the laptop. Its specification said to extend the *existing*
`/api/preferences` `GET`/`PUT`.

That route no longer exists. LAY-125 deleted it four weeks after LAY-52 was written, because its
`PUT` upserted a `profiles` row and so became a second profile-creation path competing with ADR
0017's trigger. ADR 0018 carries the amendment. Two tickets therefore had to be decided together,
and one of them was describing a file that had been deleted for a reason that still holds.

## Decision

### One module store per tab, read through `useSyncExternalStore`

`lib/theme/store.ts` holds the preference in module state. `useTheme` became a thin reader over it
and its returned shape (`theme`, `preference`, `setPreference`) did not change, so `SettingsContent`
is untouched. No provider and no context — this is the repo's first shared client-side state, and
ADR 0018's observation that there is no `createContext` call anywhere still holds.

Three things write the theme, in this order of authority: the sailor, their **Profile**, and civil
twilight — the last only while the preference is `auto`. `localStorage` is not a fourth. It is the
store's memory between tabs, and what the blocking script reads to get the first paint right.

### The store owns the document class, and the chrome stops reading the theme

The class and the twilight timer moved into the store, so there is exactly one writer of each no
matter how many screens subscribe. That makes the LAY-128 failure unrepresentable rather than merely
fixed: there is no second holder left to disagree.

`AppLayout` no longer calls `useTheme()`. It calls `useThemeSync(userId)`, which starts the store in
an effect and subscribes to nothing — so a theme change does not re-render the entire app, which the
old side-effect-only call would now have done.

### A Server Action, and `/api/preferences` does not come back

`lib/theme/actions.ts` exposes `readThemePreference` and `saveThemePreference`. This is the repo's
live idiom for an authenticated write — every `actions.ts` under `app/(app)/` — and it reintroduces
no public route. Nothing in it creates a row: it reads the **Profile**, merges, and `update`s. A
missing row is reported and not repaired, because ADR 0017's trigger guarantees one and an upsert
here would hide its failure. That is the whole of LAY-125's objection, and it stays honoured.

The write is a read-then-merge because `preferences` is one JSONB column shared with the buoy
settings of ADR 0001. Sending `{ theme }` alone would overwrite what the sailor set on another
screen — the one thing AGENTS.md forbids. Two statements rather than a `jsonb_set` are acceptable
because the only writer of a sailor's own row is that sailor, choosing a theme by hand.

Authorization is "signed in", **not** `canWrite`. That predicate governs the boat, which only an
admin edits (ADR 0019); this is the sailor's own row under the own-row `UPDATE` policy, and `role`
stays unwritable regardless — a trigger refuses it for any caller holding the `authenticated` JWT
role.

### Identity travels down as a prop; the preference does not

`useThemeSync` takes the server-resolved **Account**'s id, which the chrome already holds (ADR 0018).
The store never asks the browser who the sailor is.

The *preference* is deliberately not a prop. The server does not own it — it is the browser's state,
and the server never sees `auto` resolve — and a prop would leave the Settings picker unable to write
it. So identity comes down and the preference stays in the store. Passing the id is also what makes a
sign-in part way through a tab's life pick up a preference set on another device, since
`useRefreshOnIdentityChange` re-renders the chrome with a new id but cannot reset module state.

### What absent means, in three places

- `UserPreferences.theme` is **optional**. Absent and `auto` are different facts: `auto` is a choice,
  absent means this sailor has never chosen on any device, which is every row predating the field. A
  missing preference is never written down as `auto`.
- `readThemePreference` returns `null` for a **Guest**, for a sailor who never chose, for an
  unreadable value, and for a failed read. Those are not distinguished because the caller's answer is
  the same for all four — keep using `localStorage` — and no screen would say anything different.
- The hydration snapshot is the constant `{ preference: 'auto', theme: 'solar' }`. The server cannot
  know what time it is where the sailor is, and does not need to: the blocking script has already put
  the right class on the document before React runs. `/settings` still prerenders statically, which
  it could not do against a clock-dependent snapshot.

### A failed write does not take the theme back off the screen

`setThemePreference` applies the choice, then sends it. The screen does not wait and does not revert.
The sailor asked for this theme and is looking at it; a failed round trip means only that the *other*
device will not know, and the console says so.

A Server Action **rejects** on a failed round trip as well as returning `{ ok: false }` for a
refusal, so both the read and the write carry a `catch`. Without one, the graceful degradation above
would instead be an unhandled rejection and, in development, an error overlay on top of a theme that
did in fact apply. The read's `catch` deliberately leaves the identity in place: a failed read says
nothing about whether anybody is signed in, and clearing it would quietly stop that sailor's later
choices reaching their Profile.

### Writes queue, so the last tap is the last word

Each write reads the column, merges and rewrites the whole of it. Several in flight together would
let whichever *landed* last decide what is stored — which is not the same as whichever the sailor
*tapped* last, and would leave the Profile disagreeing with the device the choice was made on. So
writes go through a promise chain, and one that has been superseded by a later tap, or by a different
sailor, is dropped rather than stored and then corrected.

A tap counts as a choice **even when it changes nothing**: tapping the theme already in use is still
the sailor saying which theme they want. That is enough to outrank an answer from the Profile that
was already on its way, and worth storing so the other device agrees — a sailor who taps Auto means
Auto, whatever their phone last said.

## Consequences

- The twilight drift is gone in both directions, and the tests say so at the store and hook levels —
  including two simultaneously-mounted instances, which is the shape the bug had.
- The duplication ADR 0018 flagged is unchanged, not widened: the storage key and the sun math still
  exist twice, in `store.ts` and in the blocking script that cannot import it. The key is exported as
  `THEME_STORAGE_KEY` with a comment pointing at the script.
- `resetThemeStore()` is exported for tests, because module state outlives a test the way it outlives
  a navigation. `clearCache()` in `services/buoys/ndbc.ts` exists for the same reason.
- A sailor with no chrome around them is treated as a **Guest** by the store — `localStorage` only.
  Every screen that reads the theme is inside the route group today, so this is a degradation and not
  a live case.
- Cross-tab theme is still absent. A `storage` listener on this store would now get it in a few
  lines; it was not in either ticket's scope.
- **Storing one enum costs four sequential round trips** — `getClaims`, `profiles` for the **Role**,
  `profiles` for `preferences`, then the `update`. Accepted rather than optimised. `resolveAccount()`
  is the designated reader of the **Account** (ADR 0018) and reusing its row would mean either
  widening its contract or duplicating its logic, and the read before the write is what stops the
  buoy settings being overwritten. This is Postgres on a rare deliberate tap, not the metered LLM and
  weather calls the AGENTS.md budget is about.
- No browser evidence. There is a real Chromium here, but nothing in this change is about position,
  layout or a real click, and simulating two twilight crossings is what jsdom and fake timers are
  good at. The build was run to confirm a `'use client'` store importing a `'use server'` module
  bundles.
