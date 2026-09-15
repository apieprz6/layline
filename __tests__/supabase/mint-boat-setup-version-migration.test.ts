/**
 * Static assertions over the Version-minting migration.
 *
 * The behaviour is proved against a live database by scripts/verify-race-archive-schema.sql,
 * which needs Postgres and so cannot run here. What jest can do is guard the properties that are
 * properties of the *text*: the ones whose failure mode is a plausible edit no running database
 * would object to, or that only a hosted project would reject.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20260915040000_mint_boat_setup_version.sql'

const sql = readFileSync(resolve(MIGRATIONS, FILENAME), 'utf8')

/** The statements alone, since the prose above them discusses what they avoid. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('the Version-minting migration', () => {
  it('runs after the migration that creates the tables it writes to', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    const archive = files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')
    const mint = files.indexOf(FILENAME)

    expect(archive).toBeGreaterThanOrEqual(0)
    expect(mint).toBeGreaterThan(archive)
  })

  it('is SECURITY INVOKER, so RLS decides who may write', () => {
    // The whole authorization story: a signed-in non-admin calling this is refused by exactly
    // the policy that would refuse them a direct insert (ADR 0019). SECURITY DEFINER would make
    // this function a second, weaker place where that decision lives.
    expect(code).toMatch(/SECURITY INVOKER/)
    expect(code).not.toMatch(/SECURITY DEFINER/)
  })

  it('pins an empty search_path, and qualifies every name it uses', () => {
    expect(code).toMatch(/SET search_path = ''/)

    // With no search_path, an unqualified name does not resolve. Every table and function the
    // body names carries its schema.
    expect(code).not.toMatch(/(FROM|INTO|UPDATE)\s+boat_setup_/)
    expect(code).toMatch(/auth\.uid\(\)/)
  })

  it('takes the version id from the caller rather than defaulting one', () => {
    // The permanent Storage path contains the id and the bytes move to it before this
    // transaction commits (ADR 0013), so the id has to exist before the row does.
    expect(code).toMatch(/p_version_id\s+UUID/)
    expect(code).toMatch(/VALUES \(\s*\n\s*p_version_id,/)
  })

  it('writes the Version and moves the pointer in the one function body', () => {
    // Two requests would leave an artifact whose Version exists and which nothing points at,
    // and supabase-js cannot open a transaction to make them one.
    expect(code).toMatch(/INSERT INTO public\.boat_setup_versions/)
    expect(code).toMatch(/UPDATE public\.boat_setup_artifacts[\s\S]*?SET current_version_id/)
  })

  it('numbers the Version itself rather than trusting a caller', () => {
    expect(code).toMatch(/COALESCE\(MAX\(version_number\), 0\) \+ 1/)
    expect(code).not.toMatch(/p_version_number/)
  })

  it('takes the author from the session, never from an argument', () => {
    expect(code).toMatch(/auth\.uid\(\)/)
    expect(code).not.toMatch(/p_created_by/)
  })

  it('refuses to write a Version with nobody signed in', () => {
    expect(code).toMatch(/IF auth\.uid\(\) IS NULL THEN[\s\S]*?RAISE EXCEPTION/)
  })

  it('stores a blank note as no note', () => {
    expect(code).toMatch(/NULLIF\(BTRIM\(COALESCE\(p_note, ''\)\), ''\)/)
  })

  it('does not re-implement the forward-only pointer check', () => {
    // The deferred constraint trigger from the archive migration is the one place that rule
    // lives; a copy here would be a second thing to drift.
    expect(code).not.toMatch(/forward|version_number\s*<|previous_version/i)
  })

  it('is executable by a signed-in sailor and by nobody else', () => {
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.mint_boat_setup_version[\s\S]*?FROM PUBLIC/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.mint_boat_setup_version[\s\S]*?TO authenticated/)
    expect(code).not.toMatch(/TO anon/)
  })

  it('touches nothing in the storage schema', () => {
    // The bytes are moved by the Server Action before this is called, through the storage API.
    // A hosted `db push` fails with 42501 on any statement against storage.objects.
    expect(code).not.toMatch(/storage\./i)
  })

  it('is replaceable, so a later migration can correct it in place', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.mint_boat_setup_version/)
  })

  it('says what it is for, in the database', () => {
    expect(code).toMatch(/COMMENT ON FUNCTION public\.mint_boat_setup_version/)
  })
})
