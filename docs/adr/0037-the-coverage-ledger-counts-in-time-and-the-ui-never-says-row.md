# ADR 0037: The Coverage Ledger Counts in Time, and the UI Never Says "Row"

## Status

Accepted. Arose while building LAY-155, from the owner reading the finished screen: "the use of the
word 'row' in the UI here is extremely confusing for an end user."

**Amends ADR 0029** in two places, and nowhere else:

- its **Coverage Ledger** section states the match as `3251 rows · 13 of 13 races` and the gap as
  "Of those, 1,593 (49%) have no Sea state recorded." Both keep their jobs and change their unit:
  the match is stated as **measured sailing time**, and the gap as a share of that time.
- its ledger switch, "Include rows with nothing recorded", keeps its mechanism and loses its
  wording: it names the annotations it governs, and it governs only those.

Builds on ADR 0009 (which already refused to print a row count on the Race list), ADR 0036 (each
row weighted by its own measured interval), and ADR 0008's **Testimony** distinction. Does not touch
ADR 0026's row-grained matching: the *unit of a match* is still the **Recording Row**, and nothing
here changes what is matched or counted — only what is said.

## Context

**Recording Row** is the right name for the concept and the wrong word for a sailor. CONTEXT.md
already guards the term from being blurred — its _Avoid_ list rules out *sample*, *datapoint*,
*reading* ("a reading is one channel, a row is all of them") and *observation* — but that list is
about the engineering vocabulary, and it never asked what the screen should say. The Polar
performance screen shipped saying "row" or "rows" in nine places.

Three facts decided this, and the first two were already written down:

- **The Race list refuses to print a row count, for this exact reason.** `BoatPerformanceContent`:
  "A duration can be held against a sailor's memory of the afternoon; '6,337 rows' cannot be held
  against anything." The analysis screens then printed row counts in nine places without noticing
  that the archive list next door had already decided against it.
- **A row count is not proportional to the thing it is standing in for.** qtVlm logs on events, not
  on a clock: one archive recording's median in-window cadence is 75 seconds and the largest gap in
  the archive is hours wide. So 812 rows is twenty minutes on one recording and four hours on
  another, and a sailor comparing two bands by row count is comparing nothing.
- **The figures were already weighted by time.** ADR 0036 weights every row by its own measured
  interval, precisely because the rows are not evenly spaced. The ledger was stating the evidence
  in a unit the figures above it had already rejected.

The owner's own suggestions — "data points", "recorded data" — are the natural next move, and the
first is on the _Avoid_ list. Which prompted the better question: not *what word*, but *what unit*.

## Decision

### The Coverage Ledger states measured sailing time

`13 of 13 races · 4h 12m recorded`, and under it `3h 1m of it can be scored; 1h 11m is frozen,
low-speed or mid-maneuver.` and `Of that, 49% has no Sea state recorded.`

The races lead because that is what a sailor holds in their head — thirteen afternoons, of which
this is some — and the duration follows as the size of the evidence. Summed from each row's own
measured interval, which is the same number that weights every figure beside it, so the ledger and
the figures now count in one unit.

**It is a floor and never a wall clock.** The last row of each window has no measured interval
(`rowIntervalSeconds`), so a handful of rows a season contribute nothing, and a fall-back hour's
backwards step contributes nothing either. The copy says "4h 12m recorded", never "exactly".

A **row count survives in the data and not on the screen**: `CoverageLedger.matched_rows` is kept
for one job, telling "nothing matched" from "matched, but measured no time". A screen testing
`matched_seconds === 0` would call a real match an empty one.

### Everything else on these screens counts in time too

A band reads `96.1% · 2h 4m`, a band with nothing scorable reads *no scorable time*, the teaser
reads `3h 1m scored across 5 races`, and the Race list inside the `when` popover states each race's
duration. One unit per screen; a screen that mixed them would invite exactly the comparison that
does not hold.

