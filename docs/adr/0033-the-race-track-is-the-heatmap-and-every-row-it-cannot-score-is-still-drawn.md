# ADR 0033: The Race Track Is the Heatmap, and Every Row It Cannot Score Is Still Drawn

## Status

Accepted. Resolves LAY-148 ("Prototype the GPS track + polar-%-of-target heatmap overlay"), the last
of the per-screen prototypes under LAY-138.

Numbered 0033 because 0031 was claimed three times from concurrent sessions, twice onto `main`. This
ADR also renumbers ADR 0031 (Instrument Tuning, LAY-147) to **0032**, leaving 0031 with LAY-151's
rig-tune ADR — not by claim order, which would have moved the rig-tune one, but because that is the
number already cited from `types/index.ts`, the rig-tune components and actions, three test files, the
migrations README and ADR 0007's supersession note. A number that shipped code greps for is the one
that should not move.

Applies ADR 0025's **Countable** rule to a map, fills in the render side of the exception ADR 0025
already wrote for this screen, and takes ADR 0028's Target Speed lookup as given. Discharges the
obligation ADR 0014 placed on "any map view in Layline" to mark **Dropouts**, and finds that ringing
frozen points is not enough on its own. Raised LAY-150, which reopened *for the scoring path only*
how the Polar's trustworthy floor is determined — resolved by ADR 0036, which this ADR's sub-floor
render state is amended to match.

Decided against three variants on a throwaway branch, `prototype/lay-148-heatmap`, driven by two real
recordings and the boat's real ORC certificate. That branch is the artifact and is not merged.

## Context

The Race analysis screen has no mockup precedent for a track. The brief asked for one directly: the
boat's GPS trace, coloured by how it was doing against its **Polar** at each point.

Four things had to be settled — the colour scale, how a row no metric may read is drawn, whether the
Polar's unmeasured low angles get a state of their own rather than an extreme colour, and where the
map sits among the sections the screen already has now that the AI-summary card is cut (LAY-138
decision 3).

What made this a prototype rather than a discussion is that the answer depends entirely on the
*proportions* real data arrives in, and those are worse than the ticket assumed. Two recordings,
reproduced with the shipped `parseQtvlmRecording`, `assessRowQuality` and `raceChartSeries`:

| | rows | scored | Frozen | Low-Speed | in a Maneuver Window | below the Polar's floor | no target |
|---|---|---|---|---|---|---|---|
| Chicago–Waukegan | 258 | 64 | 82 | 23 | 20 | 53 | 16 |
| Chicago–St Joe | 1743 | 566 | 815 | 57 | 65 | 220 | 20 |

**A quarter of one race is scoreable.** 64 of 258 rows on the shorter recording carry a percent of
target; 178 are excluded by **Countable** or by the Polar's floor, and 16 more have no computable
target. Any design that draws only what it can colour draws a quarter of the race.

**47% of the distance race is a dead feed**, and a frozen run repeats one position, so 815 Frozen
rows produce **three rings on the map** — the rings stack into a pixel. ADR 0014's obligation, taken
literally, is satisfied by a map that still shows a clean track of a boat that was not transmitting.

**The Polar's floor is not 45° on this boat.** `CONTEXT.md` states the ~45° suppression as a rule and
LAY-138 carries it as settled. `polarSuppression()` reading Handsome Pete's own certificate returns
**52°**, so hardcoding 45 would mislabel 37 rows in the 258-row race — and the prototype's own
evidence then showed 52 is wrong too, for a different reason (LAY-150).

## Decision

### A dedicated diverging scale, centred on 100% — not the wind-band tokens

The ticket asked whether to reuse `--wind-light` / `--wind-medium` / `--wind-heavy` / `--wind-storm`.
No. Those tokens mean absolute wind speed, which is a different quantity that will be on the same
screen as this map; one palette for two quantities makes the screen unreadable in the one place it
matters most. Percent of target gets its own ramp.

Diverging rather than sequential, because percent of target is a **polarity** question before it is a
magnitude one. The Polar already told the sailor how fast the boat theoretically goes; what the track
is for is finding *which side of target* each stretch of water sat on. Seven bands, two one-hue arms
and a **neutral gray midpoint** — never a hue at the middle, per the `dataviz` rule:

```
<85%   85–95%   95–98%   98–102%   102–105%   105–115%   115%+
 ←──────  amber  ──────→   gray    ←──────   blue   ──────→
```

