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

## Consequences

- **The drawer is no longer a list of what you can open.** Two of its entries will never open for a
  visitor who is never going to have an account. That cost is accepted deliberately: it is the price
  of the app saying what it is.
- **There is no blurred-data pattern to build, and there must not be one.** Locked states render
  geometry — the same hatched, obviously-not-a-value treatment the archive already uses for "not
  recorded" — so the two absences read consistently.
- **Boat identity cannot live in the drawer header.** Since no signed-out screen names the boat, the
  boat's name and its editing live on Boat management, behind the lock, rather than in the chrome.
- **The routes need a locked state, not just the drawer.** A guest who deep-links to a boat route
  must land on the locked screen with its invitation. No 404, and no middleware redirect — which is
  consistent with ADR 0004 already declining redirects for unauthenticated users.
- **One thing this decision does not settle:** ADR 0004 puts the Auth Sheet inside the dashboard
  layout, and a locked boat screen is outside it. Either the sheet becomes reachable from more than
  the dashboard, or the invitation routes to the dashboard with the sheet open. Both are defensible,
  the difference is visible to the user, and it belongs to whoever implements this.
- `CONTEXT.md`'s **Guest** entry no longer claims that everything a guest cannot use is invisible to
  them, and the locked treatment now has a name to be referred to by.
