# ADR 0028: The Polar Interpolates, the Crossover Chart Floors, Neither Resamples the Other

## Status

Accepted. Resolves LAY-142 ("Reconcile the Polar's and Crossover Chart's mismatched TWS axes"), which
[Prototype how the Sail Selection Chart visualizes matched race data](LAY-146) depends on for its
per-cell percent-of-target math.

Builds on ADR 0026's typed `computeRowEfficiency` seam — this ADR fills in how the Polar side of that
seam looks up a value, not the still-open numerator — and on the already-shipped row classification in
`services/boat/polarSyntheticRows.ts`. Closes the concern LAY-86 flagged about the Crossover Chart's `25`
column.

## Context

Four screens this map is speccing read the **Polar** and the **Crossover Chart** together — most
directly, coloring a Sail Selection Chart cell by percent of **Target Speed** pulled from the Polar. The
two grids don't share a TWS axis. This boat's Polar reads `[4,6,8,10,12,14,16,20,24]` — nine columns,
confirmed as the genuine, current ORC certificate axis for this class (ORC Rule 402.2 caps a certificate
at 24 kt). The boat's actual Crossover Chart reads `[4,6,8,10,12,14,16,18,20,22,24,25,30]` — thirteen
columns, extending six knots past anything a certificate can express, with an odd `25` sitting between
`24` and `30` where every other step is 2 kt.

Neither axis is hardcoded: `gridPayloadAxis.ts`'s `ascendingAxis` is the only rule both share — ascending,
non-negative, no requirement to be whole or evenly stepped — so this decision has to hold for whatever
axis a future upload defines, not just this boat's current numbers.

Nothing reads either file today. `services/analysis/` has no files (ADR 0026); no Target Speed
interpolation exists anywhere in the repo. `services/boat/polarSyntheticRows.ts` already classifies every
Polar row as `measured`, `interpolated`, `ramp-filler`, `partial-ramp-filler`, or `no-data`, and reduces
that to a per-file trustworthy-TWA boundary (`firstTrustworthyTwa`) plus the list of filler TWAs
(`suppressedTwa`) — built for the ~45° display-suppression rule CONTEXT.md already states
(`CONTEXT.md:521`), but nothing yet reuses it for interpolation itself.

## Decision

### Query each grid independently, at the row's own real TWS — never resample one onto the other

There is no grid-to-grid axis translation. A row (or a query point) has its own actual `(TWA, TWS)`; the
Polar and the Crossover Chart are each queried at that point against their own native axis. Neither grid
is ever resampled onto the other's columns.

### The Polar is bilinearly interpolated; the Crossover Chart is floor-looked-up

**Polar → bilinear interpolation.** Target Speed is a continuous quantity, and a row's real wind rarely
lands on a defined column. Interpolate across both the TWA and TWS axes between the two bracketing
rows/columns.

**Crossover Chart → floor/step lookup, never interpolated.** A sail id is categorical — there is no such
thing as "35% Sail 6, 65% Sail 8." Reading the chart at a row's TWS means finding the largest defined
column at or below that TWS and taking its recommendation as-is. Floor, not nearest-neighbor: a boat at
24.6 kt stays on the 24 kt recommendation rather than jumping early to 25's.

### The Crossover Chart's irregular steps — including 25 — are genuine, not artifacts

LAY-86 flagged the `25` between `24` and `30` as "odd enough to be worth confirming." It's real: qtVlm's
own documented example (`8;12;16;20;25;30;32`) and a second, independent vendor's published template both
use irregular TWS steps as ordinary practice — "the steps between TWAs and TWS is free of constraints" is
qtVlm's own words for it. On this boat's own chart, the `25` column differs from its `24` neighbor in 6 of
26 rows and from `30` in 18 of 26 — it's where the A2 gets retired for a reaching spinnaker at deep angles
before everything collapses to Reef+Jib3 by 30 kt. A column exists where the boat's sail choice actually
changes, not on a round grid. See `docs/research/orc-polar-file-formats.md` for the full corroboration.
This closes LAY-86's concern; it does not reopen it.

