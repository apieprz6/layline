# ADR 0045: A Race Holds Its Recordings

## Status

Accepted. Resolves LAY-202, on the map *iOS companion app* (LAY-196). **Amends ADR 0010** on
which way the Race and its Recording point, on what deleting a Race means, and on the frame a Race
Window is stated in. Every other ruling of 0010 stands.

Follows ADR 0044, which made a Layline phone recording a second **Recording Format** and keyed its
Facts to the Recording rather than the Race. Decided without a phone recording in existence: the
recorder is not built and the boat is hauled (2026-11).

## Context

Map decision 7 has the phone and the qtVlm laptop record side by side until the phone replaces it,
so a Race can hold more than one Recording, and more sources are welcome, never a conflict to be
resolved away. `CONTEXT.md` already says so, since ADR 0044. Nothing else does:

- **The schema is one-to-one, with the Race as the child.** `races.recording_id` is `NOT NULL
  UNIQUE … ON DELETE CASCADE`, and the column comment reads "a Recording is never shared between
  Races". Deleting a Race is written as deleting its Recording, which is correct only because of
  that `UNIQUE`.
- **Every reader reaches "the" Recording.** `readRace`, `readRaces`, `readLatestRace`,
  `readAnalysisArchive`, `readInstrumentTuning` and the MCP tools each embed one
  `recordings!inner(…)` and read its rows.
- **Every analysis takes one ordered stream on one clock.** Row Quality, Maneuvers, Countable, the
  efficiency intervals, Instrument Tuning and the Race Track Heatmap all walk `rows[i-1]` to
  `rows[i]`. A row is identified by `race_id` and `row_index`, which would collide across two
  Recordings.
- **The window is in its one Recording's frame.** ADR 0010 stores the Race Window as naive
  wall-clock time, compared against the qtVlm export's own naive stamps with no conversion. A phone
  recording's timeline is UTC receive time (ADR 0044 §3). Nothing in the codebase relates the two.

