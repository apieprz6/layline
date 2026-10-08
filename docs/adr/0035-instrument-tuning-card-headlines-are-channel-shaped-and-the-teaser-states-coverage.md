# ADR 0035: Instrument Tuning Card Headlines Are Shaped per Channel, and the Overall-Tab Teaser States the Worst Coverage Word

## Status

Accepted. Resolves LAY-152 ("Decide what each Instrument Tuning card headlines, and what the Overall
teaser counts, now the band is retired"), the question ADR 0034 opened and explicitly declined to
answer: "The `HDG` card's headline is now in question. The chart shows a ±10° curve behind a `+3.3°`
mean; whether the card should lead with the mean, the swing, or both is a separate decision." Also
settles the consequence ADR 0034 flagged but left open: "The card's figures and the Overall-tab
teaser ('2 of 3 off band') need a replacement count — what the teaser says under a coverage verdict is
not settled here."

Amends ADR 0032 in two places: the card layout's description of "the current era's figure" as one
number per card, and the Overall-tab teaser's `N of 3 off band` count. Does not touch ADR 0034's
chart forms, its coverage axis, or its `SOLID`/`THIN`/`ANECDOTAL` cut-points — those stand exactly as
decided. Does not touch the Overall tab's "two rows starting Instrument …" collision, which stays
parked on the map (LAY-138) as unspecified.

## Context

ADR 0034 retired the σ band for a coverage verdict, but left each card's headline exactly as ADR 0032
specified it: one signed mean of the current Era's figure, with its own σ, Race count, and (for `STW`)
`R²`. The real archive breaks that uniform shape in three different ways, not one:

- **`HDG` is a periodic curve, and the mean is not a representative point on it.** Since the 4 July
  autocompensation it reads `+12.7°` heading NNE and `−8.9°` heading WSW — a 22° one-cycle swing — and
  the card's `+3.3°` is the average of that curve, matching no heading the compass actually shows.
- **`AWA` is two populations that lean opposite ways, and their mean erases the finding.** Port reads
  `11.5°` wider upwind; starboard reads `10.2°` wider downwind. A single mean of the two sits near zero
  — not a lossy summary of the asymmetry, but a number that hides it entirely. Downwind rests on 2 Tack
  Pairs from 2 Races, `ANECDOTAL` by ADR 0034's own verdict.
- **`STW`'s gap is U-shaped by speed, and the chart already carries the figure that matters: the fitted
  line.** ADR 0034 gave the chart's readout as "the line's gap from 1:1 at 4 kt and at 8 kt," because a
  single scalar can't represent a U. The card had no equivalent of its own.

These are not the same problem with three faces. `HDG`'s issue is which point of an aggregate to lead
with; `AWA`'s is that there is no single aggregate worth leading with at all; `STW`'s is that the
chart has already solved this and the card simply hadn't adopted the answer. A rule written to fit one
of these does not fit the other two for free.

The teaser's old count (`2 of 3 off band`) counted channels past a trust threshold. Under coverage,
there is no "off" — `THIN` and `ANECDOTAL` say how little evidence a figure rests on, not that an
instrument is wrong. ADR 0034 established that distinction for the cards; a teaser that counted
low-coverage channels as if they were problems would reintroduce the same conflation one level up, in
the one place a sailor reads before deciding whether to open the screen at all.

## Decision

### Each card's headline is shaped to its own channel, not a shared template

The three cards keep ADR 0032's chrome — same slot order, same stacked layout, same causal
`HDG → AWA → STW` reading order — but the headline figure inside that chrome is no longer one
rule applied three times.

- **`HDG` leads with the swing.** The highest and lowest heading in the current Era's curve and the
  degree spread between them (e.g. `+12.7° at NNE to −8.9° at WSW — 22° swing`), mirroring the chart's
  own readout (ADR 0034: "leads with the curve's highest and lowest headings and the swing between
  them"). The era mean is kept, demoted to a secondary line beneath, with its weighting stated per ADR
  0032's "two means of the same figure are both correct, and whichever is printed says which." Leading
  with the swing instead of the aggregate also sidesteps the weighting question on the number that
  matters most: a single heading bin's own figure is not an aggregate the way the era mean is, so it
  carries no binned-vs-row-weighted ambiguity to disclose.
- **`AWA` drops the single mean entirely.** The headline is two signed figures side by side, upwind and
  downwind, each stating which tack reads wider (e.g. `Upwind: port 11.5° wider` / `Downwind: starboard
  10.2° wider`). A side resting on fewer than five Tack Pairs is flagged in words as too few to lean on
  — reusing ADR 0034's Tack Dial readout rule verbatim — rather than hidden or folded into an average
  that would misstate it.
- **`STW` shows the gap from 1:1 at 4 kt and at 8 kt**, promoting the chart's own two-point readout
  (ADR 0034) to the card rather than inventing a third representation of the U-shaped gap.

All three stay inside LAY-138 decision 7: none of these figures is a value to type into the
instrument. A swing is a description of where the curve sits, not two candidate corrections; a pair of
signed figures states what each tack reads, not what either should read; a gap at two speeds is a
measurement of the line, not its slope or intercept (which ADR 0027 and ADR 0034 already forbid
printing).

### The Overall-tab teaser states the worst coverage word, and carries no count

`Instrument tuning · solid`, `· thin`, or `· anecdotal` — the worst of the three channels' coverage
verdicts (`ANECDOTAL` > `THIN` > `SOLID`), lowercased, reusing ADR 0034's own vocabulary rather than
minting new words. No count: `2 of 3 thin` would have relocated the conflation ADR 0034 just corrected
rather than resolved it, since a bare number beside "instrument tuning" reads as a severity score
regardless of the word next to it, and the whole point of a coverage verdict is that low coverage is
not a severity.

Neutral tone throughout — not amber-for-bad, not green-for-good, matching ADR 0032's rule that no band
word was ever a compliment and extending it to the coverage word: `solid` is not praise and `anecdotal`
is not an alarm, each states how much evidence exists. Same row shape as its neighbours (ADR 0032): no
second line, no promoted mini-chart, no colour change. The "two rows starting Instrument …" collision
is untouched and stays exactly as parked on the map.

## Consequences

- **`services/analysis/` must expose the swing (per-Era max/min heading bin) and the upwind/downwind
  split as first-class results**, not just the aggregate mean — the card now reads data shapes the
  mean alone never needed to expose. The `STW` card needs no new shape: the 4kt/8kt gap is already the
  chart's own readout.
- **The teaser's status word is a pure function of the three cards' own coverage verdicts** — no new
  aggregation, no new cut-points, no new ADR 0034 machinery. It is a `max` over three already-computed
  words.
- **CONTEXT.md's Instrument Tuning Screen entry is rewritten** to describe a channel-specific headline
  per card rather than one uniform figure, and to describe the teaser as a coverage word rather than a
  count.

## Rejected alternatives

- **One shared headline template across all three cards** (e.g. always mean + swing, or always two
  sub-figures). Fits `HDG` by coincidence, actively misstates `AWA` (there is no single curve to split
  into a swing), and is redundant for `STW` (the chart's line is already the honest headline; a second
  invented scalar would compete with it). A shared rule would have repeated ADR 0032's original mistake
  of generalizing across three structurally different measurements.
- **Counting channels below `SOLID` on the teaser** (`2 of 3 thin or anecdotal`). Reintroduces a
  severity count one level above the cards that ADR 0034 just freed from one — a reader does not need
  to know the word next to the number to read "2 of 3" as "two things are wrong."
- **No status word on the teaser at all**, just a bare door. Considered and rejected: the Overall tab's
  existing rows (ADR 0032) each carry a status pill, and dropping this one's entirely would make
  Instrument tuning the one row on the tab that says nothing about itself before being opened.
