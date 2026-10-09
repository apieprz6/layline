/**
 * Everything the three Instrument Tuning charts are interactive over, from a season of Recordings.
 *
 * ADR 0034's consequence, stated as one function: `services/analysis/` must return what the charts
 * are *interactive over* and not only the figures — every heading bin with its row count including
 * the ones under the gate, every **Tack Pair** with its time and angles and rows, every Countable
 * `(STW, SOG)` row, and per Era the per-bin Race counts and per-Race means. The three checks each
 * already do that; what was missing was one place that reads a Recording once and feeds all three,
 * so a screen does not assemble the pipeline itself and three copies of it cannot drift.
 *
 * Pure and isomorphic. Nothing here touches Supabase, a clock or a `Date`: it takes rows and a
 * **Calibration Log** and returns figures, which is what lets the same function run in a Jest suite
 * over the owner's real archive and in a Server Component over the same recordings read back out of
 * Storage.
 *
 * ## The order the rows are read in, which is load-bearing
 *
 * Row Quality and Maneuvers are computed over the **whole Transcription** and the result is clipped
 * to the **Race Window** afterwards, never the other way round (ADR 0009). A dropout beginning
 * before the gun still froze the race's first rows, and a flip before the gun still has the boat
 * recovering into them; clipping first cannot see either. That ordering is the one thing a caller
 * could get wrong, so this function owns it and asks only for the rows and the window.
 */

import { calibrationEras } from '@/services/analysis/calibration-eras'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { awaAsymmetryByEra, eraAwaAsymmetry, raceAwaAsymmetry } from '@/services/analysis/awa-asymmetry'
import { headingOffsetByEra, raceHeadingOffset } from '@/services/analysis/compass-deviation'
import { detectManeuvers, type ManeuverAssessableRow } from '@/services/analysis/maneuvers'
import { paddlewheelDivergence, type EraDivergence, type FitMethod } from '@/services/analysis/paddlewheel'
import { readableRows } from '@/services/analysis/readable-rows'
import type { QualityAssessableRow, RaceWindow } from '@/services/recordings/row-quality'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type {
  AnalysisRow,
  CalibrationLogEntry,
  EraAwaAsymmetry,
  EraHeadingOffset,
} from '@/types'

/**
 * The two fit methods the screen offers for the `STW` line.
 *
 * `stw-on-sog` exists in the service and is deliberately not offered: three ways to fit one line is
 * a statistics lesson, and two is the point being made — that the slope depends on the method, so
 * no single coefficient may be printed (ADR 0034).
 */
export type OfferedFitMethod = Extract<FitMethod, 'orthogonal' | 'sog-on-stw'>

/** Both methods, in the order the toggle offers them: the default first. */
export const OFFERED_FIT_METHODS: readonly OfferedFitMethod[] = ['orthogonal', 'sog-on-stw']

/**
 * The columns the three checks read off one row.
 *
 * Narrower than a `TranscriptionRow` on purpose, and the eight Row Quality reads plus `AWA (calc)`
 * is exactly what the stored read selects (`services/races/recording-rows.ts`). So both a freshly
 * parsed Transcription and one read back out of Postgres satisfy this, and neither has to be
 * widened into the other to be measured.
 */
export interface TuningRow extends QualityAssessableRow, ManeuverAssessableRow {
  /** `AWA (calc)`: the only apparent wind that exists in a Recording, and a calculation (ADR 0008). */
  awa_calc: string | null
}

/** One Race, as this composition reads it. */
export interface TuningRace<Row extends TuningRow = TuningRow> {
  race_id: string
  /** Every row of the whole Transcription, in file order. **Not** clipped to the window. */
  rows: readonly Row[]
  window: RaceWindow
}

/** One Race's rows, assessed whole and then clipped — what all three checks read. */
export interface TuningRaceRows<Row extends TuningRow = TuningRow> {
  race_id: string
  window_start: string
  rows: (Row & AnalysisRow)[]
}

/**
 * A season as the three charts read it.
 *
 * Each channel's Eras are its own, because they are cut from the Calibration Log per channel and
 * the `HDG` boundaries need not line up with the `STW` ones — on this archive the compass has two
 * Eras and the paddlewheel one.
 */