Two facts about this boat shape what more Recordings are worth. The laptop and the phone both listen
to the same YDNR-02, so their instrument values mostly start at the same NKE sensors and TL25; only
position (the Garmin against the phone's GPS) and qtVlm's recomputed true wind against the TL25's
are independent. And several recorders aboard one boat is a different thing from several boats in
one race.

## Decision

**A Race holds its Recordings. Each Recording belongs to exactly one Race, and a Race reads all of
them as one analysis.**

### 1. A phone recording is a Recording

It is the same entity as a qtVlm export, in a different **Recording Format**. It is not a second
kind of thing attached to the Race. Anything a Race does with its Recordings it does with every
format.

### 2. A Race holds zero or more Recordings; a Recording belongs to exactly one Race

The Recording becomes the child: `recordings.race_id NOT NULL`, and `races.recording_id` goes.

Many-to-many is rejected. A Recording never backs more than one Race, in either format:

- **A qtVlm export** is still uploaded once per Race (ADR 0010). A regatta-day file is uploaded
  once for each race it holds, and each upload is its own Recording.
- **A phone recording** gets there by its own controls: the app concludes a race and starts a new
  Recording. One phone recording never spans several Races.

**A Race may hold no Recording.** No constraint requires one. Today every Race is created with its
first Recording, because the only creation path is an upload. Race planning may later make Races
before they are sailed, and this leaves room for that. Whether a planned race is still a **Race**
in `CONTEXT.md`'s sense, "one complete race sailed", is for that work to decide.

A further Recording may be **attached** to an existing Race at any time, through the amendment flow
with a file step. How the phone creates a Race or attaches to one belongs to the map's open item
*how a Race comes into being from the phone*.

### 3. Deleting

Deleting a Race deletes all its Recordings, their Transcriptions and their stored bytes. An admin
may also delete one Recording from a Race. Deleting the last one asks for confirmation and leaves
the Race standing with no recording; it does not delete the Race. No Annotation can destroy a
Transcription, as before. The **Sweeper** still removes only stored bytes that no Recording claims.

### 4. One Race Window, in the sailor's wall-clock time

A Race has one Race Window, however many Recordings it holds. The start and finish are one claim,
and two windows typed separately would drift apart in a way that looks like instruments disagreeing.

The window stays **Testimony in the sailor's local wall-clock time**, stored as naive wall-clock time
exactly as ADR 0010 stores it today. Each Recording is compared against it through a **Clock
Relation**. A qtVlm export's relation is the identity, which is the comparison made today. How any
other recorder's clock relates to the window is a separate decision, LAY-210, *reconcile the recorders'
clocks*. Until that is decided, a phone Recording cannot be windowed.

### 5. The window refusals, across Recordings

ADR 0010 refuses two windows, and both still apply. A finish at or before its start is always
refused. A window with no data inside it is refused only when the Race has at least one Recording
and **none** of them has data inside the window. A Recording with nothing inside is a coverage fact
stated on the race page, such as *"phone recording ends 40 min before the start"*, never a
refusal. This is ADR 0010's warn-don't-block stance applied per Recording.

### 6. One analysis per Race, from every Recording

A sailor sees **one** analysis of a Race, never one per Recording. Several near-identical analyses
side by side would confuse more than they inform. That one analysis draws on every Recording the
Race holds, under two rules:

- **Nothing any source gave is overwritten.** Each Recording's Transcription stays exactly as
  recorded.
- **Any combined value is Layline's, and labelled as such.** A position refined from several
  receivers, or a gap in one source filled from another, is computed at read and stated, the way
  ADR 0044 §5 treats any value Layline calculates.

The mechanics are deliberately not decided here: choosing a source or combining several, the
ranking, gap filling, how disagreements are marked, whether a disputed moment stays Countable, and
the per-Race provenance statement. They go to LAY-211, *decide how a Race's analysis draws on several
Recordings*, which needs the clock decision first, because two sources can be compared only once
their clocks are related. That ticket starts from three things the owner said:

- The NKE 0183 Stream and the router's NMEA 2000 wind will likely be identical.
- The phone may record position at higher fidelity than the Garmin.
- With a phone, a watch, the Garmin and a crew member's phone, there may be enough receivers to
  refine where the boat really was.

### 7. Every Recording on a Race was made aboard that boat, and stays private to it

Several recorders aboard one boat, whether instruments or any crew member's phone, are several
Recordings on one Race. Each Recording records which **Account** made it (`recorded_by`). Another
boat's recording of the same race is that boat's own Race, never a Recording on this one, so
combining values in ruling 6 can never mix in another boat's instruments.

A boat's Races and Recordings are **private to that boat**, because a boat's performance data is a
competitive advantage. Pooling across boats is out of scope. It may come later as a feature, and
only as something a boat opts into. A design that shares any of it by default must overturn this
ruling openly.

### 8. What changes, and when

One build ticket, LAY-212, does the following, before the phone upload ticket:

- Flips the schema to `recordings.race_id` and inverts the 13 existing foreign keys. There is
  nothing else to backfill.
- Adds `recordings.recorded_by`.
- Moves row identity to `recording_id` + `row_index`.
- Rewrites deletion, the window-refusal trigger and the Sweeper's ownership check.
- Changes `RaceDetail`, `RaceListEntry` and the MCP race summary to carry a list of Recordings.

The analyses keep reading the Race's one Recording until a second can exist. They are rewritten
under the fusion decision, not before it.

### Rejected alternatives

- **A phone recording as a separate kind of thing on the Race** (a "Track" or "Capture"). It would
  duplicate the Recording's whole contract (Transcription, Provenance, deletion) for one format.
- **Many-to-many between Races and Recordings.** It would let a phone recording of a regatta day
  back each of its races. It was rejected as messy: a join to keep consistent and deletion that has
  to ask who else holds a Recording, when the phone can simply end one Recording and start the next.
- **A Race Window per Recording.** It would keep ADR 0010's "the Recording's own frame" literally
  true. But it makes the sailor state one claim twice, and the two copies drift.
- **A Race needs at least one Recording.** Simpler today, but it would have to be undone the moment
  a race can be planned before it is sailed.
- **Show each Recording's analysis side by side, or let the sailor pick one per Race.** Honest, but
  more confusing than it is worth for near-identical results.
- **Blend sources into a value no instrument reported, silently.** It would average disagreement
  away. Combining is allowed only as a labelled value of Layline's (ruling 6).

## Consequences

- `CONTEXT.md`'s relationship "a **Recording** contains exactly one **Race**" is replaced by "a
  **Race** holds zero or more **Recordings**; each Recording belongs to exactly one Race". ADR
  0010's justification for duplicating identical bytes, that it keeps the old relationship true,
  still holds under the new one.
- "Deleting a Race is expressed as deleting its Recording" stops being true and is rewritten.
- A **Clock Relation** is a new term, defined only as far as ruling 4 goes.
- Two grilling tickets join the map, *reconcile the recorders' clocks* and *decide how a Race's
  analysis draws on several Recordings*, the second blocked by the first. One build ticket follows
  this ADR.
- Until the fusion decision lands, a Race with a phone Recording and a qtVlm Recording can be
  stored, but not analysed as one.
