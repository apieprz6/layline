# ADR 0026: The Analysis Query Layer Matches Rows, Not Races, and Stays Read-Time

## Status

Accepted. Resolves LAY-143 ("Design the analysis query layer"), the architectural groundwork the
screen-level prototype tickets — [Prototype how the Sail Selection Chart visualizes matched race
data](LAY-146), [Prototype the Instrument Tuning screen](LAY-147), and [Prototype the GPS track +
polar-%-of-target heatmap overlay](LAY-148) — depend on.

Builds on ADR 0010's "contract with the analysis effort" (read-time-computed from a Race's current
Testimony, any cache keyed on `updated_at`, nothing derived stored against a Race) and on ADR 0025's
**Countable** rule, which this ADR adopts rather than re-derives. Leaves two things open on purpose:
the Polar/VMG Efficiency numerator (entangled with the paddlewheel-vs-SOG divergence question) stays
with its own future ticket, and each filter dimension's bucket boundaries — what counts as "morning,"
where a wave-state cutoff sits — stay with the screen-level prototype tickets above.

## Context

Four screens read across some or all of the Race archive: Polar performance detail, the Sail
Selection Chart, a new Instrument Tuning screen, and the per-Race breakdown. Three of the four share a
six-dimension filter set — wind speed, point of sail, sail used, wave state, time of day, and a
season/date range.

Nothing here exists yet. `services/analysis/` has no files. No screen has a real filter control — the
map's "already filterable in the mockup" describes the Claude Design mockup file, not app code. Nothing
anywhere computes Target Speed, Polar Efficiency, or VMG Efficiency, per-race or across races. The
archive itself is small and grows by hand: thirteen Races, roughly 4,088 rows inside their windows,
entered a few times a season by the owner. No design doc anywhere estimates a growth rate or raises a
recompute-cost concern.

Two facts push against the obvious shape. First, **Sea State** and **Sail Configuration** are
Annotations resolved onto **Recording Rows** by time-in-force (ADR 0008), so a single Race can carry
more than one value of either across its duration — a sail change mid-race is not an edge case, it is
what the mechanism is for. A filter keyed on the Race would either ignore that or invent a second
resolution rule. Second, six of thirteen Races carry no Sea State or Sail Configuration annotation at
all (ADR 0010's Context), so any filter touching either dimension meets missing data on close to half
the archive, not as a rare gap.

## Decision

### The unit of a match is the row, not the Race

An **Analysis Filter** (new `CONTEXT.md` term) matches one **Recording Row** at a time against all six
dimensions, using each row's own resolved annotation values — the same time-in-force resolution ADR
0008 already defines, applied here rather than reinvented. A Race is never asked "does this Race match";
only its rows are. Screens that need a Race-level answer (a matched row count, a coverage figure) get
there by grouping matched rows by `raceId`, not by filtering at that grain to begin with.

### Efficiency is a pluggable seam, not something this ADR settles

Every consumer needs a row's Target Speed, Polar Efficiency, and VMG Efficiency. This ADR fixes only the
seam — conceptually `computeRowEfficiency(row, polar) -> { targetSpeed, polarEfficiency, vmgEfficiency }`
— and resolves `polar` the same way `services/races/readRace.ts` already resolves any Boat Setup
artifact: via the Race's own bound Version pointer, so a season spanning a Polar update compares each
Race to the Polar actually in force when it was sailed, never to today's. The numerator itself
(`STW/POL` vs `SOG/POL`) is not decided here — the map already carves that out, entangled with the
paddlewheel-vs-SOG divergence question, into its own ticket "in its own session." Fixing the seam now
means that ticket changes one function's body, not the shape every screen calls.

### Countable governs every aggregate; the per-Race heatmap is the one screen that shows the rest

ADR 0025 already settled this: a row counts toward Polar Efficiency, VMG Efficiency, the Sail Selection
Chart, and every Instrument Tuning check only if it is **Countable** (not Frozen, not Low-Speed, not
inside a Maneuver Window). This ADR does not reopen that; it wires the query layer's matched rows through
the existing Countable predicate before any aggregation, and leaves the per-Race GPS-track heatmap
rendering every matched row regardless — including non-Countable ones, styled as ADR 0025 already
specifies, as a distinct excluded state rather than a computed percentage.

Matching and counting are independent questions. A row can match every selected filter bucket and still
be excluded from a number if it is not Countable.

### Unknown is a selectable bucket, on by default

Sea State and Sail Configuration are the two dimensions a row can lack entirely. A row with no annotation
for a filtered dimension matches an explicit **Unknown** bucket — a real, selectable value alongside the
actual ones, on by default when a filter is untouched. Narrowing a filter to a specific real value (e.g.
"Choppy") excludes Unknown rows the same as it excludes any other non-matching value, unless Unknown is
also selected.

The alternative — always showing unannotated rows regardless of which real buckets are selected — was
rejected: it breaks what "filtered to Choppy" means the moment a sailor narrows the filter, in service of
a "never silently omit" rule that a selectable, on-by-default Unknown bucket already satisfies without
corrupting the filter's own semantics.

### `services/analysis/` has three layers and no API route

- A shared row-matching primitive: given a row (with its resolved annotations) and an Analysis Filter,
  returns whether it matches and tags it with its `raceId`, its resolved dimension values, and its
  Countable status.
- The efficiency seam above.
- One aggregation function per screen — `getPolarPerformanceData`, `getSailSelectionData`,
  `getInstrumentTuningData` — each composing the first two into that screen's specific shape (a binned
  efficiency grid, a sail-vs-condition matrix, a divergence trend).

