/**
 * Static assertions over the migration that amends a whole race in one transaction.
 *
 * The behaviour is proved against a live database by section 12 of scripts/verify-race-upload-rpc.sql —
 * twenty-seven checks over the function itself, recorded in docs/testing/race-upload-transaction.md —
 * which needs Postgres and so cannot run here. What jest can do is guard the properties of the
 * *text*: the ones whose failure mode is a plausible edit no running database would object to, and — for
 * this function above all — the ones that are about what the file does **not** say.
 *
 * The largest of those is AC 8. The Transcription is immutable and no path in Layline may alter it, and
 * the way that is true of this function is that it never names `recordings` or `recording_rows` at all.
 * A live test cannot prove an absence; a grep can, which is the one thing this file is better at than
 * the database.
 *
 * The second is the order of the five steps. Every one is forced by the one before it — the lock is the
 * authorization, the DELETE is what lets the chart pointer move, the clearing count of 0 is true only
 * *because* of the DELETE — and a re-ordering would still run, still commit, and refuse an ordinary
 * amendment that repointed a chart.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20260916170000_amend_a_race.sql'

/** The statements alone, since the header above them discusses at length what they avoid. */
const statements = (filename: string): string =>
  readFileSync(resolve(MIGRATIONS, filename), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const code = statements(FILENAME)

/** The body, without the COMMENT — which quotes half of these words in prose. */
const body = code.slice(0, code.indexOf('COMMENT ON FUNCTION'))

describe('the amend-a-race migration', () => {
  it('runs after the schema, the sail vocabulary and the function it delegates to', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.sql'))
      .sort()
    const here = files.indexOf(FILENAME)
    expect(here).toBeGreaterThanOrEqual(0)

    // Both annotation tables, the window constraints and the touch triggers.
    expect(here).toBeGreaterThan(
      files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')
    )
    // repoint_race_crossover_chart, reached through amend_race_boat_setup.
    expect(here).toBeGreaterThan(files.indexOf('20260916120000_one_sail_vocabulary.sql'))
    // amend_race_boat_setup itself, which this one calls rather than reimplements.
    expect(here).toBeGreaterThan(files.indexOf('20260916150000_race_boat_setup_pointers.sql'))
  })

  it('adds no column, no table, no constraint and no trigger', () => {
    // The whole shape of this change. Everything an amendment writes has been writable since the
    // archive migration; what was missing was a way to write it all at once. A CREATE or ALTER here
    // would be a second place for an invariant to live.
    expect(code).not.toMatch(/ALTER TABLE/)
    expect(code).not.toMatch(/CREATE TABLE/)
    expect(code).not.toMatch(/ADD (COLUMN|CONSTRAINT)/)
    expect(code).not.toMatch(/CREATE (OR REPLACE )?TRIGGER/)
    expect(code).not.toMatch(/CREATE (UNIQUE )?INDEX/)
    expect(code).not.toMatch(/DROP /)
  })

  it('takes the race, the race’s own columns, the five answers and both lists of Testimony', () => {
    expect(code).toMatch(
      /CREATE OR REPLACE FUNCTION public\.amend_race\(\s*p_race_id\s+UUID,\s*p_race\s+JSONB,\s*p_setup\s+JSONB,\s*p_sails\s+JSONB,\s*p_sea_state\s+JSONB\s*\)/
    )
    // Nothing comes back. The caller re-reads the race, and every figure on its page is derived at
    // read (ADR 0009) — a count returned here would be a number about a moment already gone.
    expect(code).toMatch(/RETURNS VOID/)
  })

  describe('what it cannot touch', () => {
    it('never names the Recording or its rows, in any statement', () => {
      // AC 8, as an absence. The Transcription is what the file said and an amendment is what the
      // sailor said about it (ADR 0010): there is no parameter here for a recorded value, and no
      // statement that could carry one even if there were.
      expect(body).not.toMatch(/recording_rows/)
      expect(body).not.toMatch(/\brecordings\b/)
      expect(body).not.toMatch(/filename|content_sha256|row_count|first_row_time|last_row_time/)
    })

    it('has no reach into Storage, and does not pretend to', () => {
      expect(body).not.toMatch(/storage\./)
      expect(body).not.toMatch(/BOAT_BUCKET|races\//)
    })

    it('recomputes nothing derived, because nothing derived is stored', () => {
      // Row Quality, Coverage and Gap Seconds are derived at read (ADR 0009), so an amended window
      // re-derives all three the next time the race is opened. A column for any of them here would be
      // a cached answer that a later migration would have to remember to invalidate (AC 10).
      expect(body).not.toMatch(/row_quality|coverage|gap_seconds|dropout/i)
    })

    it('asks for no change reason and writes no history of its own', () => {
      // AC 4 and AC 5. `races.updated_at` is the whole record, moved by `races_updated_at` and by the
      // touch triggers on both annotation tables — so an amendment that only corrected the sea state
      // still advances it, and none of that is restated here.
      expect(body).not.toMatch(/p_reason|change_reason|reason\s+TEXT/i)
      expect(body).not.toMatch(/amended_at|amended_by|change_log|history/i)
      expect(body).not.toMatch(/SET updated_at/)
    })
  })

  describe('the five steps, in the one order that works', () => {
    it('locks the Race first, and the lock is the authorization', () => {
      // SECURITY INVOKER means the admin-only write policy on `races` applies to this SELECT, so a
      // viewer reaching the function directly finds no row and is refused before anything is deleted
      // (ADR 0019). "No such race" and "not yours" are deliberately one answer.
      expect(body).toMatch(/FROM public\.races\s+WHERE id = p_race_id\s+FOR UPDATE/)
      expect(body).toMatch(/RAISE EXCEPTION 'no such Race, or it is not writable by this account'/)
      expect(body).toMatch(/USING ERRCODE = '42501'/)
      expect(body).toMatch(/SECURITY INVOKER/)
      expect(body).not.toMatch(/SECURITY DEFINER/)
    })

    it('deletes both annotation lists before it moves the chart pointer', () => {
      // `race_sail_entries_race_chart_fkey` is ON UPDATE RESTRICT, so the pointer cannot move while a
      // Sail Configuration still names the old Version (ADR 0023). Both DELETEs therefore come before
      // the delegated call, and the whole Testimony is re-inserted below — it is a replacement, not a
      // clearance.
      const sails = body.indexOf('DELETE FROM public.race_sail_entries')
      const seaState = body.indexOf('DELETE FROM public.race_sea_state_entries')
      const setup = body.indexOf('public.amend_race_boat_setup(')
      const insert = body.indexOf('INSERT INTO public.race_sail_entries')

      expect(sails).toBeGreaterThan(0)
      expect(seaState).toBeGreaterThan(0)
      expect(setup).toBeGreaterThan(seaState)
      expect(insert).toBeGreaterThan(setup)
    })

    it('delegates the five answers rather than writing them itself, with the count that stands', () => {
      // Zero is the *true* count: nothing is standing after the DELETEs. Delegating also buys the
      // five-key check, so a payload short of one answer is refused here too rather than silently
      // clearing a pointer.
      expect(body).toMatch(/PERFORM public\.amend_race_boat_setup\(p_race_id, p_setup, 0\)/)
      // The pointers are that function's to write. A second UPDATE of any of them here would be a
      // second place for the coupled Rig Tune pair to drift.
      const update = /UPDATE public\.races\s+SET ([\s\S]*?)WHERE id = p_race_id;/.exec(body)
      expect(update).not.toBeNull()
      const assignments = update === null ? '' : update[1]
      expect(assignments).toMatch(/title\s+=/)
      expect(assignments).toMatch(/window_start\s+=/)
      expect(assignments).toMatch(/window_finish\s+=/)
      for (const pointer of [
        'polar_version_id',
        'crossover_chart_version_id',
        'rig_tune_version_id',
        'instrument_calibration_version_id',
        'rig_tune_band_id',
      ]) {
        expect(assignments).not.toMatch(new RegExp(pointer))
      }
    })

    it('writes every re-inserted sail against the Race’s own chart Version', () => {
      // One vocabulary per race, not one per entry (ADR 0023): the Version comes from the payload's
      // Boat Setup answer, which is the one the row now points at after step 3.
      expect(body).toMatch(/v_chart_id\s+UUID := \(p_setup->>'crossover_chart_version_id'\)::UUID/)
      expect(body).toMatch(/INSERT INTO public\.race_sail_entries \(\s*race_id, crossover_chart_version_id, at, definition_number, note\s*\)/)
      expect(body).toMatch(/jsonb_array_elements\(v_sails\)/)
      expect(body).toMatch(/jsonb_array_elements\(v_sea_state\)/)
    })

    it('keeps every timestamp exactly as the caller sent it', () => {
      // AC 7. An entry's `at` is Testimony about when something happened, and the window is a claim
      // about which stretch was the race: moving the second cannot rewrite the first. So the insert
      // casts the stamp and does nothing else to it — no clamping to the window, no offset, no
      // now().
      expect(body).toMatch(/\(entry->>'at'\)::TIMESTAMP/)
      expect(body).not.toMatch(/GREATEST|LEAST|now\(\)|CURRENT_TIMESTAMP|AT TIME ZONE/)
      // And no entry is dropped for falling outside it: nothing filters the arrays being inserted.
      expect(body).not.toMatch(/WHERE[\s\S]{0,80}window_(start|finish)/)
    })
  })

  describe('what it refuses, and what it leaves to the database', () => {
    it('insists the window is stated, because NULL is not an answer for it', () => {
      // `->>` on an absent key is NULL, which for a Version pointer legitimately means *not recorded*
      // (ADR 0008) and for a window bound means a caller sent three of the four things a race is. The
      // title is deliberately not on this list: absent and blank both mean untitled.
      expect(body).toMatch(/ARRAY\['window_start', 'window_finish'\]/)
      expect(body).toMatch(/RAISE EXCEPTION 'p_race must state the window/)
      expect(body).not.toMatch(/ARRAY\[[^\]]*'title'/)
    })

    it('restates neither window refusal, because both are the database’s own', () => {
      // ADR 0009's two, enforced by `race_window_ordered` on the UPDATE and by the deferred
      // `races_window_intersects_rows` at commit — after the entries go back in, over rows that never
      // moved. A copy here would be a third place for the rule to live and the one that could drift.
      expect(body).not.toMatch(/window_finish\s*(>|<|<=|>=)\s*window_start/)
      expect(body).not.toMatch(/races_window_intersects_rows|race_window_ordered/)
    })

    it('says the one thing a constraint could only say about a column', () => {
      // `race_sail_entries.crossover_chart_version_id` is NOT NULL, so this is refused either way.
      // Said here because the constraint's message names a column, and what went wrong is a sailor
      // naming sails against a Race that would record no chart Version.
      expect(body).toMatch(/IF v_chart_id IS NULL AND jsonb_array_length\(v_sails\) > 0 THEN/)
      expect(body).toMatch(/USING ERRCODE = '22023'/)
    })

    it('reads an absent list and an empty one as the same thing', () => {
      // Both mean *not recorded*, which is a legal race whose page says so (ADR 0010). Normalised once
      // so neither insert has to decide, and so neither raises about extracting elements from null.
      expect(body).toMatch(/v_sails\s+JSONB := COALESCE\(p_sails, '\[\]'::JSONB\)/)
      expect(body).toMatch(/v_sea_state\s+JSONB := COALESCE\(p_sea_state, '\[\]'::JSONB\)/)
      expect(body).toMatch(/jsonb_typeof\(v_sails\) <> 'array'/)
      expect(body).toMatch(/jsonb_typeof\(v_sea_state\) <> 'array'/)
    })

    it('runs with an empty search_path and qualifies every name it touches', () => {
      expect(body).toMatch(/SET search_path = ''/)
      expect(body).not.toMatch(
        /(FROM|INTO|UPDATE)\s+(races|race_sail_entries|race_sea_state_entries)\b/
      )
    })

    it('states the door for its own signature', () => {
      // A REVOKE names a signature, so a new function starts out with Postgres's grant to PUBLIC and
      // Supabase's to `anon` no matter what was revoked from anything else. A guest has no race
      // screens at all (ADR 0015).
      const signature = String.raw`\(UUID, JSONB, JSONB, JSONB, JSONB\)`
      expect(code).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.amend_race${signature} FROM PUBLIC, anon`)
      )
      expect(code).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.amend_race${signature} TO authenticated`)
      )
    })

    it('says in its own COMMENT what it cannot reach', () => {
      // The COMMENT is what a psql session reads, and the two facts hardest to see from the body are
      // the two absences: the Transcription, and any history beyond `updated_at`.
      expect(code).toMatch(/COMMENT ON FUNCTION public\.amend_race/)
      expect(code).toMatch(/Touches neither recordings nor recording_rows/)
      expect(code).toMatch(/No change reason and no per-field history/)
    })
  })
})
