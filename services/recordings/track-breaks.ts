/**
 * Where a drawn track must break, and what bridges a **Dropout**: the walk every map in Layline
 * shares.
 *
 * Extracted from `raceTrackHeatmap` when the Dashboard's race thumbnail needed the same answer
 * (LAY-179). ADR 0014 obliges every map to mark a dead feed, and ADR 0033 found that ringing alone
 * leaves a clean track of a boat that was not transmitting — so the break, the ring and the
 * bridge with its duration are one obligation, and two copies of the walk that discharges it would
 * be two places for a map to quietly stop discharging it.
 *
 * Nothing here colours, scores or counts anything. It takes rows already assessed — the caller has
 * run `assessRowQuality` over the whole Transcription and clipped afterwards (ADR 0009) — and hands
 * back runs of joined fixes by row index, so each caller draws them in its own ink.
 */

import type { TrackProjection } from '@/services/recordings/track-projection'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { DropoutBridge, TrackRing } from '@/types'

/** What the walk reads of a row: where it was, whether it is a copy, and when. */
export interface BreakableRow {
  latitude: number | null
  longitude: number | null
  /** Row Quality's verdict: this row repeats the fix above it because the feed had died. */
  frozen: boolean
  row_time: string
}

/** One fix of a run, projected, with the index of the row it came from. */
export interface RunFix {
  index: number
  x: number
  y: number
}

export interface TrackBreaks {
  /**
   * Runs of fixes the track may join, in row order. A run of one is a real case — a feed that
   * surfaced for a single fix between two dropouts — and a caller must draw it as a point rather
   * than drop it, or that row is in the counts and nowhere on the map.
   */
  runs: RunFix[][]
  bridges: DropoutBridge[]
  rings: TrackRing[]
}

export function breakTrack(
  rows: readonly BreakableRow[],
  projection: TrackProjection
): TrackBreaks {
  const runs: RunFix[][] = []
  const rings: TrackRing[] = []
  const bridges: DropoutBridge[] = []

  /** The run in progress, or null where a break interrupted it. */
  let run: RunFix[] | null = null
  /** The last row either side of a Dropout: where the bridge starts, and when. */
  let before: { x: number; y: number; seconds: number; row_time: string } | null = null
  /** Rows of the Dropout being crossed. Zero outside one. */
  let frozenRun = 0

  const closeRun = (): void => {
    if (run !== null) runs.push(run)
    run = null
  }

  rows.forEach((row, index) => {
    const { latitude: lat, longitude: lon } = row

    if (row.frozen) {
      // A frozen row still has a position — it is the previous row's, verbatim — and ringing it is
      // the only way the run is visible at all. The track breaks here, so nothing draws a line
      // through water the boat may not have crossed.
      if (lat !== null && lon !== null) rings.push({ cx: projection.x(lon), cy: projection.y(lat) })
      frozenRun += 1
      closeRun()
      return
    }

    if (lat === null || lon === null) {
      // A missing fix is a break too, but it is not a Dropout and carries no duration claim: the
      // boat was somewhere and the file does not say where.
      closeRun()
      before = null
      frozenRun = 0
      return
    }

    const here = { index, x: projection.x(lon), y: projection.y(lat) }
    const seconds = wallClockSeconds(row.row_time)

    if (frozenRun > 0 && before !== null) {
      bridges.push({
        x1: before.x,
        y1: before.y,
        x2: here.x,
        y2: here.y,
        seconds: seconds - before.seconds,
        from: before.row_time,
        to: row.row_time,
        rows: frozenRun,
      })
    }

    if (run === null) run = []
    run.push(here)

    before = { x: here.x, y: here.y, seconds, row_time: row.row_time }
    frozenRun = 0
  })

  // The last run ends at the end of the window, which is a break like any other.
  closeRun()

  return { runs, bridges, rings }
}

/**
 * A **Dropout**'s duration, as a sailor would say it: `34s`, `7m`, `2h11`.
 *
 * Under 90 seconds reads in seconds, because `2m` for 91 seconds is a rounding a sailor would
 * notice on a gap they remember. Beyond an hour reads `h` and minutes, since `131m` is a number
 * nobody converts in their head on the rail.
 */
export function dropoutDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}