Amber below and blue above, *not* the conventional red/blue: the same map rings Frozen rows in
`--wind-storm`, and a red arm would collide with it. Each arm is validated on its own as an ordinal
ramp against the sand surface (`scripts/validate_palette.js --ordinal`: monotone lightness, adjacent
ΔL ≥ 0.06, light end ≥ 2:1).

### After dark the ramp degrades to magnitude, and the legend must say so

`.theme-nightvision` collapses every hue to a red lightness ramp — that is the theme's whole
proposition, not a limitation to design around. A diverging scale cannot survive it: tokenised
honestly, both arms land on the same ramp, so 85% and 115% become the same colour and the brightest
step is the midpoint.

This is accepted rather than worked around, with one obligation attached: **the legend is
theme-aware.** By day it reads `slower than target — 100% — faster`. After dark that sentence is a
lie, and the legend must instead say that depth is distance from target in either direction, with
polarity coming from the section's own numbers below the map. A legend that keeps its daylight words
after dark is the actual defect here, not the collapsed hue.

If polarity after dark turns out to matter on the water — this is a lake where distance races run
through the night — the retreat is variant B's sequential ramp, which is theme-stable, and not a new
hue. It is not a theme override: a chart escaping the theme is the one thing `globals.css` forbids.

### Colour is spent only on the measurement; every other row is drawn in shape and texture

A row that is not **Countable** is still on the track, because the boat was still there. It carries
no colour, because it supports no claim. Nothing that is not a measurement may borrow a step of the
ramp.

- **Low-Speed or inside a Maneuver Window** — a continuous hairline in `--text-muted`, under the
  coloured track. Geometry, no claim.
- **Below the Polar's own measured floor** — *amended by ADR 0036.* Originally decided as the same
  hairline, dotted: an extreme colour at the end of the scale would say the boat was 480% of target
  when what is true is that we have nothing to compare it with. ADR 0036 found trust is per-cell, not
  per-row, and that a sailed row should never read as "no data" at all — so a **Filler-Anchored** row
  is now coloured by its computed percent like any other, carrying a distinct marker rather than going
  uncoloured. The ticket's underlying worry — an extreme colour claiming certainty the data does not
  have — is addressed by the marker, not by withholding the colour.
- **Frozen** — ringed in `--wind-storm`, and the track is drawn **broken into and out of the run**,
  exactly as ADR 0014 requires and `TrackMap` already does.
- **No computable target** (in range, but the Polar cannot answer) — the plain hairline. ADR 0028
  makes this missing, and missing is drawn as absence of colour, never as a value.

The count is stated in words under the legend — *"178 of 258 rows are drawn but not scored"* — so the
proportion is never something the sailor has to infer from how much grey is on screen.

### A frozen run is bridged and labelled with its own duration

Ringing is necessary and not sufficient. Where a **Dropout** separates two fixes, the map draws a
**dashed bridge** between them carrying the gap's duration (`7m`, `34s`, `57m`). This is the part of
ADR 0014's obligation that ringing alone cannot discharge, and it generalises: a map that joins two
fixes across a dead feed with an ordinary line is asserting a course the recording never recorded.

The labels need a surface-coloured halo (`paintOrder="stroke"`) and clamping inside the frame. Before
that they clipped to `feed dead` with no duration at all, which is worse than no label.

### The frame is stable and the map zooms inside it

The box is a fixed 360 × 440 at 390px whatever shape the track is, and the thin-track problem is
solved by **zoom and pan** — 1× to 12×, 1.6× a step, wheel and pinch about the cursor, with a
"whole track" button home.

This reverses the prototype's own earlier finding, which shrank the box to the track's aspect ratio.
That is right only while the whole track is the only view anyone can ever have, and it isn't: a 25nm
point-to-point is unreadable at 390px however the box is shaped. A stable frame also stops the page
reflowing between races.

Three constraints the build inherits, each of which the prototype got wrong first:

- **Zoom is a transform on an inner `<g>`, not an animated `viewBox`**, so pinned chrome works — the
  scale bar stays in its corner and re-reads its own distance at the current zoom, so it keeps
  telling the truth. Every stroke is `vectorEffect="non-scaling-stroke"`, and ink that is not
  geography (type, hairlines, ring radii) divides the zoom back out. Zooming in is for separating
  the segments, not fattening them.
- **The client gets drawn geometry, not rows.** The projection and the state classification stay on
  the server; what crosses the boundary is a list of path strings with a colour each. The client can
  move the camera and has no ability to re-decide what a row meant. This is also forced: a
  projection carries closures and cannot be serialised at all.
