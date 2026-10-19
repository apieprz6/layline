# ADR 0041: The `STW` Card Answers Whether to Recalibrate, and Never by How Much

## Status

Accepted. The design is branch `prototype/speed-check-recalibrate`, reviewed by the owner on the real
archive (13 Races, read through the shipped pipeline); variant E — the verdict once, with a chart and a
checklist behind a toggle — was chosen, with the Scatter kept as a third view.

**Amends three ADRs and one definition**, each in one place:

- **ADR 0034**, `STW` section: boat speed is **Chart | Checklist | Scatter**, not Scatter | Gap by speed.
  The Chart replaces Gap by speed and opens by default; the Scatter is unchanged, and the fit-method
  toggle moves under it, the one view with a line in it.
- **ADR 0035**, *Diagnostic only*: for `STW` alone, the card now says *whether* the paddlewheel needs
  recalibrating. It still never says what to set it to.
- **ADR 0027**: the stated caveat that current is negligible is no longer assumed silently. The verdict
  tests one way current would show — a gap that swings with heading — and the caveat names the way it
  cannot see.
- **`CONTEXT.md`**, **Instrument Tuning Screen**: "Diagnostic only" is narrowed to "never drafts a
  value", with the `STW` verdict named as the one recommendation the screen makes.

## Context

The owner, reading the `STW` chart with a multiplier and a Programmed Offset entered, could not tell
from it whether the paddlewheel needed recalibrating — which is the only reason a sailor opens it. The
chart showed a scatter of thousands of dots on a 45° line, where a 0.3 kt gap is eight pixels; a toggle
between two fitting methods; and a headline of `+0.21 kt · R² 0.90`. Every number was honest and none
was an answer. The owner asked for one a sailor without a statistics degree could read.

The answer turns out to be separable from GPS error without statistics, because the two behave
differently. GPS `SOG` noise is random row to row and averages away over a band. A paddlewheel
calibration error **repeats: the same gap at the same speed in every Race**. Current also moves `SOG`
and not `STW`, but it changes Race to Race and swings with heading; weed on the wheel grows over weeks
and resets when it is cleaned. Each of those has a fingerprint the archive can be read for.

On the owner's season the reading is unambiguous, and it is not the one a fit implies. The paddlewheel
is **spot on from 4 to 9 kt, 89% of the sailing**, reads 0.2–0.4 kt slow at 2–4 kt where every Race
agrees, is within 0.24 kt on every heading sailed, and moved 0.12 kt over the season. The first
prototype said "worth recalibrating" off the 2–4 kt bands alone — and that would have been wrong: a
calibration is one multiplier and one Programmed Offset, so it moves every speed together, and fixing
the slow end would make the middle read fast. That case is why the verdict reads the *shape* of the gap
and not only its size.

## Decision

### The verdict leads the card

A sentence first — **Worth recalibrating**, **No recalibration needed**, **Clean the paddlewheel
first**, **Can't tell yet**, or **Not enough Races yet** — with the one sentence that earns it. It reads
the Era's points only, so it is the same under either fit method. It is computed by
`services/analysis/paddlewheel-verdict.ts` from five readings:

1. **Bands.** Each Race's own mean gap per knot of `STW`, every Race weighted equally (ADR 0034's rule).
   A band is *spot on* inside the close-enough window — judged at the hundredth of a knot it is
   printed at, so a band shown as 0.20 kt is never called outside a ±0.2 kt window — *reads slow* or *reads fast* outside it where the
   Races agree, and *Races disagree* where they lean both ways.
2. **Where the sailing is.** The share of the Era's rows in spot-on bands.
3. **Heading.** The gap by recorded `COG`, in eight 45° sectors. A swing beyond twice the window is
   current, and the verdict refuses to recommend recalibrating into it.
4. **Drift.** Each Race's Measured Offset in the order sailed, last third against first. A move beyond
   the window is weed: clean first.
