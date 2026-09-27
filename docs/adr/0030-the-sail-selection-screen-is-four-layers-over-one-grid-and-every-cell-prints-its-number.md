# ADR 0030: The Sail Selection Screen Is Four Layers Over One Grid, and Every Cell Prints Its Number

## Status

Accepted. Resolves LAY-146 ("Prototype how the Sail Selection Chart visualizes matched race data") —
its three questions being how a cell communicates coverage vs. performance vs. **disagreement**, how
the legend and the tap-through scale, and how a filtered view re-renders.

Builds on ADR 0025 (**Countable**), ADR 0026 (the analysis query layer), ADR 0028 (the Polar
interpolates, the Crossover Chart floors, neither resamples the other), ADR 0029 (the **Analysis
Filter** is a rail over a **Coverage Ledger**, filters client-side, and gives this screen five
dimensions), ADR 0023 (the Crossover Chart owns the only sail vocabulary) and ADR 0012 (absence
renders as a legitimate answer). Constrained throughout by the night-vision theme (ADR 0024's store,
`app/globals.css`), which collapses all eight `--sail-band-*` tokens to red tints and flattens
`--state-success` / `--state-warning` / `--state-danger` to reds.

The three variants this was decided against live on the throwaway branch
`prototype/lay-146-sail-selection-cells` (`7dd039e`, refined in `6d8e077`), not in `main`. That branch
is **local only**: it carries aggregates computed from the owner's private archive, so it is a primary
source to read beside this ADR, not something to publish.

## Context

The mockup marks a matched cell with a single **dot** — "cell has matched race data" — and prints race
count and `% of target speed` in a list underneath. Two visual states, one number per matched cell, no
filter, no tap-through.

Three variants were built as a throwaway route and driven by the **real archive** rather than invented
data: the thirteen Races, the boat's own `.sailselect` Crossover Chart and `.pol` Polar, put through
Row Quality (`services/recordings/row-quality.ts`), the LAY-140 maneuver window at (1, 3), ADR 0025's
**Countable** rule, floor lookup on both of the chart's axes and bilinear **Target Speed** honouring
the Polar's suppression floor. It reproduces the figures the earlier ADRs already record — 6,337 rows,
4,088 in-window, 870 Frozen, 415 in a Maneuver Window, 2,707 Countable — which is the check that it
reads the archive the way Layline does.

What that produced is the whole design problem, and it breaks the mockup in four separate places:

- **The grid is 26 angles × 13 wind speeds — 338 cells — and 150 of them have any Countable row at
  all.** 86 of those 150 hold fewer than ten rows; 39 were reached by a single Race. A dot that means
  "has data" says the same thing about a cell with 4 rows from one Race and one with 90 rows from
  seven.
- **74 cells can never carry a percent of Target Speed.** The chart's 35° and 40° rows sit below the
  Polar's first measured angle (45°, where `polarSyntheticRows.ts` stops calling rows filler), and its
  25 kt and 30 kt columns sit past the Polar's last, where ADR 0028 forbids extrapolation. On top of
  that, **11 cells hold Countable rows and still have no computable target.** A cell therefore has
  more than two states however the screen is drawn.
- **Disagreement is a proportion, not a flag.** 947 Countable rows carried the sail the chart
  recommends, 298 carried a different one, and **1,299 — nearly half — carry no Sail Configuration at
  all**. 38 cells hold *both* agreeing and differing rows; 31 reached cells cannot be judged at all.
- **Colour cannot be the carrier.** In night vision the eight sail bands become red tints of each
  other and the three state colours become reds, so any encoding that lives only in hue is unreadable
  on the exact screen a sailor uses at night — and this archive contains a 14-hour overnight race.

Average percent of target across reached cells runs 63.5% to 114.1%, median 89.6, with 32 cells below
85%.

## Decision

### One quantity per grid, four layers, small multiples as the switcher

Coverage, percent of target and agreement do not fit together in a cell 24px wide, so the screen stops
trying. The same grid is drawn four times — **Chart** (the recommendation itself), **Coverage**,
**% target**, **Agreement** — and a cell prints **one number**. Four thumbnails of those grids sit
above the full-size one and are the switcher: small multiples, read as shapes, tapped to enlarge. The
comparison between coverage and performance becomes a glance up rather than a decoding exercise.

