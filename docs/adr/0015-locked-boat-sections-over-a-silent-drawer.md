# ADR 0015: Locked Boat Sections Over a Silent Drawer

## Status

Accepted

## Context

**Boat management** and **Boat performance** are the first parts of Layline that a signed-out
visitor cannot use. Everything before them is additive-auth by design (ADR 0004): a **Guest** gets
the whole dashboard, every weather source and every read-only feature, and the **Auth Sheet** is an
offer rather than a gate. The boat sections break that pattern, because they read one boat's private
archive: LAY-93 settled that there are exactly two reading tiers — guest and signed-in — and that
`role` governs writes only.

So the drawer has a decision to make that no other screen has faced. Either it shows a guest three
entries and never mentions that two more exist, or it shows all five and locks two of them.

LAY-95 prototyped three renderings of that choice: silent (no boat entries at all), padlocked with
placeholder shapes and an explicit invitation, and present-and-tappable straight into the Auth
Sheet. The prototype is a primary source on the throwaway branch
`prototype/lay-95-boat-sections`; it is not on main and is not production code.

## Decision

**Show both entries to a signed-out visitor, padlocked, with an explicit invitation to sign in.**

A locked door tells a returning sailor where their archive lives, and tells a stranger that this app
is somebody's boat rather than a public weather page. That is a positioning claim, not a permissions
one, and it is worth more than the tidiness of a shorter drawer.

Three constraints come with it, and none of them is optional:

1. **Behind the lock are placeholder shapes, never blurred or partial data.** No teaser that a guest
   can squint at, no real figure at reduced fidelity. This follows directly from the core belief
   about data: a value that looks like a reading and is not one is worse than an obvious absence.
2. **The boat's name does not appear on any signed-out screen.** The drawer advertises that a boat
   exists here, not whose it is.
3. **A tap explains and invites.** A locked entry opens a locked screen carrying the invitation; it
   is not a dead end, not a silent no-op, and not a redirect to a login page — Layline has no login
   page by decision (ADR 0004).
   **Superseded by the amendment below**: the row does not open anything, because there is no locked
   screen to open. The invitation is the control on the row itself.

## Consequences

- **The drawer is no longer a list of what you can open.** Two of its entries will never open for a
  visitor who is never going to have an account. That cost is accepted deliberately: it is the price
  of the app saying what it is.
- **There is no blurred-data pattern to build, and there must not be one.** Locked states render
  geometry rather than anything that could be mistaken for a reading.
  **Superseded by the amendment below**: there is no locked state to render at all, which settles this
  more strongly than a placeholder treatment would.
- **Boat identity cannot live in the drawer header.** Since no signed-out screen names the boat, the
  boat's name and its editing live on Boat management, behind the lock, rather than in the chrome.
- **The routes need a locked state, not just the drawer.** A guest who deep-links to a boat route
  must land on the locked screen with its invitation. No 404, and no middleware redirect — which is
  consistent with ADR 0004 already declining redirects for unauthenticated users.
  **Superseded by the amendment below**: the route redirects, carrying the destination.
- **One thing this decision does not settle:** ADR 0004 puts the Auth Sheet inside the dashboard
  layout, and a locked boat screen is outside it. Either the sheet becomes reachable from more than
  the dashboard, or the invitation routes to the dashboard with the sheet open. Both are defensible,
  the difference is visible to the user, and it belongs to whoever implements this.
  **Settled by ADR 0016**: the sheet moves up into the app layout and opens in place, because routing
  to the dashboard would land a deep-linking guest somewhere other than the screen they asked for.
- `CONTEXT.md`'s **Guest** entry no longer claims that everything a guest cannot use is invisible to
  them, and the locked treatment now has a name to be referred to by.

## Amendment (LAY-102, 2026-09-14)

The decision above — show both entries, padlocked, with an invitation — stands. **How** the
invitation is offered does not. Implementing it produced a padlocked row that navigated to a locked
screen, and the owner rejected that on sight of the source design:

> If the user is not signed in the menu item is disabled and the sign-in text should be clickable and
> trigger the sign-in flow. There should not be a "signed-out" version of the boat
> performance/mgmt page.

So:

1. **The row is inert.** A **Locked Entry** is a `div`, not a `Link`, drawn in `--text-muted` with the
   padlock directly after the label. It has nowhere to send a guest, so it does not pretend to.
2. **Its "Sign in" is the only control on it,** out at the right edge, and it opens the **Auth Sheet**
   in place. Each one is labelled with the section it unlocks — `Sign in to open Boat management` —
   because a drawer holding three identically-named buttons names nothing.
3. **Neither boat route has a signed-out rendering.** `LockedBoatScreen` and its hatched geometry are
   deleted. A guest reaching either route is redirected to the dashboard with the sheet open and the
   route remembered: `GET /boat-management` → `/?signin=%2Fboat-management`, and finishing sign-in
   lands on `/boat-management`. `lib/account/signInFirst.ts` is that one line, shared by both pages.

This makes constraints 1 and 2 above cheaper to hold rather than harder: nothing about the boat —
including that it has a name — is served to a guest at all, because no signed-out rendering of the
screen exists to leak it from.

The cost is that the redirect ADR 0015 originally refused is now the behaviour, in the one place a
guest can reach by typing a URL. It buys the thing a locked screen was for — the sailor still ends up
where they were headed — without a second, signed-out design for two screens to keep in step with the
real ones. The `?signin=` value is user-writable and becomes a redirect target, so it goes through
`relativePathOrHome` on the way in as well as on the way out (ADR 0018), and is stripped from the URL
once read, so a reload does not reopen a dismissed sheet.

ADR 0016's note that the sheet lives in the app layout so a locked screen can reach it without
navigating is now over-general: no screen needs that, but the drawer still does, and it is mounted
there for the same reason.
