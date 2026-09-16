# Supabase Migrations

## Testing Migrations Locally

1. **Start Supabase**:
   ```bash
   supabase start
   ```

2. **Apply all migrations**:
   ```bash
   supabase db reset
   ```

3. **Verify specific tables**:
   ```bash
   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d profiles"
   ```

4. **Stop Supabase**:
   ```bash
   supabase stop
   ```

## Migration: 20260501215158_create_profiles_table.sql

**Purpose**: User preferences database schema for per-user data source configuration.

**What it creates**:
- `profiles` table with JSONB preferences column
- Auto-update trigger for `updated_at` column
- RLS policies for user isolation (read/update/insert own profile only)
- Index on `user_id` for faster lookups

**JSONB preferences structure**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": true,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": true,
      "displayName": "Purdue Buoy"
    }
  }
}
```

**Rollback** (if needed):
```sql
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP INDEX IF EXISTS profiles_user_id_idx;
DROP TABLE IF EXISTS profiles CASCADE;
```

**Testing**:
- ✅ Table structure verified
- ✅ RLS policies verified (3 policies: SELECT, UPDATE, INSERT)
- ✅ Trigger verified (auto-updates `updated_at` on UPDATE)
- ✅ JSONB preferences insert/query tested
- ✅ Rollback tested (clean removal)

See `/docs/adr/0001-jsonb-user-preferences.md` for design rationale.

## Migration: 20260910183000_create_race_archive_and_boat_setup.sql

**Purpose**: the hosted schema for the race archive and Boat Setup. Nothing user-facing —
this migration and its two check suites are the deliverable.

**What it creates**: twelve tables, six enums, four invariant triggers — three of them
`CONSTRAINT TRIGGER`s, deferred so a multi-statement write can finish before being judged, and
one plain `BEFORE UPDATE` for Version immutability — four `updated_at` triggers, three
annotation triggers that reach back to the Race, and RLS on every table.
(LAY-101's description says "five constraint triggers"; the authoritative design doc has four
invariant triggers and wins. Band contiguity is deliberately application-level —
`docs/design-docs/race-archive-schema.md:362`.)
`boats`, `sails`, `boat_setup_artifacts`, `boat_setup_versions`, `rig_tune_bands`,
`calibration_events`, `recordings`, `recording_rows`, `races`, `race_sail_entries`,
`race_sail_entry_sails`, `race_sea_state_entries`.

**What it seeds**: one boat (Handsome Pete, Beneteau 10R), the six sails of its inventory, and
the four Boat Setup artifact rows with no current Version. Nothing else — no importer, no
backfill, no race data. The archive is entered by hand through the finished UI.

**Design**: `docs/design-docs/race-archive-schema.md` is authoritative, and the migration is
a lift of it. Also ADR 0005, 0007, 0008, 0009, 0010, 0011, 0012, 0013.

**Four decisions that look like mistakes and are not**:

- `numeric` with no declared scale, everywhere. A declared scale is a rounding rule, and a
  recorded value is not Layline's to round (ADR 0008).
- `recordings.id` has no `DEFAULT`. The permanent Storage path contains the id, so the caller
  mints it before the bytes move: ADR 0013 prefers orphaned bytes to orphaned rows.
- `timestamp` for a recording's own naive wall clock — no offset exists in a qtVlm export and
  none is invented — and `timestamptz` only for moments in Layline's own life.
- No `UPDATE`/`DELETE` policy on `recording_rows`, and no `DELETE` policy on
  `boat_setup_versions`. Immutability comes from the *absence* of a policy. Deleting a Race is
  still `DELETE FROM recordings WHERE id = $1`, which cascades: referential actions are not
  subject to RLS.

**Rollback**:
```sql
DROP TABLE IF EXISTS race_sea_state_entries, race_sail_entry_sails, race_sail_entries,
    races, recording_rows, recordings, calibration_events, rig_tune_bands,
    boat_setup_versions, boat_setup_artifacts, sails, boats CASCADE;
DROP FUNCTION IF EXISTS public.touch_race_updated_at_via_entry(),
    public.touch_race_updated_at(), public.enforce_sail_entry_non_empty(),
    public.enforce_race_window_intersects_rows(), public.enforce_version_immutability(),
    public.enforce_forward_only_current_version();