- **Touch belongs to the page until the sailor zooms in.** A 440px-tall map would otherwise swallow
  every attempt to scroll past it, and at 1× there is nothing to pan to; `touch-action` switches on
  zoom state and the home button hands the gesture back.

### The map is the screen's first section, and nothing replaces the AI card

Order: **the map**, then Boat performance vs. polars, Manoeuvre splits, Sail selection vs. chart,
Instrument calibration check. Full width, its legend directly beneath it.

The AI-summary card is dropped and **nothing fills the space**, which is the ticket's fourth question
answered: the card was the screen's opening because there was nothing better to lead with, and there
now is. The tiles that follow are the same numbers the map is made of, which reads as a summary of
what was just seen rather than a preamble to it.

### The Polar's floor is read off the Polar, never written down

As first shipped, the dotted state's threshold came from `polarSuppression()` on the Race's own bound
**Polar Version** — 52° for this boat, with the legend naming the number it actually used — rather than
a hardcoded `~45°`, which is a fact about two example files, not a constant. The threshold-detection
principle stands; the dotted state it fed does not, per the amendment below.

**It was also not the right shape**, which the prototype found by measuring: that floor was one
scalar per file, and the filler ramp in this certificate stops at a different row in every wind-speed
column (real from 40° above 10 kt, from 45° at 6–8 kt, only from 52° at 4 kt). The scalar floor
therefore suppressed the boat's best upwind angle in every condition it can sail in. **Resolved by
LAY-150 (ADR 0036)**: trust is per-cell, and a Filler-Anchored row is coloured and flagged rather than
left dotted and uncoloured — so the dotted sub-floor state this ADR shipped no longer exists as its own
render state. See ADR 0036 for the per-cell rule and the Filler-Anchored marker that replaces it.

## Amendment 1 — what building it settled (LAY-161)

Four things this ADR deliberately left open, answered by the implementation rather than by a second
decision ticket. Nothing above is reversed.

**The scoreable count in the table above is out of date, and the reason is ADR 0036.** Measured by
the shipped code over the same recording, Chicago–Waukegan draws 258 rows and scores **113** of
them, 31 of those Filler-Anchored — not 64. The 64 was the single-scalar 52° floor's answer; trust
is per-cell now, so a row sailed below that floor against real cells is scored and one anchored on
filler is scored *and flagged*. The Frozen (82) and Low-Speed (23) columns reproduce exactly. The
Maneuver Window column reads **13** rather than 20, because `notCountableReason` gives each row one
reason in order and the prototype counted every row in a window including ones already counted
elsewhere — the disjoint accounting is the one under which the counts beneath the legend add up to
the race. All of it is pinned in `services/analysis/__tests__/archive-track-heatmap.test.ts`.

**The Filler-Anchored marker is the segment stitched in its own band colour** — same hue, same
weight, a dashed stroke. ADR 0036 left the pixels to whoever implemented it. A texture rather than
a glyph because it costs no extra ink on a 1,700-segment track, and it survives night vision, where
a second hue is not available to mark anything with. Its weakness is a single isolated filler row,
where one dash reads much like a short solid segment; these rows arrive in runs (light air at a low
angle), and zoom separates them.

**The map opens the half of the page below the Transcription boundary, not the page.** This ADR's
"first section" was written against the analysis screen's own section list, and the page the archive
actually has opens with Testimony that ADR 0010 puts above a drawn line. A track is not something
the sailor said — it is the recording, drawn — so it leads the half of the page that is the
recording, above Coverage and the Row Quality notes, and the breakdown tiles follow it there.

**An uncoloured track carries its reason.** Three different facts produce one, and grey that means
"this race records no Polar Version" must not read as grey that means the boat was slow: `RaceTrack`
carries `polar` / `no-polar-version` / `polar-unreadable`, and the legend says each in words. Nine
of this archive's races name no Polar at all. Per *segment*, the reason travels as a discriminated
`TrackNotScored` — this ADR's "not as a boolean or a null percentage" — and reaches the DOM, even
though several of those states are deliberately drawn as the same hairline.

**A run of one fix is plotted, not dropped.** A heatmap needs a colour per row, so the track is
segments between consecutive fixes — and a fix with no neighbour to join is in no segment at all.
Chicago–Waukegan's window loses its feed seventeen times and twice comes back for exactly one fix
before dying again, so until those two rows were drawn as points they were counted and drawn
nowhere: the only two rows in thirteen races where this ADR's own "every recorded row is still
drawn" was false. `TrackMap` already plotted the same case for the same reason.

