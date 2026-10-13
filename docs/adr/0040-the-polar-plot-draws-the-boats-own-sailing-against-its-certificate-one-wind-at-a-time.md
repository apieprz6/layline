# ADR 0040: The Polar Plot Draws the Boat's Own Sailing Against Its Certificate, One Wind at a Time

## Status

Accepted. Settles LAY-165, which prototyped the picture LAY-155 shipped the Polar performance screen
without. The design is branch `prototype/lay-165-polar-picture`, worked through seven rounds of the
owner's review on the real archive (13 Races, read through the shipped pipeline rather than a port of
it). Built by LAY-173.

**Amends three ADRs**, each in one place:

- **ADR 0026**: the Polar performance screen's aggregate, named there as a "binned efficiency grid"
  and shipped by LAY-155 as a list of four wind bands, is the **Polar Plot** described here. The list
  goes.
- **ADR 0029**: the Polar performance screen's registry drops from six dimensions to **five**. `wind`
  leaves the rail under that ADR's own rule, because the Polar Plot's focus window now owns the axis.
- **ADR 0038**: the readout floats over the map frame *only when the map is the sole picture of the
  selection*. On the per-Race page the Polar Plot shares the selection, so the readout leaves the
  frame and serves both pictures.

**Does not amend ADR 0036.** A **Filler-Anchored** figure is computed, shown, flagged and coloured on
the Polar Plot exactly as on the **Race Track Heatmap** (see *Filler-Anchored sailing*, below, for the
alternative that was decided against).

## Context

The Polar performance screen shipped two percentages and a list. A sailor narrowed six dimensions and
watched two numbers move, while every other screen on LAY-138 got a picture first. Sailors read their
boat's performance as a **polar**, the speed it holds at each angle against the speed it should, and
the screen had nothing in that shape. The per-Race page had the reverse problem: ADR 0033 reserved a
"Boat performance vs. polars" section beside the track and nobody gave it a form.

The real archive decided most of what follows, and five measurements carry the decision:

- **A mean line hides the spread.** The season's per-row figures run from p25 86% to p75 99% (p5 71%,
  p95 114%). Eighteen ten-degree means draw 92.4% and nothing else.
- **A speed averaged across wind speeds is a blend of different boats.** The 50–60° bin read 5.19 kt
  over rows spanning 4 to 19.2 kt of wind: 4.86 kt in light air, 5.90 in medium, 6.64 in heavy.
  Downwind it hid a real weakness: 130–140° is 4.59 kt (79%) in light air against 7.05 kt (94%) in
  medium.
- **Binning on both axes is not enough on its own.** With angle and speed binned but wind left free,
  45% of patches mixed two or more wind bands. Those patches held 73% of scored time, and the median
  one hid a 19-point spread in percent of target, because fast-for-5-knots and slow-for-15 cancel in
  one cell.
