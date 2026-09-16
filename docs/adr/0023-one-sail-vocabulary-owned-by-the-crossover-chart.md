# ADR 0023: One Sail Vocabulary, Owned By The Crossover Chart Version

## Status

Accepted. Reverses part of ADR 0012 and the **Sail Inventory** half of LAY-111.

## Context

Layline held **three** answers to "what was up on the boat", and they were designed not to meet.

1. The **Sail Inventory** — a `sails` table seeded with six rows (`main`, `jib-1`, `jib-2`, `jib-3`,
   `A2`, `A3`), each an individual sail, keyed and retirable.
2. A **Sail Configuration** — a `race_sail_entries` row naming a *set* of those sails through
   `race_sail_entry_sails`, plus a separate `reef_state` of `full` or `reef-1`.
3. A **Sail Definition** — one numbered row of a Crossover Chart's own sail list, whose label names
   a whole combination as the file spells it: `4;Reef + Jib 2`, `6;Main + Reaching Spin`, `8;Main + A2`.

`CONTEXT.md` recorded the separation as deliberate: "a **Sail Definition** is a **Crossover
Chart**'s own numbering and the two never resolve into each other", and ADR 0012 argued the same
point from the domain — the numbers are the chart's identifiers, not Layline's idea of a sail.

That holds right up until the archive is asked the question it exists to answer. **Race data is to
be compared against the Crossover Chart**: was the boat flying what the chart recommended for the
wind it actually had. A comparison needs the two vocabularies to resolve into each other, and
nothing in the model could do it — `{main, A3}` with `reef = full` is not `6;Main + A3` by any rule
a database can check, only by a resemblance a person can see. Worse, the set-of-sails encoding can
express configurations no chart defines, so the comparison has no defined answer for them.

Two other facts pushed the same way. The Inventory was never actually *managed*: nothing in the app
writes `sails`, there is no admin screen, `retired_on` and `updated_at` were never used, and the
wizard's own copy pointed at a screen that does not exist ("Add them under Boat"). And reef was
recorded twice over — as a column, and inside the chart's labels, which already say `Reef + Jib 2`.

## Decision

**There is one sail vocabulary, and a Crossover Chart Version owns it.** The Sail Inventory is
deleted — not deprecated. What survives is the uploaded Sail Definitions, and a **Sail
Configuration** on a Race *is* one Definition of the Version that Race points at.

### The Definitions become rows, so the map is enforced and not promised

`crossover_sail_definitions (version_id, kind, number, label)`, keyed `(version_id, number)`, with
`FOREIGN KEY (version_id, kind) REFERENCES boat_setup_versions (id, kind)`. This is exactly the
`rig_tune_bands` move and it is made for exactly the same reason ADR 0011 gives: Postgres cannot
reference into JSONB, so an interior a Race must point at is promoted to rows. A number validated
only by Zod can be *checked* on one path; a number that is a foreign key cannot be wrong on any.

Unlike a Rig Tune, the Version's payload is **not** emptied. `sail_definitions` stays in it as the
file's own testimony, hashed with the rest, and the rows are a projection written from the same
parse inside `mint_boat_setup_version`'s transaction. Storing as recorded and deriving alongside is
the house rule; one transaction is what keeps the derivation from drifting.

### A Sail Configuration names a Definition of the Race's own Version

`race_sail_entries` carries `crossover_chart_version_id NOT NULL`, a nullable `definition_number`,
and a nullable `note`, pinned by two ordinary foreign keys and no triggers:

```sql
FOREIGN KEY (race_id, crossover_chart_version_id) REFERENCES races (id, crossover_chart_version_id)
FOREIGN KEY (crossover_chart_version_id, definition_number)
    REFERENCES crossover_sail_definitions (version_id, number)
```

The first needs only a `UNIQUE (id, crossover_chart_version_id)` index on `races`, which is free
when `id` is already the key, and it is what makes "the Definition belongs to the chart *this* Race
was sailed against" a property of the schema. The second is MATCH SIMPLE, so a null
`definition_number` satisfies it without a special case — the same mechanism the four Version
pointers on `races` already rely on. `race_sail_entry_sails`, the deferred
`race_sail_entries_non_empty` trigger and the `reef_state` enum all go; `UNIQUE (race_id, at)`
stays and now means one Configuration per moment, which is what a Definition is.

### An entry with no Definition is testimony, not a gap

