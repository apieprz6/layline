# ADR 0034: The Instrument Tuning Charts Are Interactive, and Trust Is Stated as Coverage, Not Scatter

## Status

Accepted. Resolves LAY-149 ("Prototype the three per-channel diagnostic charts behind Instrument
Tuning"), the ticket ADR 0032 opened to design the charts its cards open, and which it named as the
one place that might overturn the basis of its verdict band. **It does: this ADR supersedes ADR 0032's
σ band with a coverage verdict.** Everything else in ADR 0032 — one card per Calibration Channel, the
causal `HDG` → `AWA` → `STW` order, cross-channel Calibration Log marks, the bottom sheet rather than a
route, two filter dimensions with `when` replaced by Calibration Era — stands, and LAY-149's questions 5
and 7 are answered by it rather than here.

Also amends ADR 0027 in three places (the fit method, what "the line" may be drawn as, and the
population its blank-`STW` coverage stat is computed over). Builds on LAY-145's port spec
(`docs/research/compass-calibration-and-awa-offset-port.md`), ADR 0025 (**Countable**), ADR 0012
(absence is a legitimate answer) and ADR 0030 (the print identifies the value, colour only finds it).

The four variants this was decided against live on the throwaway branch
`prototype/lay-149-diagnostic-charts` (`d726674`), pushed but never merged. Variant **D** won, after two
rounds of review with the owner. **Unlike LAY-147's prototype, this one ran on the real archive**: its
`compute-charts.py` ports `compass_calibration.py` and `awa_offset.py` as LAY-145 specs them, plus ADR
0027's regression, over the 2,707 Countable rows of 13 Races (reproduced as LAY-146 did). Its output,
`charts.json`, is committed on that branch by the owner's choice, so the branch builds as it stands. The 2026-07-04 `HDG` era boundary was taken from Handsome-Pete's
`compass-calibrations.yaml`, standing in for the **Calibration Event** the owner has not yet entered
(ADR 0032's correct failure: until it is entered, the screen has one Era).

## Context

ADR 0032's cards each state one number. Behind each is a chart already specified in closed tickets —
the `HDG` binned deviation curve, the `AWA` tack-pair split, the `STW` `SOG`-on-`STW` regression — and
LAY-149 asked what those charts look like at 390px, how absent data reads on them, how the Race and
the Era levels relate, and whether trust is better stated as coverage than as scatter.

**The real archive answered the last question before any chart did**, and changed several others:

- **The compass error is a curve, not an offset.** Since the 4 July autocompensation it reads about
  **+12.7° heading NNE and −8.9° heading WSW** — a one-cycle swing of 22°. Before 4 July the curve has
  the same shape, about ten degrees higher. The autocompensation moved the mean and left the shape. The
  card's `+3.3°` is an average of that curve.
- **So the race-to-race σ ADR 0032's band divides by is mostly heading mix.** A Race that sailed north
  reads high and one that sailed WSW reads low; the scatter between Race means is a fact about which
  courses were sailed, not about how well each figure was measured. The band read `WORTH WATCHING`
  (`+3.3° / 2.6°`) off a quantity that is not noise.
- **No single Race covers the compass.** Per-Race heading coverage runs 14–56% of the rose. The era
  curve reaches 33 of 36 headings, but only 24 rest on two or more Races, and its most extreme bin rests
  on two.
- **Downwind Apparent Wind Asymmetry barely exists.** 18 upwind tack pairs from 10 Races; **2 downwind
  pairs** from 2. And they lean opposite ways — port reads 11.5° wider upwind, starboard 10.2° wider
  downwind — which a vane rotated on the mast would not do.
- **LAY-145 §2.6's check can now be read.** Across an autocompensation that moved the compass about ten
  degrees, the Asymmetry went from −3.8° to −5.5° (on 4 Races before and 6 after). That does not look
  compass-driven.
- **The `STW` gap is U-shaped on Countable rows**: about +0.45 kt at 2–3 kt, near zero at 4–6 kt, and
  +0.3 to +0.5 kt at 8–9 kt (the top end depends on whether rows are banded by `STW` or by `SOG`). ADR
  0027 measured a gap that grows steadily with speed, to roughly 10% at 9–10 kt, over all 6,337 rows
  with `SOG ≥ 3.5` — a different population, which includes **Frozen** rows and **Maneuver Windows**.
  Its numerator decision is unaffected; its description of the shape is refined here.
- **The fitted line's slope depends on how it is fitted.** Weighted as ADR 0027 specifies, regressing
  `SOG` on `STW` gives **0.94**; regressing `STW` on `SOG` and inverting gives **1.02**; an orthogonal
  fit, treating both instruments as noisy, gives **0.98**. The first says the paddlewheel over-reads at
  speed and the second says it under-reads. Least squares on one variable is biased flat by noise in the
  other, and here both are measurements.
- **ADR 0027's blank-`STW` coverage stat is zero on the rows the scatter reads.** All 935 in-window rows
  with no `STW` are Frozen (845) or Low-Speed (90). The 19.8% is a fact about the whole archive.

And the owner's review set two requirements no closed ticket had: the Apparent Wind Asymmetry chart must
make asymmetry **easy to see, upwind and downwind, for the season and for one Race**, because the season
figure is what guides how far the vane is set to one side; and the `STW` scatter's **line must stay on
screen**, because a straight line is the shape the instrument's constants act on.

## Decision

### Every chart is interactive, and two views of one measurement share one state

Each chart responds to touch and to the arrow keys: a tap picks a heading bin, a speed band or a tack
pair, and a **readout panel** under the chart — always present, so nothing jumps — says what was picked
and what it rests on. Hit-testing is done by the chart from the tap position, because a 10° bin at 390px
is nine pixels wide and no finger lands on that.

Where one measurement is best read two ways, the sheet offers **both behind a toggle over one shared
state**, not two stacked charts: the overlay, the selected Race and the selected bin or band all survive
the switch, so flipping views never loses the sailor's place, and a 390px sheet is not asked to hold two
charts' worth of height. The compass is **Strip | Rose**; boat speed is **Scatter | Gap by speed**.

### `HDG` — the deviation curve, as a strip or a rose

- **Strip** (default): one column per 10° bin across 0–360°, above the line reading high. Under it an
  **evidence row** prints how many Races each heading rests on.
- **Rose**: the same bins on a compass rose, outside the zero ring reading high — the form a sailor reads
  a deviation card in.
- **Absent and thin bins**: a heading no Race reached three rows on is **hatched, and no line or bar is
  drawn across it** — never interpolated. A bin resting on one Race is drawn hollow.
- **Levels**: the current Era is always drawn. Chips overlay **the previous Era as a dashed line** (on by
  default, because "moved, not flattened" is the most important thing the archive knows about this
  compass) or **one Race in amber**. A Race that produced no curve shows its chip dashed, and picking it
  says why.
- **Tapping a heading** shows its figure in this Era and the last, and every Race behind it with its
  row count — **including a Race whose bin fell under the three-row gate, listed as not counted** rather
  than omitted.
- With nothing picked, the readout leads with the curve's **highest and lowest headings and the swing
  between them**, and says plainly that the card's figure is the average of a curve.

### `AWA` — the Tack Dial

A new form, because none of the three first-round variants made asymmetry easy to see. The **Tack
Dial** is drawn bow-up, the way the instrument displays apparent wind: the boat at the centre, starboard
to the right, port to the left. Every **Tack Pair** puts a filled starboard dot and a ringed port dot at
the angle each tack held; upwind pairs sit in the top sector, downwind in the bottom, and the reaching
sectors (50°–110°) are drawn shaded and labelled as not used.

Port's average is **folded onto the starboard side** as a dashed ray. On a symmetric instrument the two
rays coincide; on an asymmetric one the gap is filled as a wedge and **labelled with its width in
degrees**. Upwind and downwind sit on one picture because comparing them is the check that distinguishes
a vane set off-centre — which leans the same way on both points of sail — from everything else.

- **Levels**: chips for the season, either side of the latest `HDG` Calibration Era boundary (so LAY-145
  §2.6's check is one tap), or one Race. A single Race is drawn over the season's rays in grey.
- **Weighting**: the rays are means per Race first, then across Races, so a long Race buys no extra
  influence; the readout says so.
- **The readout** states, per point of sail, which tack reads wider and by how many degrees, the signed
  Asymmetry, and its pair and Race counts — and flags any point of sail with **fewer than five pairs** as
  too few to lean on. A closing sentence says whether upwind and downwind lean the same way, and what
  that does and does not imply.
- **Tapping a dot**, or a row in the pair list beneath, picks that pair: its date and time, its rows,
  and its two angles.
- **Diagnostic only.** The dial says which tack reads wider and by how much. It never says what to set
  the vane to, and the caveat that travels with it says why it could not: the recording's apparent wind
  is qtVlm's recomputation, so the Asymmetry may be the vane, the compass, or the true-wind model. Where
  a season figure guides the owner's own adjustment on the boat, that is the owner's judgement made with
  the dial, not a value the dial supplied (LAY-138 decision 7).

### `STW` — a scatter with its line, and the gap by speed

- **Scatter** (default): `SOG` on `STW`, the dashed 1:1 line as the paddlewheel is currently configured,
  and **the fitted line drawn**, because a straight line is the shape the instrument's constants act on.
  A picked Race is lifted out in amber with its own line, if it clears ADR 0027's gates.
- **Gap by speed**: the same rows turned so 1:1 lies flat, with the mean gap per 1 kt band (every Race
  weighted equally) and the row count per band beneath. The fitted line is drawn here too, as a straight
  line against the flat 1:1, so the places the U-shaped rows leave it are visible. Tapping a band says
  the rows' gap there, the line's, and flags a disagreement over 0.1 kt.
- **The line is fitted orthogonally by default**, treating both instruments as noisy, and a toggle
  switches to ADR 0027's `SOG`-on-`STW` regression so the dependence on method is visible rather than
  buried. `R²` is the same either way; the knot gap (the weighted mean of `SOG − STW`) depends on no fit
  at all.
- **The line's coefficients are never printed** (ADR 0027, LAY-138 decision 7). The readout gives the
  line's gap from 1:1 at 4 kt and at 8 kt — a reading of the drawn line, in the Measured Offset's own
  unit — and the card keeps its gap and `R²`.
- **The blank-`STW` stat is computed over the rows the chart reads**, and where it is zero it says where
  the blank rows went: Frozen or Low-Speed.

### Trust is coverage: a verdict about how much the figure rests on

ADR 0032's `WITHIN NOISE` / `WORTH WATCHING` / `CLEARLY OFF` band is **retired**. Each card instead
carries a **coverage verdict** — `SOLID`, `THIN` or `ANECDOTAL` — and the reason in words beside it:

- `HDG`: the share of the 36 headings resting on two or more Races in the current Era.
- `AWA`: the pair count on the weaker point of sail, since an Asymmetry that cannot be compared upwind
  to downwind cannot be interpreted.
- `STW`: the share of Races carrying a line of their own.

The verdict says how much evidence there is, not how bad the instrument is; the figure and the chart
behind it say that. As with the band, the word is always printed and never carried by colour alone, and
no verdict is a compliment. **The thresholds are provisional** — the prototype used two-thirds and one
third for the shares, and five pairs per point of sail — and are to be revisited when the archive is
larger; the decision here is the axis, not the cut-points.

### The per-Race tile is numbers with coverage bars

On Race analysis, the Instrument calibration check tile shows that Race's three figures, each over a
thin coverage bar (share of the rose, pair count, `R²`) with the reason in words where a figure is
absent, and links to the season screen. Not a miniature of each chart: three small charts cost more of
Race analysis than one Race's thin evidence earns.

## Consequences

- **`services/analysis/` must return what the charts are interactive over, not just the figures.** Per
  Race: every heading bin with its row count *including bins under the gate*, every Tack Pair with its
  time, angles and rows, and every Countable `(STW, SOG)` row. Per Era: per-bin Race counts and per-Race
  means. The exclusion reason stays data, as ADR 0032 already requires. All of it stays pure and
  isomorphic, since ADR 0029 moved aggregation into the browser.
- **ADR 0032's band arithmetic goes away**, and with it the σ over Race means. The card's figures and
  the Overall-tab teaser ("2 of 3 off band") need a replacement count — what the teaser says under a
  coverage verdict is not settled here.
- **The fit method is a decision the shipped screen carries**, not a prototype curiosity: orthogonal by
  default, with the method stated beside the line.
- **The `HDG` card's headline is now in question.** The chart shows a ±10° curve behind a `+3.3°` mean;
  whether the card should lead with the mean, the swing, or both is a separate decision (see the map).
- **CONTEXT.md** gains **Tack Dial** and **Tack Pair**; **Instrument Tuning Screen** loses the band and
  gains the coverage verdict; the invariant that the screen "reports figures and a band" is amended; the
  `STW` shape note under Polar Efficiency's resolved ambiguity is refined.
- **Testing**: the bin, band and pair arithmetic and the coverage verdicts in Jest; every tap, toggle and
  arrow key in Playwright against `next start`, asserting the readout changed — the prototype's
  `shots-d.mjs` is a working example, and it asserts rather than just shooting because a tap on an
  unhydrated chart succeeds and changes nothing.

## Rejected alternatives

- **A rose only, or a strip only, for the compass** (variants A and B). The rose is the sailor's own form
  and the strip is the one legible at 390px; the owner wanted both, and a shared-state toggle costs
  nothing a second chart would not.
- **Two stacked compass charts.** Doubles the sheet's height for one measurement, and loses the shared
  selection that makes flipping between them useful.
- **Every Race as its own miniature under the era chart** (variant C). Persuasive about what the era is
  made of, and the only form that made the §2.6 check visible — which the Tack Dial now does with one
  chip. Too tall for three channels, and a grid of thin minis invites reading each as a verdict.
- **Strips of pair offsets, dumbbells, and one row per Race for `AWA`** (A, B, C). Each showed the
  offset; none showed the *asymmetry* — two tacks holding different angles — as something seen rather
  than read off a signed number, and none put upwind and downwind side by side in one picture.
- **Keeping the σ band alongside coverage** (variant C). Two words on a card that can disagree, and the
  σ is not measuring what it claims to.
- **A residual chart alone for `STW`** (variant B). Shows the U, and hides the line the owner works with.
- **ADR 0027's `SOG`-on-`STW` regression as the only fit.** Its slope is biased flat by noise in `STW`,
  and on this archive that is the difference between over-reading and under-reading.
- **Printing the line's slope and intercept.** Still a drafted correction however it is labelled (ADR
  0027, LAY-138 decision 7).
- **Absolute degree and knot thresholds for the verdict.** Rejected for the same reasons ADR 0032 gave.
