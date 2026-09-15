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
scripts/verify-race-archive-schema.sh              # 110 checks, local stack
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