The **filter chips keep a bare count**, which is the one place a number is not evidence: it is
comparative, it predicts what tapping does, and the chip carries no noun at all. What a screen
reader hears in its place says "matches" — `1,178 matches`, `no matches anywhere in the archive` —
because a chip is the one control where the honest word is about the filter rather than about the
sailing.

### The ledger switch names the annotations it governs, and governs only those

"Include sailing with no sea state or sail recorded", built from the dimensions the screen offers
rather than written out, so the **Sail Selection Screen** names the Sea State alone (ADR 0030).

And it acts on **Testimony dimensions only**, which is ADR 0029's own scope restored rather than a
new restriction. LAY-155 gave every dimension a **Not recorded** bucket, as its ticket required, and
then let the switch act on every dimension whose bucket could hold a row — which quietly swept in
wind speed and point of sail. Two reasons that line is wrong:

- **A sailor can act on one kind and not the other.** No Sea State is a race nobody annotated, and
  they can go and annotate it. No `TWS` is a gap in what the instruments logged, and no amount of
  annotating will fill it. One switch over both promises something it cannot deliver.
- **A switch has to be labellable.** Listing two annotations fits a checkbox; listing four
  dimensions, two of which the sailor cannot do anything about, does not — which is how it ended up
  saying "nothing recorded" and leaving a sailor guessing what they were admitting.

Nothing is hidden by the narrower scope: the ledger still states every gap it finds, including the
channel ones, and every dimension keeps its own **Not recorded** chip for isolating it.

The word **"Not recorded"** itself is untouched (ADR 0029), everywhere, including on the chips.

## Consequences

- `CoverageLedger` trades `total_rows` and `countable_rows` for `matched_seconds`,
  `total_seconds` and `countable_seconds`; `CoverageLedgerGap` trades `rows` for `seconds`.
  `AnalysisArchiveRace` trades `rows` for `seconds`.
- `AnalysisDimensionSpec` trades `absence_possible` for `annotation: string | null` — the sailor's
  own word for what they would write down, or null where nobody could have. One field now both
  scopes the switch and names it.
- `describeDuration` (`services/recordings/coverage.ts`) becomes a shared renderer for the analysis
  screens as well as the Race list, which is what keeps the two saying the same thing.
- Two suites assert, over the whole rendered screen rather than over one string, that the word
  never comes back: `PolarPerformanceContent.test.tsx` and `CoverageLedgerPanel.test.tsx`.
- CONTEXT.md's **Coverage Ledger** entry is edited by this ticket. **Recording Row**'s own entry and
  its _Avoid_ list are **not**: the term is still right for the code, and this ADR is about what the
  screen says, which that entry never claimed to govern.

## Rejected alternatives

- **"Data points", "samples", "readings".** The first two are on **Recording Row**'s _Avoid_ list
  and the third is both on it and wrong — a reading is one channel, a row is all twenty-one. They
  also leave the real problem untouched: the quantity still is not proportional to the afternoon.
- **"Recorded data" as a mass noun, keeping the counts.** The smallest change, and the one the owner
  reached for second. Rejected because `3,251 recorded points` is still a number nothing can be
  held against, and because it would leave the ledger counting in a unit the figures above it had
  already rejected.
- **Time, plus the row count beside it for a visible denominator.** `1,593 (49%)` is checkable in a
  way `49%` is not. Rejected as the worst of both: it reintroduces the word in the one place the
  sailor reads most carefully, to make a figure auditable that the detail screen is already the
  place to audit.
- **Dropping the quantity entirely and showing only percentages.** Leanest, and it breaks ADR 0025's
  rule that a screen states the coverage behind its figure.
- **Durations on the filter chips too.** Consistent, and arguably easier to weigh — but it costs a
  per-bucket interval sum on every popover open to replace a number that is already noun-free, and
  the one thing a chip's number must do is predict a tap.
