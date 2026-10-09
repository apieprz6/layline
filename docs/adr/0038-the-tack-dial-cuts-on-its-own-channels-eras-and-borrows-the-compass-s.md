# ADR 0038: The Tack Dial Cuts on Its Own Channel's Eras, and Borrows the Compass's

## Status

Accepted. Arose while building LAY-159, from the owner reading the finished screen against their own
**Calibration Log**: "I checked my instrument calibration logs and I see that I had entered a
calibration for Sept 2nd but didn't see a chip asking to filter down only since then."

**Amends ADR 0034** in one place and nowhere else: its **Tack Dial** section says the dial's levels
are "chips for the season, either side of the latest `HDG` Calibration Era boundary (so LAY-145
§2.6's check is one tap), or one Race". That sentence is read here as naming an *addition* — the
compass comparison the dial should offer — and not as a replacement for the dial cutting on its own
channel, which is what it was implemented as.

Builds on ADR 0027 (**Calibration Eras** are per channel, from the Log alone), ADR 0032 (the one
cross-channel mark, and its reason) and ADR 0008 (a recorded channel is what the display wrote).

## Context

The owner's Log holds two Versions:

| | |
|---|---|
| **2 Sep 2026** · v2 | `AWA` offset `−6°` → `−3°` |
| **4 Jul 2026** · v1 | first recorded: `AWA` offset `−6°`, `AWS` ×0.90, `STW` ×1.05 +1.05 kt, `HDG` offset `0°` |

Cut per channel, that is three `AWA` Eras — before 4 July, 4 July to 2 September, and since — and
two `HDG` Eras, because only the first Version touched the compass. The dial was built chipping on
the `HDG` Eras alone, so it offered "Before / Since 4 Jul" and had nothing to say about 2 September.

Three things make that a defect rather than a trade-off:

- **It is the act that governs this figure.** An `AWA` **Programmed Offset** is applied by the
  display *before* a Recording is written, so an **Apparent Wind Asymmetry** is what remains after
  it. And a vane offset does not shift both tacks together: it moves starboard's held magnitude one
  way and port's the other, so re-typing it by 3° moves the measured Asymmetry by the whole 3°. The
  season figure was averaging a `−6°` configuration with a `−3°` one — which is precisely the thing
  CONTEXT.md's **Calibration Era** invariant exists to prevent, and the dial's season figure is what
  guides how far the vane is set on the boat (LAY-138 decision 7).
- **The chart was already contradicting itself.** `CalibrationRail` marks the channel's own acts
  plus, on this chart, the compass's. So the rail drew a dashed rule at 2 September directly above a
  chip row that offered no way to cut on it.
- **ADR 0034's reason does not reach that far.** The `HDG` chips exist because compass deviation
  leaks into qtVlm's recomputed apparent wind, which is an argument for *showing* the compass's
  boundaries. It is not an argument for hiding the masthead's.

## Decision

### The dial chips on `AWA`'s own Eras, and on `HDG`'s as well

Its own first, as the partition that makes the figure mean one thing; the compass's beside them, for
LAY-145 §2.6's check. The service returns both — `asymmetry.eras` and `asymmetry.compass_eras` — so
which partition a figure belongs to is decided where the Log is read rather than by a chart picking
a channel.

A **borrowed boundary names its channel** on the chip: `Since 4 Jul · HDG`. Unlabelled, it would
read as an act on the masthead, which is the same mistake ADR 0032's muted, channel-labelled rules
avoid on the rail.

### A date both channels were touched on is offered once, as the chart's own

The owner's first Version recorded every channel's figures, so 4 July is a boundary for `AWA` *and*
for `HDG`. One chip, `AWA`'s — the same rule `CalibrationRail` already applies to a day it would
otherwise draw two rules on, stated once more rather than twice.

### The season still spans every boundary, and still says so

Unchanged from ADR 0034, and now the only figure on the screen that pools across an Era. It is what
the owner reads to decide how far to set the vane over, the Asymmetry is explicitly not a **Measured
Offset**, and the per-Era chips are immediately beside it.

## Consequences

- `InstrumentTuningSeason['asymmetry']` gains `compass_eras`; `eras` changes meaning, from the
  compass's Eras to the masthead's. `TackDial` takes both.
- **Nothing changes for the archive as it stands.** The owner has recorded no act against `AWA`, so
  `AWA` has one Era over the whole season, and the cross-channel chips are the only ones the dial
  offers — which is what `archive-charts.test.tsx` now pins, either side of the 4 July
  autocompensation. The defect only appears once a masthead act is written down, which is exactly
  what happened.
- The other two charts were already right: the compass cuts on `HDG` and the paddlewheel on `STW`,
  each its own channel, and neither borrows.
- CONTEXT.md's **Tack Dial** entry says which channel's boundaries it shows.

## Rejected alternatives

- **`AWA`'s Eras alone.** Correct and incomplete: it drops the one comparison ADR 0034 built the
  chips for, and the check it answers — whether an asymmetry is compass-driven — cannot be made
  anywhere else on the screen.
- **A channel picker above the chips.** One control to say "cut on `AWA`" or "cut on `HDG`", instead
  of two kinds of chip. Fewer chips, and a mode: the sailor would have to hold which channel the
  dates on screen belong to, where a `· HDG` suffix says it on the chip they are reading.
- **Every channel's boundaries, labelled.** `AWS` and `STW` acts too, since qtVlm's recomputation
  reads `STW`. Rejected for now because ADR 0032 settled that exactly one thing crosses channels and
  why; widening that is a decision about the whole screen, not about this chart, and no act on the
  paddlewheel has yet been recorded to test it against.
- **Showing a boundary twice where two channels share a date.** Honest about the Log, and two chips
  reading `Since 4 Jul` and `Since 4 Jul · HDG` that select the same Races is a worse answer than
  one.
