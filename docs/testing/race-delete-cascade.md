# Deleting a Race — Local Verification

Verification record and re-run guide for the race delete (LAY-112).

LAY-112 makes two claims Jest cannot reach. The third acceptance criterion: "the transaction is
expressed as a delete of the Recording and takes the Race, both annotation tables, the sail join rows
and every Recording Row in one statement". The eighth: a signed-in non-admin "is refused by RLS if
they try". A mocked Supabase client can show that the Server Action sends
`DELETE FROM recordings WHERE id = $1` and nothing else; whether that one statement empties the tables
below it, and whether a viewer's identical statement empties none, are questions for a live database.

**The criterion is quoted as written, and one clause of it has since stopped being true.** LAY-130
collapsed the Sail Inventory into the Crossover Chart (ADR 0023), so there are no sail join rows to
take: a Sail Configuration names a Sail Definition on the entry itself. The tree under `recordings` is
one level shallower — four tables rather than five — and what a delete must **not** touch changed with
it, from the inventory to the chart's vocabulary.

The other half of the delete — commit first, remove the object second, and a failure at the second
step leaves bytes and no row — is `app/(app)/boat-performance/races/[raceId]/__tests__/actions.test.ts`,
where the ordering is observable and the storage failure can be simulated. The Storage policies it
relies on (an admin may delete an object, a non-admin may not, and the object survives the denied
delete) are `scripts/verify-boat-storage.mjs`, checks 14–17. Nothing about Storage is checked here.

A third claim is about Storage rather than the database, and it is the sweeper's: that an object's
`created_at` survives a `move`. It has its own script and its own run, at the end of this file.

**Run on 2026-09-15 against the local stack** (PostgreSQL 17.6, DB on `127.0.0.1:54322`): **22 of 22
checks passed**. **Re-run on 2026-09-16** with LAY-130's two migrations applied ahead of it, after the
suite was rewritten for the one sail vocabulary: **22 of 22 again**.

## Re-running it

```bash
npx supabase start
npx supabase db reset                        # applies every migration in order
scripts/verify-race-delete-cascade.sh        # the local stack, through the container
scripts/verify-race-delete-cascade.sh "$DB_URL"  # or a hosted project
```

The suite is `scripts/verify-race-delete-cascade.sql`: one transaction that ends in `ROLLBACK`, so it
is safe against a project holding real races — every race it deletes is one it created in the same
transaction. It exits non-zero if any check fails. Against a hosted project use the **session** pooler
or the direct connection string; the transaction pooler will not do, because the suite is one
transaction carrying `SET LOCAL ROLE` and `SET CONSTRAINTS`.

It is the companion to `scripts/verify-race-upload-rpc.sql` and shares its two mechanics: the tiers are
`SET LOCAL ROLE` plus a `request.jwt.claims` setting, which is what `public.is_admin()` decides from,
and deferred constraints are made to fire with `SET CONSTRAINTS ALL IMMEDIATE` because the suite never
commits.

The fixture goes in through `public.create_race_from_upload` rather than hand-written `INSERT`s, for
the same reason the delete goes out as one statement: a race assembled by a different route than the
real one can be whole in ways a real race never is, and the cascade would then be checked against a
shape that does not occur. It calls the five-argument form, so the Sail Configurations and the Sea
State entry are arguments to the same call the Recording is.

Two things about re-running it since LAY-130: the suite needs
`20260916120000_one_sail_vocabulary.sql` and `20260916121000_…` applied, and the fixture needs a
Crossover Chart Version to name its sails in, which it inserts directly rather than minting — that
function has its own suite.

## Observed, section by section

| Section | What it establishes |
| --- | --- |
| 1. The cascade is in the schema | All four foreign keys read `confdeltype = 'c'`: `recording_rows.recording_id`, `races.recording_id`, `race_sail_entries.race_id` (composite since ADR 0023, matched on its first column), `race_sea_state_entries.race_id`. And `race_sail_entries → crossover_sail_definitions` is `'r'` — the cascade goes down, never sideways into the chart's vocabulary |
| 2. An admin's one statement | The fixture is a whole race (`recordings=1 rows=3 races=1 sail_entries=2 sea_state=1`); one `DELETE FROM recordings` reports `1 row` and leaves `0` everywhere; the race is off the archive list |
| 3. What it must not touch | Both Sail Definitions still there, the Crossover Chart Version they belong to still there, the boat still there, both `auth.users` still there — `ON DELETE RESTRICT` in the directions that matter |
| 4. A viewer | `0 rows` and **no error**; the whole race still standing afterwards; a viewer's direct `DELETE FROM races` is equally silent and equally ineffective |
| 5. A guest | `anon` deletes nothing and the race is untouched |
| 6. Deleting the Race is not deleting the race | An admin's `DELETE FROM races` leaves `recordings=1 rows=3` behind — a Transcription nothing points at; and deleting one annotation takes itself and nothing else |
| 7. The sweeper's side | After the delete, the id is absent from the set `services/storage/runSweep.ts` anti-joins against, read through RLS as a signed-in caller |