Something unusual happens: a jib nobody charted, a sail change mid-leg, a shredded kite. Such a
moment records `definition_number = NULL` with a **required** `note`, under
`CHECK (definition_number IS NOT NULL OR note IS NOT NULL)`. The null is also what excludes it from
comparison against the chart, by construction rather than by a flag somebody remembers to filter
on. The note is required because that sentence is the only record of what was up.

### No Configuration without a Version

The entry's `NOT NULL` Version and its foreign key to `races` mean a Race with no Crossover Chart
pointer can hold no Sail Configurations at all. The picker is closed in that state and says why.
The alternative — recording sails against no vocabulary — is how the three-way ambiguity above got
in, and it would leave rows that no comparison can ever read.

### Reef is whatever the Definition says

`race_sail_entries.reef` and the `reef_state` enum are dropped. The boat's own file defines
`Reef + Jib 2` and `Reef + Jib 3`, so reef was already stated where the comparison reads it; a
second, independent field could only ever agree redundantly or disagree unresolvably. The cost is
honest: a reefed configuration the chart does not define is recordable only as a note.

### Sail identity does not span Versions

Number 6 in v1 and number 6 in v2 need not mean the same thing, and nothing is added to make them.
Comparison against the chart always happens inside one Version, which is the question worth
asking; season-level curiosity ("how often did we fly the kite") groups by label text. A stable
Layline slug per Definition was rejected as the Inventory returning through a side door — a
hand-maintained vocabulary with the same drift the `sails` table is being deleted to escape.

### "Frozen" continues to mean what ADR 0012 said it means

The Race's Crossover Chart pointer defaults to the Version current **at the recording's start
time** and stays changeable, per ADR 0012 and LAY-113. Null means *not recorded* and is never
backdated. Changing the pointer clears the Sail Configurations that no longer resolve — the same
rule LAY-113 already states for a Wind Band when the Rig Tune pointer moves, and here the foreign
key makes it unavoidable rather than remembered: with `ON UPDATE RESTRICT`, the entries must go
before the pointer can move, in one transaction, after the sailor is told how many.

## Consequences

- **ADR 0012 is amended**: "the numbers are the chart's own identifiers, not Layline's idea of a
  sail" survives, but the corollary that the two vocabularies never resolve into each other does
  not. There is now exactly one vocabulary, so there is nothing left to resolve *across*. The
  Crossover Chart's absorption of its Definitions (ADR 0012's central move) is what makes this
  safe: a Configuration and the cell it is compared against come from the same minted Version.
- **ADR 0011's "one payload interior promoted to rows" becomes two**, for the same stated reason.
- `CONTEXT.md` loses the **Sail** and **Sail Inventory** entries, rewrites **Sail Configuration**
  and **Sail Definition**, replaces the relationship bullet asserting the two never resolve, and
  records the collapse in the resolved-confusions log.
- **The migration is destructive and deliberately so.** Every existing `race_sail_entries` row is
  deleted: a set of individual sails cannot be translated into a Definition without inventing the
  translation, and there are roughly a dozen such races whose sails the owner can re-enter by hand.
  `crossover_sail_definitions` is backfilled from any existing crossover payloads. No Race's chart
  pointer is backdated.
- `create_race_from_upload_with_annotations` changes signature: `p_sails` becomes
  `[{at, definition_number, note}]` and the Race carries a chart Version. Its inner loop collapses
  to one INSERT, since a Configuration is no longer a set needing its parent's id.
- Deleted from the codebase: `services/boat/readSails.ts`, `services/boat/sails.ts` and
  `sailsAvailableOn` with its tests, and the `Sail`, `SailChoice` and `RaceSailEntrySail` types.
  A Definition is retired by being absent from the next Version, so `retired_on` has no successor.
- The upload wizard's "Sails up" and "Mainsail" chip rows become one row of Definition chips read
  from the chosen Version — including Definitions no cell recommends, which are real
  configurations the chart simply never suggests — plus one "Something else" chip that asks for a
  note.
- **LAY-111 is partly reversed.** Its Sea State half, its annotation timeline and its read-time
  resolution (the latest entry at or before a row, falling back to the earliest) are untouched; its
  sail half is replaced.
- The comparison this exists for becomes expressible: for any recorded row, the Race's frozen chart
  and its wind give a recommended Definition, and the Configuration in force at that moment names
  one from the same list. A disagreement is a finding to state, never an error to refuse.
