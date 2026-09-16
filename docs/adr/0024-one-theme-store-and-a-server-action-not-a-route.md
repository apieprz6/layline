# ADR 0024: One Theme Store Per Tab, And A Server Action Where A Route Was Planned

## Status

Accepted. Supersedes the transport LAY-52 specified. Closes the drift ADR 0018 predicted in
`useTheme`.

Amended 2026-09-16, before merge: the store runs from the **root** layout rather than the chrome. As
first written it never started on `/station/[buoyId]`, which is outside `app/(app)/`. See "Every route
runs the store, from the root layout".

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

### Every route runs the store, from the root layout

The chrome is not on every screen. `app/station/[buoyId]` sits outside `app/(app)/` deliberately, and
`app/auth/callback` does too. A tab opened cold on a station screen mounted no `AppLayout`, so the
store never started: it kept whatever the blocking script had made of `localStorage`, never adopted the
preference on the sailor's **Profile**, and never crossed twilight. Because a station screen has no
in-app links at all, the only way out was a routing action back into the group — which is exactly when
the theme appeared. Measured in Chromium against `next build && next start`, on a browser whose
`localStorage` had never held the preference: `/` went light at 134 ms and dark at 422 ms, and
`/station/45198` stayed light indefinitely. With the runtime in the root layout it goes light at 136 ms
and dark at 316 ms. Once `localStorage` holds the preference — the sailor's own device, from the second
load on — every route is dark from the first paint with no flip, which is what the blocking script is
for.

So `useThemeRuntime()` runs from `app/layout.tsx`, the one layout every route has, through
`components/theme/ThemeRuntime.tsx` — a client component that renders `null`, needed only because the
root layout is a Server Component.

It asks the **Profile** without being told who the sailor is, because `readThemePreference` resolves
them server-side. What it does wait for is the chrome, *if there is one*: a **Guest** the chrome has
vouched for is not worth a round trip, and only the chrome knows, holding the server-resolved
**Account**. One microtask is enough of a wait — React runs every effect in a commit before the queue
drains — and unlike reading the identity out of the tree, that does not depend on where the runtime
sits relative to the chrome. The store then asks at most once per tab per sailor, whichever of the two
gets there first.

Resolving the **Account** in the root layout instead was rejected: it would double the auth work on
every request, make every route dynamic, and put a second reader beside `resolveAccount()`'s one
designated place (ADR 0018).

An identity *generation* guards the answer. Because the question carries no id, a read that went out
before a sign-out-and-sign-in in the same tab cannot be matched to a sailor when it lands; the
generation counter is what lets it be dropped rather than applied to whoever is there now.

An identity-less question also does not use up the tab's question. `/auth/callback` is outside
`app/(app)/` as well, and there the answer is `null` whatever the sailor has chosen — the browser is
still exchanging the code, so the server can resolve nobody. `CompleteSignIn` then calls
`router.replace`, which is a client-side navigation, so the same module state meets the chrome. If that
first `null` counted, **the sailor would lose their cross-device preference for the whole tab on the
primary sign-in path** — the exact case LAY-52 exists for. So the store records whether a question went
out before anyone was named, and the chrome naming somebody is a fresh question rather than a repeat.
A question that *failed* does not count either, or a tab that asked while the dock had no signal could
never ask again.

On the callback screen the runtime does not ask at all: `useThemeRuntime` starts the theme there with
`askProfile: false`. Beyond being answerable only with `null`, that request passes through the
middleware, which refreshes auth cookies — alongside the exchange that is writing them. The class and
the twilight timer still run; it is the one screen where the store waits to be told.

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
  the right class on the document before React runs. A clock-dependent snapshot would also make the
  theme un-prerenderable, which is a constraint worth keeping even though `app/(app)/` is dynamic
  today for an unrelated reason — its layout resolves the **Account** from cookies.

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
- A sailor with no chrome around them still gets their **Profile**'s preference; what they cannot do
  until the chrome names them is *store* a new choice, since a write needs an id. The only screens
  outside `app/(app)/` are the station screen and the auth callback, neither of which offers the
  picker, so nothing reaches that window in practice.
- A cold load of `/station/[buoyId]` costs one `readThemePreference` even for a signed-out visitor —
  the station screen is public and has no chrome to vouch for a **Guest**, so nobody can say the
  question is pointless before it is asked. One `getClaims` per tab, answered `null`. Cheaper than the
  alternative: the auth cookie is not reliably readable from the browser.
- `useThemeRuntime` knows one route by name, `/auth/callback`. A special case in a hook that otherwise
  knows nothing about routing, accepted because that screen is genuinely different — it is the only one
  where who the sailor is changes *while it is open*. If a second such screen ever appears the test to
  extend is "themes the sign-in handshake screen without asking the Profile".
- A `loading.tsx` or a `<Suspense>` above the chrome would put its effect in a later commit than the
  root layout's, so the microtask would no longer find the chrome's word. The cost then is one wasted
  question per Guest load of a group route, not a wrong theme — the chrome's answer supersedes an
  identity-less one. jsdom always commits in one pass, so no test would notice; the note is here and in
  `startTheme`'s docstring.
- **A device that has never held the preference locally still shows the wrong theme for ~300–500 ms.**
  First paint happens before the server can be asked, and the blocking script has only `localStorage`
  to go on. Accepted: it is the cross-device case LAY-52 exists for, it happens once per browser, and
  the alternatives are worse — a server-rendered class means resolving the Account on every request and
  no static prerender, and blocking the paint on a round trip is a worse trade on the dock than a brief
  flash. The second load on that device is correct, because the answer is written to `localStorage`.
- Cross-tab theme is still absent. A `storage` listener on this store would now get it in a few
  lines; it was not in either ticket's scope.
- **Storing one enum costs four sequential round trips** — `getClaims`, `profiles` for the **Role**,
  `profiles` for `preferences`, then the `update`. Accepted rather than optimised. `resolveAccount()`
  is the designated reader of the **Account** (ADR 0018) and reusing its row would mean either
  widening its contract or duplicating its logic, and the read before the write is what stops the
  buoy settings being overwritten. This is Postgres on a rare deliberate tap, not the metered LLM and
  weather calls the AGENTS.md budget is about.
- The behaviour is asserted in jsdom, not Playwright: nothing here is about position, layout or a real
  click, and simulating two twilight crossings is what fake timers are good at. A real signed-in
  Chromium against `next build && next start` was used once, to *diagnose* the missing runtime above and
  to time the first paint — the numbers in this ADR come from there. No e2e test was added, because the
  cheap part of that reproduction was the browser and the expensive part was minting a Supabase session
  by hand.
