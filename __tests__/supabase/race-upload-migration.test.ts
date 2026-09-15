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

/** The statements alone, since the prose above them discusses what they avoid. */
const statements = (filename: string): string =>
  readFileSync(resolve(MIGRATIONS, filename), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const code = statements(FILENAME)
const annotated = statements(ANNOTATED)

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
