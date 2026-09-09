# ADR 0013: Orphaned Bytes Over Orphaned Rows

## Status

Accepted

## Context

A recording upload spans two systems that share no transaction: Supabase Storage holds the bytes,
Postgres holds the Recording, its Transcription and its Race. The wizard writes nothing to the
database until submit, and the bytes land under a temporary prefix (`tmp/{user_id}/{upload_id}/`)
first, so an abandoned wizard leaves a cleanable object and never a half-built race.

At submit, two operations have to happen and either can fail: move the object to
`recordings/{recording_id}/{filename}`, and commit the transaction. Whichever runs second can fail
after the first has succeeded, so one of two inconsistent states is unavoidable. The choice is
which one.

Deleting a race has the mirror-image version of the same problem: remove the row, or remove the
object, first.

## Decision

**Always leave orphaned bytes rather than an orphaned row.** Concretely: on upload, generate the
`recording_id` client-side, **move the bytes first and commit second**. On delete, **commit the
transaction first and delete the object second.**

The two failure modes are not symmetrical, which is the whole argument. Bytes with no row are
invisible, harmless, and cost a few hundred kilobytes on a free tier. A row with no bytes is a race
that appears in the list, opens, renders its annotations, and then fails whenever anything asks for
its source file — a broken record that looks intact.

Generating the id client-side is what makes the upload ordering possible: the permanent path
contains the `recording_id`, so the id must exist before the move, which means it cannot be a
`DEFAULT gen_random_uuid()` assigned by the `INSERT`. `recordings.id` therefore has no default, so
the requirement is structural rather than a convention someone can forget.

## Consequences

- **A sweeper is load-bearing, not a nicety.** It has three jobs: abandoned `tmp/` uploads,
  orphaned `recordings/` prefixes from a failed commit, and objects left behind by a failed delete.
  It is the only thing that makes this decision tidy rather than merely safe, and it is a real
  build item.
- `recordings.id` has no `DEFAULT`. Any hand-written `INSERT` must supply it.
- Storage paths are derived from the id and the stored `filename`, never stored — so an orphaned
  prefix is found by listing Storage and anti-joining against `recordings`, with no third source of
  truth to reconcile.
- A failed delete leaves bytes for a race that no longer exists. Nothing links to them, so the only
  visible effect is bucket size until the sweeper runs.
