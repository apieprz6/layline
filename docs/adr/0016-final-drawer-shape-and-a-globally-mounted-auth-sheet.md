# ADR 0016: The Final Drawer Shape and a Globally Mounted Auth Sheet

## Status

Accepted

## Context

The boat effort commits to building the **final** navigation shape immediately, so that nothing moves
when the analysis effort follows. That shape had never been decided, and the two sources for it
disagree in a way nobody had noticed.

Production `components/dashboard/HamburgerMenu.tsx` carries three entries — Dashboard (`/`), Wind
Data (`/wind-data`), Settings (`/settings`). The `Boat Management.dc.html` mockup carries four —
Dashboard, Boat management, Boat performance, Settings. **Wind Data is in one and not the other**, and
the mockup neither replaced nor demoted it; it is simply absent.

Two further facts bear on it. `app/station/[buoyId]` is a *dynamic detail route*, reached by tapping a
`StationRow`, not a top-level page missing from the nav — so nothing in this codebase is precedent for
keeping a real section out of the drawer. And there is no authentication UI anywhere in `app/` or
`components/` today: LAY-53, which specifies the drawer's account block verbatim, is a
`ready-for-agent` PRD sitting in Backlog.

ADR 0015 established that both boat entries are shown to a **Guest** as **Locked Entries**, and that a
tap must explain and invite rather than dead-end. It then named one question and deliberately declined
to answer it: ADR 0004 mounts the **Auth Sheet** *inside the dashboard layout*, and a locked boat
screen is outside that layout, so either the sheet becomes reachable from elsewhere or the invitation
routes to the dashboard with the sheet open. ADR 0015 called both defensible and left it to "whoever
implements this". That is a reasonable thing for an ADR to do and an unaffordable thing for a handoff
spec to inherit, so it is settled here.

## Decision

### Five flat entries, in one fixed order, with two dividers

```
Dashboard
Wind Data
────────────────
Boat management    🔒
Boat performance   🔒
────────────────
Settings
```

**Wind Data stays.** Its absence from the mockup is an oversight, not a demotion: the mockup was drawn
to show Boat Management and never depicted the weather half of the app, and it is already known to have
invented a boat name and a race start time that violates `AGENTS.md`. It is not authoritative about
surfaces it was not drawing. Wind Data is a real section — two tabs, a `SummaryBar`, a `StationCard`
per buoy, and the index that `/station/[buoyId]` hangs off — and the Dashboard carries only the compact
`LiveWindCard`.

**Flat, not nested.** Nesting buys a shorter top level at the cost of a level of depth for exactly two
items, and it fights ADR 0015: a guest must be told *both* sections exist, so a collapsed parent would
have to advertise two padlocks through itself.

**The order is stable across sign-in.** ADR 0015 fixes membership as stable, so nothing appears or
disappears; the padlocks come off and the account block swaps, and that is all. The dividers are what
make the middle group read as *one locked section* rather than two locked items scattered through a
list — which is why the locked pair can sit in the middle without interrupting anything, and why
Settings keeps the last slot rather than being stranded above the two sections a signed-in owner uses
most.

### The invitation is inline on the locked row

A **Locked Entry** in the drawer carries a padlock icon and a right-aligned "Sign in" link on the row
itself. This is what the LAY-95 prototype built (`VariantB.tsx`), and it is deliberately *not* a
separate invitation block: the offer belongs to the thing being offered.

This is distinct from LAY-53's account block ("Browsing as guest" + Sign in / Sign up when signed out;
initials, name and Sign out when signed in). **No variant of the prototype models that block** — the
string "Browsing as guest" appears nowhere on the prototype branch — so its placement remains LAY-53's
to make, in the drawer's existing bordered footer region. This ADR does not decide it.

### The Auth Sheet is mounted in the app layout, not the dashboard

The sheet opens over whatever screen the sailor is on. Under the alternative, tapping "Sign in" on a
locked Boat performance screen throws them to the Dashboard, and when they finish signing in they are
*still* on the Dashboard rather than the page they were trying to reach — which breaks precisely the
deep-link case ADR 0015 went out of its way to protect ("a guest who deep-links to a boat route must
land on the locked screen with its invitation").

### LAY-53 is a hard prerequisite of the boat navigation

A padlock with nowhere to send anyone is a dead end, and a dead end is the one thing ADR 0015 forbids.
The boat sections do not ship their locked state before the Auth Sheet exists.

## Consequences

- **This amends ADR 0004 and LAY-53 on where the sheet is mounted.** Both say the Auth Sheet "lives
  inside the dashboard layout as a Client Component". It moves up to the app layout. That is a move,
  not a redesign: the sheet's modes, contents and OAuth flow are untouched.
- **`CONTEXT.md`'s Auth Sheet entry is corrected**, since it repeated the dashboard-layout claim as
  vocabulary.
- **LAY-53's own out-of-scope line no longer holds.** It reads "Role-based feature gating (guests and
  signed-in users see the same app for now)", which the boat sections are the first thing to break.
  Recorded on LAY-53 rather than left to be discovered during its build.
- **The 390px question is arithmetic and does not constrain the outcome.** The drawer is a fixed 268px
  (`--drawer-width`) at full viewport height: five entries at ~48px is ~240px of an ~800px column, and
  the label budget after padding, icon and gap is ~196px against ~105px for "Boat performance" at 14px
  Inter.
- **The prototype's own drawer ordering is superseded.** All three variants hardcode
  `['Dashboard', 'Wind Data', 'Settings']` and append the boat entries *after* Settings. That ordering
  was incidental to a preview widget — in Variant A the boat entries are conditionally absent, so
  appending was the natural code shape — and the prototype had no dividers, so it could not express the
  grouping that makes this order work. The prototype remains the primary source for the *lock
  treatment*, not for the order.
- **`app/station/[buoyId]` stays out of the drawer**, on the settled ground that detail routes do not
  belong in one. It is not a loose end.
- **The Model Forecast tab is precedent, not a problem.** Wind Data already ships one working tab and
  one deliberate "coming soon" empty state, which is exactly the shape Boat performance's Overall tab
  will take.

## Alternatives considered

- **Drop Wind Data, following the mockup.** Rejected: it is a real section with an index-to-detail
  hierarchy and a second tab already stubbed, and the mockup never drew the weather half of the app at
  all. Deleting a shipped destination on the strength of its absence from an unrelated drawing is not a
  decision, it is an accident.
- **Nest the two boat entries under one parent.** Rejected: solves a problem a 268px full-height drawer
  does not have, and a collapsed parent cannot satisfy ADR 0015's requirement that a guest be told both
  sections exist.
- **The prototype's order, with the locked pair last.** Genuinely defensible — it keeps every openable
  entry contiguous at the top for a guest. Rejected because the drawer is stable across sign-in and so
  gets designed once: this order would put Settings, a utility, permanently above the two sections the
  boat's owner opens most, and the dividers already solve the interruption it was avoiding.
- **Route the invitation to the dashboard with the sheet open.** Rejected: see the deep-link argument
  above. It also means a sailor completes sign-in on the wrong page.
- **Give the locked boat screens a self-contained invite so they can ship before LAY-53.** Rejected: it
  means building an invitation twice and deciding its copy twice, for a ticket that is already
  `ready-for-agent`.
