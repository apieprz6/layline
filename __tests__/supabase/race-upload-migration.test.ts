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

const sql = readFileSync(resolve(MIGRATIONS, FILENAME), 'utf8')

/** The statements alone, since the prose above them discusses what they avoid. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

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