DROP TYPE IF EXISTS recording_date_order, reef_state, sea_state, calibration_event_type,
    calibration_channel, boat_setup_kind;
```

## Migration: 20260916121000_create_race_from_upload_with_sail_definitions.sql

**Purpose**: the same five-argument `public.create_race_from_upload`, with `p_sails` now
`[{at, definition_number, note}]` and `p_race` carrying `crossover_chart_version_id`. ADR 0023
means a Sail Configuration is one Definition of the Race's own chart Version, so the old inner
loop over a set of sail ids collapses to a single `INSERT ... SELECT` — there is no child table
left to need the parent's id.

**It replaces the function rather than overloading it**, and the argument types are unchanged
(`jsonb ×5`), so this is a plain `CREATE OR REPLACE` with no `DROP`. That is the one case where a
replacement cannot leave a stale overload behind.

**The Version is written once, on the Race, and copied onto every entry from there** — no entry
states its own, and one is refused if it tries. `p_sails` non-empty against a Race with no chart
Version is refused before the Recording is inserted, so nothing of the upload survives a mistake
that the wizard should have caught (ADR 0013 prefers orphaned bytes to orphaned rows).

**What it does not restate**: the composite foreign keys, `sail_entry_says_something` and
`sail_entry_note_non_empty` all live in `20260916120000` and refuse a bad entry from there. This
function adds one refusal of its own — the null-Version case above — because a foreign key cannot
say *why* in words the wizard can show.

```bash
supabase db push                                  # or paste the file into the SQL editor
scripts/verify-race-upload-rpc.sh "$DB_URL"       # 55 checks, safe against real data
```

The suite went from 45 checks to 55 and section 9 was rewritten: a Definition number stored, the
Race's Version copied onto entries that never stated it, a note stored verbatim beside a
Definition, a note-only Configuration with a null `definition_number`, sail 4 refused against a
Version that stops at 3 and accepted against one that defines it, an entry that says nothing
refused by name, and sails against a Race with no chart Version refused with nothing written.
**All 55 were run against the local stack and passed.**

**Rollback**: re-run `20260915230000_create_race_from_upload_with_annotations.sql`, which restores
the previous body. It only makes sense alongside a rollback of `20260916120000` — the old body
writes `race_sail_entry_sails` and a `reef_state`, and neither exists afterwards.

## Migration: 20260916120000_one_sail_vocabulary.sql

**Purpose**: ADR 0023. Delete the Sail Inventory and let a Crossover Chart Version own the only
sail vocabulary Layline has. `crossover_sail_definitions (version_id, number)` is a new table;
`race_sail_entries` gains `crossover_chart_version_id NOT NULL`, `definition_number` and `note`;
`sails` (with its six-row seed), `race_sail_entry_sails`, the `race_sail_entries_non_empty`
trigger, `race_sail_entries.reef` and the `reef_state` enum all go.

**The Definitions become rows for the reason `rig_tune_bands` did.** Postgres cannot reference
into a JSONB array, and a Configuration pointing at "element 3 of a payload" is the positional
index ADR 0007 and ADR 0011 both refuse. The payload keeps `sail_definitions` untouched — that is
the file's own testimony — and the rows are a projection written **from the same parse, in the
same transaction**, inside `mint_boat_setup_version`. A Version's rows and its payload cannot be
written apart.

**Two composite foreign keys replace what a trigger would have guessed at**: one to
`races (id, crossover_chart_version_id)`, so an entry cannot disagree with its own Race, and one
to `crossover_sail_definitions (version_id, number)`, so it cannot name a sail the Version never
defined. `MATCH SIMPLE` is doing deliberate work in the second — a null `definition_number` is a
note-only Configuration and the key stands aside — and no work at all in the first, where both
columns are `NOT NULL`. A Race with a null chart pointer holding no Configurations is a
consequence of the first key, not a check written anywhere. `ON UPDATE RESTRICT` is why repointing
a Race's chart must clear its Configurations first, in one transaction, after the sailor is told
how many.

**It is destructive and deliberately so**: every existing `race_sail_entries` row is deleted.
Those rows name `sails` ids against Races whose chart pointer has never been written, so there is
nothing to translate against without inventing the translation — and the archive is hand-entered
by its owner through the finished UI. `crossover_sail_definitions` **is** backfilled, from
`payload->'sail_definitions'` of every existing crossover Version. No Race's chart pointer is
backdated: null means *not recorded* (ADR 0012).

**Destructive once, and it has to be said that way.** The delete names its rows —
`WHERE crossover_chart_version_id IS NULL`, against the column added nullable just above it — so the
first run takes every old-vocabulary row and a second run takes nothing. A plain
`DELETE FROM race_sail_entries` reads identically on the first run and destroys hand-entered
Testimony on any run after it, which is not recoverable from anything. Two other statements were
re-run hazards for the same reason and are fixed the same way: the backfill skips a Version already
projected (`NOT EXISTS`, which is not the same as an `ON CONFLICT` that would also swallow a payload
naming one number twice), and the two dropped tables are left to take their own triggers, because
`DROP TRIGGER IF EXISTS x ON y` *raises* once `y` is gone. Applying the whole file twice in one
transaction, with a Configuration entered in between, was run locally on 2026-09-16: the second run
completes, the Configuration survives, and the Definitions count is unchanged.

```bash
supabase db push                                  # or paste the file into the SQL editor
scripts/verify-race-archive-schema.sh "$DB_URL"   # both new sections included
```

The schema suite loses its six-sail assertion and "a flown sail cannot be deleted" — neither has a
subject any more — and gains the two composite-key refusals, the says-something CHECK, the
non-empty note, and a Configuration on a chart-less Race.

**Rollback**:
```sql
DROP TABLE IF EXISTS crossover_sail_definitions CASCADE;
ALTER TABLE race_sail_entries
    DROP COLUMN crossover_chart_version_id, DROP COLUMN definition_number, DROP COLUMN note;
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_id_crossover_chart_version_key;
DROP FUNCTION IF EXISTS public.repoint_race_crossover_chart(uuid, uuid, integer);
```
That leaves the schema without a sail vocabulary at all. Restoring the Inventory means re-running
`20260910183000_create_race_archive_and_boat_setup.sql`'s `sails`, `race_sail_entry_sails` and
`reef_state` statements by hand — this migration drops them, and their rows are gone.

## Migration: 20260915230000_create_race_from_upload_with_annotations.sql

**Purpose**: `public.create_race_from_upload(p_recording jsonb, p_rows jsonb, p_race jsonb,
p_sails jsonb, p_sea_state jsonb)` — the same one transaction, now carrying the sailor's Testimony.
LAY-111's two annotation steps mean an upload writes five tables instead of three: the Recording,
its Transcription, the Race, its Sail Configurations and its Sea State readings.

**It replaces the three-argument function rather than overloading it.** The section below documents
that signature; this migration `DROP FUNCTION`s it in the same file that creates the five-argument
one. An overload would resolve for any caller still passing three arguments, and that caller would
write a race with no annotations and no complaint — indistinguishable from a race whose sails
genuinely were not recorded (ADR 0010).

**Empty arrays are the ordinary case**, not a failure: six of the archive's thirteen recordings have
no sail or sea-state record at all, so `p_sails => '[]'` means *not recorded* and is written as such.
Neither kind's `at` is bounded by the Race Window — the sails were set before the start.

**Push it before a deploy, for the reason the section below gives**, and with one extra edge: a
hosted project that has the old function and not this one has a *working* wizard right up to submit,
where PostgREST reports no `create_race_from_upload(jsonb, jsonb, jsonb, jsonb, jsonb)` in the schema
cache — after the bytes have moved (ADR 0013).

```bash
supabase db push                                  # or paste the file into the SQL editor
scripts/verify-race-upload-rpc.sh "$DB_URL"       # 45 checks, safe against real data
```

The suite grew from 31 checks to 45: the fourteen new ones cover the two annotation tables, the
empty-array case and an entry placed outside the window. Those fourteen were never run as written —
ADR 0023 rewrote the sail half of section 9 before a database was in reach, and what did run is the
55-check suite recorded in `docs/testing/race-upload-transaction.md`, which is where the observed
output goes.

**Rollback**:
```sql
DROP FUNCTION IF EXISTS public.create_race_from_upload(jsonb, jsonb, jsonb, jsonb, jsonb);
```
Restoring the three-argument version means re-running `20260915220000_create_race_from_upload.sql`,
which this migration's `DROP` leaves intact on disk.

## Migration: 20260915220000_create_race_from_upload.sql

**Superseded by `20260915230000` above**, which drops this signature and creates the five-argument
one in its place. Kept here because it is the migration a hosted project applied first, and because
it is what a rollback of `20260915230000` re-runs.

**Purpose**: `public.create_race_from_upload(p_recording jsonb, p_rows jsonb, p_race jsonb)` — the
one transaction the upload wizard's submit writes through. It inserts the Recording, its
Transcription rows and the Race together, or none of them.

**Why a function and not three client calls**: a Transcription is immutable and the Race's
`races_window_intersects_rows` trigger is deferred, so the rows have to be in the same transaction
as the Race that is judged against them. Three round trips from a Server Action cannot be one
transaction, and a half-written Recording is unrepairable.

**It must be pushed to the hosted project before a preview or production deploy can save a race.**
It is a `CREATE FUNCTION`, so nothing else in the app notices its absence — the wizard charts,
crops, refuses and confirms exactly as it should, and then submit fails at the very last step with
`Could not find the function public.create_race_from_upload(...) in the schema cache`, which is
PostgREST reporting a function that is not there. That failure lands **after** the bytes have moved
to their permanent path (ADR 0013), so each attempt leaves one orphaned object under
`recordings/{recording_id}/` for a sweep to collect.

```bash
supabase db push                                  # or paste the file into the SQL editor
scripts/verify-race-upload-rpc.sh "$DB_URL"       # 31 checks, safe against real data
```

**Its timestamp is later than the day it was written**, for the reason
`20260915210000_mint_boat_setup_version.sql` documents: this was written first and shipped
third, and `supabase db push` refuses a local migration that sorts before one the remote has
already applied. Nothing in it depends on running before LAY-106's or LAY-107's — different
tables, differently named functions — so moving past them costs nothing.

**Rollback**:
```sql
DROP FUNCTION IF EXISTS public.create_race_from_upload(jsonb, jsonb, jsonb);
```

## Migration: 20260915210000_mint_boat_setup_version.sql

**Purpose**: what LAY-106's upload needs from the database — a way to insert the next Version of
a file-backed artifact and move the artifact's pointer to it without the two ever being apart.

**What it creates**: `public.mint_boat_setup_version(uuid, boat_setup_kind, date, jsonb, text,
text, text)`, returning the `version_number` it minted.

**Why the function exists**: the two writes cannot be two requests. The pointer's foreign key is
`DEFERRABLE INITIALLY DEFERRED` and `boat_setup_artifacts_forward_only_current` is a deferred
`CONSTRAINT TRIGGER`, both so that inserting a Version and pointing the artifact at it can be one
transaction — and supabase-js cannot open one. Two requests would leave, on any failure between
them, a Version nothing points at. The pointer moving *backwards* is still refused by that
trigger at commit rather than re-checked here, so the rule lives in one place.

**Why the id is the caller's**: the permanent Storage path contains the version id, and the bytes
move to that path *before* this transaction commits (ADR 0013) — so the id has to exist before
the row does. Same reasoning as `recordings.id` having no `DEFAULT`.

**`SECURITY INVOKER`, deliberately.** The function is convenience, not authority: RLS refuses a
signed-in non-admin inside it exactly as it refuses a direct insert (ADR 0019), and `created_by`
comes from `auth.uid()` rather than from an argument (ADR 0018). `version_number` is read as
`MAX + 1` under the caller's own RLS; `UNIQUE (artifact_id, version_number)` is what settles two
concurrent uploads, and the loser is told to try again rather than overwriting the winner.

**Rollback**:
```sql
DROP FUNCTION IF EXISTS public.mint_boat_setup_version(
    UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT);
