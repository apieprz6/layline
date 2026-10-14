/**
 * A synthetic season for the Polar performance harness beside this file. Not production data.
 *
 * Three races in three winds, so the focus window has something to narrow: light air at 6 knots,
 * medium at 10 and fresher at 14, each sailed across a beat, a reach and a run with its speed
 * spread around the certificate's. A stretch of each is mid-manoeuvre, so the legend has sailing
 * to say is not drawn.
 *
 * Synthetic on purpose, for the reason `app/dev/race-track/fixture.ts` gives: the archive is
 * hand-entered through the finished UI and no local database holds one. What the figures *mean* is
 * pinned in Jest; this exists so a real browser has patches to tap and a slider to move.
 */

import type { ScorableRow } from '@/services/analysis/efficiency'
import { racePlottableRows } from '@/services/analysis/polar-plot'
import { polarTargets } from '@/services/analysis/polar-targets'
import type { AnalysisArchiveRace, MatchableRow, PolarPayload } from '@/types'

export const SEASON_POLAR_ID = 'harness-season-polar'

/**
 * A certificate whose ramp clears at a different angle in its lightest columns, so the family
 * behind the patches has the staircase floor the real one has.
 */
export const SEASON_POLAR: PolarPayload = {
  twa_axis: [30, 35, 40, 52, 70, 90, 120, 135, 150, 165],
  tws_axis: [4, 8, 12, 16, 20],
  boat_speed: [
    [1.1, 1.6, 2.1, 2.3, 2.4],
    [2.2, 3.2, 4.6, 5.0, 5.2],
    [3.3, 5.0, 5.7, 6.0, 6.2],
    [4.0, 5.6, 6.4, 6.7, 6.9],
    [4.4, 6.2, 7.0, 7.3, 7.5],
    [4.6, 6.5, 7.3, 7.7, 8.0],
    [4.4, 6.4, 7.4, 7.9, 8.3],
    [4.1, 6.1, 7.2, 7.9, 8.4],
    [3.6, 5.5, 6.7, 7.5, 8.1],
    [3.1, 4.8, 6.0, 6.9, 7.6],
  ],
}

const RACES_IN: { id: string; title: string; day: string; tws: number; pace: number }[] = [
  { id: 'harness-light', title: 'Light-air harness race', day: '2026-06-06', tws: 6, pace: 0.86 },
  { id: 'harness-medium', title: 'Medium-air harness race', day: '2026-07-04', tws: 10, pace: 0.95 },
  { id: 'harness-fresh', title: 'Fresh-air harness race', day: '2026-08-01', tws: 14, pace: 1.02 },
]

/** The angles each race sails, one leg after another: two beats, a reach and a run. */
const LEGS: { twa: number; rows: number; maneuver?: boolean }[] = [
  { twa: 42, rows: 14 },
  { twa: 42, rows: 3, maneuver: true },
  { twa: -46, rows: 14 },
  { twa: 95, rows: 10 },
  { twa: 140, rows: 3, maneuver: true },
  { twa: -145, rows: 14 },
]

/** 30 seconds a row from mid-afternoon, in the naive frame. Any stamp does for a harness. */
function stamp(day: string, index: number): string {
  const total = 14 * 3600 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${day}T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

export function seasonRows(): MatchableRow[] {
  const targets = polarTargets(SEASON_POLAR)

  return RACES_IN.flatMap((race) => {
    const rows: ScorableRow[] = []

    for (const leg of LEGS) {
      for (let step = 0; step < leg.rows; step += 1) {
        const index = rows.length
        // Two knots either side of the race's own wind, so a 2 kt window holds part of a race.
        const tws = race.tws + ((index % 5) - 2)
        const target = targets.targetSpeed(leg.twa, tws)?.knots ?? 5
        // A spread around this race's own pace, so the patches at one angle have a shape.
        const sog = target * (race.pace + ((index % 7) - 3) * 0.03)

        rows.push({
          row_index: index,
          row_time: stamp(race.day, index),
          sog: sog.toFixed(2),
          tws: tws.toFixed(1),
          twa: String(leg.twa),
          countable: leg.maneuver !== true,
        })
      }
    }

    const plottable = racePlottableRows(
      rows,
      { id: race.id, polar_version_id: SEASON_POLAR_ID },
      targets
    )

    return plottable.map((row, index) => ({
      ...row,
      day: race.day,
      day_seconds: 14 * 3600 + index * 30,
      sea_state: null,
      sail: { recorded: 'not-recorded' as const },
      crossover_chart_version_id: null,
    }))
  })
}

/** The three races as the rail's `when` popover names them, newest first. */
export function seasonRaces(rows: readonly MatchableRow[]): AnalysisArchiveRace[] {
  return [...RACES_IN].reverse().map((race) => ({
    id: race.id,
    title: race.title,
    day: race.day,
    seconds: rows
      .filter((row) => row.race_id === race.id)
      .reduce((total, row) => total + (row.interval_seconds ?? 0), 0),
  }))
}
