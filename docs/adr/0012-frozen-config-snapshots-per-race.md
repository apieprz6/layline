# ADR 0012: Frozen Config Snapshots Per Race

## Status

Accepted

## Context

A Race is measured against the Boat Setup that was current when it was sailed. Re-measuring the
Polar in July must not change what a June race reports — otherwise every stored result silently
rewrites itself whenever anything about the boat is re-entered, and the archive stops being an
archive.

There are two ways to get that. **Copy** the config into the Race at upload, so the Race carries
its own snapshot of the grid and the shroud figures. Or **point** at the immutable Version that
was current, and dereference on read.

Two things then complicated the pointing approach, and both were found by reading the model rather
than by hitting them at runtime.

**A Crossover Chart and its Sail Definitions were separate artifacts, independently versioned.**
`CONTEXT.md` asserts that every chart cell must resolve to a Sail Definition. But if a Race
freezes two independent pointers, it can point at Chart v1 and Sail Definitions v2 — a pairing
that never existed on the boat, in which a cell may resolve to a different sail than it did when
the chart was authored, or to nothing at all.

**The recorded Wind Band had nowhere to point.** ADR 0007 requires a Race to record which band the
boat was set up for. With a Rig Tune's bands living inside a JSONB payload, that reference could
only be a positional index or a magic key, both of which ADR 0007 forbids by name.

## Decision

**Point, don't copy** — and fix the model so pointing is sound.

A Race holds **four** nullable Version pointers, one per Boat Setup artifact, plus one Wind Band
pointer. Copying was rejected because a snapshot per Race duplicates a 144-cell grid thirteen times
over for thirteen races that all point at the same v1, and because two representations of one
Polar are two things that can disagree. A Version is already immutable, so a pointer is a snapshot;
the copy adds nothing but drift.

### The Crossover Chart absorbs its Sail Definitions

They collapse into one artifact. The chart's cells and the numbered list they resolve against are
now one payload, minted together, so the cross-version pairing is not merely discouraged — it is
unrepresentable.

This is the right seam on domain grounds too, not just referential ones. The numbers in a
Crossover Chart are the *chart's own identifiers*, not Layline's idea of a sail; a Sail Definition
has no meaning outside the chart that refers to it. Separating them modelled a relationship that
does not exist.

**Boat Setup therefore has four artifacts, not five**: a Polar, a Crossover Chart, a Rig Tune and
an Instrument Calibration.

### The Wind Band becomes a row

`rig_tune_bands` is a table, so `races.rig_tune_band_id` is a real foreign key. A composite
foreign key on `(rig_tune_version_id, rig_tune_band_id)` guarantees the recorded band belongs to
the frozen Rig Tune Version, which is the invariant that mattered and the one a positional index
could never have expressed. ADR 0011 covers why this is the one payload interior promoted to rows.

### Every pointer is nullable, and every pointer is writable

Null means *not recorded*. It is never a backdated guess, and it is not an edge case: **all
thirteen seeded races carry a null Rig Tune pointer**, because v1 of the Rig Tune is the boat's own
unmeasured tune and no Version existed when those races were sailed. The Instrument Calibration
pointer is null wherever memory failed.

"Frozen" means the pointer does not follow the current Version. It does not mean a person cannot
change it — filling one in later, when somebody remembers, is an Amendment under ADR 0010, and it
is the amendment most likely to happen while seeding the archive.

### One Recording, one Race

`races.recording_id` is `NOT NULL UNIQUE`, and the Race is the **child** of the Recording. That
single constraint makes ADR 0010's split structural rather than documented: the immutable half of a
race lives in a different table from the editable half, and no query can accidentally treat one as
the other.

One export *file* may still back several Races — a regatta day is uploaded once per race — because
each upload is its own Recording with its own Transcription. There is deliberately no overlap
check between two such windows.

The direction has one non-obvious consequence. ADR 0010 says deleting a Race takes its
Annotations, its Transcription and its stored bytes, but a cascade from `races` cannot reach the
Recording that owns it. So the delete is expressed against the Recording:

```sql
DELETE FROM recordings WHERE id = $1;
```

which cascades to the Race, its annotations and its rows in one statement. That is safe precisely
because `recording_id` is unique — there is no second Race to orphan.

## Consequences

- `CONTEXT.md`'s **Boat Setup** and **Sail Definition** definitions change, and the relationship
  line asserting a chart cell resolves to a Sail Definition becomes an intra-payload rule enforced
  by Zod rather than a cross-artifact claim.
- **ADR 0005 is amended**: Instrument Calibration is the *fourth* member of Boat Setup, not the
  fifth.
- The race upload wizard and the race detail page each offer **four** Version pickers, not five,
  and each must render "not recorded" as a legitimate answer rather than defaulting to the current
  Version.
- A Wind Band picker on a Race is only meaningful once a Rig Tune Version is chosen, and the
  database enforces that ordering (`rig_tune_band_id IS NULL OR rig_tune_version_id IS NOT NULL`).
- Boat Setup can be re-entered freely without touching a single stored race result, which is the
  whole point. The cost is that every read of a race joins four Versions; with thirteen races and
  one boat that is not a performance question.
- Deleting an admin account is blocked while any Version or Race they authored stands
  (`created_by ... ON DELETE RESTRICT`). Deciding what should happen instead is a real decision,
  and it fails loudly rather than nulling out authorship.
