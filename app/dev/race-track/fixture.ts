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

import type { TrackAnnotationInput, TrackHeatmapRow } from '@/services/analysis/track-heatmap'
import type { CrossoverChartPayload, PolarPayload, RaceDetail, RaceTrack } from '@/types'

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

/**
 * What the sailor said, in the stamps this fixture's rows carry.
 *
 * Two sail changes and a sea state, placed on the beat and at the top mark, so the harness shows
 * Testimony sitting over the measurement — which is the thing only a browser can judge.
 */
export const HARNESS_TESTIMONY: TrackAnnotationInput[] = [
  { at: stamp(2), lane: 'sail', label: 'Main + Jib 1' },
  // Recorded a few seconds apart, so the two land on one fix — which is the collision the markers
  // have to survive, and the reason the second is lifted with a leader line back down.
  { at: stamp(26), lane: 'sea', label: 'Moderate' },
  { at: stamp(26), lane: 'sail', label: 'Main + A2' },
  { at: stamp(48), lane: 'sea', label: 'Rough' },
]

/**
 * A chart with one crossover, so the harness shows both verdicts.
 *
 * Jib 1 below 12 knots and Jib 3 above it. The fixture sails in 10 knots throughout and the sailor
 * recorded Jib 1 first and the A2 later, so the track reads as agreement up to the second sail
 * change and a difference after it.
 */
export const HARNESS_CHART: CrossoverChartPayload = {
  twa_axis: [40, 90, 135],
  tws_axis: [6, 12],
  cells: [
    [1, 3],
    [1, 3],
    [4, 3],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 3, label: 'Main + Jib 3' },
    { number: 4, label: 'Main + A2' },
  ],
}

/** The Sail Configurations the harness compares against that chart, in its own words. */
export const HARNESS_SAILS = [
  { at: stamp(2), definition_number: 1, label: 'Main + Jib 1' },
  { at: stamp(26), definition_number: 4, label: 'Main + A2' },
]

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

/**
 * The synthetic race as its own page states it: Testimony, coverage, findings and the track.
 *
 * Plausible rather than remarkable — two sail changes, two sea states, every Boat Setup pointer
 * set, a dropout in the Row Quality notes — because what the harness is for is the *layout* at a
 * width jsdom cannot have an opinion about, and a page of empty sections would not show it.
 */
export function harnessRace(track: RaceTrack): RaceDetail {
  return {
    id: 'harness-race',
    title: 'Harness race — synthetic',
    window_start: stamp(0),
    window_finish: stamp(74),
    recording: {
      id: 'harness-recording',
      filename: '07-11-26-harness.csv',
      first_row_time: stamp(0),
      last_row_time: stamp(74),
      source_columns: ['Date', 'Latitude', 'Longitude', 'COG', 'SOG', 'TWS', 'TWA'],
    },
    coverage: {
      window_seconds: 2250,
      lead_gap_seconds: 0,
      tail_gap_seconds: 0,
      live_seconds: 1830,
      frozen_seconds: 420,
      backwards_steps: 0,
      row_count: 75,
      median_interval_seconds: 30,
    },
    quality: {
      detector_version: 'harness',
      low_speed_sog_knots: 2,
      dropout_min_rows: 3,
      dropout_channels: ['latitude', 'longitude', 'cog', 'sog'],
      rows: [],
    },
    track,
    findings: [
      { severity: 'note', message: 'The feed was dead for 8 minutes in the middle of this window.' },
    ],
    annotations: {
      sails: [
        { at: stamp(2), definition_number: 1, label: 'Main + Jib 1', note: null },
        { at: stamp(26), definition_number: 4, label: 'Main + A2', note: null },
      ],
      sea_state: [
        { at: stamp(26), sea_state: 'moderate' },
        { at: stamp(48), sea_state: 'rough' },
      ],
    },
    boat_setup: {
      polar: { version_id: 'harness-polar', version_number: 3, effective_from: '2026-02-10' },
      crossover_chart: {
        version_id: 'harness-chart',
        version_number: 2,
        effective_from: '2026-01-15',
      },
      rig_tune: { version_id: 'harness-tune', version_number: 4, effective_from: '2026-04-20' },
      instrument_calibration: {
        version_id: 'harness-cal',
        version_number: 1,
        effective_from: '2026-03-02',
      },
      band: { band_id: 'harness-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
      logged_tws_mean: 10,
    },
  }
}
