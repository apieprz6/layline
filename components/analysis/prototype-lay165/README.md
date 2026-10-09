# PROTOTYPE — LAY-165, the picture under the Polar performance filter rail

**Throwaway. Do not build on this.** It lives on `prototype/lay-165-polar-picture`, branched from
`origin/main` at `725e6f9` (so it has LAY-161's and LAY-164's shipped Race Track Heatmap in it), and
never lands on `main`.

> Three variants of the chart LAY-155 never built — season-wide under the real Analysis Filter rail,
> and the same three under the real per-Race page beside the real Race Track Heatmap — switchable
> via `?variant=A|B|C` and `?view=season|race|teaser` on `/dev/polar-picture`.

Run it: **`npm run prototype:lay165`**, then <http://localhost:4165/dev/polar-picture>. `←`/`→`
cycle variants, `↑`/`↓` cycle views; `?race=<id>` picks which race the race view is of (three are
built). `node components/analysis/prototype-lay165/shots.mjs` shoots all fifteen screens at 390px
and 1280px into `/tmp`.

**Build the data first:** `npx jest components/analysis/prototype-lay165/generate`. `archive.json`
is **gitignored** — 2.4 MB of the owner's own rows, which is the recordings themselves rather than
the aggregates LAY-149 committed, and this repo is public. It rebuilds from `~/git/Handsome-Pete` in
three seconds. Say the word and it can be committed so the branch builds unattended.

## This runs on the real archive, through the shipped pipeline

Not a fixture, and — unlike LAY-146's and LAY-149's generators — **not a Python re-port either**.
`generate.test.ts` reads the owner's `.csv` files and `.pol` through the repo's own
`parseQtvlmRecording`, `assessRowQuality`, `detectManeuvers`, `analysisRows`, `polarTargets`,
`computeRowEfficiency` and `raceTrackHeatmap`, and emits rows in the shipped `MatchableRow` shape.
So the rail, the Coverage Ledger and both headline figures on screen are the **shipped** components
computing the **shipped** numbers, and the only new code is the drawing. A chart that disagreed with
the figure printed above it would be a prototype arguing with the screen it is a prototype of.

The whole question here is how the Polar's *ragged per-cell trust boundary* should be drawn, so a
second implementation of `polarTargets` would have been a second opinion about exactly that.

13 Races · 4,088 in-window rows · **2,698 Countable** · 2,577 scored · **344 Filler-Anchored** ·
121 Countable but off the certificate's axes. (LAY-146's Python put Countable at 2,707; this is the
same rule run by the shipped module, so the nine-row difference is that one's roughness, not this
one's.)

**Two honest limits.** Sea State is 100% *Not recorded* here — the annotations live in the owner's
own database and `metadata.yaml` carries none — so that chip can only be judged for layout, not for
narrowing. And the `sail` chip is missing the three Sail Definitions this boat owns and has never
raced, for the same reason: the Crossover Chart Version lives in the database too. The per-Race
map's "Sail vs chart" overlay is empty for the same reason, and the map therefore offers five live
overlays rather than six.

## What each variant is a position on

| | **A — Rose** | **B — Panels** | **C — Grid** |
|---|---|---|---|
| **Q1 what shape** | a polar rose: speed in knots at an angle, the certificate's own curves behind it | two cartesian panels: percent of target against `TWA`, and against `TWS` | the certificate's own 16 × 9 table with the boat's figures in the cells |
| **the claim** | the boat's whole speed profile — the ratio is a colour on it | only the ratio, which is the quantity every other screen here speaks | per-cell coverage first, performance second |
| **Q2 filler-anchored** | drawn in place, hollow and stitched, **never coloured** | same refusal, on an axis: a hollow ring at its own height, value readable | **ADR 0036 colours itself** — computed, shown, flagged, and painted |
| **Q3 narrowing** | the rail narrows the trace; bins that empty vanish and the certificate stays | the line shortens; the evidence bars under it collapse first | cells blank to hatch; the count above says how many were lost |
| **Q3′ per-race reference** | the season as a dotted accent line (grey was unreadable — see below) | the season as a grey line on the same axes | cells the archive reached and this race did not, dashed and empty |
| **Q4 teaser** | a 150px rose, no labels | the by-angle sparkline | a 7px-cell grid, no numbers |
| **mobile** | tall (a half-disc is 2:1) but legible at 390 | the only one that fits both axes at 390 without scrolling | the grid is cramped at 390; it wants the desktop column |

## What the real archive showed, and the fixture could not

