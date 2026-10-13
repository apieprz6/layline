# Prototype — gust and wave content on the station page (LAY-169)

**Throwaway.** Nothing here is production code. Built on branch
`prototype/lay-169-gust-wave`, which branches from `prototype/lay-168-station-chrome`:
the header and dock are LAY-168's winning Variant A, imported from
`../station-chrome/`. The wind history is real (the same 72h fetch as
`app/station/[buoyId]`). **Gust and wave values are invented fixtures** (`fixtures.ts`)
whose shapes mirror what LAY-170 (PR #133) adds to `WindDataPoint` and `BuoyMetadata`.

## Verdict — Variant A won (2026-10-13)

The owner picked **A — Folded in**. Gust and waves fold into the charts already on the
page, with **no modules of their own**. What the build inherits:

- **No third column.** LAY-168 A's `3fr 2fr 1fr` / `1fr 1fr 0.8fr` track is dropped, and
  the grid stays LAY-61's two columns at every width. That also settles LAY-168's open
  question about the column being ~190px wide at 1280. LAY-168's header and dock are
  unaffected.
- **Gust on `SpeedLineChart`:** a shaded band from the speed trace up to the gust trace.
  A null gust breaks the band the way an outage breaks the trace. The y-axis scales to
  include gust, the title reads "Wind speed · gust", and the hover label reads
  "12.4 G18".
- **Gust on `WindRose`:** "G 18" under the speed readout. It shows "G —" when the station
  can measure gust but has no reading at that moment, and is absent when it can't.
- **Waves on `WindRose`:** a readout in the chart's bottom-left corner with height (ft),
  period (s), and a direction arrow plus compass word. The arrow points where the waves
  are going. When the station has the capability but no current reading, it shows "—"
  and "No reading since HH:MM".
- **Elevation note: a chip in the header**, "85 ft ⓘ", beside the station id. It
  qualifies every wind number on the page, which is why it sits there. Tap toggles it.
  The text comes from `windMeasurementHeight` + `adjustmentNote` and names speed and gust
  both. It appears only above 33 ft, so Purdue shows nothing.
- **Station Capability decides presence**, as in all three variants. CHII2 shows nothing
  wave-shaped anywhere.

Left open for the build:

- `WindRose` and `SpeedLineChart` need real props for this. The prototype copies them
  (`GustWindRose.tsx`, `GustSpeedLineChart.tsx`), and the build adds the props to the
  real components instead.
- At 390px the wave corner sits close to the rose's SW label. It fits, but check it
  once real readings arrive.
- "G —" on the rose has no "since HH:MM" line, unlike the wave corner. Decide whether
  gust needs one too.
- Not checked: the band on 1-minute data at 6h+ scales, and touch-dragging.
- Recommended: reword CHII2's `adjustmentNote` to the height-free claim used in
  `fixtures.ts`, and fix the undefined `--accent-blue` that `WindRose` uses.

B and C stay in this folder as the record of what A was chosen against.

## Run it

```bash
npm run dev
# http://localhost:4000/prototype/station-content?variant=A
# ...?variant=B&buoy=45198              Purdue: gust and waves
# ...?variant=C&buoy=45198&missing=1    Purdue, latest 2.5h of readings missing
```

| param | values | what it shows |
|---|---|---|
| `variant` | `A` `B` `C` | the three answers below |
| `buoy` | `CHII2` (default), `45198` | CHII2 measures gust but no waves, at 85 ft. Purdue measures both, at the surface |
| `missing` | `1` | blanks gust and waves for the last 150 min: the station can measure them but has no current reading |

In dev, the bottom bar cycles variants (or use ← / →), and the top-right bar toggles
station and `missing` and shows the capability state. Both bars are hidden under
`next start`, so use the URL there. Scrub and touch the charts too: every gust and wave
figure follows the moment the rose shows, not just the latest one.

## The question

How do wind gust and wave height, period and direction render on the station page, as
secondary readings inside LAY-168's shell? And, per the owner's caveat on LAY-168: do
they become **modules of their own**, or **fold into the charts already there**?
LAY-168 A's third grid column depends on that answer.

## What all three share (not a variant question)

- **Station Capability decides presence.** A station that can't measure something gets
  no card, row, line or readout for it at all. CHII2 never shows waves anywhere.
- **Capability without a current reading** shows "—" and one line: **"No reading since
  HH:MM"**. Nothing more, and never the last value carried forward as if current.
- **One elevation note**, `ElevationNote.tsx`, replaces the three copies ADR 0008
  flagged. The text comes from metadata: the height from `windMeasurementHeight`, the
  claim from `adjustmentNote`. It names **speed and gust** both. It appears only above
  33 ft (the 10 m anemometer standard), so Purdue gets none. Tap to toggle, so it works
  without hover; Escape or a tap outside closes it.
- **Recommended for the build:** CHII2's `adjustmentNote` becomes the height-free claim,
  "Wind at this height typically reads 20–30% higher than at the surface." The height is
  already its own field, and today's string repeats it.

## How the three disagree

| | **A — Folded in** | **B — Own modules** | **C — Gust in, waves out** |
|---|---|---|---|
| Gust | Shaded **band** from the speed trace up to gust, plus "G 18" under the rose's speed | A **Gust tile**: figure, "+N over speed", sparkline, window peak | **Tick** per gust reading above the speed trace, plus "G 18" on the rose |
| Waves | Readout in the **rose's bottom-left corner**: height, period, direction arrow | A **Wave tile**: height, period, "from NE" with arrow, height sparkline | One **strip** under stats in column 2: height · period · direction arrow |
| Grid | LAY-61's two columns. LAY-168 A's third column is **dropped** | LAY-168 A's **third column** from 1024. Below 1024 a **two-up strip** after stats | Two columns, plus an auto-height row in column 2 only when the station has waves |
| Elevation note | **Chip in the header** ("85 ft ⓘ"), beside the station id | Chip on the **speed chart's title** | ⓘ on the **rose's "Speed" label** |
| CHII2 | Nothing wave-shaped anywhere | Gust tile alone, filling a full-height column | No strip; layout identical to today's |

Things to look at specifically:

1. **B with CHII2 at 1280+:** one Gust tile stretched down a full-height column, mostly
   empty. The third column only earns its width on Purdue, and Purdue is seasonal.
2. **B changes LAY-168 A's "hidden below 1024".** Hiding gust and waves on the phone,
   the primary device, would make them desktop-only data, so B shows them as a strip.
3. **Band (A) vs ticks (C)** at CHII2's sparse cadence: ticks read as stray dashes, while
   the band reads as "the puffs ran this much over".
4. **A's wave corner** at 390px fits, but sits close to the rose's SW label. Is the rose the
   right home for a non-wind quantity?
5. **Where the note sits.** Only the header chip (A) visibly qualifies every wind number
   on the page; the other two attach it to one readout.

## Looked at, and what that does not cover

Every variant × {CHII2, Purdue, Purdue missing} × {390, 820, 1280, 1536} was
screenshotted under `next start` (`shots.mjs`), with no horizontal overflow in any of the
36. The elevation note was opened in every variant at 390 and 1280 (`shots-tooltip.mjs`)
and stays on screen. Not checked: touch-dragging, and how the band looks on 1-minute
data at 6h+ scales.

Two pre-existing quirks surfaced, both outside this prototype: `--accent-blue` (used by
`WindRose` for the compass word) isn't defined in `globals.css`, and the speed chart's
"KTS" unit label overlaps its top tick label.

## Layout of the folder

- `page.tsx`: fetches real history and lays the fixtures over it.
- `PrototypeStationContent.tsx`: the harness. LAY-168's scrub state, plus the gust and
  wave readings at the displayed moment.
- `Chrome.tsx`: LAY-168 A's header and dock, with a slot after the station id.
- `GustSpeedLineChart.tsx`, `GustWindRose.tsx`: copies of the real charts with gust and
  slot props added.
- `Modules.tsx`: tile, strip, corner, footnote, wave arrow, sparkline.
- `ElevationNote.tsx`: the one caveat.
- `fixtures.ts`, `readings.ts`, `shared.ts`, `variants.module.css`.
