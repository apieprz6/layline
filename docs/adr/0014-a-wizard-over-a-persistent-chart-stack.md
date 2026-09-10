# ADR 0014: A Wizard Over a Persistent Chart Stack

## Status

Accepted. Settles the flow shape for race upload and annotation, chosen from four prototyped
alternatives and confirmed by the owner. Applies ADR 0008 (provenance), ADR 0009 (upload quality
gates), ADR 0010 (Testimony over an immutable Transcription), ADR 0012 (four Boat Setup artifacts)
and ADR 0013 (orphaned bytes over orphaned rows) rather than revising any of them.

**ADR 0010 was subsequently amended to reuse this flow** as the amend surface for an existing Race,
entered without the File step (ADR 0010, Amendment 1, 2026-09-10). This decision stands as written;
what changes is that the flow has a second caller, and the consequences of that are recorded there.

## Context

Getting a race into Layline means answering four questions about a qtVlm CSV: which stretch of it is
the race, which sails were up and when, what the sea was doing, and which Boat Setup Versions were
on the boat. All four are **Testimony** (ADR 0010) — the sailor's claim, not something the file
states — and all four are answered on a phone, often the day after, from memory.

The cost of answering is the whole problem. The archive's busiest recording carries **seven sail
changes**; a distance race runs 13.68 hours. If entering that race is expensive, the archive stays
empty, and an empty archive makes every downstream feature worthless. So the question the prototype
existed to settle was not "which layout looks best" but **how many taps a race costs**.

Four shapes were built and driven against six real recordings: a five-step **wizard**, a single
scrolling **sheet**, a **timeline-first** flow with no datetime field anywhere, and a **log now,
annotate later** split. Each carried an identical cost meter, identical fixtures, and identical
refusal logic, so flow shape was the only variable.

Two facts about the data shaped the answer more than any layout preference:

- **A window is a place before it is a pair of times.** The boundary the sailor is actually looking
  for is the moment the boat stopped sailing the course and motored home. On a GPS track that moment
  is unmistakable; on a speed trace it is nearly invisible.
- **A dead instrument feed leaves no gap.** qtVlm keeps writing rows on schedule, repeating the last
  fix verbatim. On a chart that draws a suspiciously flat line — and it draws it exactly where a
  sailor would drag a window boundary to. On a **map it draws nothing at all**: the boat sits at one
  pixel, so half a recording can be dead and the track looks clean.

## Decision

**A five-step wizard — File, Window, Sails, Sea state, Review — over a chart stack that is mounted
once and carried through every step.**

**The stack is a GPS track map plus one swappable channel.** The track sits above; below it one of
SOG, TWS, TWA or AWA, chosen by a pill row. Both are cropped by a **single** window, read through
one shared time axis: dragging the map's rail and dragging the chart's handles are the same piece of
state, not two scrubbers kept in sync. Scrubbing **erases** the cropped-away track to a ghost rather
than dimming it, so the crop reads as *this is the race* instead of *this bit is highlighted*.

**Only the permissions change between steps.** On Window the scrubbers move and annotations are
frozen; on Sails a tap on the track or the chart places a sail change and the window is fixed; on
Sea state the same gesture applies to sea state; on Review nothing is editable. **Every annotation
placed on an earlier step stays drawn for the rest of the flow**, dimmed and without a hit target,
and the channel choice survives the step change. The sailor answers each question against the same
picture and never has to re-establish where they are.

**Times come from the recording, never from a keypad.** A tap snaps to the nearest recorded row, so
an annotation's time is always a time the file actually has; a time already taken steps forward one
row so two entries cannot collide by accident. Nudges of ±1 and ±5 minutes plus a datetime field
cover the gaps between rows, and an explicit "add one by time instead" path exists for when tapping
is not available.

**A sail change costs the difference, not a fresh sail plan.** A new sail entry inherits the previous
entry's Sail Configuration, so a change is usually two chip taps — drop the old headsail, name the
new one.

**From 1024px up the two charts sit side by side**, track left and channel right, with the window
strip and the provenance sentence spanning both because they describe both. Both are fluid: the
viewBox holds the aspect ratio so the projection stays geographically true, and panes cap so an
ultrawide splits the space rather than growing two enormous squares.

### The measurement

Entering `08-26-26-beer-can` — the archive's worst case at seven sail changes — end to end costs
**24 actions**. A recording with nothing to annotate costs **5**: pick the file, three Nexts, submit.
Everything above five is something the sailor chose to say about the race.

Carry-forward is what makes seven affordable; six of the seven real changes on that race are a
single sail swap, and without carry-forward the same race is roughly three times the taps. Both
figures are pinned by exact assertions in the prototype's test, so a change that costs the sailor
more taps fails rather than passing quietly.

## Consequences

- **Any map view in Layline inherits an obligation to mark Dropouts.** A frozen run is invisible on
  a track, so frozen points are ringed and the track breaks into and out of them; on the chart the
  same runs are hatched and the line is drawn broken. This is not a nicety of one prototype screen —
  a map that omits it silently presents a dead feed as a clean track.
- **AWA is read from the file's own `AWA (calc)` column and stored exactly as given**, labelled a
  calculation wherever it is shown. qtVlm computed it; the boat never measured it; the column name
  says so. TWA is read from `TWA`, not `TWA (calc)`. This is ADR 0008 applied, and it needed no
  derivation on our side.
- **Angles are scaled to a fixed 0–180, or −180–180 where the file is signed**, so switching channel
  never silently rescales the y-axis under the sailor. Speeds scale to the file.
- **Missing values are `null`, never a sentinel.** `-1` is a valid wind angle, so a sentinel would be
  a fabricated stand-in for a missing reading — the thing ADR 0008 forbids.
- **The wizard writes nothing until submit** (ADR 0013), which is what lets a draft be abandoned at
  any step. Review shows the exact rows that would be written, including the four Version pointers
  left null when nobody chose one.
- **The Wind Band picker stays gated behind a Rig Tune choice** (ADR 0007), and a duplicate content
  hash is a confirmation rather than a refusal, because one Recording can hold more than one Race
  (ADR 0009, ADR 0010).
- **Nothing is pre-selected in the sail and sea-state steps.** A default here would be a guess
  presented as a memory.
- The sheet, timeline-first and log-now-annotate-later shapes are rejected, but two of their ideas
  survive inside the wizard: tap-to-place times come from the timeline-first shape, and the sheet's
  objection to sub-forms is why sail entries are a list edited in place rather than a screen per
  entry.
- **The prototype itself is not merged.** It carries mock fixtures, no persistence and a throwaway
  route; it lives on `prototype/lay-94-race-upload` as a primary source, and this ADR is what main
  keeps.