export interface InstrumentTuningSeason {
  /**
   * The compass, oldest Era first. One entry per `HDG` Era that holds a Race.
   *
   * The current Era is the last, and the one before it is the dashed overlay the chart draws by
   * default — "the autocompensation moved the curve and left its shape" cannot be seen one Era at
   * a time.
   */
  heading: EraHeadingOffset[]
  asymmetry: {
    /**
     * Every Race as one figure.
     *
     * Pooled across `HDG` Era boundaries, which nothing else on this screen does. Sanctioned for
     * this figure alone, and for a stated reason: the season figure is what guides how far the vane
     * is set to one side on the boat, and the Asymmetry is explicitly **not** a Measured Offset —
     * so the invariant that no Measured Offset spans an Era is not the one being bent. The
     * either-side-of-the-boundary comparison is right beside it in `eras`.
     */
    season: EraAwaAsymmetry
    /**
     * The same Races cut on **`AWA`'s own** Eras, oldest first.
     *
     * Its own channel, because that is the partition that makes the figure mean one thing. An
     * `AWA` **Programmed Offset** is applied by the display before a Recording is written, so the
     * Asymmetry is what is left after it — and a vane offset moves the two tacks' held magnitudes
     * in *opposite* directions, which changes the measured Asymmetry by the whole of it. A figure
     * spanning the day that offset was re-typed is two instrument configurations averaged together,
     * which is the one thing a Calibration Era exists to prevent.
     */
    eras: EraAwaAsymmetry[]
    /**
     * The same Races cut on the **`HDG`** Eras, oldest first.
     *
     * ADR 0034 asked for these, for LAY-145 §2.6's check: whether the Asymmetry moved across an
     * autocompensation that moved the compass about ten degrees — on this archive it went −3.8° to
     * −5.5°, which does not look compass-driven. They are *as well as* `eras` and not instead of
     * them; reading that sentence as a replacement is what hid the owner's own `AWA` recalibration
     * from the chart it governs.
     */
    compass_eras: EraAwaAsymmetry[]
  }
  /**
   * The paddlewheel, per `STW` Era, oldest first — fitted both ways.
   *
   * Both, because the chart's fit-method toggle must not wait on a server round trip and because
   * the fit is the service's arithmetic: a chart that refitted on a click would be a second copy of
   * it. The rows are identical in the two.
   */
  speed: Record<OfferedFitMethod, EraDivergence[]>
}

/**
 * One Race's rows, assessed whole and clipped to its window.
 *
 * A `ReadableRow` satisfies all three checks' own ports at once — the compass reads `CTW` and
 * `COG`, the Asymmetry reads `AWA (calc)` and Not Water-Referenced, the paddlewheel reads `STW`,
 * `SOG` and the exclusion reason — so the expensive half of the pipeline runs once per Race rather
 * than once per check.
 */
export function tuningRaceRows<Row extends TuningRow>(
  race: TuningRace<Row>
): TuningRaceRows<Row> {
  const quality = assessRowQuality(race.rows)
  const analysis = analysisRows(quality, detectManeuvers(race.rows, quality))

  return {
    race_id: race.race_id,
    window_start: race.window.window_start,
    rows: analysisRowsWithin(readableRows(race.rows, analysis), race.window),
  }
}

/**
 * The whole season, for all three charts.
 *
 * A Log with nothing in it yields one Era per channel over the whole archive, which is the state
 * the screen ships in and the correct failure ADR 0032 describes: until somebody records an act on
 * the boat there is one Era and, where the data steps, an unexplained shift in it.
 */
export function instrumentTuningSeason<Row extends TuningRow>(
  races: readonly TuningRace<Row>[],
  log: readonly CalibrationLogEntry[]
): InstrumentTuningSeason {
  const read = races.map(tuningRaceRows)
  const hdgEras = calibrationEras(log, 'HDG')

  const compass = read.map(raceHeadingOffset)
  const asymmetry = read.map(raceAwaAsymmetry)

  return {
    heading: headingOffsetByEra(hdgEras, compass),
    asymmetry: {
      // `calibrationEras([], 'AWA')` is one unbounded Era by construction, which is exactly "every
      // Race, whatever was done to the boat" — not a boundary invented to hold the season.
      season: eraAwaAsymmetry(calibrationEras([], 'AWA')[0], asymmetry),
      eras: awaAsymmetryByEra(calibrationEras(log, 'AWA'), asymmetry),
      compass_eras: awaAsymmetryByEra(hdgEras, asymmetry),
    },
    speed: {
      orthogonal: paddlewheelDivergence(speedRaces(races, read), log, { method: 'orthogonal' }),
      'sog-on-stw': paddlewheelDivergence(speedRaces(races, read), log, { method: 'sog-on-stw' }),
    },
  }
}

/**
 * The same Races in the shape the paddlewheel check asks for.
 *
 * It wants `sailed_at` where the other two want `window_start`, and it wants the not-Countable rows
 * too — they are what its blank-`STW` coverage stat is made of, so handing over only the Countable
 * ones would lose it.
 */
function speedRaces<Row extends TuningRow>(
  races: readonly TuningRace<Row>[],
  read: readonly TuningRaceRows<Row>[]
): Parameters<typeof paddlewheelDivergence>[0] {
  return read.map((race, index) => ({
    race_id: race.race_id,
    sailed_at: races[index].window.window_start,
    rows: race.rows,
  }))
}
