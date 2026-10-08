# ADR 0036: A Polar's Trust Is Per-Cell, and a Filler-Anchored Figure Is Flagged, Not Withheld

## Status

Accepted. Resolves [LAY-150](https://linear.app/layline-sailing/issue/LAY-150/settle-which-part-of-a-polar-may-score-a-row-the-twa-floor-is-per-cell),
raised by ADR 0033 ("Whatever LAY-150 settles changes how many rows are dotted, not what dotted
means") and recorded as open in CONTEXT.md's 45° suppression entry.

Numbered 0036, not 0035: [LAY-152](https://linear.app/layline-sailing/issue/LAY-152) claimed 0035 from
a concurrent session, on an unmerged branch at the time this one landed. Same situation this map's
decision log already records between ADR 0027/0028 and the triple claim on ADR 0031 — the two topics
don't overlap, so there is nothing to reconcile beyond the number itself.

Amends ADR 0028's "inside the Polar's manufactured filler rows" rule (row-level exclusion from
Target Speed) and ADR 0033's sub-floor render state (an uncoloured dotted hairline) — both built on
the single-scalar, row-level answer this ADR replaces. Does **not** touch `polarSuppression()` or the
polar-table display rule it serves; that rule is correct for its job (hiding rows) and is untouched.
Does not touch ADR 0009's stored-payload rule, or ADR 0028's handling of true out-of-axis queries.

## Context

`services/boat/polarSyntheticRows.ts`'s `classifyPolarRows()` returns one origin per **row** —
`measured`, `interpolated`, `ramp-filler`, `partial-ramp-filler`, or `no-data` — and `polarSuppression()`
collapses that to a single `firstTrustworthyTwa` scalar. ADR 0028 wired that scalar directly into Target
Speed: a query is reported missing if its TWA falls below it, on either side of the interpolation
bracket.

That is the wrong grain for scoring. Measured against Handsome Pete's own certificate, cell by cell
(each cell tested against its own multiple of the TWA 30 row, at `RAMP_TOLERANCE = 0.1`):

```
TWA       4     6     8    10    12    14    16    20    24
30     ramp  ramp  ramp  ramp  ramp  ramp  ramp  ramp  ramp
35     ramp  ramp  ramp  ramp  ramp  ramp  ramp  ramp  ramp
40     ramp  ramp  ramp  real  real  real  real  real  real
45     ramp  real  real  real  real  real  real  real  real
52     real  real  real  real  real  real  real  real  real
```

Row 40 is manufactured only in the lightest three columns; row 45 only in the lightest one.
`polarSuppression()` reads this as **52°**, because `rampAgreement()` returns `'leading'` for row 45
(on the ramp in the lightest column, off it everywhere else) and the contiguous row-level walk keeps
going past 40 and 45 on that basis. The row-level rule is correct for the table, whose job is hiding
rows wholesale, and wrong for scoring, which discards six real cells at TWA 40 and seven at TWA 45 for
no reason the file supports.

A second question rode along with the first. Beat angle moves with wind speed — 47° to 40° across this
boat's own TWS axis, per the interpolated VMG curve — and every one of those angles sits at or below
52°, so the current floor was suppressing the boat's best upwind angle in every condition it can sail
in. Grilling this with the owner (research recorded in this ticket's Linear thread, not in the repo)
settled it further than the ticket asked:

- **A row that actually happened should never read as "no data."** Suppressing a sailed row's
  percent-of-target because its target came from a filler cell overwrites a derived number with
  silence — the opposite of this project's own data-integrity rule (`AGENTS.md`). The row is real; only
  the question of what to compare it against is in doubt, and that doubt belongs on the number, not in
  place of it.
- **A race or season aggregate must not be a mean of per-row percentages.** A filler-anchored row's
  target can read far too low, driving an individual percentage arbitrarily high; averaging percentages
  lets a handful of those rows dominate a number nobody can sanity-check against the data. The fix is a
  ratio of sums — total actual distance over total target-implied distance for the window — the same
  shape ADR 0027's season aggregation already uses, weighted by each row's actual elapsed time (qtVlm
  rows are event-triggered and unevenly spaced; `services/recordings/provenance.ts` already measures
  this gap rather than assuming one), never a flat per-row count.
- **Target VMG cannot be stated as a point value from this file, ever — not just near the floor.**
  Target VMG's definition is itself a search: the TWA that maximizes `boatspeed × cos(TWA)` at a given
  TWS. Restricting that search to real cells does not make it exact, for two independent reasons,
  verified against this boat's own ORC Speed Guide figures (`BeatAngle`/`Beat VMG`/`GybeAngle`/`Run VMG`
  — fields the certificate publishes and the `.pol` conversion step discards before Layline ever sees
  the file):
  1. **A rectangular TWA × TWS grid cannot hold a per-TWS optimum that moves.** Any TWA row tabulated
     narrow enough to be useful at one wind speed is, by construction, past the true optimum — and
     therefore unmeasurable — at every lighter wind speed on the same certificate. There is no row
     placement that is simultaneously real for every column.
  2. **Even seeding the grid with the certificate's own exact optimum per TWS does not guarantee a
     plain search finds it.** Verified by reconstruction: six of nine wind speeds on this certificate
     have a downwind VMG curve flat enough near its true peak that the published figures, rounded to
     two decimals, differ from a neighboring angle by under a hundredth of a knot — below the
     certificate's own stated precision. A search over any grid, however well built, can land on the
     neighbor instead.

  So Target VMG, wherever it is computed by searching a boat-speed grid, is an **approximation** of
  the certificate's own answer, not a reproduction of it — standing true of the floor-restricted search
  this ADR specifies, and true of every grid this ticket tried building, including ones seeded directly
  from the certificate's own optimum. A certificate's `BeatAngle`/`Beat VMG`/`GybeAngle`/`Run VMG`
  fields are the only exact source for this quantity, and Layline does not ingest them today. Whether
  to add that ingestion is new fog on the map, not a decision this ticket makes (see Consequences).

## Decision

### Trust is a property of a cell, not a row

`polarSyntheticRows.ts` grows a per-cell classifier alongside `classifyPolarRows()`/`polarSuppression()`
— same module, same job (describing what the Polar file itself contains), finer grain. For each
`(TWA, TWS)` cell, the existing ramp/interpolation signatures are tested against that cell alone rather
than reduced to one verdict per row. `RAMP_TOLERANCE = 0.1` is unchanged — nothing found here suggests
it was miscalibrated, only that per-cell scoring makes an existing borderline cell (TWA 40 at 24 kt
misses its ramp multiple by 0.16 kt, just outside tolerance) load-bearing in a way the row-level rule
never exposed it to.

### A row's Target Speed is scored by its own bilinear bracket, and any filler corner flags the whole value

A recorded row's `(TWA, TWS)` interpolates from the four grid cells bracketing it. If **any one** of
those four corners is filler, the computed Target Speed is flagged — not withheld. A partially-real
bracket is exactly as untrustworthy as a fully-fabricated one; nothing here found evidence that a
bracket with three real corners and one filler one is meaningfully safer to present as unflagged.

### Compute, never suppress — the flag travels with the number

Every **Polar Efficiency** figure is computed and shown, carrying a provenance flag: anchored on
measured/interpolated cells only, or touching at least one filler cell (**Filler-Anchored**, a new
`CONTEXT.md` term). Nothing a sailor actually did is ever reported as "no data" because the chart's
comparison point happened to be weak. This reaches every consumer built on the same Target Speed lookup:
the **Race Track Heatmap** (amending ADR 0033 — a Filler-Anchored row is coloured by its percent, not
left an uncoloured dotted hairline, with a distinct marker so it still reads differently from a fully
measured cell) and the **Sail Selection Screen**'s percent-of-target layer (amending ADR 0030 — its
"no computable target" dash becomes a shown, flagged percent for the Filler-Anchored case; the dash
stays exactly where it already means something ADR 0030 earns on its own terms: a true out-of-axis
query, which this ADR does not touch).

### A race or season Polar Efficiency figure is a ratio of sums, weighted by elapsed time

Total actual distance over total target-implied distance for the window, never a mean of per-row
percentages — so a handful of Filler-Anchored rows cannot dominate a number nobody can see the
individual rows behind. Each row's contribution is weighted by its own measured elapsed time
(`services/recordings/provenance.ts`'s existing gap measurement), never an assumed fixed interval,
because qtVlm rows are event-triggered and not evenly spaced.

### Target VMG is computed the same way, with a standing approximation caveat, and no point beat/gybe angle is ever stated

Target VMG at a given TWS is the max of `boatspeed × cos(TWA)` over cells this ADR's per-cell classifier
marks real — restricting the search away from filler, exactly as `polarSyntheticRows.ts`'s contract
already requires elsewhere. Every **VMG Efficiency** figure built on it carries a standing caveat —
"Target VMG is estimated from the Polar's grid, not the certificate's own published optimum" — on every
row at that TWS, not only when the search visibly pins to the real-floor's edge. This is a correction to
`CONTEXT.md`'s existing **Target VMG** term, which currently reads as if the grid search produces the
Polar's actual optimum.

Layline states no point beat or gybe angle anywhere, from any Polar, under any construction. This is a
hard rule, not a per-file judgment call: proven to fail even on a grid built directly from the
certificate's own stated optimum. Whether Layline should ever ingest a certificate's own
`BeatAngle`/`Beat VMG`/`GybeAngle`/`Run VMG` fields as a second, more precise data source is left to the
map (see Consequences) — this ADR settles only that the `.pol` grid, however queried, is never that
source.

## Consequences

- `polarSyntheticRows.ts` gains a per-cell classifier; `classifyPolarRows()`/`polarSuppression()` and
  the polar-table display rule are unchanged and keep their row-level answer, which remains correct for
  their job.
- `services/analysis/` (still unbuilt — ADR 0026) gets its Target Speed/Target VMG/Polar Efficiency/VMG
  Efficiency functions, each consuming the per-cell classifier as an input rather than
  `firstTrustworthyTwa`. The classifier stays in `services/boat/`, since it describes the Polar artifact
  alone; the composition with a recorded row is a different concern and belongs in the new module.
- ADR 0028's "inside the Polar's manufactured filler rows" bullet is superseded for the scoring path:
  a query there now returns a Filler-Anchored Target Speed, not a missing one. Its other bullet — a
  query past either axis's defined range — is untouched; that is still, and only that is, missing.
- ADR 0033's sub-floor render state changes from an uncoloured dotted hairline to a coloured, distinctly
  marked cell. The exact marking (texture, ring, or otherwise) is left to whoever implements it — this
  ADR settles the rule, not the pixels.
- ADR 0030's "no computable target" dash state splits in two: Filler-Anchored becomes a shown, flagged
  percent; true out-of-axis stays a dash. `getSailSelectionData` and the heatmap's row-level read both
  need the per-cell flag threaded through, not just a boolean.
- **New fog for the map, not a ticket**: whether Layline should ingest an ORC certificate's own
  `BeatAngle`/`Beat VMG`/`GybeAngle`/`Run VMG` fields as a second data source, to produce an exact
  (rather than approximate) Target VMG and, if ever wanted, a stated beat/gybe angle. Separable from
  this ticket because it is a new ingestion capability, not a scoring-rule change, and the map's
  destination does not currently include it.
- Two other threads this ticket's research surfaced are explicitly out of scope and belong to their own
  future tickets, not this map's fog, pending separate scoping: whether `TWS` itself carries enough
  instrument error to need its own Calibration Channel treatment, and whether a season of a boat's own
  recorded performance could ever produce a second, clearly-labeled, Layline-computed polar alongside
  (never replacing) the certificate.

## Rejected alternatives

- **A coarser per-column floor instead of a per-cell bracket test.** Collapsing each TWS column to its
  own single lowest-real-TWA would read better as a sentence but silently assumes a column's real/filler
  boundary is uniform across every bracket that touches it, which the measured table above shows is not
  always true at the margins. The bracket test is the more precise statement of the same evidence and no
  harder to compute.
- **Suppressing Filler-Anchored rows, matching today's behavior.** Rejected per the data-integrity
  argument above: a sailed row is real regardless of how weak its comparison point is, and hiding it
  destroys information a sailor can otherwise interpret with the flag in hand.
- **Flagging Target VMG only when the search visibly pins to the real-floor's edge.** Rejected once the
  downwind reconstruction showed the approximation is not confined to the edge — a flat curve interior
  to the real region is just as capable of handing the search the wrong neighbor.
- **Seeding the grid with the certificate's own Beat/Run VMG as part of this ticket.** Would require a
  new ingestion path for data the `.pol` format does not carry — out of scope for a ticket about scoring
  the file Layline already has, and left as fog for the map instead.
