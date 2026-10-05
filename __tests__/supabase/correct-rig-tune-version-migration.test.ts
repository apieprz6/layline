/**
 * Static assertions over the Rig Tune correction migration (LAY-151, ADR 0031).
 *
 * The behaviour is proved against a live database by scripts/verify-race-archive-schema.sql,
 * section "Correcting a Rig Tune Version", which needs Postgres and so cannot run here. What
 * jest can do is guard the properties of the *text* whose failure mode is a plausible edit no
 * running database would object to.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20261005200000_correct_a_rig_tune_version.sql'

const sql = readFileSync(resolve(MIGRATIONS, FILENAME), 'utf8')

/** The statements alone, since the prose above them discusses what they avoid. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

/** One function's body, from its CREATE to the dollar-quote that closes it. */
function body(name: string): string {
  const match = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`
  ).exec(code)
  if (!match) throw new Error(`no function ${name} in ${FILENAME}`)
  return match[1]
}

describe('the Rig Tune correction migration', () => {
  it('runs after every migration already in the repository', () => {
    // `supabase db push` refuses a local migration that sorts before one the remote applied.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files[files.length - 1]).toBe(FILENAME)
  })

  it('lets a rig_tune Version be corrected, and its payload still never changes', () => {
    const trigger = body('enforce_version_immutability')

    expect(trigger).toMatch(/NOT IN \('instrument_calibration', 'rig_tune'\)/)
    expect(trigger).toMatch(/OLD\.kind = 'rig_tune' AND NEW\.payload IS DISTINCT FROM OLD\.payload/)
    // Every column refused before is still refused, for both kinds.
    for (const column of ['version_number', 'created_by', 'recorded_at', 'filename', 'content_sha256']) {
      expect(trigger).toMatch(new RegExp(`NEW\\.${column}\\s*(<>|IS DISTINCT FROM)\\s*OLD\\.${column}`))
    }
  })

  it('guards every write to rig_tune_bands, not only updates', () => {
    expect(code).toMatch(
      /CREATE TRIGGER rig_tune_bands_write_path\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.rig_tune_bands/
    )
  })

  it('opens the guard in both functions that write bands, and closes it again in each', () => {
    for (const name of ['mint_rig_tune_version', 'correct_rig_tune_version']) {
      const fn = body(name)
      expect(fn).toMatch(/set_config\('layline\.rig_tune_band_write', 'on', TRUE\)/)
      expect(fn).toMatch(/set_config\('layline\.rig_tune_band_write', '', TRUE\)/)
    }
  })

  it('runs both functions as their caller, so RLS decides who may write', () => {
    expect(code).not.toMatch(/SECURITY DEFINER/)
    // One per function header: mint, re-created here, and the correction.
    expect(code.match(/^SECURITY INVOKER$/gm)).toHaveLength(2)
  })

  it('pins an empty search_path on every function, and qualifies what it names', () => {
    expect(code.match(/SET search_path = ''/g)).toHaveLength(4)
    expect(code).not.toMatch(/(FROM|INTO|UPDATE)\s+(boat_setup_|rig_tune_bands|races)\b/)
  })

  it('never moves the current pointer or a Race from a correction', () => {
    const fn = body('correct_rig_tune_version')
    expect(fn).not.toMatch(/boat_setup_artifacts/)
    expect(fn).not.toMatch(/public\.races/)
  })

  it('stores gaps_stale as sent rather than recomputing it', () => {
    // ADR 0031: a correction is the sailor's statement about staleness.
    expect(body('correct_rig_tune_version')).toMatch(
      /gaps_stale = COALESCE\(\(band ->> 'gaps_stale'\)::BOOLEAN, FALSE\)/
    )
  })

  it('is executable by a signed-in sailor and by nobody else', () => {
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.correct_rig_tune_version[\s\S]*?FROM PUBLIC/)
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.correct_rig_tune_version[\s\S]*?FROM anon/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.correct_rig_tune_version[\s\S]*?TO authenticated/)
  })

  it('says what it is for, in the database', () => {
    expect(code).toMatch(/COMMENT ON FUNCTION public\.correct_rig_tune_version/)
    expect(code).toMatch(/COMMENT ON FUNCTION public\.enforce_rig_tune_band_write_path/)
  })
})