No `app/api/` route sits in front of any of this. An Analysis Filter travels as URL `searchParams`; each
screen's Server Component page calls its aggregation function directly, the same pattern
`services/races/readRace.ts` already uses from `app/(app)/boat-performance/races/[raceId]/page.tsx`.
There is nothing here a client needs to fetch without a navigation, so there is nothing here an API route
would earn its keep doing.

### Read-time-computed, no cache, for all four screens

Matches ADR 0010's default. The archive is thirteen Races and roughly 4,088 in-window rows today, hand-
entered a few times a season — recomputing every derived figure on every read costs nothing worth
measuring at this scale, and no document anywhere projects a growth rate that would change that
calculus. This resolves the map's own "Not yet specified" item deferring the cache-vs-read-time call to
this ticket: the answer, for now, is that there is nothing to cache. Revisit if the archive's shape
changes materially — many more races, or a per-Race screen that turns out to recompute something
expensive over a full Transcription on every read — not on a schedule.

### The per-Race breakdown is out of this design

Decision #8 on the map already rules out filters on it. Its only new need — per-row Target Speed and
Efficiency for the polar-%-of-target heatmap — is the same seam every other screen uses, applied to one
Race's own rows. It needs no row-matching primitive, no Analysis Filter, and no cross-race aggregation
step, so it is a consumer of this design rather than a fourth surface within it.

### What this ADR does not decide

Bucket boundaries per dimension — the exact wind-speed bands, point-of-sail zones, wave-state cutoffs,
and time-of-day windows a sailor actually picks from — are left to the screen-level prototype tickets,
except wind speed, which reuses the Light/Medium/Heavy/Storm classification `AGENTS.md` already defines.
Deciding these without a UI in front of anyone risks guessing wrong and re-litigating in every prototype
ticket regardless; the mockup-driven, human-in-the-loop tickets are better placed to make that call than
this one.

## Consequences

- `services/analysis/` is new code with three kinds of file in it — a matching primitive, the efficiency
  seam, and per-screen aggregation — and no route handlers.
- `types/index.ts` gains an `AnalysisFilter` type (a partial record of dimension to selected bucket ids,
  deliberately dimension-agnostic about what a bucket id actually is) and a matched-row type carrying
  `raceId`, resolved dimension values, Countable status, and the efficiency seam's output. Per-screen
  aggregate shapes are typed alongside their own aggregation function, not centralized, since nothing
  else names them (per `AGENTS.md`'s typing convention).
- The prototype tickets (LAY-146/147/148) can each assume the matched-row shape above exists and spend
  their session on the screen's own aggregation and rendering, not on re-deriving how filtering works.
- The still-open numerator ticket changes only the efficiency seam's body; nothing about matching,
  Countable-filtering, or the per-screen aggregation shape depends on which numerator wins.
- `CONTEXT.md` gains one term, **Analysis Filter**, and one relationship note tying it to **Countable**.

## Rejected alternatives

- **Filter at the Race grain.** Simpler, and wrong the moment a Race has two Sail Configurations or two
  Sea States across its duration — which the annotation mechanism was built to allow, not an edge case
  to shrug off.
- **An `app/api/analysis/*` route layer, with client-side fetch on filter change.** Considered because a
  filter UI feels like an interactive thing. Rejected because URL `searchParams` plus a Server Component
  re-render already gives a filter UI a working, linkable, back-button-safe interaction with nothing
  extra to build, and nothing here needs a client-side fetch until a prototype ticket finds a concrete
  reason searchParams navigation feels wrong on mobile.
- **Build a cache now, ahead of need.** ADR 0010 already anticipates a future materialized layer; this
  ADR declines to be that layer's justification. Thirteen Races and ~4,088 rows is not a performance
  problem, and a cache keyed on `updated_at` that nothing yet needs is a maintenance cost with no
  matching benefit.
- **Always show Unknown-annotated rows regardless of the selected buckets.** Satisfies "never silently
  omit" too, but at the cost of making a narrowed filter lie about what it narrowed to.
- **Settle the Polar/VMG Efficiency numerator here, since the query layer can't be fully concrete without
  it.** Would fold two tickets into one and reopen a question the map already deliberately carved out
  into its own session. A typed seam is concrete enough for every other decision in this ADR to stand
  without it.
