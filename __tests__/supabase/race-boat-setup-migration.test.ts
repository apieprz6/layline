/**
 * Static assertions over the migration that lets a Race record all five Boat Setup answers.
 *
 * The behaviour is proved against a live database by scripts/verify-race-upload-rpc.sql (sections 10
 * and 11) and scripts/verify-race-archive-schema.sql, both of which need Postgres and so cannot run
 * here. What jest can do is guard the properties that are properties of the *text*: the ones whose
 * failure mode is a plausible edit no running database would object to, and the ones that are about
 * what the file does *not* say.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20260916150000_race_boat_setup_pointers.sql'

/** The statements alone, since the prose above them discusses at length what they avoid. */
const statements = (filename: string): string =>
  readFileSync(resolve(MIGRATIONS, filename), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const code = statements(FILENAME)

/** The five keys `p_race` and `p_setup` both answer, in the order the columns are named. */
const FIVE = [
  'polar_version_id',
  'crossover_chart_version_id',
  'rig_tune_version_id',
  'instrument_calibration_version_id',
  'rig_tune_band_id',
] as const

describe('the Boat Setup pointers migration', () => {
  it('runs after the schema that gave it columns and after the body it replaces', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const here = files.indexOf(FILENAME)
    expect(here).toBeGreaterThanOrEqual(0)

    // The five columns, the four kind-tagged composite keys and band_requires_rig_tune.
    expect(here).toBeGreaterThan(
      files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')
    )
    // repoint_race_crossover_chart, which this file's new function calls rather than reimplements.
    expect(here).toBeGreaterThan(files.indexOf('20260916120000_one_sail_vocabulary.sql'))
    // The create_race_from_upload body this one replaces.
    expect(here).toBeGreaterThan(
      files.indexOf('20260916121000_create_race_from_upload_with_sail_definitions.sql')
    )
  })

  it('adds no columns and no constraints, because the schema already carries all five', () => {
    // The whole shape of this change: `races` has had the columns and the keys since the archive
    // migration. A CREATE or ALTER here would be a second place for the same invariant to live.
    expect(code).not.toMatch(/ALTER TABLE/)
    expect(code).not.toMatch(/CREATE TABLE/)
    expect(code).not.toMatch(/ADD (COLUMN|CONSTRAINT)/)
    expect(code).not.toMatch(/CREATE (UNIQUE )?INDEX/)
  })

  describe('create_race_from_upload, writing all five at the upload', () => {
    it('keeps the same five arguments, so it replaces rather than overloads', () => {
      // An overload would leave the LAY-130 body reachable, and that body files a Race with no
      // Polar, no Rig Tune, no Calibration and no Band — indistinguishable from a race whose Boat
      // Setup genuinely was not recorded (ADR 0008).
      expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.create_race_from_upload\(/)
      expect(code).not.toMatch(/DROP FUNCTION IF EXISTS public\.create_race_from_upload/)
      for (const arg of ['p_recording', 'p_rows', 'p_race', 'p_sails', 'p_sea_state']) {
        expect(code).toMatch(new RegExp(`${arg}\\s+JSONB`))
      }
    })

    it('reads all five off p_race and names all five in the INSERT', () => {
      for (const key of FIVE) {
        expect(code).toMatch(new RegExp(`\\(p_race->>'${key}'\\)::UUID`))
      }
      expect(code).toMatch(
        /polar_version_id, crossover_chart_version_id, rig_tune_version_id,\s*instrument_calibration_version_id, rig_tune_band_id, created_by/
      )
    })

    it('resolves no Version itself, by date or by an artifact’s current pointer', () => {
      // The default is the Version in force at the recording's start, and it is resolved in the
      // wizard where the sailor can see it and change it (services/boat/versionInForce.ts). Resolved
      // here, an archived race would silently name whatever is current at the moment it is filed,
      // and re-filing the same race in a year would name a different Polar (ADR 0012).
      expect(code).not.toMatch(/effective_from/)
      expect(code).not.toMatch(/current_version_id/)
      expect(code).not.toMatch(/ORDER BY version_number/)
    })

    it('lets a missing answer stay missing', () => {
      // `->>` on an absent or null key is NULL, the columns are nullable and the composite keys are
      // MATCH SIMPLE, so a race with none of the five saves. Nine archive races predate every Boat
      // Setup artifact and backdating v1 onto them would assert a Polar the boat did not have yet.
      expect(code).not.toMatch(/COALESCE\(\(p_race->>'(polar|rig_tune|instrument)/)
    })
  })

  describe('amend_race_boat_setup, the one path by which the five change afterwards', () => {
    it('takes the Race, the whole answer, and the number of Configurations agreed to lose', () => {
      expect(code).toMatch(
        /CREATE OR REPLACE FUNCTION public\.amend_race_boat_setup\(\s*p_race_id\s+UUID,\s*p_setup\s+JSONB,\s*p_clearing\s+INTEGER/
      )
      expect(code).toMatch(/RETURNS INTEGER/)
    })

    it('refuses a payload that is missing any of the five rather than reading it as null', () => {
      // `p_setup->>'polar_version_id'` on a payload that never mentioned the Polar answers NULL,
      // which would clear a pointer nobody meant to touch. Every key has to be stated, even to say
      // "not recorded".
      for (const key of FIVE) {
        expect(code).toMatch(new RegExp(`'${key}'`))
      }
      expect(code).toMatch(/p_setup \? v_key/)
      expect(code).toMatch(/RAISE EXCEPTION\s+'p_setup must state all five/)
      expect(code).toMatch(/USING ERRCODE = '22023'/)
    })

    it('moves the chart pointer through repoint_race_crossover_chart, and only when it moves', () => {
      // race_sail_entries_race_chart_fkey is ON UPDATE RESTRICT, so a plain UPDATE of
      // crossover_chart_version_id on a Race with Configurations cannot succeed — the Configurations
      // have to go first, and how many go is something the sailor agreed to (ADR 0023).
      expect(code).toMatch(/public\.repoint_race_crossover_chart\(p_race_id, v_chart_id, p_clearing\)/)
      expect(code).toMatch(/IF v_chart_id IS DISTINCT FROM v_current_chart THEN/)
      // And an agreement to clear Configurations when the chart is not moving is a caller that
      // thinks it is doing something else.
      expect(code).toMatch(/ELSIF p_clearing <> 0 THEN/)
      // The counting and the DELETE belong to that function; a copy here is a second place to drift.
      expect(code).not.toMatch(/DELETE FROM public\.race_sail_entries/)
    })

    it('sets the Rig Tune Version and the Wind Band in one UPDATE', () => {
      // The pair is one answer in two columns and the composite key checks the pair. Set apart,
      // whichever went first would leave a Race naming a band that belongs to the other Version, and
      // the constraint would refuse the amendment that was going to fix it.
      const update = /UPDATE public\.races\s+SET ([\s\S]*?)WHERE id = p_race_id;/.exec(code)
      expect(update).not.toBeNull()
      const assignments = update === null ? '' : update[1]
      expect(assignments).toMatch(/rig_tune_version_id\s+=/)
      expect(assignments).toMatch(/rig_tune_band_id\s+=/)
      // The chart pointer is not among them: repoint_race_crossover_chart writes that one.
      expect(assignments).not.toMatch(/crossover_chart_version_id/)
    })

    it('takes the row for the length of the amendment, and refuses what it cannot see', () => {
      // The read decides whether the chart pointer is moving, so it has to be the row the UPDATE
      // then writes. RLS is what makes the SELECT come back empty for a viewer, which is the same
      // refusal as "no such Race" and is deliberately not distinguished from it (ADR 0019).
      expect(code).toMatch(/FROM public\.races\s+WHERE id = p_race_id\s+FOR UPDATE/)
      expect(code).toMatch(/RAISE EXCEPTION 'no such Race, or it is not writable by this account'/)
      expect(code).toMatch(/USING ERRCODE = '42501'/)
    })

    it('asks for no change reason', () => {
      // ADR 0010 reserves a reason for a new Version of an artifact. Correcting which Version a race
      // names is the sailor fixing their own record of their own boat, and every pointer stays
      // editable in place forever.
      // The COMMENT says the words "no change reason", so what is asserted is that no argument and no
      // column carries one.
      expect(code).not.toMatch(/p_reason|change_reason|reason\s+TEXT/i)
      expect(code).not.toMatch(/amended_at|amended_by|change_log/)
    })

    it('is SECURITY INVOKER with an empty search_path, and qualifies every name', () => {
      expect(code).toMatch(/SECURITY INVOKER/)
      expect(code).not.toMatch(/SECURITY DEFINER/)
      expect(code).toMatch(/SET search_path = ''/)
      expect(code).not.toMatch(/(FROM|INTO|UPDATE)\s+(races|recordings|recording_rows|rig_tune_bands|boat_setup_versions)\b/)
    })

    it('states the door for its own signature', () => {
      // A REVOKE names a signature, so a new function starts out with Postgres's grant to PUBLIC and
      // Supabase's to `anon` no matter what was revoked from anything else.
      const signature = String.raw`\(UUID, JSONB, INTEGER\)`
      expect(code).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.amend_race_boat_setup${signature} FROM PUBLIC, anon`)
      )
      expect(code).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.amend_race_boat_setup${signature} TO authenticated`)
      )
    })
  })
})
