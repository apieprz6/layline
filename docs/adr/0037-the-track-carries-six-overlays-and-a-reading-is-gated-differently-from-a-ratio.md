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
| % of **Target Speed** | ratio about 100% | diverging, seven bands: amber below, gray, **teal** above | `--track-below-3` … `--track-above-3` |
| % of **Target VMG** | ratio about 100% | *the same* ramp | the same seven |
| `SOG` | knots | sequential, one hue | `--track-speed-1` … `-5` |
| `TWS` | knots | **the wind bands** | `--wind-light` … `--wind-storm` |
| `TWA` | signed angle | diverging by tack, depth for the angle | `--track-port-1..3`, `--track-stbd-1..3` |
| sails vs the **Crossover Chart** | categorical | green agrees, red differs | `--track-agree`, `--track-differ` |

Four of those rows carry an argument:

**The two ratios share one ramp** rather than getting one each. They are the same shape of question,
and two diverging ramps on one screen would invite the sailor to read a difference of palette as a
difference of kind. Its faster arm is **teal**, not ADR 0033's blue: blue read as neutral rather
than as *better* — it is also this system's accent, on links and on the selected chip — and teal
carries "good" without becoming the green half of a red/green pair, which is the one diverging
choice a red-green colour-blind reader cannot use. Amber against teal differs on the blue-yellow
axis, which both common kinds of colour blindness keep.

**`TWS` is the one overlay the wind-condition tokens belong to.** ADR 0033 refused them for
percent-of-target because they mean an absolute wind speed on a screen that also shows a ratio. Here
they mean exactly what they say, so the thresholds are read off `WIND_THRESHOLDS` rather than
restated — two copies of what medium air is would be two chances for the dashboard's wind card and
this map to disagree.

**`TWA` diverges by tack, not by magnitude.** A single ramp over `|TWA|` would draw both tacks
identically, which erases the thing a sailor is actually looking for; the arms are the existing
`--tack-port`/`--tack-starboard` hues, so a port leg here is the colour port is everywhere else in
Layline.

**Sail chart agreement is categorical, and green/red is the one place those hues mean what everyone
expects.** It answers a question the other five cannot: *where do the two records of this race
disagree with each other?* — the **Sail Configurations** the sailor wrote down against what the
**Crossover Chart** calls for at each row's own angle and wind speed. **Cell Agreement** already
counts that comparison per chart cell (ADR 0030); this is the same comparison at the grain the map
draws, through the same `crossoverLookup`, so the two cannot disagree.

Agreement is an integer comparison in one vocabulary — a Configuration names a **Sail Definition**
number of the Version the Race points at, and so does the chart's cell (ADR 0023) — never a match on
names, which would make "Main + A2" and "Main+A2" two different sails. And a *difference is not a
fault*: a boat carrying the A2 through a lull the chart would have reefed for is a decision somebody
made on the water, often a good one. The legend says that where the sailor is reading the colours.

Its red is its own token rather than `--state-danger`, because that hex is `--wind-storm`'s and so
the **Dropout** ring's: a disagreeing stretch and a dead feed must not be the same colour on one map.

There are **four ways to have no verdict**, and they are kept apart because a single "no" would
flatten a decision, a gap in the archive and the edge of the chart into one shrug: the Race records
no chart Version at all (and so can hold no Configurations either); nobody wrote down what was
flying; what was flying is a note rather than a Definition, so there is no integer to compare; or the
row sits below one of the chart's own axes, where a floor lookup has no floor (ADR 0028).

What was flying *at a given row* is resolved through ADR 0010's own rule, `entryInForce`, including
its load-bearing half — the earliest testimony carries **backwards**, because the sails were up
before the sailor got round to saying so. The amend flow's charts resolve through the same function,
so one race cannot read two ways on two screens.

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

### A tap reads one stretch out, on the map, with provenance

A tap selects the nearest leg *in the track's own coordinates*, so the reach is the same patch of
water at every zoom, and nothing beyond it: selecting a stretch a thumb-width away would be the map
answering a question nobody asked. It is read on pointer-up from a pointer that did not travel, so a
pan never selects and a tap works at every zoom, including the one where the page owns the scroll.

**The readout floats over the frame, and moves out of its own way.** It was a panel under the map
first, and that was wrong for the only viewport that matters: at 390px the map is 440 units tall, so
the answer to a tap landed below the fold and the sailor had to scroll away from the thing they were
pointing at in order to read about it. A readout you have to go and find is not a readout. So the
card sits inside the frame, in the half the selection is *not* in — measured through the camera, since
what matters is where the stretch is on screen after a pan — and it keeps clear of the zoom knobs. It
opens with the overlay's headline and the four figures a sailor reads beside any of them, expands to
the rest, and can be dismissed, because a card over a map must be closable.

The readout states the row's own clock, every channel, both targets and both percentages — and three
things that are the point of it:

- **Provenance, per figure** (ADR 0008): `SOG` and `COG` are the GPS's own answer; every wind figure
  was **Computed** by qtVlm from a solved current and an instrument altitude the export does not
  carry; **Target VMG** carries its standing caveat.
- **A missing figure says which kind of missing it is** — one of ADR 0025's three exclusions, or the
  Polar off its axis, or no Polar recorded at all. Four facts that a dash would flatten into one
  shrug.
- **A Filler-Anchored figure is shown flagged, not withheld** (ADR 0036).

### Testimony is drawn on the track, in a treatment no scale uses

