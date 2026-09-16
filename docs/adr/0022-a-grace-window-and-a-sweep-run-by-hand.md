# ADR 0022: A Grace Window, and a Sweep Run by Hand

## Status

Accepted

## Context

ADR 0013 chose orphaned bytes over orphaned rows and made a sweeper load-bearing: three jobs —
abandoned `tmp/` uploads, `recordings/` prefixes left by a commit that failed after the bytes moved,
and objects left by a delete that failed after the row went — found by listing Storage and
anti-joining against `recordings`.

Building it (LAY-112) turned up something that anti-join alone does not survive. The upload moves the
bytes **before** it commits, so between those two operations there is legitimately a
`recordings/{id}/` prefix with no row. A sweep that ran in that gap would delete the bytes of a race
whose transaction was about to succeed — producing exactly the row-with-no-bytes state the whole
ordering exists to prevent. The sweeper would be the only thing in Layline capable of manufacturing
it.

Then a second thing, found by review and settled against the local stack: submit does not upload the
file twice, it **moves** it out of `tmp/`, and a move keeps the `objects` row it already had. Same id,
same `created_at`, `updated_at` bumped to the move. Measured locally: staged at `23:16:39.166`, moved
at `23:16:41.728`, `created_at` still `23:16:39.166` afterwards. So an object's `created_at` under
`recordings/` is the moment the sailor *staged* the file — before dinner, possibly — and a window
measured from it expires while the wizard is still open.

The third question was when it runs. The obvious answer for a collector is a schedule.

## Decision

**An object younger than a grace window is never removed, whatever the anti-join says**, and **its age
is the time since the bytes arrived at that path** — `updated_at`, not `created_at`. Two windows,
because the two prefixes are waiting for different things:

- `recordings/` — **15 minutes.** The gap it covers is one RPC wide. Fifteen minutes is absurd
  headroom for that, and it is chosen that way because the errors are not symmetrical: being early
  breaks a race, being late costs bucket space until the next run.
- `tmp/` — **24 hours.** A wizard opened before dinner and finished after it is not abandoned.
  Nothing depends on `tmp/` being tidy, so this is generous on purpose.

An object Storage will not date is kept, for the same reason: with no age there is no way to apply
the window, and "it might be seconds old" is the case that matters.

**And the bucket is listed before `recordings` is read.** One of the two reads is always the stale one,
and this is the choice of which. A commit landing between them is then a row the sweep knows about and
bytes it decides to keep; read the other way round, that same commit is a row the sweep never heard of
whose bytes are already sitting in its listing.

**The sweep runs on demand, as `POST /api/storage/sweep`, admin only, and reports what it removed.**
Not a cron job. And it refuses to sweep at all when it cannot read `recordings` or cannot list a
prefix: a bucket with no table to compare against is a bucket in which every object looks orphaned.

## Consequences

- The sweeper cannot break a race, which is what makes it safe to run at any moment — including
  while an upload is in flight, which the ticket required and a test asserts by name. Three things hold
  that, not one: the anti-join, the read order, and a window measured from the stamp a move bumps.
- Layline now depends on storage-api preserving `created_at` across a move and bumping `updated_at`.
  If a future version stamped a moved object afresh, the sweeper would get *safer*, not less safe —
  the object would look younger — so the dependency only bites the other way, and taking the later of
  the two stamps means neither reading breaks it.
- An orphan lives at least 15 minutes. Nothing observes it: it is invisible to every screen, so the
  only cost of the delay is a few kilobytes of bucket.
- A sweep is a thing the owner does, not a thing that happens. The person who deletes a race is the
  person who can run this, and they can run it while looking at the answer — which is why the delete
  screen says the bytes were left rather than silently trusting a schedule. On the free tier there is
  also no scheduler to pay for or to notice has stopped firing.
- Running it means an authenticated POST rather than a click, and that is a real cost: one admin, one
  command, documented in `docs/testing/race-delete-cascade.md`. A screen for it is a later ticket if
  the bucket ever gets untidy enough to want one.
- "Removed nothing" and "could not tell what to remove" are different answers and are never
  conflated. The failure is a 500 with a reason, never an empty report.
- `boat-setup/` is not walked at all. Those objects belong to Boat Setup Versions, which are never
  deleted and whose rows the sweeper knows nothing about, so there is no orphan there to find and no
  reason to hold the knife near them.