- **Compute-and-flag, drawn, is *flattering* — and that is the decision this prototype actually
  turns on.** ADR 0036 says a Filler-Anchored figure is computed, shown and flagged rather than
  withheld. Draw that on a diverging ramp centred on 100% and the certificate's ramp rows land at
  the **good** end: the 30° and 35° rows read **104% to 242% of "target"**, in teal, because what
  they are divided by is a ramp towards zero. 13 of the 16 filler-anchored cells that carry a figure
  read above 102%. The flag (a stitched outline) is quieter than the colour, and the colour says
  *fastest sailing in the archive*. Variant C shows this as ADR 0036 reads today; A and B both
  refuse the colour and keep the figure. **One of the three has to win, and it is a display
  amendment to ADR 0036 either way it goes.**
- **The trust floor really is ragged, and it is three different numbers.** The first anchorable TWA
  is **52° at 4 kt, 45° at 6 and 8 kt, 40° from 10 kt up**. A single inner radius would be wrong in
  eight of nine columns — LAY-150's finding, now visible as a curve that changes ink along its own
  length. 22 of 144 cells are `ramp-filler`, 113 `measured`, 9 `interpolated`.
- **Duration dominance is real in exactly one race.** Point share and time share track each other
  within a point and a half for twelve of thirteen races — except `06-20-26-chi-wauk`, which is
  **1.9% of the scored rows and 6.5% of the scored time** (150 rows over five hours). So an
  unweighted point cloud would under-count that race 3.4×, and a *binned, time-weighted* chart —
  which all three variants are — avoids the problem rather than arguing about it.
- **The weighting argument is small at the headline and decisive per bin.** Season Polar Efficiency
  is **92.4%** as ADR 0036's ratio of sums and **93.3%** as a plain mean of per-row percentages:
  0.9 of a point. Inside a single 10° bin the two can differ by far more, which is what decides
  whether a bin reads under or over 100% — so the rule earns its keep in the picture, not in the
  figure above it.
- **VMG Efficiency is 73.5% against Polar Efficiency's 92.4%.** A nineteen-point gap, on a figure
  ADR 0036 already makes carry a standing caveat. Worth knowing before anyone draws a "% of Target
  VMG" rose: it would read as a catastrophe, and the caveat would be doing all the work.
- **The boat has a shape, and it has a hole in it.** Two lobes — 40–60° and 120–150° — with
  **190 of 2,577 scored rows** between 90° and 110°. The rose shows that at a glance; the panels
  show it only as a thin patch of evidence bars; the grid shows it as empty cells.
- **86 of 144 cells carry a figure; 102 have been sailed at all.** The sixteen-cell difference is
  cells where the boat sailed and nothing could be scored, which is a distinction only the grid
  draws.
- **A reference ghost collides on the rose and works on the panels.** The first draft drew the
  season behind one race in grey — on variant A that made three grey lines on one picture, two of
  them the certificate's columns and one of them the boat. Fixed by drawing it in the accent,
  dotted; on variant B grey was never a problem, because the certificate is not in the picture.
- **The per-Race view's sparsity is worse than LAY-148 measured.** That ticket's case was 64
  scoreable rows of 258; the thinnest race here carries **28**, and three races carry under 50. The
  grid of one race is 36 of 144 cells.
- **Where it goes on the per-Race page answers itself.** ADR 0033's layout puts the map in a 620px
  column with the derived figures beside it, and the chart reads well in that second column at
  1280px — the two pictures of the same quantity, side by side, one spatial and one angular. At
  390px it simply stacks under the map, which is also right: the map is the race, and the chart is
  the summary of it.

## Things the ticket did not ask

- **The switcher has no `NODE_ENV` gate**, deliberately. `next start` *is* a production build and
  `next dev` never hydrates in this environment (AGENTS.md), so a bar hidden in production is a bar
  that can never be clicked. The gate is the route — `/dev/polar-picture` 404s without
  `LAYLINE_LAY165=1`, exactly as `app/dev/race-track` does — which is stronger: a stray merge
  leaves the whole page unreachable rather than one component invisible.
- **`app/dev/` is the right home for a prototype that needs the real app and no database.** LAY-149
  mounted its prototype inside `app/(app)/`, which needs an account and a Supabase client; this one
  needs neither, and the harness convention LAY-161 shipped fits it exactly.
- **The rose's radius is the ratio's own arithmetic.** A bin's time-weighted mean speed is
  `actual_distance_nm / elapsed_seconds` and its percent of target is
  `actual_distance_nm / target_distance_nm` — both out of one `EfficiencyAggregate`. Had the rose
  averaged `SOG` per row, it would disagree with the percentage beside it by a little, always.

## Still open, for the owner

1. **Which shape** — A, B, C, or a mix (the obvious mix is B's panels on the season screen and A's
   rose on one race, which is also the one combination that makes the two screens look unrelated).
2. **The filler colour**, which is the real decision: refuse the ramp (A, B) or let ADR 0036 paint
   it (C).
3. Whether the Overall-tab teaser becomes a picture at all, or stays the text LAY-155 shipped.