5. **Shape.** Whether the judged bands lie within the window of one straight line in speed — the only
   gap a multiplier and an offset can remove. The line is fitted inside the module, read for its
   residuals and discarded; it is never returned, because its coefficients are a drafted correction.

It says **recalibrate** only where the paddlewheel is off over most of the sailing (under 60% spot on),
the Races agree, the gap is a straight line, and neither heading nor drift explains it.

### Three views behind one toggle

- **Chart** (default): one column per knot, each counted Race's mean as a dot, the season's as a bar in
  the band's verdict colour, a close-enough stripe around zero, and the row count beneath. No fitted
  line — the question here is whether the Races agree, and a straight line through a U would draw a
  disagreement the verdict does not rest on. A tapped speed says its verdict, how many Races lean the
  same way, and each Race's own figure. A picked Race is ringed.
- **Checklist**: the five questions in a rigger's words — *Is it off where you sail most? Where it's
  off, do the Races agree? Is it the same on every heading? Has it held steady through the season?
  Would recalibrating fix it?* — each answered in a sentence with a mark and its evidence. The last two
  of the readings are ones the Scatter could never show.
- **Scatter**: unchanged from ADR 0034, with the fit-method toggle beneath it.

### What stays ruled out

- **No value to type in.** A gap is given in knots at stated speeds. **No percentage**: "reads 5% slow"
  is "set the multiplier to 1.05" with the arithmetic left to the reader. No slope, no intercept, no
  suggested multiplier or offset (ADR 0027, LAY-138 decision 7).
- **No sign.** "0.37 kt slow", never `+0.37 kt` — the reader should not have to remember which
  instrument was subtracted from which. The Scatter's readout keeps its signed figures, which are
  readings of the drawn line.
- **No invented heading.** A row with no `COG` is left out of the heading check, never read as north.
- **Words as well as colour**, because some sailors cannot separate hues. (Written when every verdict
  colour was a red under night vision; ADR 0043 made them distinct again, and the rule stands.)

### The thresholds are starting values

Chosen against the owner's thirteen Races and **not strongly defended**, in ADR 0027's phrase for its
own spread gate — to be revisited once the archive is larger:

| | |
|---|---|
| Close enough | ±0.2 kt — what Lake Michigan current and GPS noise can account for alone |
| A Race counts in a band or sector | 10 rows |
| A band gets a verdict | 3 Races |
| The Races agree | 75% lean the same way |
| Leave it, however the edges read | 60% of the sailing spot on |
| Heading or drift is to blame | a swing of 0.4 kt, a drift of 0.2 kt |

## Consequences

- `SpeedPoint` carries the row's recorded `COG` beside the two speeds, nullable, so the heading check
  reads what GPS gave and nothing else.
- The archive suites pin the owner's answer: no recalibration, spot on at 4–9 kt (89%), slow at 2–4 kt,
  a 0.24 kt heading swing and a 0.12 kt drift.
- The card's headline on the Overall tab's rail is unchanged — the line's gap at 4 and 6 kt (ADR 0035
  as amended by LAY-162). Whether the verdict should replace it there is a separate decision.
- The Gap by speed view is gone. Its U is the Chart's, drawn per Race instead of per row; its fitted
  line is the Scatter's alone.

## Rejected alternatives

- **A verdict per band only, with no overall answer.** It leaves the sailor to weigh 2–4 kt against
  4–8 kt themselves, which is the judgement the owner asked the card to make.
- **"Recalibrate" whenever the Races agree a band is off.** The first prototype did this and told the
  owner to recalibrate a paddlewheel that is right where the boat sails.
- **Showing how much to change the calibration.** The rule that the correction happens on the boat
  first stands; a recommendation to recalibrate is a reason to go and do that, not a number to type.
- **Keeping Gap by speed alongside the Chart.** Two views of the same per-knot gap, one per row and one
  per Race, ask the reader to work out which to believe.