```

## Migration: 20260915190000_rig_tune_stale_gaps_and_mint.sql

**Purpose**: what LAY-107's form needs from the database — somewhere to record that a band's
**Turnbuckle Gaps** went stale, and a way to write a whole Version at once.

**What it creates**: `rig_tune_bands.gaps_stale` (`BOOLEAN NOT NULL DEFAULT FALSE`), the
`base_band_gaps_never_stale` CHECK, and `public.mint_rig_tune_version(date, text, jsonb)`.

**Why the column exists at all**: staleness is not derivable. Deriving it would mean matching
bands across two Versions by `low_kt`, and bands are re-cut from one Version to the next — the
match is a guess, and a guess about whether a stored measurement still describes the rig is
exactly the kind of invention ADR 0008 rules out. So it is recorded when it becomes true, by
the one edit that can make it true: re-measuring the Base Tune (ADR 0007). It is never
recomputed from the base, because no thread pitch is stored, and never true of the Base Tune
itself, which is what the others are stale *against* — hence the CHECK.

**Why the function exists**: a Version is three writes — the Version row, all of its bands,
and the artifact's `current_version_id` — and supabase-js has no transaction to hold them in.
Half a band table is not a tune anybody should set a boat to (ADR 0011), so the three go
through one `plpgsql` call. It also allocates `version_number` under `SELECT ... FOR UPDATE` on
the artifact, so two admins cannot mint the same number.

**What the function refuses.** A table with no bands, and a table that does not carry exactly
one Base Tune band: `rig_tune_bands` already has a partial unique index that refuses the second
base, and a row-at-a-time constraint cannot see a missing row, so the zeroth is counted here —
which is what makes "exactly one per Version" a promise of the database rather than of the form.
The artifact is looked up `INTO STRICT`, so the day a second boat exists the call fails instead
of writing the Version to whichever row came back first. Band contiguity is *not* checked here:
it needs the whole table in view and the vocabulary to name the band at fault, which is
`lib/boat/rigTune.ts`'s job.

**`SECURITY INVOKER`, deliberately.** The function exists for the transaction, not for
authority: RLS refuses a viewer inside it exactly as it would refuse the three statements
written out, and `created_by` comes from `auth.uid()` rather than from an argument. `EXECUTE`
is revoked from `PUBLIC` and `anon` and granted to `authenticated` — which is not a permission
to write, only permission to be refused by the write policies (ADR 0019).

**Rollback**:
```sql
DROP FUNCTION IF EXISTS public.mint_rig_tune_version(DATE, TEXT, JSONB);
ALTER TABLE public.rig_tune_bands DROP CONSTRAINT IF EXISTS base_band_gaps_never_stale;
ALTER TABLE public.rig_tune_bands DROP COLUMN IF EXISTS gaps_stale;
```

## Verification suites

Both are committed, both are re-runnable, and both are safe against a project holding real
data. Neither runs in CI, because CI has no database — the CI-side guard is
`__tests__/supabase/race-archive-migration.test.ts`, which asserts the properties that are
properties of the migration's text.

```bash
scripts/verify-race-archive-schema.sh              # every schema check, local stack
scripts/verify-race-archive-schema.sh "$DB_URL"    # ... or a hosted project
scripts/verify-boat-storage.sh                     # LAY-92's 17 storage checks
```

The schema suite attacks every invariant the design doc claims Postgres enforces and passes
only when the database refuses. It is one transaction ending in `ROLLBACK`, so its fixtures —
two users, a Recording, two Races, some Versions — exist only for the length of the run.

The storage suite really writes: it uploads, moves and deletes real objects and creates two
throwaway users. It cleans up after itself, but there is no `ROLLBACK` for bytes. Against a
hosted project it needs `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

**It is local-only as of ADR 0020**, which turned the email provider off on the hosted project.
Both signed-in tiers are reached with `signInWithPassword`, which needs that provider — left on
locally for exactly this reason, and off hosted because a hosted anon key ships to the browser.
A hosted run of the thirteen signed-in checks therefore needs a session obtained another way: a
token minted from the project's JWT secret, or the provider re-enabled for the length of the
run. The four bucket checks and the service-role cleanup work hosted unchanged.

Neither suite creates a `profiles` row any more. `20260911213000_profile_trigger_and_role_lock.sql`
makes the Profile from a trigger on `auth.users`, so both now create the account and let the
Profile follow — the admin fixture is then promoted from `viewer`, which is a role write and only
permitted because neither suite carries an end-user JWT.

**One hazard worth knowing before a hosted `db push`.** A migration is one transaction, so an
aborted statement is reported against the *following* one — which makes an innocent
`CREATE POLICY` look like the culprit for a problem above it. The usual cause is
`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`, which fails `42501` because
`postgres` no longer belongs to `supabase_storage_admin`. Neither migration emits it, and a
test asserts that this one never will.
