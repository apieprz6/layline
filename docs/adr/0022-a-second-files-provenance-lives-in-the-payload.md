# ADR 0022: A Second File's Provenance Lives In The Payload

## Status

Accepted

## Context

A Crossover Chart arrives as two files and becomes one Version: the grid (`.sailselect`, 26 wind
angles × 13 wind speeds of sail numbers) and the sail definitions that say what those numbers are.
They are deliberately not versioned apart — two halves with separate histories would let a Race
freeze a pairing that never existed on the boat (ADR 0012) — so one row in `boat_setup_versions`
holds both, with `twa_axis`, `tws_axis`, `cells` and `sail_definitions` in one JSONB payload.

`boat_setup_versions` is one table for all four artifact kinds (ADR 0011). It carries two columns
for file-backed kinds: `filename` and `content_sha256`, both nullable and both required by a CHECK
exactly when the kind is `polar` or `crossover_chart`. There is one of each, because when they were
added there was one file per Version.

Now there are two, and the second one's name and hash have nowhere to go. Layline stores the bytes
of every file it was given and can hand them back, so those bytes need a name and a hash the same
way the first file's do: a Download that cannot name what it is downloading, or prove the bytes are
the bytes that were parsed, is not the same feature.

The options were a second pair of columns (`definitions_filename`,
`definitions_content_sha256`), a side table of files keyed by version id, or the payload.

## Decision

**The second file's provenance goes in the payload, under `source.definitions`** — its `format`, its
`filename` and its `content_sha256`, beside the definitions those bytes were read into. The grid
file keeps the Version's own `filename` and `content_sha256` columns, unchanged and CHECK-enforced
as before.

Columns on the shared table are for machinery every kind shares. A second file is not that: one
artifact in four has two, and the other three have zero or one. Two more nullable columns would be
null on every Polar row, null on every Rig Tune row, null on every Instrument Calibration row, and
would need a CHECK branch saying so — schema that exists to be empty. A side table is the same
argument with more joins, and it reintroduces the thing ADR 0011 removed.

The payload, by contrast, is already the place where what makes a kind *itself* lives. A Crossover
Chart's second file is exactly that: it is not a Version with an attachment, it is one artifact that
came in two pieces, and the definitions half's provenance sits next to the definitions it produced.
Zod owns that shape, so it is enforced where the payload is enforced — on write, in one place —
rather than by a CHECK constraint that can only see columns.

## Consequences

- **Two files, one Storage prefix.** Both land under `boat-setup/crossover_chart/{version_id}/`,
  named by the sailor's own filenames. The upload therefore refuses two files with the same name:
  one prefix and one name means the second upload silently overwrites the first, and the bytes
  handed back later have to be the bytes that were given.
- **The download route needs a selector.** `/api/boat-setup/crossover-chart/{id}/download` serves
  the grid; `?file=definitions` serves the other half, reading its filename out of the payload. The
  Polar's route is unchanged and takes no selector, because it has nothing to select.
- **A Version summary can only name the grid file.** A list row deliberately carries no payload, so
  the definitions filename is not available to it. Both files are named on the Version's own screen,
  which reads the payload.
- **The confirm carries a hash per half.** A swapped definitions file changes what every cell in the
  chart means without changing a byte of the grid, so one checksum would not notice.
- **A payload with no `source.definitions` must still render.** `source` is optional on the payload
  type for the Polar's sake, so the Version screen says plainly that a Version records no separate
  definitions file rather than offering a Download that would 404.
- **A fifth kind with two files would follow this, not a column.** If one ever arrives, its second
  file's provenance goes in its own payload — which is the same answer ADR 0011 gives to every other
  question about a kind's own shape.