The **Chart** layer is never filtered and never annotated. The chart is the chart: its recommendation
does not become less true because no Race reached that cell.

### Every cell prints its number; colour finds the shape

Each layer is coloured, mixed from the tokens the app already owns with `color-mix()` — a sequential
single-hue ramp of `--text-accent` for Coverage, because a race count has an order; the four state
tokens in bands for % target (`<85`, `85–94`, `95–104`, `105+`); `--state-success` /
`--state-warning` / `--state-danger` plus a muted neutral for Agreement, because a verdict does not.

**And every cell prints the number or glyph anyway.** This is not decoration: in night vision all of
those tints collapse to reds, and the print is what still says which band a cell is in. The shipped
`CrossoverChartGrid` already holds this rule for sail ids ("the colour is how the shape is seen; the
number is how the sail is identified"); this extends it to all four layers.

Above target gets **its own band**, not a fold into "on target": 105%+ is either genuinely fast or a
calibration story, and both are worth being able to find.

### A cell has five states, and none of them is a fabricated zero

1. **Unreached** — no Countable row under the current narrowing. Blank, and blank means blank.
2. **Reached, with a percent** — the number, in its band's tint.
3. **Reached, with no computable target** — 11 cells today. Prints `–`, in a neutral tint, never 0 and
   never an average of the rows that do have one.
4. **Structurally incapable of a target** — the 74-cell region. Also `–`, with the legend stating why
   (below the Polar's first measured angle, or past its last column) so the two `–` cases are
   distinguishable by where they are rather than by guessing.
5. **Ghosted** — had rows before the current narrowing and has none under it. See below.

This is ADR 0012's stance applied to a grid: the absence of a target is a legitimate answer with a
reason, not a hole to fill.

### Disagreement is four verdicts and a reserved fifth, never a "wrong" mark

Per cell, over its Countable rows: **Agrees** (`=`), **Differs** (`≠`), **Mixed** (`±`, and 38 cells
are mixed), **Not recorded** (`?`, 31 reached cells, ADR 0029's word). The glyph carries it and the
tint agrees with the glyph.

A fifth state is reserved and empty: **Off-chart**, for rows whose Sail Configuration names no Sail
Definition — ADR 0029's *Note only*, which is mainsail alone in this archive. It must **never** be
counted as disagreement: flying something the chart has no word for is not the crew contradicting the
chart's advice, it is the vocabulary running out (ADR 0023).

It is empty for a reason worth recording. Those 4 rows sit at **TWS 3.0–3.6 kt**, below the chart's
own first column (4 kt), so they have no floor and no recommendation to disagree with — they cannot
appear in any cell. The map left the Crossover-Chart-vocabulary question unticketed on the assumption
that this is "the screen where an unnameable sail actually has to be plotted". It is not: today that
sail is never plotted at all.

And the word is never "wrong". A cell where the crew flew something else is a cell worth looking at —
the chart may be wrong, the crew may have been right, or the wind may have been between columns.

### A narrowing blanks the cell and leaves a dotted ghost

The third question's three candidates were blank, dim, or the unfiltered state at lower opacity. The
answer is **blank plus a ghost**: a cell the narrowing emptied keeps a dotted outline where a solid
one would be, and prints nothing.

- Showing the unfiltered value dimmed puts a number on screen that the filter excludes. That is a lie
  with a legend, and on a grid of 338 cells nobody will consult the legend.
- Silently blanking loses the one thing a sailor wants from a narrowing: what it cost. Moderate seas
  alone takes this screen from 150 reached cells to 74 — the ghosts are how that is visible.

The **Chart** layer does not ghost, because it never filtered.

### Tapping a cell opens a breakdown where every line carries its own percent of target

Sub-question 2 asked for "the same sail / wave / time-of-day detail the Polar detail screen gives a
race point". The breakdown gives it, and **each line carries its own percent of Target Speed over its
own rows** — per Sail Configuration actually carried, per Sea State, per time of day, plus a line for
the rows whose sail was never written down. `no target` where a group has no computable one, never the
cell's average borrowed downward.

The cell average alone is misleading, and the archive says so plainly. 140° at 10 kt reads 91.4%
across 100 rows and 7 Races; underneath, it is 89.7% under Main + A2 against 92.9% on the rows nobody
annotated, 89.2% in calm water against 100.1% in slight chop, and 90.4% by day against 93.4% by night.
A sailor acts on the sub-figure, not the cell.

This is also the only place the sail actually carried is legible, and that matters more than it looks:
ADR 0029 gives this screen five filter dimensions, dropping "sail used" because the sail is the chart's
own answer. With no sail chip in the rail, the Agreement layer and this breakdown are the whole of it.

### The grid is the boat's own chart, at the full width of the screen

26 × 13 straight from the `.sailselect`, floor lookup on both axes (ADR 0028, and the TWA axis is read
the same way as the TWS axis). The grid takes the full width — out through the page's padding, with
`table-layout: fixed`, so the thirteen columns divide a 390px screen between them at ~27px each and no
sideways scroll is needed at phone width, with the angle column sticky and the scroll kept only as a
fallback for anything narrower.

## Consequences

- **`getSailSelectionData` must return per-slice sums, not per-cell averages.** For every cell:
  Countable row count, Race count, the rows with no target, the verdict tallies, and — for each (Sail
  Configuration, Sea State, time of day) slice — its row count, the count of rows that had a target,
  and the **sum** of their percents. Sums travel; averages do not survive re-aggregation under a
  narrowing. Per ADR 0029 these functions run in the browser, so they must stay pure and free of
  server-only imports.
- **The percent shown anywhere on this screen is an average of per-row Polar Efficiency over Countable
  rows**, and the count of rows excluded is stated wherever there is room (ADR 0025's requirement,
  which named this screen's coverage count as one of those places).
- **The 74-cell region is permanent** until the Polar gains measured rows below 45° or above 24 kt. It
  is a property of the two artifacts' shapes, not of how much racing has been logged, and its `–` must
  never become a 0 or an interpolation.
- **No new design tokens.** Every colour is a `color-mix()` of an existing one, which is what keeps the
  night-vision override working; `color-mix()` enters the codebase here for the first time.
- **Five cell states are testable and should be tested**: the aggregation in Jest, and the grid's
  geometry at 390px — a cell's position, a tap opening the right breakdown, the sticky angle column —
  in Playwright against `next start`.
- **The map's open question about a Crossover Chart vocabulary entry for mainsail alone is not settled
  here, and no longer belongs to this screen.** The premise that this screen forces it is false.

## Rejected alternatives

- **Everything on one grid (prototype Variant 1).** Bar length for coverage, a shape glyph for percent
  of target, hatching for a different sail, a dashed edge for "sail never recorded" — four encodings
  inside 24 × 22px. It is dense and genuinely beautiful at a glance, and unreadable in detail: the
  legend has four keys nobody holds in their head, and in night vision the hatch and the glyph are
  the only two that survive. It also has nowhere to put the third state of a target.
- **A ranked list of cells with a locator strip (prototype Variant 3).** Best of the three for reading
  exact numbers and for sorting by worst performance, and it made the small-sample problem impossible
  to miss. Rejected because the question the screen exists for — "where doesn't the chart match up
  right" — is a question about *shape*, about a region of the grid, and 150 cards is not a chart.
- **Colour with no printed number.** Fails night vision outright, which is where the reasoning for
  every colour decision on this screen starts.
- **Dimming filtered-out cells, or showing their unfiltered value at lower opacity.** Both put a
  number on screen that the current narrowing excludes.
- **One blended "health" colour per cell.** Collapses coverage, performance and agreement into a
  single hue, so a cell that changed colour never says which of the three moved — and the sparse cells
  (86 under ten rows) would dominate a blend that weights performance.
- **Interpolating a Target Speed into the 74-cell region so every cell has a percent.** ADR 0028, and
  a sailor pinching at 35° would read a number manufactured from the Polar's own filler.
- **Leaving the sail actually carried to the filter rail.** ADR 0029 drops "sail used" here, so
  without the breakdown's per-sail lines the carried sail would be visible nowhere on the screen whose
  whole subject is which sail to carry.
