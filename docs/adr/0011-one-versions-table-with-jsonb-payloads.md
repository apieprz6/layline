# ADR 0011: One Versions Table With JSONB Payloads

## Status

Accepted

## Context

Boat Setup has four artifacts — a Polar, a Crossover Chart, a Rig Tune and an Instrument
Calibration — and each is versioned independently, because a Race is measured against the
Versions that were current when it was sailed.

The four have almost nothing in common as *content*. A Polar is a 16×9 grid of boat speeds. A
Crossover Chart is a 26×13 grid of sail numbers plus the numbered list those cells resolve
against. A Rig Tune is a handful of wind bands, each holding twelve shroud figures. An Instrument
Calibration is four channels, two of which carry a multiplier and two of which do not.

They have everything in common as *machinery*. Every one of them needs a version number unique
within its artifact, an `effective_from` date the sailor supplies, a `recorded_at` timestamp for
when it was typed into Layline, an author, an optional note, and — for the two that come from a
file — a filename and a content hash. Every one of them needs a "current" pointer, immutability
after minting, and a Race able to freeze a reference to it.

So the question is where the seam goes. Options:

- **Four tables**, each with its own columns and its own copy of the machinery.
- **A shared `boat_setup_versions` table plus four payload tables**, so the machinery is shared
  and the content is relational.
- **A shared `boat_setup_versions` table with the payload as JSONB**.

## Decision

One `boat_setup_versions` table holding all the machinery, with the payload as a JSONB column.

The machinery carries every invariant worth enforcing, and duplicating it four times means four
places for `version_number` uniqueness or the forward-only current pointer to be got subtly
wrong. The payloads, by contrast, share no columns, and — decisively — **no payload is ever
queried cell-wise**. A Polar lookup loads the whole grid and interpolates in TypeScript; nothing
will ever ask Postgres for the boat speed at 90° and 12 knots. A relational grid would be 144
rows to serve a read that always wants all 144. ADR 0001 already set this repo's precedent for
JSONB over premature normalisation, and structure is validated by Zod on write, as it is there.

### The kind tag and the composite foreign key

Sharing one table costs something real: the rules that differ per kind — a Rig Tune's note is
required, only a Polar and a Crossover Chart have a filename, only an Instrument Calibration may
be corrected in place — are all conditioned on `kind`, and `kind` naturally belongs on the parent
`boat_setup_artifacts` row, where a `CHECK` cannot reach it.

Rather than demote those rules to application code, `kind` is denormalised onto the child and kept
truthful by a composite foreign key:

```sql
-- on the parent
UNIQUE (id, kind)

-- on the child
kind boat_setup_kind NOT NULL,
FOREIGN KEY (artifact_id, kind) REFERENCES boat_setup_artifacts (id, kind)
```

The copy cannot disagree with the original, and every kind-dependent rule becomes a declarative
`CHECK`. The same pattern is used twice more, for the same reason: `rig_tune_bands` proves it
belongs to a `rig_tune` Version, and `races` proves each of its four pointers references a Version
of the right kind — with a constant tag column per pointer, relying on `MATCH SIMPLE` so a NULL
pointer still satisfies the constraint.

### One narrow exception: `rig_tune_bands`

Wind Bands are rows, not JSONB, and this is a deliberate departure rather than an inconsistency.
A Race records which Wind Band the boat was set up for, so something outside the payload points
*into* it. Under JSONB that pointer could only be a positional index or a magic key, both of
which ADR 0007 explicitly forbids — the bands belong to the Version, not to the application, and
naming them `light` / `medium` / `heavy` is the collision `CONTEXT.md` documents at length.

Promoting the band to a row buys three things a document could not: `races.rig_tune_band_id` is a
real foreign key, the Base Tune gets a genuine guarantee
(`CREATE UNIQUE INDEX ... ON rig_tune_bands (version_id) WHERE is_base`), and the open-ended top
band is expressed as `high_kt IS NULL` with its own partial unique index. The twelve shroud
figures stay as JSONB *on the band row*, because nothing points at them either.

The test this exception draws, and the one to apply next time: **a payload's interior becomes rows
when something outside it needs to point at one.** Otherwise it stays JSONB.

## Consequences

- Adding a fifth artifact kind is an `ALTER TYPE ... ADD VALUE`, a branch in the payload `CHECK`,
  and a Zod schema. No new table.
- Zod schemas in `services/` are the only description of payload structure. The `CHECK`
  constraints test key *presence* per kind and nothing more, so a malformed payload cannot exist
  as a row while SQL is not pretending to validate a 144-cell grid.
- `created_by` is `NOT NULL` on every kind, which **amends ADR 0005**: it ruled a Calibration
  Event needed no author field on the grounds of one boat and one writer. That is true today and
  would be a schema change the day a second admin exists.
- `recorded_at` is immutable even through an Instrument Calibration correction, so it keeps
  meaning *when this Version was first entered*. There is no history to disambiguate it against.
- There is no `DELETE` policy on `boat_setup_versions`. A mis-minted Version is superseded, never
  removed, which is what `CONTEXT.md` already says happens to a wrong Rig Tune.
- The forward-only current pointer is a *deferred constraint trigger*, not a `CHECK`, so an
  artifact and its first Version can be inserted in one transaction despite the circular
  reference. The foreign key is `DEFERRABLE INITIALLY DEFERRED` for the same reason.
