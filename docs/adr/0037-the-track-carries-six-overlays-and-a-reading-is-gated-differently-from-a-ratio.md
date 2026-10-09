# ADR 0037: The Track Carries Six Overlays, and a Reading Is Gated Differently from a Ratio

## Status

Accepted. Resolves [LAY-164](https://linear.app/layline-sailing/issue/LAY-164), raised by the owner
after using what LAY-161 shipped: *"I wanted interaction in that I could click a section of the
track"*, and *"I would also like to allow the user to switch which metrics are overlayed. Not just
target speed."*

Amends ADR 0033 in two places — its single ramp, and its "the client gets drawn geometry, not rows"
rule — and extends ADR 0025's Countable rule to a case it was not written for. Does not touch ADR
0036's per-cell trust, ADR 0028's lookup rules, or ADR 0009's stored-payload rule.

Numbered 0037 as the next free number; this repo's decision log records three concurrent claims on
0031 and one on 0035, so a later reader finding another 0037 should assume a collision rather than a
contradiction.

## Context

ADR 0033 built the Race Track Heatmap as one picture of one quantity: percent of **Target Speed**,
on a seven-band diverging ramp, with a colour per segment sent to the client so that nothing on the
far side could re-decide what a row meant.

Three things the owner found on the water, with the archive loaded:

1. **The track is a picture of more than one question.** Percent of target answers *how did we go*;
   it does not answer *where was the wind*, *which tack was that*, or *how fast were we actually
   moving* — and the same trace, recoloured, answers all of them from data the race already carries.
2. **A heatmap with no readout makes the sailor estimate its own encoding.** Colour is for finding
   the stretch; once found, the question is what the numbers were, and no amount of ramp design
   answers that.
3. The two defects fixed on LAY-161's own branch — a frame capped at 360px inside a 720px column,
   and a 3.2-unit stroke too thin to read a band off.

The design question is not "can we add a dropdown". It is that **a scale is a claim about the shape
of its quantity**, and these quantities are four different shapes. A ratio has a meaningful centre;
a speed has none; a signed angle has a *side*; a course is cyclic. One ramp stretched over all four
would be the same mistake ADR 0033 refused when it declined to reuse the wind bands — two
quantities, one palette — committed four times over.

The second question is which rows each overlay may colour, and it is sharper than it looks. ADR 0025
excludes **Low-Speed** and in-manoeuvre rows from "every performance metric". A percent of target is
a performance metric. `SOG` is not: it is what the GPS recorded, and a parked boat's speed over the
ground is a fact about the boat, not a claim about how well it was sailed.

## Decision

### Six overlays, one scale shape per quantity

| overlay | quantity | scale | tokens |
|---|---|---|---|
| % of **Target Speed** | ratio about 100% | diverging, seven bands | `--track-below-3` … `--track-above-3` |
| % of **Target VMG** | ratio about 100% | *the same* ramp | the same seven |
| `SOG` | knots | sequential, one hue | `--track-speed-1` … `-5` |
| `TWS` | knots | **the wind bands** | `--wind-light` … `--wind-storm` |
| `TWA` | signed angle | diverging by tack, depth for the angle | `--track-port-1..3`, `--track-stbd-1..3` |
| `COG` | course | four compass quadrants | `--track-cog-n/e/s/w` |

Four of those rows carry an argument:

**The two ratios share one ramp** rather than getting one each. They are the same shape of question,
and two diverging ramps on one screen would invite the sailor to read a difference of palette as a
difference of kind.

**`TWS` is the one overlay the wind-condition tokens belong to.** ADR 0033 refused them for
percent-of-target because they mean an absolute wind speed on a screen that also shows a ratio. Here
they mean exactly what they say, so the thresholds are read off `WIND_THRESHOLDS` rather than
restated — two copies of what medium air is would be two chances for the dashboard's wind card and
this map to disagree.

**`TWA` diverges by tack, not by magnitude.** A single ramp over `|TWA|` would draw both tacks
identically, which erases the thing a sailor is actually looking for; the arms are the existing
`--tack-port`/`--tack-starboard` hues, so a port leg here is the colour port is everywhere else in
Layline.

**`COG` is drawn as quadrants, and the legend says so.** A course is cyclic and Layline has no cyclic
palette. One could be built, and it would be a lie after dark: `.theme-nightvision` collapses every
hue, and a hue wheel has no honest collapse — north and south would become one colour while the
legend claimed a bearing. Four quadrants are coarse, true, and survive the theme, because four steps
are what one red depth ramp can keep apart.

### A reading is gated differently from a ratio, and that asymmetry is deliberate

**Frozen** is the exclusion every overlay keeps. Those values are a verbatim copy of the row above
rather than a reading (ADR 0009), so colouring one paints a number the boat never produced.

Nothing else is shared:

- The two ratios are **performance metrics**, so ADR 0025 applies in full: a Low-Speed or
  mid-manoeuvre row carries no percent, exactly as everywhere else in Layline.
- The four channel overlays are **readings**. They colour any row whose feed was alive and whose own
  channel is not blank. Refusing to draw a parked boat's speed over the ground would be hiding a
  recorded value to honour a rule about averages that the overlay is not computing — the opposite of
  this project's data-integrity rule.

Measured on Chicago–Waukegan: percent of target colours **113** of 258 rows, `SOG` colours **176** —
every row except the dead feed. Both figures are pinned in
`services/analysis/__tests__/archive-track-heatmap.test.ts`, and the legend states the coverage of
whichever overlay is on screen, by that overlay's own reasons.

### Each overlay's legend owes its own after-dark sentence

ADR 0033 accepted that the diverging ramp cannot survive `.theme-nightvision` and attached one
obligation: the legend must stop claiming a side. That obligation now applies per scale, because each
loses something different — the sequential ramp loses nothing, the tack scale loses the tack, the
quadrants keep all four steps. Every scale therefore carries both sentences as data, and the one
thing none of them may do is keep the daylight words.

### The client gets each row's values and verdicts, and bands them through the server's own module

This is the amendment to ADR 0033's "drawn geometry, not rows". Six overlays over ~1,700 rows cannot
each be precomputed into the payload, and a switch that costs a round trip is not a switch.

What crosses now is, per drawn row: its channels as numbers, its **Target Speed**, **Target VMG**
and the two percentages, whether either was **Filler-Anchored**, and which of ADR 0025's exclusions
applies. Every one of those is computed on the server. The banding — value to band, and the row gate
above — lives in `services/analysis/track-overlays.ts`, which **both sides call**.

The rule's purpose is kept by a different means than the rule itself. The client cannot invent a band
the rules refuse, because the rules are not on that side; what it gains is an instant switch and the
readout a tap needs, neither of which is a decision. The projection still never crosses — it carries
closures and cannot be serialised at all.

### A tap reads one stretch out, with provenance

A tap selects the nearest leg *in the track's own coordinates*, so the reach is the same patch of
water at every zoom, and nothing beyond it: selecting a stretch a thumb-width away would be the map
answering a question nobody asked. It is read on pointer-up from a pointer that did not travel, so a
pan never selects and a tap works at every zoom, including the one where the page owns the scroll.

The readout states the row's own clock, every channel, both targets and both percentages — and three
things that are the point of it:

- **Provenance, per figure** (ADR 0008): `SOG` and `COG` are the GPS's own answer; every wind figure
  was **Computed** by qtVlm from a solved current and an instrument altitude the export does not
  carry; **Target VMG** carries its standing caveat.
- **A missing figure says which kind of missing it is** — one of ADR 0025's three exclusions, or the
  Polar off its axis, or no Polar recorded at all. Four facts that a dash would flatten into one
  shrug.
- **A Filler-Anchored figure is shown flagged, not withheld** (ADR 0036).

### The frame is fluid, and the ink is thick enough to read

The box's *shape* is what ADR 0033 fixed — it does not reshape to the track's extent — never its size
in CSS pixels. Capped at 360 it sat at half the width of the page's own column, so it is fluid now and
the `viewBox` keeps the projection true. The track's stroke goes from 3.2 to 5.4 units: a heatmap's
ink is its message, and at 3.2 the sailor had to squint at a hue, which defeats the one thing the map
exists for.

## Consequences

- **Fifteen new tokens**, each with a declared night-vision mapping: five sequential, six for the
  tack pair, four for the quadrants. The sequential and tack ramps are monotone in OKLab lightness
  with adjacent ΔL ≥ 0.069 and light ends above 2:1 against the sand surface; the quadrants are
  categorical, each above 3.2:1, with their lightness spread as well so they survive a colour-blind
  reader. There is deliberately no `--track-wind-*` family: `TWS` reads the wind bands directly.
- **`services/analysis/track-overlays.ts` is now the single place a band is decided**, and it is
  imported by a Client Component. It must stay pure and free of server-only imports.
- **The payload per race grows**, from a band per segment to a row's facts per segment — about 150
  bytes a row, so roughly 250KB uncompressed on the 1,636-row distance race, and far less over the
  wire since it is repetitive JSON. If that ever bites, the next move is a Server Action keyed by
  `row_index` for the readout, keeping the banding inputs inline.
- **`TrackHeatmapCounts` is per overlay**, because the overlays disagree about what they can colour
  and the sentence under the legend is about the one on screen.
- **ADR 0033's "drawn geometry, not rows" no longer holds literally**, and a reader of that ADR
  should come here for what replaced it and why the guarantee is the same.
- **The two ratio chips are not offered at all on a race with no Polar Version** — nine of this
  archive's races. A chip that painted a uniformly grey track would invite "no comparison recorded"
  to be read as "slow everywhere".
- **Still open**: the readout is reachable only by pointer. A keyboard or screen-reader path to the
  same figures — stepping the selection row by row — is not built, and that is a gap rather than a
  decision.

## Rejected alternatives

- **One ramp for everything, with the legend relabelled per overlay.** Cheapest by far, and it would
  draw a boat speed as if 6 knots were a midpoint of something. A scale's shape is a claim; four of
  these quantities make four different claims.
- **A cyclic hue wheel for `COG`.** It is the correct encoding for a cyclic quantity and it cannot
  survive a theme that collapses hue, which this product has and uses on the water at night. Four
  quadrants are honest in both themes.
- **Precomputing all six overlays' bands on the server**, keeping ADR 0033's rule literally. Six
  bands plus six reasons per row is a bigger payload than the row's own facts, and it still would not
  give the tap its readout — so it costs more and buys less than the shared module.
- **Fetching the readout per tap through a Server Action.** Smaller payload, and it puts a network
  round trip between a sailor's finger and a number they are pointing at, on a boat. Kept as the
  retreat if the payload ever becomes the problem.
- **Colouring a Frozen row on the channel overlays**, on the grounds that the file does hold a value
  there. The value is a copy; drawing it is drawing fabrication (ADR 0009).
- **Gating the channel overlays with Countable, so all six agree.** Tidier, and it would hide
  recorded values — a parked boat's `SOG` — to satisfy a rule about performance averages that a
  channel overlay does not compute.