**One thing left as the prototype decided it, and flagged rather than quietly re-decided.** Two of
the seven ramp steps are byte-identical to wind-band tokens — `--track-below-2` is `--wind-heavy`'s
`#C47000` and `--track-above-2` is `--wind-medium`'s `#0055BB`. The *token* refusal this ADR makes is
honoured and tested: the ramp holds its own seven values, so changing what 16–22 knots looks like
cannot move what 85–95% of target looks like. But the reason the ADR gives for the refusal is
perceptual — "one palette for two quantities makes the screen unreadable in the one place it matters
most" — and at two steps out of seven the palettes do coincide, on a page that will carry both
quantities. These are the hexes the prototype validated and the owner decided from, and the design
system has one amber and one blue, so they stand; whoever adds a wind-banded chart to this page
should look at the two together and say whether the ramp needs its own amber and blue.

One cost is worth naming. The browser test this ADR requires has nothing to open: there is no race
in any local database, because the archive is hand-entered through the finished UI. So the camera is
exercised against `app/dev/race-track`, a harness route that 404s unless the server was started with
`LAYLINE_TRACK_HARNESS=1`, mounting the same component over the same drawing function with a
synthetic race. It is a fixture page in the production tree, which is a real cost; the alternative
was no coverage of the one thing only a browser can answer.

## Consequences

- **`services/analysis/` needs a per-race, full-resolution, per-row read** — every row with its
  position, its efficiency and *why* it has none — alongside the aggregate functions ADR 0026
  specifies. LAY-143 flagged this as likely a different access pattern; it is. The map wants ~1,700
  rows of one race, not a bucketed aggregate over thirteen.
- **The excluded reason must survive to the renderer as a discriminated state**, not as a boolean or
  a null percentage. Three states draw differently (hairline, ring, bridge), and a **Filler-Anchored**
  row carries a fourth, non-excluded marker on top of its own colour (ADR 0036) — collapsing any of
  these back into "not Countable" would re-lose the distinction ADR 0009 was written to protect.
- **Seven new design tokens**, with declared night-vision mappings, for the diverging ramp. They are
  a `%`-of-target ramp and must not be reused for anything else, exactly as this ADR refuses to reuse
  the wind bands.
- **The map is a Client Component** — the only one on this screen. The Server Component computes and
  draws; the client owns the camera.
- **Frozen rings alone are now insufficient anywhere in Layline.** ADR 0014's obligation is amended:
  a map that marks Dropouts must bridge and label them, because at archive scale the rings stack into
  a single pixel and the obligation is silently discharged while the defect remains.
- **A browser test must assert the transform, not the click.** `next dev` never hydrates in this
  environment and a Playwright click on an un-hydrated node succeeds silently, so "the zoom button
  was clicked" proves nothing. Navigate with `gotoHydrated()` and assert on the attribute the map
  actually carries.
- **A recording with no position fixes must say so**, in words, where the map would be. It is a real
  case in the archive and an empty frame explains nothing.

## Rejected alternatives

- **Reusing the wind-band tokens.** Two quantities, one palette, on one screen. The ticket asked; the
  answer is no.
- **A sequential single-hue ramp with 100% annotated rather than coloured** (variant B). It is the
  theme-stable option and that is a real advantage, but it makes the sailor read a number to learn
  which side of target a stretch was on — which is the one thing the map exists to answer without
  reading. Kept explicitly as the retreat if the night-vision degradation proves unacceptable.
- **A neutral track with deviation as dot size, hue only at the poles** (variant C). Genuinely
  elegant — absence of a dot is an honest encoding of "no number here", and it survives night vision
  because two poles need only two steps. Rejected because it spends the track's own shape on nothing
  and makes on-target and unscoreable water look identical, which is exactly the conflation the rest
  of this ADR is built to prevent.
- **Shrinking the frame to the track's aspect ratio.** Reversed by the owner mid-prototype, and
  rightly: it reflows the page between races and still cannot make a 25nm trace legible on a phone.
- **Grey for excluded rows as a colour step.** Grey is the diverging ramp's midpoint. An excluded row
  drawn in it reads as on target.
- **Omitting excluded points from the track.** It draws a quarter of one of these races and calls it
  the race.
- **Hardcoding 45°.** Mislabels 37 rows in a 258-row race on the only boat in the archive.