A **Sail Configuration** and a **Sea State** go on the map at the place on the water they were given
about, with the amend flow's own two glyphs — `S` for a sail, `~` for the water — so it is one
vocabulary across both screens. On a map an annotation is a *place*, which is the whole point of
drawing it: "the kite went up at the windward mark" is a thing a sailor can see on a track and cannot
see on a clock.

It is deliberately not a hue. An annotation is **Testimony** — neither measured nor computed
(CONTEXT.md's **Provenance**) — and on a screen whose six scales already spend every hue the design
system has, the only honest way to say "a different kind of thing" is to stop using hue for it: a disc
in the page's own surface, outlined and glyphed in the text colour, drawn over the measurement rather
than under it.

**Two on one fix fan out, with a leader line back to it.** A sail change and a sea state recorded
seconds apart land on the same fix, and a disc exactly over another is a marker that hides a marker.
Each after the first is lifted clear in screen units — the pile is a drawing problem, not a
geographic one — the fix itself stays marked, and a dashed line joins the two, which is what keeps
the offset honest: the position is still the position, and the line says the disc has been moved off
it. Each label sits *beside* its own disc rather than above it, because above meant a lifted disc
landed on the label of the one below.

**An annotation is placed at the nearest fix in time, and only within two minutes of it.** The rows
are event-triggered and unevenly spaced, so the nearest fix to a sail change can be a minute away —
the gap therefore travels with the placed marker, because "here" and "near here" are different claims
and only the second is one the track supports. Past two minutes nothing is drawn: a sail change
recorded after the finish is real Testimony about a moment the track does not cover, and putting it on
the last fix would invent a place for it. Those are counted, and the legend says they exist. A
**Frozen** row *is* a candidate, unlike everywhere else in this map: its position is a copy of a real
fix, and the sailor's claim is about the water rather than about the instruments.

### The frame is fluid, and the ink is thick enough to read

The box's *shape* is what ADR 0033 fixed — it does not reshape to the track's extent — never its size
in CSS pixels. Capped at 360 it sat at half the width of the page's own column, so it is fluid now and
the `viewBox` keeps the projection true. The track's stroke goes from 3.2 to 5.4 units: a heatmap's
ink is its message, and at 3.2 the sailor had to squint at a hue, which defeats the one thing the map
exists for.

### The page says the fact and keeps the argument one tap down

The owner's other note on the same pass: *"in general just clean up the verbosity. The UI is too
wordy right now."* This screen owes a great many explanations, and ADR after ADR requires them to be
**stated** rather than inferred — the proportion of a race that is not coloured (ADR 0033), the
caveat that travels with a figure (ADR 0036), why the recording cannot be edited (ADR 0010). None of
those obligations are withdrawn. What changes is that *stated* no longer means stated at full length
in front of every reader on every visit: a five-line paragraph under every map is a paragraph nobody
reads twice, which loses an explanation as thoroughly as never writing it.

So each of those becomes two parts: a line that states the fact, and a native `<details>`
disclosure — `components/common/Explainer.tsx`, no JavaScript, keyboard-reachable — holding the
reasoning. The split is not arbitrary:

- **On the page:** the count, the caveat, the theme-aware sentence, the name of a state. Hiding any
  of those would hide the claim.
- **One tap down:** why each row is uncoloured, by reason; why the recording is not editable. Those
  are arguments *for* a claim already on screen.

The legend's swatch rows lose their sentences and keep their counts — "Frozen feed — 82 rows"
rather than a clause explaining what a frozen feed is, which the swatch itself and the disclosure
both say.

## Consequences

- **Thirteen new tokens**, each with a declared night-vision mapping: five sequential, six for the
  tack pair, two for agreement. The sequential and tack ramps are monotone in OKLab lightness
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
- **A sail change given during a dropout is placed**, which is the one case where this map reads a
  Frozen row's position as meaningful. It is Testimony about the water, not a measurement, so the rule
  that excludes those rows from every overlay does not apply to it.
- **`Explainer` is a page-wide pattern now**, not this screen's: anything that owes a reason rather
  than a fact belongs in one. It is deliberately `<details>` rather than a tooltip, because a
  tooltip is unreachable on a touch screen, which is the device this product is for.
- **Still open**: the readout is reachable only by pointer. A keyboard or screen-reader path to the
  same figures — stepping the selection row by row — is not built, and that is a gap rather than a
  decision.

## Rejected alternatives

- **One ramp for everything, with the legend relabelled per overlay.** Cheapest by far, and it would
  draw a boat speed as if 6 knots were a midpoint of something. A scale's shape is a claim; four of
  these quantities make four different claims.
- **A `COG` overlay.** Built first, as four compass quadrants — a course is cyclic, and a hue wheel
  could not survive a theme that collapses hue, so quadrants were the honest reduction. Cut on the
  owner's word after using it: the track's own shape already says which way the boat was going, so
  the overlay spent four tokens restating the picture. `COG` remains a figure in the readout, where
  it costs nothing.
- **Gating sail agreement like a reading**, so that every row with a recorded sail gets a verdict.
  Rejected: a manoeuvre's `TWA` sweeps through head to wind, so the chart's recommendation mid-tack
  answers a question nobody asked, and **Cell Agreement** counts the same comparison over Countable
  rows (ADR 0030). Two screens disagreeing about which rows count is worse than a shorter answer.
- **Matching sails on their names.** One typo in a note, or one chart relabelled, and a race's
  agreement flips. The Definition number is the identity (ADR 0023).
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
