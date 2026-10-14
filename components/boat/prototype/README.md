# Prototype — Boat performance layout, without the tabs (LAY-174)

**Throwaway.** `BoatPerformanceContent.tsx` is temporarily a `?variant=` switcher
instead of the real Races/Overall tabbed component. Delete this folder and restore
`BoatPerformanceContent.tsx` from `main` once a direction is picked.

Run it:

```bash
npm run dev
# http://localhost:3000/boat-performance?variant=A
# ?variant=B, ?variant=C
```

The floating bottom bar also switches variants (arrow buttons, or ← / →), and hides
itself in production builds.

## The question

The owner dislikes three things about the current `/boat-performance` screen:

1. **Tabs** hide Races behind Overall (or the reverse) — one is always a click away.
2. **"Upload a race"** is pinned above the race list, inside the Races tab panel —
   placement feels arbitrary.
3. The race list is a single column of full-width cards. On desktop and ultrawide
   viewports, each card still stretches edge-to-edge with the same three-line stack —
   wasted width, nothing using the extra room.

All three variants read the same `races` and `canWrite`, and are handed the same
`overall` node — the real Polar/Sail-selection/Instrument-tuning teasers, fetched by
the real page. Only the *arrangement* changes.

## How the three variants disagree

| | **A — Toolbar + grid** | **B — Sidebar rail + table** | **C — Feed + FAB** |
|---|---|---|---|
| Races vs. Overall | One scrolling page: "This season" section, then "Races" section, both always visible | Persistent left rail holds "This season"; races are the main pane, beside it rather than behind a click | A horizontally-scrollable "This season" strip pinned under the header; races below it |
| Upload a race | Toolbar action top-right, next to the page title | Inline in the Races section's own toolbar row, beside the "Races · N" heading | Floating action button, fixed bottom-right — reachable from anywhere, not tied to the top of a list |
| Race list on wide screens | Responsive card grid (`auto-fill, minmax(280px, 1fr)`) — 1 column at 390px, several at desktop/ultrawide | Dense table rows (Race · Window · Duration · File columns) that stretch to fill the row instead of leaving the right side blank | Compact horizontal row-cards (mark + two-line detail) in a grid, more rows visible per screen than A's taller cards |
| Season figures on wide screens | Grid alongside the races, each teaser card its own cell | Stacked in the rail, same width regardless of viewport — a sidebar, not a strip | Horizontal strip, same height as a race row, scrolls independently of the race list |

## What this does not settle

- Whether the race list should become a grid, a table, or something else entirely for
  the *production* component — these three are deliberately different structures so
  the feedback is "steal the grid from A, the toolbar button from B," not a vote
  between finished designs.
- Mobile (390px): all three variants collapse to a single column (B's rail wraps above
  the table via `flexWrap`), but none of them has been pushed on narrow-viewport
  wording or spacing — that is a finishing-pass question, not this one.
- The Overall teasers' own internals (`PolarPerformanceTeaser`, `SailSelectionTeaser`,
  `InstrumentTuningTeaser`) are untouched; only how they're arranged around the race
  list changes.

## Layout of the folder

- `PrototypeSwitcher.tsx` — the floating bottom bar, lifted from the LAY-168 prototype
  harness unchanged.
- `VariantA.tsx`, `VariantB.tsx`, `VariantC.tsx` — the three positions, each a full
  replacement for the tabbed view.
- `BoatPerformanceContent.tsx` (one level up) is temporarily the switcher. The real
  page (`app/(app)/boat-performance/page.tsx`) and its data fetching are untouched —
  only the client component it renders into has changed.
