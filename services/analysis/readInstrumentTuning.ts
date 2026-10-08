/**
 * The Instrument Tuning season, read out of the archive.
 *
 * The one impure half of this screen: it reads the Races, their stored Transcriptions and the
 * **Calibration Log**, and hands all of it to `instrumentTuningSeason`, which is pure. Everything
 * the three charts show is computed at read and stored nowhere, as every derived figure in Layline
 * is (ADR 0009) — so the Countable rule, the three-row bin gate and the fit's gates can all move
 * without a migration.
 *
 * **All-or-nothing on failure.** A season missing one Race it could not read would present as a
 * complete season with a Race silently absent, and every figure on it — a coverage verdict most of
 * all — would be a claim about evidence that is not what it says. A failed read is reported as a
 * failed read.
 *
 * ## What this costs, and the thing to revisit
 *
 * It reads every row of every Race's Transcription: on the owner's archive that is around 35,000
 * rows, paged a thousand at a time, because Row Quality and Maneuvers must be assessed over the
 * whole recording before the Race Window is applied (ADR 0009) and because the scatter draws a dot
 * per Countable row. That is the honest cost of the screen as specified, not an oversight — and it
 * is what ADR 0026's analysis query layer exists to make cheaper when it lands. Until then the page
 * is `force-dynamic` and uncached, which is slow rather than wrong.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import { createClient } from '@/lib/supabase/server'
import { instrumentTuningSeason, type InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import { readRecordingRows, type RecordedRow } from '@/services/races/recording-rows'
import type { CalibrationEvent, CalibrationLogEntry, InstrumentCalibrationVersion } from '@/types'

/** One Race, as the screen names it. The label itself is the chart's to compose. */
export interface TuningRaceRef {
  race_id: string
  /** Whatever the sailor called it, or null where they called it nothing. */
  title: string | null
  window_start: string
}

/** Everything the three charts need, or the reason there is nothing to draw. */
export type InstrumentTuningRead =
  | {
      ok: true
      season: InstrumentTuningSeason
      /** Both sources, newest first, for the charts' dashed rules. */
      log: CalibrationLogEntry[]
      /** Every Race read, oldest first. */
      races: TuningRaceRef[]
    }
  | { ok: false; reason: 'no-races' | 'unreadable' }

const RACE_SELECT =
  'id, title, window_start, window_finish, recordings!inner(id, row_count)'

interface RaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  recordings: { id: string; row_count: number }
}

const VERSION_COLUMNS =
  'id, artifact_id, kind, version_number, effective_from, recorded_at, note, created_by, filename, content_sha256, payload'

const EVENT_COLUMNS =
  'id, artifact_id, kind, occurred_on, type, channels, note, created_by, created_at, updated_at'

export async function readInstrumentTuning(): Promise<InstrumentTuningRead> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Instrument Tuning: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, reason: 'unreadable' }
  }

  // Oldest first, which is the order a season reads in and the order every Era aggregate wants.
  const { data: races, error: racesError } = await supabase
    .from('races')
    .select(RACE_SELECT)
    .order('window_start', { ascending: true })
    .returns<RaceRow[]>()

  if (racesError) {
    console.error('Instrument Tuning: race read failed:', racesError.message)
    return { ok: false, reason: 'unreadable' }
  }

  // An empty archive is not a failure. It is the state the screen ships in, and the screen says so.
  if (!races || races.length === 0) return { ok: false, reason: 'no-races' }

  const read: { race_id: string; rows: RecordedRow[]; window: RaceWindowOf }[] = []

  for (const race of races) {
    const rows = await readRecordingRows(supabase, race.recordings.id, race.recordings.row_count)

    if (rows === null) {
      console.error(
        `Instrument Tuning: could not read the Transcription of race ${race.id}; refusing to ` +
          'compute a season over the Races that did load'
      )
      return { ok: false, reason: 'unreadable' }
    }

    read.push({
      race_id: race.id,
      rows,
      window: { window_start: race.window_start, window_finish: race.window_finish },
    })
  }

  const log = await readCalibrationLog(supabase)
  if (log === null) return { ok: false, reason: 'unreadable' }

  return {
    ok: true,
    season: instrumentTuningSeason(read, log),
    log,
    races: races.map((race) => ({
      race_id: race.id,
      title: race.title,
      window_start: race.window_start,
    })),
  }
}

/** The `races` columns a window is made of, by their own names. */
interface RaceWindowOf {
  window_start: string
  window_finish: string
}

/**
 * The Log, or null where either half of it failed to load.
 *
 * Both halves or neither, for the reason `readInstrumentCalibration` gives: a Log missing the
 * source that failed would read as a complete history, and here it would also mean a chart drawing
 * one Era where the boat had two — which is two instrument configurations averaged together with
 * nothing on screen saying so.
 *
 * An artifact with nothing recorded against it is a legitimate empty Log, and yields one Era per
 * channel over the whole archive (ADR 0032's correct failure).
 */
async function readCalibrationLog(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CalibrationLogEntry[] | null> {
  const { data: artifact, error: artifactError } = await supabase
    .from('boat_setup_artifacts')
    .select('id')
    .eq('kind', 'instrument_calibration')
    .maybeSingle<{ id: string }>()

  if (artifactError) {
    console.error('Instrument Tuning: calibration artifact read failed:', artifactError.message)
    return null
  }

  // No readable artifact row and an artifact with nothing against it are different: the first is a
  // read that failed or RLS hiding it, and inventing an empty Log for it would assert that nobody
  // has ever touched the instruments.
  if (!artifact) {
    console.error('Instrument Tuning: no Instrument Calibration artifact row is readable')
    return null
  }

  const [versions, events] = await Promise.all([
    supabase
      .from('boat_setup_versions')
      .select(VERSION_COLUMNS)
      .eq('artifact_id', artifact.id)
      .returns<InstrumentCalibrationVersion[]>(),
    supabase
      .from('calibration_events')
      .select(EVENT_COLUMNS)
      .eq('artifact_id', artifact.id)
      .returns<CalibrationEvent[]>(),
  ])

  if (versions.error || events.error) {
    console.error(
      'Instrument Tuning: Calibration Log read failed:',
      versions.error?.message ?? events.error?.message
    )
    return null
  }

  return buildCalibrationLog(versions.data ?? [], events.data ?? [])
}