### Outside either grid's covered range, the answer is missing — never extrapolated

Two ways a query can fall outside a grid's covered domain, and both get the same answer:

- **Past either axis's defined columns** — above the Polar's highest TWS (structurally ≤24 kt for any
  ORC-derived polar, though the axis itself is read from the file, not hardcoded to that number) or below
  its lowest; above or below the Crossover Chart's TWS range. A floor lookup with no floor, or an
  interpolation with nothing to interpolate between, produces **missing**, not a clamped or extrapolated
  value. This boat's chart reaches 30 kt while its Polar stops at 24 — that gap is structural, not a
  converter shortcoming, so a Sail Selection Chart cell at 25 or 30 kt shows a sail recommendation with no
  Target Speed to shade it by.
- **Inside the Polar's manufactured filler rows.** `services/boat/polarSyntheticRows.ts` already
  classifies rows as `measured`, `interpolated`, `ramp-filler`, `partial-ramp-filler`, or `no-data`.
  Bilinear interpolation may only anchor on `measured` or `interpolated` rows; `ramp-filler`,
  `partial-ramp-filler`, and `no-data` rows are never used as an endpoint, on either side of the TWA axis
  a boat's file happens to pad. A query whose TWA falls outside the file's own trustworthy range
  (`firstTrustworthyTwa` and its symmetric counterpart, derived the same way from `suppressedTwa`) reports
  Target Speed as missing — reusing the same per-file classification the ~45° display-suppression rule
  already computes, rather than a second hardcoded cutoff that could drift from it.

No screen fabricates a plausible number in either case; a missing Target Speed is a real state a cell or
row can be in, same as an Unknown Sea State bucket (ADR 0026).

## Consequences

- `services/analysis/`'s efficiency seam (ADR 0026) gets a concrete Polar-side implementation: bilinear
  interpolation, gated by `polarSyntheticRows.ts`'s row classification, returning a missing Target Speed
  rather than a number when the query falls outside the Polar's trustworthy domain on either axis.
- A new Crossover Chart lookup function joins it: floor/step on the TWS axis, returning a missing sail
  recommendation below the chart's lowest column, and never resampled against the Polar's axis.
- LAY-146 (Sail Selection Chart) can build its per-cell percent-of-target math against a Target Speed
  that's sometimes legitimately missing, and design for that state rather than treating it as an error.
- LAY-86's flagged concern about the `25` column is closed; no further investigation is warranted absent
  a genuinely new chart that behaves differently.
- `CONTEXT.md`'s **Target Speed** and **Crossover Chart** entries gain their lookup rules; no new term is
  minted.

## Rejected alternatives

- **Snap one grid's axis onto the other's before querying** (resample the Polar onto the Crossover
  Chart's columns, or vice versa). Would either fabricate Polar values at TWS columns no certificate
  measures (18, 22, 25, 30) or discard the Crossover Chart's real crossover thresholds to fit the Polar's
  coarser axis — both destroy information a source actually provided.
- **Nearest-neighbor lookup on the Crossover Chart.** Considered because it's simpler than a floor.
  Rejected because the columns are thresholds, not samples: nearest-neighbor would flip a boat at 24.6 kt
  onto the 25 kt recommendation early, and at 27.5 kt onto 30's, both before the boat is actually there.
- **Treat the `25` column as a data-entry artifact and drop or renumber it.** Would have discarded a
  column that does real, corroborated behavioral work, on the strength of it merely looking irregular
  next to round 2 kt steps.
- **Extrapolate past either grid's covered range** (flat-line the last column, or linearly project past
  it). Rejected on the same "never fabricate a plausible number for a missing value" principle the
  founding data-integrity beliefs already state — a sail recommendation or Target Speed a source never
  actually covers should read as missing, not as a guess.
