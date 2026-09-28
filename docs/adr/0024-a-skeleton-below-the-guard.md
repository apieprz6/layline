# ADR 0024: A Skeleton Sits Below the Guard, Never Above It

## Status

Accepted

## Context

LAY-132 asked for a skeleton on every screen that resolves data on the server before it renders —
`/`, `/wind-data`, `/station/[buoyId]`, `/boat-management` and `/boat-performance` — and named
`loading.tsx` as the way to do it, which is the App Router's own answer and the right one for a public
screen.

Two of those five are the **Locked Entry** boat screens, and there the file convention collides with
ADR 0015. A `loading.tsx` is a Suspense boundary *above* the page. The first thing a boat page
awaits is `resolveAccount()`, so with a boundary above it, Next has something to render the instant
the page suspends: it flushes the shell — including the skeleton — and only later, when the page
resolves and calls `signInFirst()`, does the redirect reach the browser as an instruction inside the
stream. Measured against `next build && next start`: with a boundary above the page, a **Guest**
asking for `/boat-management/polar` is answered at that URL with the boat screen's shape on it, and
the bounce to `/?signin=…` arrives afterwards from the client; without one, the request itself is
redirected and they are on `/?signin=%2Fboat-management%2Fpolar` before a pixel.

ADR 0015 says a guest is served no signed-out rendering of these screens — "not a locked one, not a
placeholder one". A skeleton of the screen is a placeholder of it, so this is not a near miss.
`e2e/boat-sections.spec.ts` and `e2e/race-routes.spec.ts` already assert the redirect chain by hand
and caught it: twenty tests, red, for a file that contained no logic at all.

The trap is quiet in two ways. A `loading.tsx` covers **every route below it**, so one placed
directly in `app/(app)/` — the obvious home for the dashboard's skeleton, since `/` is that group's
index — is a boundary over the boat pages as well. And nothing in jsdom can see any of it: the
question is which bytes leave the server first.

Hoisting the guard into a layout above the boundary was the other way out, and it cannot state the
right destination. `signInFirst('/boat-management/polar')` is what makes finishing sign-in land on the
screen the sailor asked for, and a layout is not told the path below it.

## Decision

**A skeleton is a Suspense boundary below the auth decision, never above it.**

For a public screen that means `loading.tsx`, and for a guarded one it means a `<Suspense>` inside the
page: the account is resolved first, a guest is redirected before anything is written, and the boundary
wraps only the read that follows — `readBoatSetup()`, `readRaces()`. Both skeletons live in
`components/boat/` as ordinary components, because that is what they now are.

**And the dashboard's `loading.tsx` sits in a `(dashboard)` route group**, holding `app/(app)/page.tsx`
with it, so the boundary covers `/` and none of its siblings. The URL is unchanged.

`__tests__/app/loading-skeletons.test.tsx` asserts both halves as file facts: `(app)/loading.tsx` does
not exist, and no `loading.tsx` exists anywhere below `(app)/boat-management` or
`(app)/boat-performance`.

## Consequences

- The boat screens keep exactly the guarantee ADR 0015 wrote down, and now have skeletons too. What
  the skeleton covers is the storage read; the auth hop stays in front of it, which is honest — a
  request that might yet be refused should not be drawn as one that is being served.
- A page that puts its read behind a boundary no longer renders to completion when awaited, so a suite
  that does `render(await SomePage())` gets the fallback. `__tests__/helpers/resolveServerTree.tsx`
  calls the async components the way the server does; the two boat page suites use it and assert about
  the settled screen as before.
- `/settings` has no skeleton. With the dashboard's boundary moved into `(dashboard)`, there is
  nothing left for it to inherit.

  > **Amended by LAY-131 (2026-09-16).** This bullet also said `/settings` was "the one prerendered
  > page in the app, so its prefetch carries the whole screen and a fallback would never get a turn".
  > That was true of the build in front of us and not of production. `resolveAccount()` returned a
  > **Guest** without reading cookies when the Supabase keys were missing, so a keyless build — a local
  > one, or CI — prerendered the whole `(app)` group, while production read cookies and rendered every
  > screen per request. The degraded path now reads the cookies too, so `/settings` is dynamic
  > everywhere and the reason it has no skeleton is only the second clause. This is also what
  > `app/(app)/layout.tsx` said all along.
- Nested boat routes — `/boat-management/polar`, `/boat-performance/upload`, the rest — have no
  skeleton yet, and cannot get one from a `loading.tsx`. Each is guarded in the same way, so each needs
  its own boundary below its own guard. That is a ticket per screen, not a file per folder.
- Any future guarded route inherits the constraint. The `loading.tsx` that would be natural to add
  beside it is the one thing it must not have.
