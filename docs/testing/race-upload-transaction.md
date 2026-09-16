# The Race Upload Transaction — Local Verification

Verification record and re-run guide for `create_race_from_upload`, in two parts: the
three-argument function of `20260915220000_create_race_from_upload.sql` (LAY-110), **run and
recorded below**, and the five-argument function — LAY-111's, with its sail half replaced by
`20260916121000_create_race_from_upload_with_sail_definitions.sql` (LAY-130, ADR 0023) — **run on
2026-09-16**, see [Section 9, run at last](#section-9-run-at-last--55-of-55-lay-130).

It has since outgrown its name. The same file now also verifies `public.amend_race`, because an
amendment is the upload flow minus its File step (ADR 0010 Amendment 1) and therefore the same two
window refusals over the same fixtures — see
[Section 12, the amendment](#section-12-the-amendment--128-of-128-lay-114).

LAY-110's ninth acceptance criterion is a claim no Jest test can reach: "on submit, the
Recording, its Transcription and the Race are written in one transaction, after the bytes have
moved; a failure leaves bytes and no row, never a row and no bytes". The bytes half is
`scripts/verify-boat-storage.mjs`. This is the row half, and it needs a live database: three
inserts either roll back together or they do not.

**Run on 2026-09-15 against the local stack** (Supabase CLI containers, PostgreSQL 17.6, DB on
`127.0.0.1:54322`): **31 of 31 checks passed**. That run was of sections 1–8, against the
three-argument function. Section 9 came later and is not part of it.

## Section 9, run at last — 55 of 55 (LAY-130)

**Run on 2026-09-16 against the local stack** (PostgreSQL 17.6, DB on `127.0.0.1:54322`):
**55 of 55 checks passed**, sections 1–9, and `scripts/verify-race-archive-schema.sql` alongside it
at **141 of 141**.

The section 9 that ran is not the one LAY-111 wrote. ADR 0023 replaced the sail half of it, so the
fourteen unrun checks were rewritten before they were ever run and the section now stands at
twenty-four. It establishes: a Sail Configuration naming a Definition number of the Race's own
Crossover Chart Version; the Version copied onto every entry from the Race, which no entry stated;
a note stored verbatim beside a Definition and absent where none was given; a note-only
Configuration accepted with a NULL `definition_number`; sail 4 refused against a Version defining
three and accepted against one that defines it; an entry that says nothing refused by
`sail_entry_says_something` *in those words*, with nothing of the upload surviving; two
Configurations at one instant refused; sails on a Race with no chart Version refused before the
Recording is written; an entry that tries to bring a Version of its own refused; and `'[]'`
accepted as *not recorded*. The Sea State half and the empty-array case are LAY-111's, unchanged.

**How it was run, since this environment still has no `psql`** and no permission to start the CLI's
containers: `npm i --no-save pg` and a throwaway Node script that opens one transaction, applies
the pending migrations, runs the suite's body up to its `-- Report` marker, prints the failures and
`ROLLBACK`s. That is the same transaction discipline `scripts/verify-race-upload-rpc.sh` provides
through `psql`, by another route, and the local database is shared with other checkouts — so
nothing may commit.

```bash
npx supabase start
npx supabase db reset
scripts/verify-race-upload-rpc.sh            # expect 55 of 55
```

## Section 12, the amendment — 128 of 128 (LAY-114)

**Run on 2026-09-16 against the local stack** (PostgreSQL 17.6, DB on `127.0.0.1:54322`):
**128 of 128 checks passed**, sections 1–12. The suite is no longer only about the upload: sections 10
and 11 (LAY-113) took it to 98 with the five Boat Setup pointers, and section 12 adds thirty checks
over `public.amend_race`, the one call LAY-114 amends a whole Race with.

It is here rather than in a suite of its own for the reason ADR 0010 Amendment 1 gives: an amendment
is the upload flow minus its File step, so it is the same window refusals, the same vocabulary and
the same table it has to leave alone. Sharing the file means both doors are watched by one set of
fixtures and any divergence shows up as a diff between adjacent sections.

Section 12 files a race, then amends the window, the title, the Crossover Chart pointer and both
lists of Testimony in **one call**, and asks:

- the window is the one sent, the title trimmed, the pointer moved from v1 to v2, and the other four
  Boat Setup answers still the ones the Race records;
- a sail entry left **outside** the new window is retained, at the time it was given — moving a
  window rewrites no annotation timestamp;
- both lists were replaced whole rather than added to;
- **not one recorded row changed, and the Recording still says what it said about the file** — the
  criterion the whole ticket turns on;
- each touch trigger reaches the Race on its own, so `updated_at` moves for an edit arriving through
  either annotation table;
- both window refusals come back through the function from `race_window_ordered` and the deferred
  `races_window_intersects_rows`, in the trigger's own words, with the Race left as it stood;
- a payload short of a window bound, sails against a Race recording no chart Version, a Definition
  the chosen Version does not name, and a signed-in non-admin are each refused, the last as
  `no such Race, or it is not writable by this account`;
- the Crossover Chart pointer can be cleared **back to not recorded**, with the Sail Configurations
  named in the old Version's words going with it and the Sea State, which no Version words, untouched;
- `anon` holds no `EXECUTE`, `authenticated` does, and the function is `SECURITY INVOKER` — the lock
  inside it *is* the authorization.

⚠️ **`NOW()` is transaction time.** Both `update_updated_at_column()` and `touch_race_updated_at()`
call it, and the whole suite is one `BEGIN … ROLLBACK`, so `updated_at` cannot be *watched to
advance* here and no `pg_sleep` will change that — two checks written that way failed on the first
run for exactly this reason. What the section asserts instead: `updated_at = transaction_timestamp()`
after the amendment, and `races.ctid` moving under direct DML on each annotation table. The `ctid`
comparison is also the only way to isolate the touch triggers at all, because `amend_race`'s own
step-4 UPDATE moves `updated_at` on every call.

## Re-running it

```bash
npx supabase start
npx supabase db reset                      # applies every migration in order
scripts/verify-race-upload-rpc.sh          # the local stack, through the container
scripts/verify-race-upload-rpc.sh "$DB_URL" # or a hosted project
```

Expect **128 of 128**.

The suite is `scripts/verify-race-upload-rpc.sql`: one transaction that ends in `ROLLBACK`, so
it is safe against a project holding real races. It exits non-zero if any check fails. Against
a hosted project use the **session** pooler or the direct connection string — the transaction
pooler will not do, because the suite is one transaction carrying `SET LOCAL ROLE` and
`SET CONSTRAINTS`.

Two mechanics are worth knowing before reading it, both inherited from
`scripts/verify-race-archive-schema.sql`:

- The suite never commits, so the deferred `races_window_intersects_rows` trigger would never
  fire and its refusal would look like a pass. `pg_temp.upload_as` calls
  `SET CONSTRAINTS ALL IMMEDIATE` after each accepted call to make it fire at the statement.
- The tiers are `SET LOCAL ROLE` plus a `request.jwt.claims` setting, which is what `auth.uid()`
  reads — and therefore also what the function writes into `recordings.uploaded_by` and
  `races.created_by`.

## Observed, section by section

| Section | What it establishes |
| --- | --- |
| 1. The door | `anon` holds no `EXECUTE`; a guest's call comes back `permission denied for function create_race_from_upload`, not a complaint from inside the body |
| 2. An admin's upload | Accepted; five rows in one statement; the title trimmed; `uploaded_by` and `created_by` are `auth.uid()`, never client values; the boat read from the singleton |
| 3. The NUMERIC round trip | Every channel reads back byte for byte — `0`, `0.0`, `20.10`, `-1` included; a blank channel is `NULL` and not zero; the window is stored in the recording's own naive frame, unconverted |
| 4. A viewer | Refused, and refused by `new row violates row-level security policy for table "recordings"` — the policy, not a check restated inside the function; nothing left behind |
| 5. The first window refusal | `race_window_ordered` refuses a finish at or before the start, zero-length included, **and the Transcription it had already inserted goes with it** — one transaction, not three |
| 6. The second window refusal | The deferred trigger refuses a window with no rows inside it (`the Race Window contains no Recording Rows`); a window reaching past the last row is accepted |
| 7. A truncated payload | A Transcription short of its own `row_count` is refused, and the refusal says how short |
| 8. One Recording, one Race | The same recording id cannot be uploaded twice, the first upload survives the failed retry, and a duplicate `content_sha256` is accepted — that is a confirmation in the wizard, not a refusal here |

Section 5 is the criterion itself: the `recordings` and `recording_rows` inserts had already
succeeded when the `races` insert was refused, and `0 rows survived`.

## Three things this run established

**A `REVOKE … FROM PUBLIC` is not enough to shut the door.** Postgres grants `EXECUTE` on a new
function to `PUBLIC`, *and* Supabase's default privileges for schema `public` grant it to `anon`
by name. With only `PUBLIC` revoked, `proacl` still read

```
{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

and a guest reached the function body, coming back with its internal
`no boat exists to file this race against` instead of a plain refusal. The migration therefore
names both:

```sql
REVOKE ALL ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
```

After which `anon` is `false` and `authenticated` `true` under `has_function_privilege`. This is
the same trap as the display-name helper in
[`profile-trigger-and-role-lock.md`](./profile-trigger-and-role-lock.md); it is worth expecting
on every new function.

**A shared plpgsql helper cannot test a door.** `EXECUTE` on a function is checked when a
statement is *planned*, and plpgsql caches a statement's plan for the session. Routing the
guest's call through `pg_temp.upload_as`, which had already planned that call for the admin,
let the guest straight past the privilege check and into the body — the check passed for the
wrong reason, and then failed for the right one only because the body's own message differed.
The suite makes the guest's call from a `DO` block instead, which is planned afresh every time
it runs.

**PostgreSQL 17.6 terminates the backend on a dynamic call to a function the caller may not
execute.** Found while fixing the above, because the first attempt at "plan it afresh" was an
`EXECUTE`. It reduces to a function with an empty body:

```sql
BEGIN;
CREATE FUNCTION public._probe(p INT) RETURNS INT LANGUAGE plpgsql AS $$
BEGIN RETURN p; END;
$$;
REVOKE ALL ON FUNCTION public._probe(INT) FROM PUBLIC, anon;

DO $$
DECLARE v_err TEXT; v_n INT;
BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        EXECUTE 'SELECT public._probe($1)' INTO v_n USING 1;   -- backend terminates here
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    RESET ROLE;
    RAISE NOTICE 'err=%', v_err;
END $$;
ROLLBACK;
```

Observed: `Connection terminated unexpectedly`, then `FATAL 57P03 the database system is in
recovery mode` on the next connection for a few seconds. Writing the same call plainly —
`v_n := public._probe(1);` — raises the catchable `permission denied for function _probe`, which
is what the suite does.

**`PERFORM` is on the crashing side of that line, which is not obvious** (LAY-130). It looks like
the plain call and behaves like the dynamic one: `PERFORM public._probe(1);` terminates the backend
exactly as `EXECUTE` does, while assigning the result survives. Only three shapes were tried and
only one lives, so the rule to work by is *assign the return value*, even where nothing reads it.
`scripts/verify-race-archive-schema.sql`'s "a guest cannot execute it at all" now depends on this:
it was written through `pg_temp.exec_as`, which is `EXECUTE`, so it could only ever kill the
database or pass for the wrong reason — and it passed for the wrong reason until LAY-130 revoked
`anon`'s grant on `mint_boat_setup_version` and rewrote the check as an assignment.

Nothing the application goes near: Layline never calls this function dynamically, `anon` never
calls it at all, and the crash did not cross a transaction boundary in the same session (a
denied call in its own transaction was refused cleanly). It is recorded because it will bite
anyone who writes a privilege check with `EXECUTE` in it, and because "the tests killed the
database" deserves an explanation that is not a guess.

## Not covered

- **The byte move.** That the object lands under `recordings/{recording_id}/{filename}` before
  the transaction opens, and that a failure leaves it orphaned rather than referenced, is
  Storage's half — `scripts/verify-boat-storage.mjs` and ADR 0013.
- **PostgREST.** The suite calls the function over a direct connection with `SET LOCAL ROLE`.
  That the Server Action's `.rpc()` reaches the same function as the same role is exercised by
  the upload flow itself, not here.
- **The hosted project.** Every observation above is the local stack. The `REVOKE` runs with the
  migration, so the ACL should match; `has_function_privilege` in section 1 is the check to
  re-run there.
