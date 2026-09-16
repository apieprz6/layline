/**
 * Static assertions over the race-upload transaction migration.
 *
 * The behaviour is proved against a live database by scripts/verify-race-upload-rpc.sql, which
 * needs Postgres and so cannot run here — the record is docs/testing/race-upload-transaction.md.
 * What jest can do is guard the properties that are properties of the *text*: the ones whose
 * failure mode is a plausible edit no running database would object to, or that only a hosted
 * project would reject.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20260915220000_create_race_from_upload.sql'
/** LAY-111's replacement, which drops the three-argument version and writes the annotations too. */
const ANNOTATED = '20260915230000_create_race_from_upload_with_annotations.sql'
/**
 * LAY-130's replacement, where a Sail Configuration names a Sail Definition of the Crossover Chart
 * Version the Race points at (ADR 0023). The two files above are history — a migration is never
 * edited once pushed — so what is asserted about them is the shape they wrote at the time, and this
 * is the one that describes the function as it now stands.
 */
const DEFINITIONS = '20260916121000_create_race_from_upload_with_sail_definitions.sql'

/** The statements alone, since the prose above them discusses what they avoid. */
const statements = (filename: string): string =>
  readFileSync(resolve(MIGRATIONS, filename), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const code = statements(FILENAME)
const annotated = statements(ANNOTATED)
const definitions = statements(DEFINITIONS)

describe('the race-upload transaction migration', () => {
  it('runs after every migration already applied, not just after the tables it writes to', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const upload = files.indexOf(FILENAME)

    // The tables. Nothing here would resolve before them.
    const archive = files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')
    expect(archive).toBeGreaterThanOrEqual(0)
    expect(upload).toBeGreaterThan(archive)

    // And after the two that overtook it, which is a separate requirement: `supabase db push`
    // refuses a local migration that sorts *before* one the remote has already applied — "found
    // local migration files to be inserted before the last migration on remote database". This
    // one was written first and shipped third, so its timestamp had to move past both. The
    // failure mode this catches is the branch that sat open too long, not a bad edit to this
    // file, so it is asserted here rather than trusted to whoever does the push.
    for (const overtook of [
      '20260915190000_rig_tune_stale_gaps_and_mint.sql',
      '20260915210000_mint_boat_setup_version.sql',
    ]) {
      expect(files.indexOf(overtook)).toBeGreaterThanOrEqual(0)
      expect(upload).toBeGreaterThan(files.indexOf(overtook))
    }
  })

  it('is SECURITY INVOKER, so RLS decides who may write', () => {
    // The whole authorization story: the admin-only write policies on the three tables are what
    // refuse a viewer (ADR 0019). SECURITY DEFINER would make this function a second, weaker
    // place where that decision lives — and it writes an immutable Transcription.
    expect(code).toMatch(/SECURITY INVOKER/)
    expect(code).not.toMatch(/SECURITY DEFINER/)
  })

  it('pins an empty search_path, and qualifies every name it uses', () => {
    expect(code).toMatch(/SET search_path = ''/)

    // With no search_path, an unqualified name does not resolve. Every table the body names
    // carries its schema.
    expect(code).not.toMatch(/(FROM|INTO)\s+(recordings|recording_rows|races)\b/)
    expect(code).toMatch(/INSERT INTO public\.recordings/)
    expect(code).toMatch(/INSERT INTO public\.recording_rows/)
    expect(code).toMatch(/INSERT INTO public\.races/)
  })

  it('is not executable by an unauthenticated caller', () => {
    // Not a permission to write, only permission to be refused by the write policies (ADR 0019).
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.create_race_from_upload\([^)]*\) FROM PUBLIC, anon/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_race_from_upload\([^)]*\) TO authenticated/)
  })
})