- **The certificate's trust floor is a staircase.** The first anchorable angle is 52° at 4 kt, 45° at
  6 and 8, and 40° from 10 up (LAY-150's per-cell finding). A single inner radius would be wrong in
  eight of nine columns.
- **A row count misweights the picture.** One Race is 1.9% of the scored rows and 6.5% of the scored
  time, so equal-sized dots would under-draw it 3.4× against the figure printed above them.

## Decision

### One picture, in three places

The **Polar Plot** is the boat's own sailing drawn against its certificate as a half rose. The bow
points up, 0° is at the top and 180° at the bottom, and only one side is drawn, since the Polar's TWA
axis is `|TWA|` and a mirrored rose would draw a port lobe out of starboard rows.

- **On the Polar performance screen** it is drawn as **patches** of 5° × ½ kt. Colour is the patch's
  time-weighted percent of target, and opacity rises with the time behind it.
- **On one Race** it is drawn as **every scored moment, one dot each**, at its own angle and speed.
  Colour is that moment's percent of *its own* target at *its own* wind, and area grows with its own
  measured interval. The whole season sits behind it as a dotted trace in the accent colour, so the
  picture answers "was this good *for us*". Grey is reserved for the certificate.
- **On the Overall tab** it is drawn as the small patched form over the recent five races. At that
  size a cloud is a smudge.

On every surface the colour is the track's own seven-band ramp (ADR 0033), never a second scale for
the same quantity. Every figure is a ratio of sums weighted by measured interval (ADR 0036), so a
patch, a window and the headline add up from one set of sums.

### The certificate is drawn as a family, not a curve

Behind the sailing sits **every certificate column the drawn sailing was scored against**, each read
through `targetSpeed` along the Polar's own angles. Each segment's ink changes where its
`filler_anchored` flag does, so the staircase floor is the visible inner edge of the reference. Using
one curve at the mean wind was tried and rejected: no two moments share a comparison point, so a
single curve is a reference almost nothing on the picture was measured against. When one selected
patch was scored against a target well inside the drawn curve, the figure and the picture disagreed
on screen.

### On the Polar performance screen, the focus window owns the wind axis

A slider sets a window of **uniform width**, centred in 1 kt steps across the certificate's range,
with the width selectable at 2, 4 or 6 kt. The certificate's columns are ticked underneath. The
window is what stops a patch mixing wind speeds.

- **Uniform, not the certificate's own columns.** Stepping the columns was exact, but they are
  unevenly spaced, so the windows came out at 2, 4, 4, 4, 4, 4, 6, 8 kt and then everything above 20.
  The window changed size under the thumb, so no two positions were comparable.
- **The rail gives up `wind` on this screen**, under ADR 0029's rule: a dimension whose values are
  the chart's own answer is dropped from the rail. A chip and a slider over one axis was the same
  conflict that removed the first draft's wind-band chips, in a louder form.
- **The window narrows the picture, not the match.** The **Coverage Ledger** and the headline figures
  stay over everything the rail matched.

Tapping a **patch** selects it, never a sector. A sector spans every speed at its angle, so tapping
it asks a question the picture has already divided into fifteen answers.

### On one Race, the Polar Plot and the track share one selection and one readout

Tapping a dot lights its stretch on the **Race Track Heatmap**; tapping the track rings the dot.
**One selected row sits above both pictures**, which each derive from it, not two states kept in
sync.

**The readout leaves the map frame.** ADR 0038 floats it over the frame so a tap's answer stays next
to the place tapped. That reason holds while the map is the only picture of the selection, and fails
once a second picture shares it: two readouts describing one row in two places meant scrolling up and
down to compare them. So the shipped readout, unchanged, is rendered once below both pictures. It is
**sticky at every width**, because the two cards are 700–900px tall and "both visible at once" only
holds at the top of the page. It **opens only on a tap**, and when the tapped mark falls under it the
page scrolls just far enough to show it. That is the page-level form of ADR 0038's "moves out of its
own way". The Polar Plot adds one line the map cannot provide: how long the moment lasted.

Two asymmetries are stated rather than smoothed over:

- **The map draws transitions; the Polar Plot draws moments.** A stroke is keyed by the row it
  arrives at, so the first moment of a run of fixes has no stroke. The Polar Plot answers for it and
  says the map cannot.
- **The map draws every recorded moment; the Polar Plot only the scoreable ones.** Selecting one of
  the others says there is no figure for it. The selection is never cleared and never moved to a
  neighbour.

The map's column stays at ADR 0033's 620px cap beside the Polar Plot. Two equal columns grew the
portrait frame to about 960px at 1920 and left the card beside it mostly empty.

### Filler-Anchored sailing is coloured, stitched, on both pictures

A dot or patch scored against a manufactured cell is **coloured by its percent and stitched**, as the
Race Track Heatmap draws the same sailing. This is ADR 0036 unchanged.

The prototype first drew it hollow and uncoloured. Painted, those figures read 104–242% of "target"
at the flattering end of the ramp, because what they are divided by is a ramp towards zero. The owner
first accepted the hollow treatment, then reversed it once the Polar Plot and the track shared a
selection: one tap would have shown the same moment teal on the map and hollow on the Polar Plot.
**One rule across the two pictures outranks the cleaner reading of either.** The flattering colour
is still a real risk, and it is carried by the stitch, the legend's "not measured" entry and the
readout's flag rather than by withholding the colour.

### The picture speaks in marks and time, not paragraphs and rows

The legend is **one line under the chart**, a swatch and a word for the certificate, the not-measured
cells and, on one Race, the season. The method, including how much sailing is *not* drawn and why, is
behind a single collapsed explainer. The owner rejected standing prose twice, and `Explainer`'s own
header already makes the argument. Amounts are stated in time, never in rows (ADR 0037): the slider
reads "9h 17m of sailing" and a patch reads "21m 30s over 7 races".

## Consequences

- **The track's state is lifted.** `TrackHeatmap`'s overlay and selection state, and its chip row,
  move above both pictures. `TrackHeatmapFrame` is already controlled; `TrackReadout` is hoisted out
  of it.
- **The per-Race page ships more per moment.** The dots need each moment's measured interval and
  Countable verdict, which the track's facts do not carry today. Ship them once, from the server,
  for both the Polar Plot and LAY-162's tiles.
- **The Overall tab's hero card becomes a picture.** The recent-five window is unchanged.
- **VMG is not drawn here.** A VMG panel was built and cut. Its measurements (a collapse to 9% of
  Target VMG at the beam, and a 14-point gap between the shipped 90° split and true beating and
  running) belong to LAY-166.
- **The track's own legend still says "rows"** ("Drawn, not coloured — 124 rows"). That breaks ADR
  0037 in shipped code and is not this ADR's to fix, but it now sits beside a picture that keeps the
  rule.

## Rejected alternatives

- **Percent of target on cartesian panels** (one by angle, one by wind speed). Legible, and it fit
  both axes at 390px, but sailors read performance as a polar, and the panels drop the certificate
  from the picture.
- **The certificate's own 16 × 9 grid, filled in.** The only shape honest about coverage unprompted
  (86 of 144 cells carry a figure), but it is not a shape, and the cell a moment is drawn in is not
  the pair of cells it was scored against.
- **A mean line, alone or over the cloud.** It hides the spread the cloud exists to show, and the line
  dominates what it summarises.
- **Wind-band chips on the chart**, or **four roses, one per band.** The chips duplicated the rail's
  own axis. The facets answered "where is the boat good" without interaction, but left each patch
  mixing every wind inside a seven-knot band.
- **Stepping the focus window on the certificate's columns.** Exact, but the window changed size
  under the thumb.
- **Selecting a sector.** Coarser than the mark it sits over.
- **Hollow, uncoloured Filler-Anchored sailing on the Polar Plot alone.** See above. It is the cleaner
  reading, but it disagrees with the track on the same tap.
- **Two readouts, or a new one.** Two was the scrolling problem. A hand-rolled replacement lost what
  the shipped readout already does per overlay: the overlay's own headline, provenance on every
  figure, which kind of missing a missing figure is, and "All figures".
