/**
 * A stored race, read back into the shape the flow already knows how to draw.
 *
 * This is the amend path's answer to `stageRecording`, and the difference between the two is the whole
 * of ADR 0010 Amendment 1: staging reads a file, hashes it, parks its bytes and parses them; this
 * reads rows that were parsed once, long ago, and are now simply stored. No bytes are opened, no hash
 * is taken, nothing is written to `tmp/`, and the duplicate-content question cannot arise because
 * there is no content arriving. The parse boundary sits outside the flow, so the flow can be entered
 * from either side of it.
 *
 * The charts get the **whole** Transcription rather than the rows inside the stored window, and that
 * is the point of amending: a sailor whose start was two minutes late has to see the rows they are
 * moving the start onto. A window cropped to itself cannot be widened.
 *
 * Nothing derived travels with this. Coverage, Row Quality and Gap Seconds are computed at read on
 * the race's own page (ADR 0009), so an amended window re-derives all three the next time the page is
 * opened and there is nothing here to recompute or invalidate. Row Quality *is* computed here, but
 * only because the charts need to know which rows are Frozen in order to break their lines.
 *
 * All-or-nothing, like `readRace`: a half-read race would be a flow offering to save a window over
 * rows it does not have, or an annotation list one entry short that a single save would then make
 * permanent. Null is a race that cannot be amended right now, and the page says so.
 */

import { createClient } from '@/lib/supabase/server'
import { readRecordingRows } from '@/services/races/recording-rows'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { RaceAmendment, SeaState, SubmitSailEntry, SubmitSeaStateEntry } from '@/types'

/**
 * The Race's own columns, and the Recording's bounds beside them.
 *
 * `filename` is absent, and so is `content_sha256` and everything else about the bytes: the amendment
 * has no use for them, because it cannot touch them. What it needs of the Recording is the row count
 * that bounds the paged read and the two stamps the chart axis is padded from.
 */
const AMENDMENT_SELECT =
  'id, title, window_start, window_finish, ' +
  'polar_version_id, crossover_chart_version_id, rig_tune_version_id, ' +
  'instrument_calibration_version_id, rig_tune_band_id, ' +
  'recordings!inner(id, first_row_time, last_row_time, row_count)'

interface AmendmentRaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  polar_version_id: string | null
  crossover_chart_version_id: string | null
  rig_tune_version_id: string | null
  instrument_calibration_version_id: string | null
  rig_tune_band_id: string | null
  recordings: {
    id: string
    first_row_time: string
    last_row_time: string
    row_count: number
  }
}

interface SailEntryRow {
  at: string
  definition_number: number | null
  note: string | null
}

interface SeaStateEntryRow {
  at: string
  sea_state: SeaState
}

/**
 * The Testimony as stored, or null when either list could not be read.
 *
 * Null rather than empty, and here the distinction is sharper than it is on the race's page. There, an
 * empty list read in error would make the page say the sailor recorded nothing. Here it would hand the
 * flow an empty list, the sailor would correct the window, and the one save would write that empty
 * list over what they had actually said — a failed read turned into deleted Testimony. So the whole
 * amendment is refused instead.
 *
 * The labels are deliberately not resolved. A Sail Configuration names a Definition number, the words
 * belong to the chart Version (ADR 0023), and the flow is already handed every Version the boat has
 * with its own vocabulary — resolving them a second time here would give the flow two lists of words
 * that could disagree about the same number.
 */
async function readStoredAnnotations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string
): Promise<{ sails: SubmitSailEntry[]; sea_state: SubmitSeaStateEntry[] } | null> {
  const [sails, seaState] = await Promise.all([
    supabase
      .from('race_sail_entries')
      .select('at, definition_number, note')
      .eq('race_id', raceId)
      .order('at', { ascending: true })
      .returns<SailEntryRow[]>(),
    supabase
      .from('race_sea_state_entries')
      .select('at, sea_state')
      .eq('race_id', raceId)
      .order('at', { ascending: true })
      .returns<SeaStateEntryRow[]>(),
  ])

  if (sails.error || seaState.error) {
    console.error(
      'Amend: annotation read failed:',
      sails.error?.message ?? seaState.error?.message ?? 'no rows and no error'
    )
    return null
  }

  return {
    sails: (sails.data ?? []).map((entry) => ({
      at: entry.at,
      definition_number: entry.definition_number,
      note: entry.note,
    })),
    sea_state: (seaState.data ?? []).map((entry) => ({
      at: entry.at,
      sea_state: entry.sea_state,
    })),
  }
}

/** One stored race, ready to be amended, or null when it cannot be read whole. */
export async function readRaceAmendment(raceId: string): Promise<RaceAmendment | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Amend: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data: race, error } = await supabase
    .from('races')
    .select(AMENDMENT_SELECT)
    .eq('id', raceId)
    .maybeSingle<AmendmentRaceRow>()

  if (error) {
    console.error('Amend: race read failed:', error.message)
    return null
  }

  // No row and a row RLS hid are one answer through `maybeSingle()`, and both are "there is no race
  // here for you to amend".
  if (!race) return null

  const rows = await readRecordingRows(supabase, race.recordings.id, race.recordings.row_count)
  if (!rows) return null

  const annotations = await readStoredAnnotations(supabase, race.id)
  if (!annotations) return null

  try {
    // Over the whole Transcription, before any window is applied (ADR 0009) — which here is not a
    // nicety but the only order that works: the window is the thing about to be moved.
    const quality = assessRowQuality(rows)
    const series = raceChartSeries(
      {
        rows,
        first_row_time: race.recordings.first_row_time,
        last_row_time: race.recordings.last_row_time,
      },
      quality
    )

    return {
      race_id: race.id,
      title: race.title,
      window_start: race.window_start,
      window_finish: race.window_finish,
      series,
      setup: {
        polar_version_id: race.polar_version_id,
        crossover_chart_version_id: race.crossover_chart_version_id,
        rig_tune_version_id: race.rig_tune_version_id,
        instrument_calibration_version_id: race.instrument_calibration_version_id,
        rig_tune_band_id: race.rig_tune_band_id,
      },
      sails: annotations.sails,
      sea_state: annotations.sea_state,
    }
  } catch (thrown: unknown) {
    // A stamp the wall clock refuses: a fractional second, or an offset, in a column Layline only
    // ever writes whole naive seconds to.
    console.error(
      'Amend: a recorded time is not a naive wall-clock stamp:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}