## Three things this run established

**A filtered `DELETE` is silent.** A `DELETE` policy is a `USING` filter, not a check: a viewer's
delete of a race they can plainly see comes back `0 rows` with no error at all — section 4, `err IS
NULL`. That is why the Server Action asks the statement what it deleted (`.select('id')` on the
delete) and treats an empty answer as the refusal. Without that, a refused delete and a successful one
are the same value, and the screen would tell a viewer their race was gone while it sat there.

**Deleting the `races` row is a quiet way to do the wrong thing.** Section 6: it takes the annotations
and leaves the Transcription — three rows here, 6,337 for a real weeknight race — pointed at by
nothing and visible on no screen. That is the shape ADR 0010's split makes possible, and it is the
reason the delete is expressed as a delete of the **Recording**: the Recording is the root of the
tree, so naming it is the only way to take the whole thing. It is also what keeps the annotation flow
safe, which LAY-112 required: cascades only run downhill, so editing sail entries can never reach a
Transcription.

**The fixture needed the constraints deferred and then un-deferred, twice — and no longer does.** A
Sail Configuration used to be refused for naming no sails, which could only become true once the
`race_sail_entry_sails` rows were in, one statement after the entry. So the original
`pg_temp.make_race` fired `SET CONSTRAINTS ALL IMMEDIATE` for the window trigger, went back to
`DEFERRED` for the annotations, and fired it again once the join rows existed. Since ADR 0023 the sail
is a column on the entry, `sail_entry_says_something` is an ordinary `CHECK`, and the whole race —
annotations included — goes in as one call with one `IMMEDIATE` after it. The dance was a cost of the
join table, not of the fixture.

## Running the sweeper

The sweep is on demand and admin-only (ADR 0022), so there is no button and no schedule — it is a
`POST` carrying the admin's session cookie:

```bash
curl -X POST http://localhost:3000/api/storage/sweep \
     -H "Cookie: $(printf '%s' "$SUPABASE_AUTH_COOKIE")"
```

### What a `move` does to the clock

The sweeper's `recordings/` grace window rests on knowing how old an object is, and that turned out to
be a question about storage-api rather than about Layline. Submit does not upload the file a second
time, it **moves** it out of `tmp/` — and a move keeps the `objects` row the object already had.

**Run on 2026-09-15 against the local stack** (`scripts/verify-storage-move-timestamps.sh`): **4 of 4
checks passed**.

```
PASS  1. an object can be staged under tmp/
PASS  2. Storage dates it  — 2026-09-15T23:23:53.794Z
PASS  3. it moves to recordings/  — {"message":"Successfully moved"}
PASS  4. the move keeps created_at and bumps updated_at
        — created_at 2026-09-15T23:23:53.794Z updated_at 2026-09-15T23:23:55.823Z
```

Same row, same `id`, `created_at` untouched at the moment of the *upload into `tmp/`*, `updated_at`
bumped to the move. So `created_at` under `recordings/` is the age of the **staging**, not of the
bytes at that path: a wizard opened at 18:00 and submitted at 18:20 lands an object that is already
twenty minutes old by `created_at` — past the fifteen-minute window — one instant before its row
exists. The sweeper therefore ages an object by the later of the two stamps (`services/storage/sweep.ts`,
`ageSeconds`), which is `updated_at` for anything that got there by a move.

In this container the script's own fallback is what makes it runnable: `npx supabase status` needs
docker, docker needs sudo, so the wrapper falls back to `127.0.0.1:54321` and mints a service-role
token from the default local JWT secret. Against a hosted project, pass `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` and it uses those instead.

### The report

It answers with the report: `removed` (each path, why it went, and how old it was), `kept` (each path
it looked at and left, with the reason — `recording-exists`, `too-recent`, `undatable`,
`unrecognised`), `failed` (asked for and still there), and the two grace windows it applied. A viewer
gets `403` and a Guest `401`, and a sweep that cannot read `recordings` or cannot list a prefix answers
`500` with the reason rather than reporting a clean bucket it never read.