describe('the migration that adds the sailor’s Testimony to it', () => {
  it('runs after the function it replaces', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    expect(files.indexOf(ANNOTATED)).toBeGreaterThan(files.indexOf(FILENAME))
  })

  it('drops the three-argument version rather than overloading it', () => {
    // An overload would resolve for any caller still passing three arguments, and that caller would
    // write a race with no annotations and no complaint — indistinguishable from a race whose sails
    // genuinely were not recorded (ADR 0010).
    expect(annotated).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_race_from_upload\(JSONB, JSONB, JSONB\);/
    )
    expect(annotated).toMatch(/p_sails\s+JSONB/)
    expect(annotated).toMatch(/p_sea_state JSONB/)
  })

  it('writes both annotation tables inside the same function', () => {
    // The whole reason this is one function: Testimony that is half of what the sailor said is
    // worse than a failed save, and the JS client cannot express a transaction.
    //
    // Three tables here, because a Sail Configuration was a set of sails then. LAY-130 collapsed
    // the join table into a Definition number on the entry itself (ADR 0023) — this asserts what
    // *this* file writes, which is history and does not change.
    expect(annotated).toMatch(/INSERT INTO public\.race_sail_entries/)
    expect(annotated).toMatch(/INSERT INTO public\.race_sail_entry_sails/)
    expect(annotated).toMatch(/INSERT INTO public\.race_sea_state_entries/)
  })

  it('restates none of the annotation refusals', () => {
    // `race_sail_entries_non_empty` at commit, `UNIQUE (race_id, at)` per kind, a foreign key per
    // sail, and the two enums. A copy of any of them here is a second place to drift from.
    expect(annotated).not.toMatch(/at least one sail'/)
    expect(annotated).not.toMatch(/jsonb_array_length\(.*sail_ids.*\)\s*=\s*0/)
  })

  it('treats a missing annotation array as an empty one, and never as a value', () => {
    expect(annotated).toMatch(/COALESCE\(p_sails, '\[\]'::JSONB\)/)
    expect(annotated).toMatch(/COALESCE\(p_sea_state, '\[\]'::JSONB\)/)
    // No default Reef State, no default Sea State: nothing is pre-selected anywhere (ADR 0010).
    expect(annotated).not.toMatch(/COALESCE\([^)]*'full'/)
    expect(annotated).not.toMatch(/COALESCE\([^)]*'calm'/)
  })

  it('is SECURITY INVOKER with an empty search_path, like the function it replaces', () => {
    expect(annotated).toMatch(/SECURITY INVOKER/)
    expect(annotated).not.toMatch(/SECURITY DEFINER/)
    expect(annotated).toMatch(/SET search_path = ''/)
    expect(annotated).not.toMatch(
      /(FROM|INTO)\s+(recordings|recording_rows|races|race_sail_entries|race_sail_entry_sails|race_sea_state_entries)\b/
    )
  })

  it('re-states the door for the new signature', () => {
    // A REVOKE names a signature, so the five-argument function starts out with Postgres's grant to
    // PUBLIC and Supabase's to `anon` regardless of what was revoked from the old one.
    const signature = String.raw`\(JSONB, JSONB, JSONB, JSONB, JSONB\)`
    expect(annotated).toMatch(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.create_race_from_upload${signature} FROM PUBLIC, anon`)
    )
    expect(annotated).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.create_race_from_upload${signature} TO authenticated`)
    )
  })

  it('says nothing about a source of an annotation', () => {
    // There is no `source: auto | manual` concept anywhere in Layline (CONTEXT.md). An annotation is
    // Testimony; a column recording that it was typed by the person who typed it says nothing.
    expect(annotated).not.toMatch(/\bsource\b/i)
    expect(annotated).not.toMatch(/auto[_-]?match/i)
  })
})

