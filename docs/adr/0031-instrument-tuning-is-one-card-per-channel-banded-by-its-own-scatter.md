# ADR 0031: Instrument Tuning Is One Card per Calibration Channel, Banded by Its Own Scatter, and Each Card Opens Its Chart

## Status

Accepted. Resolves LAY-147 ("Prototype the Instrument Tuning screen") — its four questions being how
three channels' trended diagnostic data is laid out, how "diagnostic only, no suggested fix" reads on
screen, whether and how **Calibration Event** dates annotate a trend, and what the Overall-tab teaser
says next to the "Instrument calibration" row it has to be told apart from.

Builds on ADR 0025 (**Countable**), ADR 0026 (the analysis query layer), ADR 0027 (`SOG` is the
efficiency numerator, and the paddlewheel-vs-`SOG` check whose era-partitioning technique this screen
adopts wholesale), ADR 0029 (the **Analysis Filter** is a rail over a **Coverage Ledger** and filters
client-side), ADR 0012 (absence renders as a legitimate answer), ADR 0030 (the sibling screen's rule
that colour finds the shape and the print identifies the value) and ADR 0024's theme store, whose
night-vision mode collapses `--state-success` / `--state-warning` / `--state-danger` to reds. Rests
throughout on `docs/research/compass-calibration-and-awa-offset-port.md` (LAY-145) for the compass and
`AWA` gates, and on `docs/research/qtvlm-csv-columns.md` for the recording format's own limits.

**Answers the question ADR 0029 assigned to this ticket by name**: whether the `when` dimension
survives here or is replaced by partitioning on **Calibration Era**. It is replaced.

