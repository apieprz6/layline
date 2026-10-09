/**
 * A synthetic race for the browser test harness beside this file. Not production data.
 *
 * Eighty rows of a beat up Lake Michigan and back down, with every state the **Race Track
 * Heatmap** draws in it: scored rows across the ramp, a run of **Low-Speed** rows, a
 * **Maneuver Window**, a **Dropout** long enough to bridge and label, and a stretch sailed at an
 * angle the grid below only answers out of its own filler.
 *
 * Synthetic on purpose. The owner's thirteen recordings are not in this repo and are not in any
 * local database — the archive is hand-entered through the finished UI, so there is no race for a
 * browser to open. What the figures *mean* is pinned against the real archive in
 * `services/analysis/__tests__/archive-track-heatmap.test.ts`; this file exists only so a real
 * browser has a track to zoom.
 */

import type { TrackHeatmapRow } from '@/services/analysis/track-heatmap'
import type { PolarPayload } from '@/types'

/**
 * A grid whose lightest two angles are a manufactured ramp, so a row sailed at 45° is
 * **Filler-Anchored** and a row sailed at 55° is not.
 *
 * The same shape as the certificate's own ramp, which `polarSyntheticRows.ts` detects by each
 * cell being its own multiple of the base row.
 */
export const HARNESS_POLAR: PolarPayload = {
  twa_axis: [30, 40, 50, 60, 90, 135],
  tws_axis: [8, 12],
  boat_speed: [
    [1, 1.5],
    [2, 3],
    [6, 7],
    [6.5, 7.5],
    [7.2, 8.1],
    [6.8, 7.6],
  ],
}

/** The venue: COLYC's race circle, 2.5nm off Navy Pier. */
const LAT = 41.8528333
const LON = -87.5568333

/**
 * 30 seconds a row, in the recording's own naive frame. Nothing here builds a `Date`.
 *
 * A Saturday afternoon, deliberately: Layline assumes no schedule, and a fixture starting at 19:00
 * on a Wednesday would put the weeknight series into a file in the app tree as if it were the
 * frame (AGENTS.md). Any stamp does for a harness.
 */
function stamp(index: number): string {
  const total = 14 * 3600 + 20 * 60 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-07-11T${pad(Math.floor(total / 3600))}:${pad(
    Math.floor((total % 3600) / 60)
  )}:${pad(total % 60)}`
}

interface Leg {
  rows: number
  /** Degrees of latitude and longitude travelled per row. */
  north: number
  east: number
  twa: string
  /** Knots over the ground, which against a 6.75-knot target spreads the rows across the ramp. */
  sog: string
  state?: 'frozen' | 'low-speed' | 'maneuver'
  /**
   * Where the feed came back, applied once at this leg's first row.
   *
   * What a real **Dropout** looks like: the boat kept sailing while the instruments repeated one
   * fix, so the next position it reports is a long way from the last one. That gap is the thing
   * the **Dropout Bridge** spans, and without the jump the bridge would be a few pixels long and
   * the harness would not show the feature it exists to show.
   */
  jump?: { north: number; east: number }
}

/** The course: two beats, a run, a parked stretch, a tack and a dead feed in the middle. */
const COURSE: Leg[] = [
  { rows: 12, north: 0.0006, east: 0.0004, twa: '55', sog: '6.9' },
  { rows: 3, north: 0.0002, east: 0.0002, twa: '55', sog: '5.4', state: 'maneuver' },
  { rows: 10, north: 0.0006, east: -0.0004, twa: '-52', sog: '6.2' },
  // Sailed tighter than the grid can measure: coloured by its own percent, and marked.
  { rows: 8, north: 0.0005, east: -0.0002, twa: '45', sog: '4.6' },
  // The feed dies for seven minutes across water the recording never recorded.
  { rows: 14, north: 0, east: 0, twa: '45', sog: '4.6', state: 'frozen' },
  {
    rows: 10,
    north: -0.0008,
    east: 0.0006,
    twa: '135',
    sog: '7.4',
    jump: { north: 0.004, east: 0.006 },
  },
  { rows: 6, north: -0.0001, east: 0.0001, twa: '135', sog: '0.8', state: 'low-speed' },
  { rows: 12, north: -0.0007, east: 0.0005, twa: '90', sog: '8.6' },
]

/**
 * The course the leg is actually drawn on, in degrees true, so the `COG` overlay agrees with the
 * shape of the track rather than contradicting it.
 *
 * A frozen leg goes nowhere, and a course from a zero-length step would be an invented bearing, so
 * it reports the one it held before stalling — which is what a dead feed does anyway: repeat.
 */
function courseOf(leg: Leg): string {
  if (leg.north === 0 && leg.east === 0) return '45'
  const degrees = (Math.atan2(leg.east, leg.north) * 180) / Math.PI
  return String(Math.round((degrees + 360) % 360))
}

export function harnessRows(): TrackHeatmapRow[] {
  const rows: TrackHeatmapRow[] = []
  let lat = LAT
  let lon = LON

  for (const leg of COURSE) {
    if (leg.jump) {
      lat += leg.jump.north
      lon += leg.jump.east
    }

    for (let step = 0; step < leg.rows; step += 1) {
      const index = rows.length
      const frozen = leg.state === 'frozen'

      // A frozen row repeats the previous row's position verbatim, which is why ringing it is the
      // only way the run is visible at all.
      if (!frozen) {
        lat += leg.north
        lon += leg.east
      }

      rows.push({
        row_index: index,
        row_time: stamp(index),
        quality: {
          row_index: index,
          row_time: stamp(index),
          frozen,
          not_water_referenced: false,
          low_speed: leg.state === 'low-speed',
          gap_seconds: 30,
        },
        maneuver_window: leg.state === 'maneuver' ? 'tack' : null,
        countable: !frozen && leg.state !== 'low-speed' && leg.state !== 'maneuver',
        latitude: lat.toFixed(6),
        longitude: lon.toFixed(6),
        sog: leg.sog,
        cog: courseOf(leg),
        tws: '10',
        twa: leg.twa,
      })
    }
  }

  return rows
}