describe('the migration where a Configuration names a Sail Definition', () => {
  it('runs after the schema change that gave it columns to write', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    expect(files.indexOf(DEFINITIONS)).toBeGreaterThan(files.indexOf(ANNOTATED))
    // `crossover_chart_version_id`, `definition_number` and `note` do not exist on
    // race_sail_entries until then, and this function's INSERT names all three.
    expect(files.indexOf(DEFINITIONS)).toBeGreaterThan(
      files.indexOf('20260916120000_one_sail_vocabulary.sql')
    )
  })

  it('keeps the same five arguments, so it replaces rather than overloads', () => {
    // An overload would leave the LAY-111 body reachable, and it writes inventory ids into a table
    // that no longer exists — a call that fails at the last insert, after the bytes have moved
    // (ADR 0013). Same signature, so there is no shape of call that reaches the old one.
    expect(definitions).toMatch(/CREATE OR REPLACE FUNCTION public\.create_race_from_upload\(/)
    expect(definitions).not.toMatch(/DROP FUNCTION IF EXISTS public\.create_race_from_upload/)
    for (const arg of ['p_recording', 'p_rows', 'p_race', 'p_sails', 'p_sea_state']) {
      expect(definitions).toMatch(new RegExp(`${arg}\\s+JSONB`))
    }
  })

  it('writes the Race’s chart Version from p_race, and resolves nothing itself', () => {
    // The first thing in Layline that writes this pointer. It is the Version the sailor named their
    // sails in, and reading "the chart in force now" here would rename an archived race's sails in
    // words nobody used (ADR 0012).
    expect(definitions).toMatch(
      /v_chart_id\s+UUID := \(p_race->>'crossover_chart_version_id'\)::UUID;/
    )
    expect(definitions).toMatch(/crossover_chart_version_id, created_by/)
    // Nothing looks a Version up by date, or by an artifact's current pointer.
    expect(definitions).not.toMatch(/effective_from|current_version_id/)
  })

  it('takes each Configuration as a Definition number and a note, and no sail ids', () => {
    expect(definitions).toMatch(/\(entry->>'definition_number'\)::INTEGER/)
    expect(definitions).toMatch(/NULLIF\(BTRIM\(COALESCE\(entry->>'note', ''\)\), ''\)/)
    expect(definitions).not.toMatch(/sail_ids|race_sail_entry_sails|\breef\b/)
  })

  it('writes one row per Configuration, in one statement with no loop', () => {
    // The per-entry loop existed to get each entry's id for its join rows. With the sail on the
    // entry itself there is nothing to come back for.
    expect(definitions).toMatch(
      /INSERT INTO public\.race_sail_entries \(\s*\n\s*race_id, crossover_chart_version_id, at, definition_number, note\s*\n\s*\)/
    )
    expect(definitions).not.toMatch(/\bLOOP\b/)
    expect(definitions).not.toMatch(/RETURNING id INTO v_(sail_)?entry/)
  })

  it('puts the Race’s own Version on every entry rather than trusting a per-entry one', () => {
    // A sailor names sails in one vocabulary. race_sail_entries_race_chart_fkey would refuse
    // anything else, but sending the entry's own value would make that a refusal for the sailor to
    // hit rather than a shape the function cannot produce.
    expect(definitions).toMatch(/SELECT\s*\n\s*v_race_id,\s*\n\s*v_chart_id,/)
    expect(definitions).not.toMatch(/entry->>'crossover_chart_version_id'/)
  })

  it('says why sails were refused when the Race records no chart Version', () => {
    // NOT NULL refuses it either way. The constraint's message names a column; this names what the
    // sailor did, which is name sails against a Race whose vocabulary was not recorded.
    expect(definitions).toMatch(
      /IF v_chart_id IS NULL AND jsonb_array_length\(v_sails\) > 0 THEN\s*\n\s*RAISE EXCEPTION/
    )
    // And before the recording insert, so nothing is written for a call that cannot finish.
    const refusal = definitions.indexOf('IF v_chart_id IS NULL')
    expect(refusal).toBeGreaterThanOrEqual(0)
    expect(definitions.indexOf('INSERT INTO public.recordings')).toBeGreaterThan(refusal)
  })

  it('restates none of the refusals the table already makes', () => {
    // The two composite keys, sail_entry_says_something, sail_entry_note_non_empty and
    // UNIQUE (race_id, at). A copy of any of them here is a second place to drift from.
    expect(definitions).not.toMatch(/says_something|IS NOT NULL OR note/)
    expect(definitions).not.toMatch(/crossover_sail_definitions/)
  })

  it('treats a missing annotation array as an empty one, and never as a value', () => {
    expect(definitions).toMatch(/COALESCE\(p_sails, '\[\]'::JSONB\)/)
    expect(definitions).toMatch(/COALESCE\(p_sea_state, '\[\]'::JSONB\)/)
    // Nothing is pre-selected anywhere: no default sail, no default Sea State (ADR 0010).
    expect(definitions).not.toMatch(/COALESCE\([^)]*'calm'/)
    expect(definitions).not.toMatch(/COALESCE\(\(entry->>'definition_number'\)/)
  })

  it('is SECURITY INVOKER with an empty search_path, like the function it replaces', () => {
    expect(definitions).toMatch(/SECURITY INVOKER/)
    expect(definitions).not.toMatch(/SECURITY DEFINER/)
    expect(definitions).toMatch(/SET search_path = ''/)
    expect(definitions).not.toMatch(
      /(FROM|INTO)\s+(recordings|recording_rows|races|race_sail_entries|race_sea_state_entries)\b/
    )
  })

  it('re-states the door, because CREATE OR REPLACE keeps an ACL it did not set', () => {
    const signature = String.raw`\(JSONB, JSONB, JSONB, JSONB, JSONB\)`
    expect(definitions).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.create_race_from_upload${signature} FROM PUBLIC, anon`
      )
    )
    expect(definitions).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.create_race_from_upload${signature} TO authenticated`
      )
    )
  })

  it('says what it is for, in the database', () => {
    expect(definitions).toMatch(/COMMENT ON FUNCTION public\.create_race_from_upload/)
  })
})