**Opens** [Prototype the three per-channel diagnostic charts behind Instrument
Tuning](https://linear.app/layline-sailing/issue/LAY-149), which owns the form of the three charts this
screen's cards open, and which may yet replace the *basis* of the verdict this ADR settles — see the
open question below.

The three variants this was decided against live on the throwaway branch
`prototype/lay-147-instrument-tuning` (`c82ede5`, named in `7713103`, drawers added in `62e6710`), not
in `main`. Unlike LAY-146's prototype, **it runs on invented data, and that is a real limitation of what
it can prove.** Nothing in the repo computes any of these three figures yet — LAY-145's port is
unwritten and ADR 0027's regression is unwritten — so there was nothing to read. The fixture is instead
shaped to the facts the archive's own documents already record: thirteen Races across one season, the
~10–12° of `HDG` deviation in everything before July 2026, the 13.68-hour St Joe distance race against a
beer-can's ninety minutes, the 19.8% of rows with no `STW` at all. What the prototype demonstrates is
therefore *layout under realistic shapes*, not aggregate figures, and the numbers quoted below are the
fixture's unless stated otherwise.

## Context

LAY-138 asks for three instrument checks on one screen. Nothing exists: `services/analysis/` has no
files, no screen reads a **Calibration Log** for anything but the log itself, and the map's own
description leaves "whether Calibration Event dates mark the trend" explicitly unspecified.

**The three figures are not three instances of one thing, and that is the whole design problem.**

- **`HDG` → Measured Offset for `HDG`, via `COG`.** Degrees. Binned by heading at 10° — the resolution
  the nke fluxgate uses for its own deviation table during an autocompensation (user guide p.6 §2.2.1,
  "every 10° with an accuracy of 0.25°") — so its natural shape is 36 bins around a rose, and a bin with
  fewer than 3 rows has no figure at all. Its caveat is that `CTW = HDG + leeway`, so part of it is
  leeway rather than compass.
- **`AWA` → Apparent Wind Asymmetry.** Degrees, and **explicitly not a Measured Offset.** LAY-145
  established that the recording's `AWA` is qtVlm's recomputation from `TWS`, `TWA` and `STW`, never the
  masthead's own reading, and that `TWA` depends on `CTW` — so the asymmetry cannot be pinned on the
  vane. Its natural shape is tack pairs at a matched point of sail, upwind (`AWA` < 50°) and downwind
  (`AWA` > 110°) computed separately, reaching discarded.
- **`STW` → Measured Offset for `STW`, via `SOG`.** Knots. A regression, reported as an `R²` plus a knot
  gap from the 1:1 line, and per ADR 0027 **never** as a drafted `(multiplier, offset)` pair. Its natural
  shape is a scatter, it needs ≥3 kt of `SOG` spread before a Race earns a fit line at all, and 19.8% of
  rows have no `STW` to plot.

Three units, three denominators, three different reasons a Race can produce nothing, and one of the
three must not be called by the name the other two share.

**The era boundary in this archive is real, dated, and known from two directions.** The boat's compass
was autocompensated on **2026-07-04**; `docs/research/qtvlm-csv-columns.md` independently measured a
~10–12° step in `CTW − COG` across that date, and CONTEXT.md records the same thing as a property of
every recording made before July 2026. Every figure on this screen is meaningful only inside one era,
and the step at that date is the most informative thing the archive currently contains.

**The channels are not independent.** A heading error propagates into the wind columns, because a
recording's true wind direction is computed from the compass. LAY-145 §2.6 turns that into a concrete,
testable check: an Apparent Wind Asymmetry that steps at the 4 July date is visible evidence the
asymmetry is compass-driven rather than masthead-driven — and that check only works if the `HDG` event is
drawn on the `AWA` chart.

**Two constraints from the neighbours.** Half this archive is unannotated — 1,593 rows, 49%, six of
thirteen Races carry no **Sea State** and no **Sail Configuration** (ADR 0029) — so a filter cannot be
this screen's spine. And in night vision every state colour becomes a red tint of every other, so no
verdict may live in hue.

## Decision

### One card per Calibration Channel, stacked, each card a summary of one measurement

Three cards, not a shared grid and not a shared timeline. Each holds, in order: the name a sailor uses,
the domain term directly beneath it spelled as the closed tickets settled it, the current era's figure
with its own σ and its Race count, which era that is and what opened it, the previous era's figure for
comparison, the per-Race trend, one line on how the figure is derived, the one caveat that must travel
with it, and the Races that produced nothing with the reason for each.

The order is `HDG` → `AWA` → `STW`, and it is causal rather than alphabetical: compass deviation leaks
into the wind columns and therefore into the `AWA` figure, so the channel that explains the others is
read first.

A card carries its own caveat because the caveat is not a footnote — "this is not a Measured Offset for
`AWA`" and "this assumes current is negligible" are load-bearing parts of the figures they sit under, and
a layout that pools three channels into shared rows has nowhere to put them.

### The verdict is a band measured against the figure's own scatter, never a value

`|figure| / σ` over the era's Races: **`WITHIN NOISE`** at or under 1, **`WORTH WATCHING`** at or under
2, **`CLEARLY OFF`** above. Three words, each with a one-line gloss on the screen itself, and the word
is always printed — never carried by the pill's colour alone, which night vision would flatten.

A figure inside one σ of itself is indistinguishable from the scatter that produced it; past two σ it is
a signal. The band therefore says *go and look at the instrument*, and it cannot say what to set it to,
which is what keeps the screen inside LAY-138's decision 7. The screen states the rest of that in plain
words: the correction is measured on the boat, on the water, and typed in by hand afterwards — Layline
records that you did it, and then measures what is left.

Judging against the figure's own dispersion rather than absolute thresholds also means there is no table
of degrees and knots to pick per channel, and none to re-pick per boat.

No band is ever a compliment. `WITHIN NOISE` means the measurement cannot distinguish this instrument
from a correct one, which is not the same as the instrument being right.

### Calibration Events annotate every trend they could plausibly have moved — including another channel's

This is the map's unspecified item, and the answer is yes, as dashed vertical rules on each channel's own
trend, labelled, at every date in the **Calibration Log** — both of its sources, the **Calibration
Events** somebody wrote down and the `HDG`/`AWA`/`STW` field changes in an **Instrument Calibration**
Version, exactly the merged output ADR 0027 already partitions on.

**And the `AWA` trend marks `HDG` events too**, drawn muted and labelled with the channel it belongs to
so it cannot be misread as a masthead event. This is the one cross-channel mark, and it exists for the
specific reason above: without it, the check that distinguishes a compass-driven asymmetry from a
masthead-driven one cannot be performed on the screen where the asymmetry is shown. Nothing else crosses
— `STW` carries its own marks only, because no other channel's history has any bearing on a paddlewheel.

### A Race that produced no figure is drawn, below the baseline, with its reason

A hollow tick below the axis where the Race sits on the date scale, and a line on the card naming each
excluded Race with its reason in words — too few valid points, too few steady segments, no tack pairs.
Never a point at zero, never a silent gap in the line (LAY-145 §2.4, ADR 0012). In the fixture that is
one Race with 3 compass points and four with no usable tack pairs; the `AWA` card's trend is
consequently full of holes, which is the honest picture of that measurement.

Population-level coverage is stated rather than filtered away: the `STW` card says on its face that the
paddlewheel had no reading for 19.8% of the rows, because those rows have no x-value and cannot appear in
the scatter at all (ADR 0027).

### The whole card is the target, and it opens a drawer rather than a route

Everything on a card summarises the same single measurement, so there is no part of a card that should
lead somewhere else, and a "see the chart" link in the footer makes a summary look like a container with
a link in it. The card itself is the control.

It opens a **bottom sheet**, not a route. The chart behind a card is the same measurement at higher
resolution, not a different subject; a navigation would throw away the sailor's place in a stack of
three cards they are comparing; and the app already owns this pattern in the **Auth Sheet** (ADR 0016,
sized by ADR 0021) — dim at `z-190`, sheet at `z-200`, a grab handle, Escape and the dim both closing it.

The card is `role="button"` with `tabIndex`, `aria-haspopup="dialog"` and an Enter/Space handler, not a
real `<button>`: a button's content model is phrasing content, and this card is a stack of headings and
figures. That choice is a debt, not a free win — see Consequences.

### The screen offers two filter dimensions, and `when` is not one of them

ADR 0029 left this screen's dimension registry to this ticket. It offers **wind speed** and **Sea
State**, and drops the other four.

- **`when` is replaced by Calibration Era partitioning, and the era is not a chip.** An era boundary is a
  Calibration Log date, and a figure is only meaningful inside one era. A month chip can cut an era in
  half or span two, and the second case silently pools two configurations of the same instrument — which
  is precisely what this screen exists to keep apart. The era is the screen's structure, so it does not
  become a seventh dimension in the rail; `when` simply leaves, and nothing takes its place there.
- **"Sail used" goes**, because there is no mechanism by which the sail carried moves a compass or a
  paddlewheel, and each channel's point count is already the scarce resource.
- **"Point of sail" goes**, by ADR 0029's own rule that a dimension whose values are the chart's own
  answer is omitted. It is the `AWA` chart's axis — the upwind/downwind split *is* the finding — a
  point-of-sail chip and a heading bin are the same cut made twice on the compass, and narrowing to one
  point of sail can destroy the ≥3 kt of `SOG` spread ADR 0027 requires before `STW` gets a fit line at
  all.

The two that stay earn it on physical grounds a sailor would recognise: both wind speed and sea state
change how the boat sits and how water passes the paddlewheel, and a fluxgate's deviation is not
independent of heel. They are the cuts most likely to show that an "instrument error" is really a
condition.

### The Overall-tab teaser is a row of the same shape, carrying a count

`Instrument tuning · 2 of 3 off band`, amber, counting the channels outside `WITHIN NOISE`; `all within
noise` and neutral when none are. Same row shape as its neighbours, no second line and no promoted
mini-chart, because the Overall tab's rows are a list of doors and a door drawn differently claims an
importance this screen has not earned over the others.

This leaves a collision, deliberately visible rather than papered over: the tab then has two rows
starting "Instrument …", both amber-pilled, meaning entirely different things — the existing one opens a
**file**, the new one opens a season of measurements. That is the Overall tab's problem to solve and it
is recorded as such on the map, not settled here.

### Two means of the same figure are both correct, and whichever is printed says which

A heading-binned mean and a row-weighted per-Race mean of the same channel over the same era are
different numbers — `+3.4°` against `+3.0°` in the fixture — because a bin mean weights every heading
equally while a Race figure weights rows, and the boat spends far more rows on some headings than others.
Neither is wrong and neither should be quietly preferred. Any figure on this screen states its weighting,
and a card's figure and its chart's figure are never presented as the same number.

## Consequences

- **`services/analysis/` gains three functions with three different return shapes, not one "offsets"
  function.** Each returns per-Race results *and* an era aggregate, and each must return the reason a
  Race produced nothing as data — the exclusion reason is rendered, so it cannot be expressed as a
  Race's absence from an array. Per ADR 0029 these run in the browser, so all three stay pure and free of
  server-only imports.
- **Era derivation is a per-channel filter over `buildCalibrationLog()`'s merged output** (LAY-145
  decision 7, ADR 0027), which means **the era spine depends on the owner having typed the Calibration
  Log in by hand.** Until the 4 July autocompensation exists as a **Calibration Event**, this screen has
  one era and the 10–12° step reads as an unexplained mid-season shift in the `HDG` trend. That is the
  correct failure: an era boundary inferred from a step in the data would be Layline asserting that a
  person did something to the boat, which is a Calibration Event's job and nothing else's.
