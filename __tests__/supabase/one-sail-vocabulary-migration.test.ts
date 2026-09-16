/**
 * Static assertions over the one-sail-vocabulary migration.
 *
 * The invariants themselves are proved against a live database by
 * scripts/verify-race-archive-schema.sql — both composite keys refusing an insert, the CHECK
 * refusing an entry that says nothing, `ON UPDATE RESTRICT` refusing a bare repoint. That suite
 * needs Postgres and so cannot run here.
 *
 * What jest can do is guard the properties that are properties of the *text*: the ones whose
 * failure mode is a plausible edit no running database would object to. Two of them are the whole
 * point of ADR 0023 and neither is checkable at runtime — that the Definitions are written from the
 * *same parse* as the payload inside one function body, and that this migration backdates no chart
 * pointer.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20260916120000_one_sail_vocabulary.sql'

const sql = readFileSync(resolve(MIGRATIONS, FILENAME), 'utf8')

/** The statements alone, since the prose above them discusses at length what it avoids. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('the one-sail-vocabulary migration', () => {
  it('runs after every migration it alters the work of', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const here = files.indexOf(FILENAME)

    expect(here).toBeGreaterThanOrEqual(0)
    // The tables it alters, and the function it replaces in place. `supabase db push` refuses a
    // local migration that sorts before one the remote has already applied, and a CREATE OR
    // REPLACE that runs before the original would be silently undone by it.
    for (const earlier of [
      '20260910183000_create_race_archive_and_boat_setup.sql',
      '20260915210000_mint_boat_setup_version.sql',
      '20260915230000_create_race_from_upload_with_annotations.sql',
    ]) {
      expect(files.indexOf(earlier)).toBeGreaterThanOrEqual(0)
      expect(here).toBeGreaterThan(files.indexOf(earlier))
    }
  })

  describe('the Definitions as rows', () => {
    it('keys them on the Version and the number, with no surrogate id', () => {
      // A Definition number means nothing outside the Version that numbered it: sail 7 of v1 and
      // sail 7 of v2 are two different sails. A surrogate key would let a Configuration name a
      // Definition without naming its Version, which is the ambiguity ADR 0023 exists to remove.
      const table = code.match(
        /CREATE TABLE IF NOT EXISTS crossover_sail_definitions \(([\s\S]*?)\n\);/
      )
      expect(table).not.toBeNull()
      expect(table![1]).toMatch(/PRIMARY KEY \(version_id, number\)/)
      expect(table![1]).not.toMatch(/\bid\s+UUID/)
    })

    it('carries the constant kind tag and pins it, so the Version cannot be a Polar', () => {
      // ADR 0011's shape, the same as rig_tune_bands: the tag column is what lets the composite
      // foreign key state the kind of the row it points at.
      expect(code).toMatch(/kind\s+boat_setup_kind NOT NULL DEFAULT 'crossover_chart'/)
      expect(code).toMatch(
        /CONSTRAINT crossover_sail_definitions_kind_fixed CHECK \(kind = 'crossover_chart'\)/
      )
      expect(code).toMatch(
        /FOREIGN KEY \(version_id, kind\)\s*\n\s*REFERENCES boat_setup_versions \(id, kind\)/
      )
    })

    it('admits zero as a number and refuses a fraction or a blank label', () => {
      // The number is qtVlm's own identifier, stored as the file gave it (ADR 0008). Nothing
      // requires it to start at 1 or to be contiguous, so the only refusals are the ones that
      // would not be an identifier at all.
      expect(code).toMatch(/number\s+INTEGER NOT NULL/)
      expect(code).toMatch(/CONSTRAINT definition_number_whole CHECK \(number >= 0\)/)
      expect(code).toMatch(/CONSTRAINT definition_label_non_empty CHECK \(BTRIM\(label\) <> ''\)/)
    })

    it('reads its backfill out of the payload rather than composing a label', () => {
      // The rows are a projection of what the file said. Anything invented here — a default label,
      // a renumbering, a COALESCE — would be Layline's words in a Version's mouth.
      expect(code).toMatch(/INSERT INTO crossover_sail_definitions \(version_id, number, label\)/)
      expect(code).toMatch(/jsonb_array_elements\(v\.payload->'sail_definitions'\)/)
      expect(code).toMatch(/WHERE v\.kind = 'crossover_chart'/)
      // No ON CONFLICT: a payload defining one number twice is a Version that should never have
      // been written, and swallowing it here would hide it forever.
      expect(code).not.toMatch(/INSERT INTO crossover_sail_definitions[\s\S]*?ON CONFLICT/)
      // Skipping a Version already projected is not the same thing, and is what makes the statement
      // repeatable while leaving that refusal intact.
      expect(code).toMatch(
        /NOT EXISTS \(\s*\n\s*SELECT 1 FROM crossover_sail_definitions d WHERE d\.version_id = v\.id\s*\n\s*\)/
      )
    })

    it('reads it under RLS, with a policy each way', () => {
      expect(code).toMatch(/ALTER TABLE crossover_sail_definitions ENABLE ROW LEVEL SECURITY/)
      const policies = [...code.matchAll(/CREATE POLICY "([^"]+)"\s+\n?\s*ON crossover_sail/g)]
      expect(policies).toHaveLength(2)
      expect(code).toMatch(/FOR SELECT TO authenticated USING \(TRUE\)/)
      // Wrapped so the planner hoists it to an initPlan, as every other write policy is.
      expect(code).toMatch(/FOR ALL TO authenticated\s*\n\s*USING \(\(SELECT public\.is_admin\(\)\)\)/)
    })
  })

  describe('minting a Version writes its rows beside its payload', () => {
    /** The body of the replaced function, which is the only place this can be seen. */
    const mint = code.match(
      /CREATE OR REPLACE FUNCTION public\.mint_boat_setup_version\([\s\S]*?\n\$\$;/
    )

    it('projects the Definitions inside the same function body as the insert', () => {
      // The load-bearing assertion of the whole migration, and one no database can make: two
      // requests would leave a Version whose payload names sails no row defines, and a Sail
      // Configuration would then be refused for naming a sail the chart plainly recommends.
      expect(mint).not.toBeNull()
      expect(mint![0]).toMatch(/INSERT INTO public\.boat_setup_versions/)
      expect(mint![0]).toMatch(/INSERT INTO public\.crossover_sail_definitions/)
    })

    it('writes them from the argument it wrote the payload from, not from a re-read', () => {
      // `p_payload` both times. Reading the row back would be a second parse, and a second parse
      // is a second chance to disagree.
      expect(mint![0]).toMatch(
        /INSERT INTO public\.crossover_sail_definitions[\s\S]*?jsonb_array_elements\(p_payload->'sail_definitions'\)/
      )
      expect(mint![0]).toMatch(/SELECT p_version_id,/)
    })

    it('refuses a Crossover Chart Version whose payload defines no sail at all', () => {
      // Its cells resolve against the Definitions, so a chart with none recommends nothing — and
      // it would also be a Version no Sail Configuration could ever be named in.
      expect(mint![0]).toMatch(
        /jsonb_array_length\(p_payload->'sail_definitions'\) = 0 THEN\s*\n\s*RAISE EXCEPTION/
      )
    })

    it('does the projection only for the kind that has one', () => {
      // A Rig Tune payload has no sail_definitions and is not missing them.
      expect(mint![0]).toMatch(/IF p_kind = 'crossover_chart' THEN/)
    })

    it('is still SECURITY INVOKER with an empty search_path', () => {
      expect(mint![0]).toMatch(/SECURITY INVOKER/)
      expect(mint![0]).not.toMatch(/SECURITY DEFINER/)
      expect(mint![0]).toMatch(/SET search_path = ''/)
      expect(mint![0]).not.toMatch(/(FROM|INTO|UPDATE)\s+(boat_setup_|crossover_sail)/)
    })

    it('shuts the door on a guest by name, which CREATE OR REPLACE would not have', () => {
      // 20260915210000 revoked FROM PUBLIC only, and Supabase's default privileges for schema
      // `public` grant EXECUTE to `anon` by name — so a guest reached the body and was turned away
      // by the author check rather than by the grant. Replacing a function keeps its ACL, so this
      // has to be said here. Same trap as create_race_from_upload, which names both.
      expect(code).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.mint_boat_setup_version\([^)]*\) FROM anon;/
      )
    })
  })

  describe('a Sail Configuration names a Definition of its Race’s own Version', () => {
    it('makes the Version NOT NULL on the entry', () => {
      // A Configuration in no vocabulary names nothing. It is also the half of the composite key
      // that makes "a Race with no chart Version can hold no Configurations" structural.
      //
      // Added nullable and tightened afterwards, in that order, because the delete below has to be
      // able to name the old rows — see "deletes every existing Sail Configuration".
      expect(code).toMatch(/ADD COLUMN IF NOT EXISTS crossover_chart_version_id UUID,/)
      expect(code).toMatch(/ADD COLUMN IF NOT EXISTS definition_number INTEGER,/)
      expect(code).toMatch(/ADD COLUMN IF NOT EXISTS note TEXT/)
      expect(code).toMatch(
        /ALTER COLUMN crossover_chart_version_id SET NOT NULL/
      )
      expect(code.indexOf('ADD COLUMN IF NOT EXISTS crossover_chart_version_id')).toBeLessThan(
        code.indexOf('ALTER COLUMN crossover_chart_version_id SET NOT NULL')
      )
    })

    it('gives the Race a key its Configurations can name', () => {
      // `id` is already the primary key, so this adds no invariant — only a referenceable unit.
      expect(code).toMatch(
        /ADD CONSTRAINT races_id_crossover_chart_version_key\s*\n?\s*UNIQUE \(id, crossover_chart_version_id\)/
      )
    })

    it('ties the entry to its Race’s pointer, and restricts the repoint', () => {
      // ON UPDATE RESTRICT is the point of the key: repointing a Race would otherwise leave
      // Configurations naming numbers of a Version the Race no longer records.
      expect(code).toMatch(
        /ADD CONSTRAINT race_sail_entries_race_chart_fkey\s*\n\s*FOREIGN KEY \(race_id, crossover_chart_version_id\)\s*\n\s*REFERENCES races \(id, crossover_chart_version_id\)\s*\n\s*ON UPDATE RESTRICT ON DELETE CASCADE/
      )
    })

    it('ties the number to that same Version’s Definitions, and will not let one vanish', () => {
      expect(code).toMatch(
        /ADD CONSTRAINT race_sail_entries_definition_fkey\s*\n\s*FOREIGN KEY \(crossover_chart_version_id, definition_number\)\s*\n\s*REFERENCES crossover_sail_definitions \(version_id, number\)\s*\n\s*ON UPDATE RESTRICT ON DELETE RESTRICT/
      )
    })

    it('refuses an entry that says nothing, as a CHECK rather than a trigger', () => {
      // The old refusal had to be deferred, because the entry row necessarily existed before its
      // join rows. With the sail on the entry itself it is one row at a time, immediate, no
      // function — and a note alone is testimony, so it satisfies it.
      expect(code).toMatch(
        /ADD CONSTRAINT sail_entry_says_something\s*\n\s*CHECK \(definition_number IS NOT NULL OR note IS NOT NULL\)/
      )
      expect(code).toMatch(
        /ADD CONSTRAINT sail_entry_note_non_empty\s*\n\s*CHECK \(note IS NULL OR BTRIM\(note\) <> ''\)/
      )
    })

    it('adds no CHECK against the Race Window', () => {
      // The sails were set before the start, so an entry before `window_start` is the ordinary
      // case and not an error.
      expect(code).not.toMatch(/window_start|window_finish/)
    })
  })

  describe('the old vocabulary going', () => {
    it('deletes every existing Sail Configuration, and says so where it does it', () => {
      // Those rows name `sails` ids, and no Race has ever carried a chart pointer to translate
      // them against. A backfill here could only guess, and a guessed sail is indistinguishable
      // from one the sailor stated.
      //
      // Named rather than unconditional, and that is the whole assertion: a row with no Version is
      // an old-vocabulary row by construction, so the first run takes all of them and a re-run
      // takes none. `DELETE FROM race_sail_entries;` reads the same on the first run and destroys
      // Testimony that "is not recoverable from anything" on every run after it.
      expect(code).toMatch(
        /DELETE FROM race_sail_entries WHERE crossover_chart_version_id IS NULL;/
      )
      expect(code).not.toMatch(/DELETE FROM race_sail_entries;/)
      expect(sql).toMatch(/every existing `race_sail_entries` row\n-- is deleted/)
    })

    it('drops the inventory, the join table, the trigger and the enum', () => {
      expect(code).toMatch(/DROP TABLE IF EXISTS race_sail_entry_sails;/)
      expect(code).toMatch(/DROP TABLE IF EXISTS sails;/)
      expect(code).toMatch(/DROP TRIGGER IF EXISTS race_sail_entries_non_empty ON race_sail_entries;/)
      expect(code).toMatch(/DROP FUNCTION IF EXISTS public\.enforce_sail_entry_non_empty\(\);/)
      expect(code).toMatch(/DROP FUNCTION IF EXISTS public\.touch_race_updated_at_via_entry\(\);/)
      expect(code).toMatch(/ALTER TABLE race_sail_entries DROP COLUMN IF EXISTS reef;/)
      expect(code).toMatch(/DROP TYPE IF EXISTS reef_state;/)
    })

    it('lets the dropped tables take their own triggers, and keeps the entry’s', () => {
      // race_sail_entries_touch_race still has a job: an entry is Testimony about its Race, and
      // editing one still touches it. Only the trigger that reached the Race *through* an entry
      // goes, because there is no join row left to reach from — and it goes with its table.
      //
      // Naming either trigger would break a re-run: `DROP TRIGGER IF EXISTS x ON y` raises when `y`
      // is gone, because the IF EXISTS is about the trigger. Proved by applying this file twice.
      expect(code).not.toMatch(/DROP TRIGGER[^\n]*ON (race_sail_entry_sails|sails);/)
      expect(code).not.toMatch(/DROP TRIGGER IF EXISTS race_sail_entries_touch_race/)
      expect(code).toMatch(/DROP FUNCTION IF EXISTS public\.touch_race_updated_at_via_entry\(\);/)
    })

    it('drops the entry’s key to the Race before the key it points at', () => {
      // A UNIQUE constraint cannot be dropped while a foreign key depends on it, and after one run
      // of this file one does. Without this the second run fails on `races` rather than on anything
      // this migration means to refuse.
      const fkey = code.indexOf(
        'ALTER TABLE race_sail_entries DROP CONSTRAINT IF EXISTS race_sail_entries_race_chart_fkey;'
      )
      const unique = code.indexOf(
        'ALTER TABLE races DROP CONSTRAINT IF EXISTS races_id_crossover_chart_version_key;'
      )
      expect(fkey).toBeGreaterThanOrEqual(0)
      expect(unique).toBeGreaterThan(fkey)
    })

    it('backdates no chart pointer onto any existing Race', () => {
      // NULL means not recorded (ADR 0012). "The Version current when this ran" would be a
      // fabricated stand-in for a fact nobody wrote down, on races sailed before any Version
      // existed.
      //
      // The two functions do write the pointer, and each is a sailor's own act rather than this
      // migration's, so they are cut out before looking: what is asserted is that nothing runs at
      // migration time to fill one in.
      const atMigrationTime = code.replace(
        /CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g,
        ''
      )
      expect(atMigrationTime).not.toMatch(/UPDATE\s+(public\.)?races/)
      expect(atMigrationTime).not.toMatch(/SET crossover_chart_version_id/)
    })
  })

  describe('repointing a Race', () => {
    it('states the count it was agreed for, and refuses if it has moved', () => {
      // Deleted Testimony is not recoverable from anything, so the one thing that must not happen
      // quietly is clearing more than the sailor was told about.
      expect(code).toMatch(/p_clearing\s+INTEGER/)
      expect(code).toMatch(/IF p_clearing IS DISTINCT FROM v_present THEN\s*\n\s*RAISE EXCEPTION/)
    })

    it('clears before it repoints, because the key would refuse it otherwise', () => {
      const body = code.match(
        /CREATE OR REPLACE FUNCTION public\.repoint_race_crossover_chart\([\s\S]*?\n\$\$;/
      )
      expect(body).not.toBeNull()
      const del = body![0].indexOf('DELETE FROM public.race_sail_entries')
      const update = body![0].indexOf('UPDATE public.races')
      expect(del).toBeGreaterThanOrEqual(0)
      expect(update).toBeGreaterThan(del)
    })

    it('applies the Race’s own write policy before deleting anything', () => {
      // SECURITY INVOKER plus a locking read: a viewer reaching this function directly finds no
      // row, and hears about privileges rather than losing somebody's Testimony.
      expect(code).toMatch(/FROM public\.races\s*\n\s*WHERE id = p_race_id\s*\n\s*FOR UPDATE/)
      expect(code).toMatch(/RAISE EXCEPTION 'no such Race[^']*'[\s\S]*?42501/)
    })

    it('is unreachable by a guest', () => {
      expect(code).toMatch(
        /REVOKE ALL ON FUNCTION public\.repoint_race_crossover_chart\(UUID, UUID, INTEGER\) FROM PUBLIC, anon;/
      )
      expect(code).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.repoint_race_crossover_chart\(UUID, UUID, INTEGER\) TO authenticated;/
      )
    })
  })

  it('is idempotent in everything it creates', () => {
    // `supabase db reset` and a re-run of a partially applied push both have to work.
    expect(code).not.toMatch(/CREATE TABLE(?! IF NOT EXISTS)/)
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.mint_boat_setup_version/)
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.repoint_race_crossover_chart/)
    // A policy and a constraint cannot say IF NOT EXISTS, so each is dropped first.
    for (const [, policy, table] of code.matchAll(
      /CREATE POLICY "([^"]+)"\s*\n?\s*ON (\w+)/g
    )) {
      expect(code).toMatch(
        new RegExp(`DROP POLICY IF EXISTS "${policy}"\\s*\\n?\\s*ON ${table};`)
      )
    }
    for (const [, constraint] of code.matchAll(/ADD CONSTRAINT (\w+)/g)) {
      expect(code).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${constraint}`))
    }
  })

  it('touches nothing in the storage schema', () => {
    // A hosted `db push` fails with 42501 on any statement against storage.objects, and reports
    // the abort against the following statement.
    expect(code).not.toMatch(/storage\./i)
  })

  it('comments the table, its columns and both functions', () => {
    expect(sql).toMatch(/COMMENT ON TABLE crossover_sail_definitions IS/)
    for (const column of ['version_id', 'kind', 'number', 'label']) {
      expect(sql).toMatch(new RegExp(`COMMENT ON COLUMN crossover_sail_definitions\\.${column} IS`))
    }
    // And the two it changed the meaning of: a Race's pointer is now a vocabulary too.
    expect(sql).toMatch(/COMMENT ON COLUMN races\.crossover_chart_version_id IS/)
    expect(sql).toMatch(/COMMENT ON TABLE race_sail_entries IS/)
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.mint_boat_setup_version/)
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.repoint_race_crossover_chart/)
  })
})
