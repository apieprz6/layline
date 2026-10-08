/**
 * Countable: whether a Recording Row may be read by a performance metric.
 *
 * One test for every consumer — Polar Efficiency, VMG Efficiency, the Sail Selection Chart, every
 * Instrument Tuning check and the Race Track Heatmap — so that no two of them can quietly disagree
 * about which rows a race is made of (ADR 0025). Computed, like the two axes it reads.
 */

import { sameRowOrder } from '@/services/analysis/maneuvers'
import { insideRaceWindow, raceWindowSeconds } from '@/services/recordings/race-window'
import type { RaceWindow } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { AnalysisRow, TranscriptionManeuvers, TranscriptionQuality } from '@/types'

/**
 * Not **Frozen**, not **Low-Speed**, and not inside a **Maneuver Window**.
 *
 * Three independent reasons a row fails, checked as one: a Frozen row's values are a copy, a
 * Low-Speed boat is not sailing, and a boat mid-turn or recovering is not in the steady state any
 * of these metrics measure. Which maneuver does not matter here — the tack/gybe/rounding split
 * exists for maneuver *cost*, and nothing reading this computes that. Not Water-Referenced is not
 * a reason: it says what the wind columns mean, not whether the boat was sailing.
 */
export function isCountable(row: Pick<AnalysisRow, 'quality' | 'maneuver_window'>): boolean {
  return !row.quality.frozen && !row.quality.low_speed && row.maneuver_window === null
}

/** The three reasons, in the order this module reads them. One row gets one of them. */
export type NotCountableReason = 'frozen' | 'low_speed' | 'maneuver_window'

/**
 * Which of the three reasons excluded this row, or null where none did.
 *
 * Here beside `isCountable` rather than in each check that wants it, for the same reason the
 * verdict itself is: a second copy of the order would be a second chance for two screens to
 * disagree about why a row was left out. A row may hold more than one reason — 48 of the archive's
 * are both Low-Speed and inside a Maneuver Window — and this answers with the first, which is also
 * the order the two counts the archive publishes were measured in (845 Frozen, then 90 Low-Speed).
 */
export function notCountableReason(
  row: Pick<AnalysisRow, 'quality' | 'maneuver_window'>
): NotCountableReason | null {
  if (row.quality.frozen) return 'frozen'
  if (row.quality.low_speed) return 'low_speed'
  if (row.maneuver_window !== null) return 'maneuver_window'
  return null
}

/**
 * Row Quality and Maneuvers joined row by row, with the Countable verdict beside them.
 *
 * Both must be computed over the same rows, in the same order — which in practice means both
 * over the whole Transcription, before any Race Window is applied. Anything else throws, because
 * a misaligned join would hand one row's maneuver to its neighbour.
 */
export function analysisRows(
  quality: TranscriptionQuality,
  maneuvers: TranscriptionManeuvers
): AnalysisRow[] {
  if (!sameRowOrder(quality.rows, maneuvers.rows)) {
    throw new Error('Row Quality and Maneuvers were computed over different rows')
  }

  return quality.rows.map((assessed, index) => {
    const window = maneuvers.rows[index].maneuver_window
    return {
      row_index: assessed.row_index,
      row_time: assessed.row_time,
      quality: assessed,
      maneuver_window: window,
      countable: isCountable({ quality: assessed, maneuver_window: window }),
    }
  })
}

/**
 * The rows inside a Race Window, out of rows already assessed over the whole recording.
 *
 * Assess first and filter here, in that order, for the same reason Row Quality does (ADR 0009):
 * a flip before the gun still has the boat recovering into the race's first rows, and clipping
 * first cannot see the flip that says so — nine rows of the archive, measured.
 *
 * The bounds question is `insideRaceWindow`'s, not this function's. That predicate exists because
 * several callers ask it, and a copy of `>=`/`<=` here would be one more chance to disagree about
 * the row on the gun.
 *
 * Generic in the row, so an `AnalysisRow` joined to anything — its channels, for the Instrument
 * Tuning checks — comes back out with that still attached rather than narrowed away.
 */
export function analysisRowsWithin<Row extends Pick<AnalysisRow, 'row_time'>>(
  rows: readonly Row[],
  window: RaceWindow
): Row[] {
  const seconds = raceWindowSeconds(window)

  return rows.filter((row) => insideRaceWindow(wallClockSeconds(row.row_time), seconds))
}