- **ADR 0029's per-screen registry is now complete**: six dimensions for Polar performance, five for the
  **Sail Selection Screen**, two here. The registry rule itself is unchanged — this screen is its second
  and larger application.
- **The band is the standing answer to "how bad is bad", and its *basis* is the one thing LAY-149 may
  overturn.** See the open question below.
- **The drawer needs real focus management, and the Auth Sheet does not have it.** The Auth Sheet's own
  source documents the gap: it declares `aria-modal` and traps no focus. Shipping a second sheet with
  the same gap doubles it, so the shipped Instrument Tuning drawer should either fix focus or, better,
  the two should share one sheet primitive that has it.
- **Every band word and every figure is text on screen**, and no state is distinguishable only by colour
  (ADR 0030's rule, and the night-vision theme is the reason for it).
- **Testing splits the usual way.** The three aggregations, the era partition and the band arithmetic in
  Jest; the card's click target, Enter/Space, the drawer's Escape and dim close, and the whole screen at
  390px in Playwright against `next start` — the prototype's own screenshot script is a working example,
  and the reason it runs against a real build rather than `next dev` is that an unhydrated card accepts a
  click and proves nothing.
- **CONTEXT.md gains three terms** — **Calibration Era**, **Apparent Wind Asymmetry** (LAY-145 proposed
  it; this is the first screen that prints it, so it is minted here) and **Instrument Tuning Screen** —
  and its **Analysis Filter** entry gains this screen's dimension list.

### The open question this does not close

The drawer is what made the band arguable, and the contradiction is worth recording rather than smoothing
over. In the fixture the compass card reads `WORTH WATCHING` off `±2.7°` of race-to-race scatter over
seven Races — while the chart behind it rests on 78% of the rose and has a worst bin of `+6.1°`. The
`AWA` card reads `WITHIN NOISE` over two Races while hiding a 1.5° disagreement between its upwind and
downwind populations, which is the very thing that makes it not a Measured Offset.

**A tight σ measured over a third of the compass is a confident number about very little.** Whether trust
is better stated as *coverage* than as *scatter* belongs to LAY-149, which owns the charts where coverage
is visible. The band as specified here stands until that ticket answers; if the answer is coverage, the
band's arithmetic changes and its three words probably do not.

## Rejected alternatives

- **One era ledger — eras down, channels across (prototype Variant B).** The best of the three at "what
  changed, and when", and the only one that offers **no verdict at all**, which is very nearly the right
  answer to the second question. Rejected because a row of three cells in three units, each with its own
  denominator and its own reason for being empty, makes three incommensurable figures look comparable —
  and because it has nowhere to put the caveats, which on this screen are part of the figures rather than
  notes about them.
- **One shared timeline, three lanes, noise envelopes (prototype Variant C).** The best picture of the
  cross-channel story: the July rule crossing all three lanes at once is exactly LAY-145's correlation,
  made visible for free. Rejected as the primary layout because 58px of lane height is not enough to read
  a figure off at 390px, because it imposes one shared date axis on three channels whose eras do not
  align, and because its envelope encodes the verdict in geometry alone — the one thing that must survive
  as text. Its full-height rule is worth reaching for again when LAY-149 designs a shared view of the
  three charts.
- **Absolute thresholds in degrees and knots for the verdict.** Simpler to read and impossible to
  justify: the numbers could be derived from nothing, would need a separate set per channel, and would
  quietly stop being right as the archive grew.
- **A suggested correction, even greyed out or labelled "candidate".** LAY-138 decision 7, and ADR 0027
  already refuses to report a drafted `(multiplier, offset)` pair for `STW`. CONTEXT.md's own cautionary
  dialogue is about precisely this failure — a number appearing on screen beside a **Programmed Offset**
  is an instruction however it is styled, and for `AWA` it would be an instruction to correct the wrong
  channel.
- **A route per channel instead of a drawer.** Loses the sailor's place in the stack of three, and frames
  the chart as a different subject from the card rather than the same measurement drawn properly.
- **A "see the chart" drill-down link in the card footer.** What was built first, and rejected on review:
  it turns a card that summarises one measurement into a container with a link in it, and it puts the
  screen's main affordance on a small target on its least interesting line.
- **Drawing per-Race and older-era charts in the drawer now.** Would have answered a LAY-149 question by
  picking one — the drawer deliberately shows the current era only, so whether eras overlay, toggle or
  get their own charts is still genuinely open.
- **A `when` chip alongside the era spine.** Two controls over one axis, and the one that looks harmless
  is the one that can pool two instrument configurations into a single figure without saying so.
- **Inferring an era boundary from a step in the data** when the Calibration Log holds none. Layline
  would be claiming a human action occurred.
- **Omitting the Races that produced no figure, or plotting them at zero.** LAY-145 §2.4; a Race that
  happened and yielded nothing is a fact about coverage, and zero is a fabricated measurement.
