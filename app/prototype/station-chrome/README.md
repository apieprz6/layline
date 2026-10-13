# Prototype — the station page's decluttered chrome across breakpoints (LAY-168)

**Throwaway.** Nothing here is production code. The charts, scale control and time
scrubber are the real components on real 72h buoy history; only the chrome around them
is drawn three ways. Delete the folder once a variant wins; the branch keeps it.

## Verdict — Variant A won (2026-10-13)

The owner picked **A — Shrink in place** whole. What the build inherits:

- **Header: one row.** Back, station name with the id beside it, `· Latest HH:MM`
  from 768px up, and the live pill. The metadata row is gone, and with it the
  **"Fetched X ago"** age. Measured 43px, down from 94.
- **Dock: stays fixed at the bottom, two rows.** Scale control with the Live button
  beside it, then the scrubber. The "Scale" and "Time scrubber" labels go, and the
  date-range caption shows only from 768px up. Measured 121px on phone and 137px from
  768px, down from 181. LAY-61's 80% / 60% centring at 1024 / 1440 is unchanged.
- **Jump to and Legend are deleted**, and the stats panel loses its tab bar.
- **The modules get a third grid column from 1024px**, appended to LAY-61's ratio:
  `3fr 2fr 1fr`, then `1fr 1fr 0.8fr` at 1440 with Gust and Wave side by side.
  Hidden below 1024.
- **Ultrawide gets no bucket of its own.** 1440+ already has room, so C's 1920px
  breakpoint is not built.

Left open for the build, because A does not answer them:

- **The CHII2 85ft note has no home.** It lived in the Legend, and AGENTS.md
  requires the UI to explain the elevation, so the build must place it somewhere.
- **The 1024px third column is narrow** (about 190px at 1280). Whether that is
  enough is LAY-169's call once Gust and Wave have content.

**Owner's caveat (2026-10-13): Gust and Wave may be folded into the existing charts**
rather than getting modules of their own. If they are, A's third column has nothing to
hold. The 1024+ grid then stays LAY-61's two columns, and the space A freed goes to the
wind rose, speed chart and stats panel. The 190px question goes away too. The header
and dock parts of A don't depend on this. Which way it goes is LAY-169's to decide.

B and C stay in this folder as the record of what A was chosen against.

## Run it

```bash
npm run dev
# http://localhost:4000/prototype/station-chrome?variant=A
# ...?variant=B&buoy=45198      (Purdue buoy instead of CHII2)
```

`variant` is `A`, `B` or `C`; `buoy` is `CHII2` (default) or `45198`. The floating bar
cycles variants (arrows, or ← / →) and collapses with `▼`. It is hidden in production
builds, so under `next start` switch with the URL instead. Resize the window across
**390 / 768 / 1024 / 1440 / 1920+** — the breakpoints are the question.

## The question

What should `StationHeader`, `BottomControlsDock` and the space freed by removing
**Jump to** and **Legend** look like at phone / tablet / desktop / widescreen — and does
a true ultrawide range need its own treatment beyond the 1440+ bucket?

## What is fixed in all three (not a variant question)

- **LAY-61's grid is untouched**: 768/1024/1440 breakpoints, 3fr/2fr → 1fr/1fr, copied
  verbatim into `grid.module.css` (copied only because the route must not edit
  production CSS). Variants may *append* a track for modules, never re-ratio the two
  LAY-61 columns.
- **Jump to and Legend are deleted, not un-tabbed** (supersedes LAY-62). `StatsOnly.tsx`
  is `WindowStats` with no tab bar — a tab bar for one tab is not a choice worth drawing.
  Consequence worth noting: the Legend carried the **CHII2 85ft note** ("surface wind
  typically 20–30% lower"). It has no home in any variant yet; AGENTS.md says that
  context must be explained in the UI, so wherever it lands is a follow-up for the build.
- **Scrubbing and scale selection behave exactly as today** — the state is
  `StationPageClient`'s, copied into the harness.
- **Gust/Wave modules are dashed placeholders** (`ModuleSlot`). LAY-169 designs their
  content; this only decides where they sit.

## How the three disagree

| | **A — Shrink in place** | **B — Let the charts breathe** | **C — The dock stops floating** |
|---|---|---|---|
| Header | One row: back, name + id, (768+: "Latest HH:MM"), live pill. Fetched age dropped | Two rows that **collapse to one on scroll**; live pill becomes a dot | One row: back, name + id, live pill |
| Dock | Fixed bottom, two rows: scale + Live button, scrubber; date-range caption 768+ only | Fixed bottom, **one row** everywhere: scale · scrubber · offset · ⏺ | Phone: fixed bottom, two rows. **768+: no floating dock** — a static rail under the header |
| Chrome height, measured in Chromium (today: **94 + 181 = 275px** at every width) | 43 + 121 = **164px** phone / 43 + 137 = **180px** 768+ | 68 + 79 = **147px** (header shrinks further on scroll) | **164px** phone / **118px** 768+, all at the top |
| Freed space goes to | A **third grid column** from 1024 (modules stacked), side by side at 1440 | The **existing panels getting bigger**; modules in a strip under the grid at 1024+ | Module strip at 1024, appended column at 1440 |
| Ultrawide (1920+) | No new bucket — 1440's column already has room | No new bucket — content keeps LAY-61's cap, whitespace is fine | **Its own bucket**: Gust and Wave each get their own column |
| Phone (390) modules | Hidden | Hidden | Hidden |

Things to look at specifically:

1. **Does dropping the "Fetched X ago" line cost trust?** A and C drop it; only B keeps
   it (and only until you scroll). Provenance-minded sailors may want it.
2. **B's one-row dock at 390px** — scale buttons and scrubber share one line. Is the
   scrubber still a usable thumb target?
3. **C's top rail at 768+** moves the controls away from the thumb on tablets. Does a
   tablet on the dock count as "phone" for reach purposes?
4. **Is a third column at 1024 (A) too narrow** for anything LAY-169 might put there?
5. **Ultrawide**: C's 1920 bucket vs. A/B's "no". That's the yes/no the ticket asks.

## Looked at, and what that does not cover

All three were screenshotted under `next start` at 390, 820, 1280, 1536 and 2560 wide
(`shots.mjs`; `shots-baseline.mjs` does today's `/station/CHII2`), with no horizontal
overflow at any of the 15. Not checked: touch-dragging the scrubber in B's one-row dock,
and the iOS safe-area inset (Chromium reports none). The `-72h` scrubber label clips at
390px in today's page too. That's `TimeScrubber`'s, not this prototype's.

## Layout of the folder

- `page.tsx` — fetches real history (same calls as `app/station/[buoyId]`).
- `PrototypeStationChrome.tsx` — the harness: scrubbing state + `?variant=` wiring.
- `PrototypeSwitcher.tsx` — the floating bar.
- `grid.module.css` — LAY-61's grid, copied.
- `VariantA|B|C.tsx` + `.module.css` — each variant's own header, dock, and module
  placement.
- `StatsOnly.tsx`, `ModuleSlot.tsx`, `shared.ts` — what all three agree on.
