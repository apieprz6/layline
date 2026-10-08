/**
 * What the **Race Track Heatmap** draws, and what it refuses to colour.
 *
 * Three claims carry this suite, and each of them is a rule the map exists to keep:
 *
 * **Colour is spent only on the measurement.** A row that is not **Countable** is drawn, because
 * the boat was there, and carries no colour, because it supports no claim. The failure this
 * guards against is not a crash — it is a flattering percentage on a row the boat spent parked,
 * which looks exactly like a measurement.
 *
 * **A Filler-Anchored row is coloured *and* marked.** ADR 0036 replaced ADR 0033's uncoloured
 * dotted hairline with this: the row is real, only its yardstick is weak, so the doubt goes on the
 * number rather than in place of it.
 *
 * **A Dropout is ringed, broken and bridged.** Ringing alone discharges ADR 0014's obligation on
 * paper while leaving a clean track of a boat that was not transmitting — so the gap is a gap,
 * with its own duration on it.
 */

import {
  TRACK_BANDS,
  dropoutDuration,
  raceTrackHeatmap,
  trackBand,
  trackBandColour,
  type TrackHeatmapRow,
} from '@/services/analysis/track-heatmap'
import { polarTargets } from '@/services/analysis/polar-targets'
import type { Maneuver, PolarPayload } from '@/types'

/**
 * A grid whose lightest two angles are the certificate's own manufactured ramp.
 *
 * Rows 30 and 40 are each their own multiple of the base row in both columns, which is the
 * signature `classifyPolarCells` reads as filler; rows 50 and 60 are not, so they are measured. A
 * query bracketing 40 and 50 therefore touches one filler corner — which flags the whole value,
 * because a bracket with three real corners is not a safer unflagged one (ADR 0036).
 */
const POLAR: PolarPayload = {
  twa_axis: [30, 40, 50, 60],
  tws_axis: [8, 12],
  boat_speed: [
    [1, 1.5],
    [2, 3],
    [6, 7],
    [6.5, 7.5],
  ],
}

const TARGETS = polarTargets(POLAR)

/** 30-second cadence from 19:00, in the recording's own naive frame. Nothing builds a `Date`. */
function stamp(index: number): string {
  const total = 19 * 3600 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-06-03T${pad(Math.floor(total / 3600))}:${pad(
    Math.floor((total % 3600) / 60)
  )}:${pad(total % 60)}`
}

interface RowOptions {
  /** Degrees north of the venue, so a fixture can place a fix or withhold one. */
  north?: number
  frozen?: boolean
  low_speed?: boolean
  maneuver?: Maneuver | null
  /** Knots over the ground. 6.75 is exactly on target at TWA 55 in 10 knots. */
  sog?: string | null
  tws?: string | null
  twa?: string | null
  positioned?: boolean
}

/**
 * One row as the map reads it. **Countable** is composed here the way `analysisRows` composes it,
 * so a fixture cannot claim a frozen row is countable.
 */
function row(index: number, options: RowOptions = {}): TrackHeatmapRow {
  const {
    north = index * 0.001,
    frozen = false,
    low_speed = false,
    maneuver = null,
    sog = '6.75',
    tws = '10',
    twa = '55',
    positioned = true,
  } = options

  return {
    row_index: index,
    row_time: stamp(index),
    quality: {
      row_index: index,
      row_time: stamp(index),
      frozen,
      not_water_referenced: false,
      low_speed,
      gap_seconds: 30,
    },
    maneuver_window: maneuver,
    countable: !frozen && !low_speed && maneuver === null,
    latitude: positioned ? (41.85 + north).toFixed(6) : null,
    longitude: positioned ? (-87.55 + north).toFixed(6) : null,
    sog,
    tws,
    twa,
  }
}

describe('the seven-band diverging ramp', () => {
  it('centres on 100% with a neutral midpoint and one hue each side', () => {
    expect(TRACK_BANDS.map((band) => band.band)).toEqual([
      'below-3',
      'below-2',
      'below-1',
      'at',
      'above-1',
      'above-2',
      'above-3',
    ])
  })

  it('reads each band off its own upper edge, which belongs to the band above', () => {
    expect(trackBand(0.5)).toBe('below-3')
    expect(trackBand(0.8499)).toBe('below-3')
    expect(trackBand(0.85)).toBe('below-2')
    expect(trackBand(0.9799)).toBe('below-1')
    // 98–102% is one band, so a boat two percent either side of target reads as on it.
    expect(trackBand(0.98)).toBe('at')
    expect(trackBand(1.0)).toBe('at')
    expect(trackBand(1.0199)).toBe('at')
    expect(trackBand(1.02)).toBe('above-1')
    expect(trackBand(1.15)).toBe('above-3')
    expect(trackBand(4.8)).toBe('above-3')
  })

  it('names a token and never a hex, so the theme stays in charge', () => {
    // After dark `.theme-nightvision` collapses both arms onto one red depth ramp. A chart escaping
    // the theme is the one thing `globals.css` forbids, which is why nothing here knows a colour.
    expect(trackBandColour('below-2')).toBe('var(--track-below-2)')
    expect(trackBandColour('at')).toBe('var(--track-at)')
    // And never a wind-speed token: those mean an absolute speed, on the same screen (ADR 0033).
    expect(TRACK_BANDS.map((band) => trackBandColour(band.band)).join(' ')).not.toMatch(/--wind-/)
  })
})

describe('a race’s track, drawn', () => {
  it('draws every recorded row and colours only the ones a metric may read', () => {
    const rows = [
      row(0),
      row(1, { low_speed: true, sog: '1.1' }),
      row(2, { maneuver: 'tack' }),
      row(3),
      row(4),
    ]

    const heatmap = raceTrackHeatmap(rows, TARGETS)

    // Four legs between five fixes: nothing is dropped for being unscoreable, because the boat was
    // there for all of it.
    expect(heatmap?.segments).toHaveLength(4)
    expect(heatmap?.counts.rows).toBe(5)
    expect(heatmap?.counts.with_fix).toBe(5)
    expect(heatmap?.counts.scored).toBe(3)
    expect(heatmap?.counts.low_speed).toBe(1)
    expect(heatmap?.counts.maneuver_window).toBe(1)

    // The two excluded rows' legs carry no band, and the colour is not borrowed from a neighbour.
    expect(heatmap?.segments.map((segment) => segment.band)).toEqual([null, null, 'at', 'at'])
  })

  it('refuses a flattering percentage on a row the boat spent parked', () => {
    // A Low-Speed row with an SOG far above its target would read as 300% of target if the gate
    // were ignored — which is the failure this rule exists for, and it looks like a measurement.
    const heatmap = raceTrackHeatmap([row(0), row(1, { low_speed: true, sog: '20' })], TARGETS)

    // The leg into the parked row carries no band. The counts are per *row*, and row 0 is scored
    // while drawing no leg of its own — a race's first fix has nothing behind it to join.
    expect(heatmap?.segments[0].band).toBeNull()
    expect(heatmap?.counts.scored).toBe(1)
    expect(heatmap?.counts.low_speed).toBe(1)
    // Not counted as a row the Polar could not answer for, either: the Polar answered fine and
    // ADR 0025 is what excluded it.
    expect(heatmap?.counts.without_target).toBe(0)
  })

  it('colours a Filler-Anchored row by its own percent and marks it', () => {
    // TWA 45 brackets the certificate's manufactured row 40 and its measured row 50, so the target
    // is computed, shown, and flagged (ADR 0036). Under the row-level floor this row read as "no
    // data" for a stretch of water the boat really sailed.
    const rows = [row(0, { twa: '45' }), row(1, { twa: '45' })]

    const heatmap = raceTrackHeatmap(rows, TARGETS)

    expect(heatmap?.segments[0].filler_anchored).toBe(true)
    expect(heatmap?.segments[0].band).not.toBeNull()
    expect(heatmap?.counts.scored).toBe(2)
    expect(heatmap?.counts.filler_anchored).toBe(2)
  })

  it('leaves a fully measured row unmarked, so the two still read apart', () => {
    const heatmap = raceTrackHeatmap([row(0), row(1)], TARGETS)

    expect(heatmap?.segments[0].filler_anchored).toBe(false)
    expect(heatmap?.counts.filler_anchored).toBe(0)
  })

  it('draws a row the Polar cannot answer for as an absence of colour, never as a value', () => {
    // Past the TWA axis: an ORC certificate structurally stops, the boat does not, and a race in
    // 27 knots has no Target Speed rather than a flattering guess at one (ADR 0028).
    const rows = [row(0), row(1, { tws: '40' }), row(2)]

    const heatmap = raceTrackHeatmap(rows, TARGETS)

    expect(heatmap?.segments[0].band).toBeNull()
    expect(heatmap?.counts.without_target).toBe(1)
    expect(heatmap?.counts.scored).toBe(2)
  })

  it('colours nothing when the race records no Polar, and blames the certificate for none of it', () => {
    const heatmap = raceTrackHeatmap([row(0), row(1), row(2)], null)

    expect(heatmap?.segments.every((segment) => segment.band === null)).toBe(true)
    expect(heatmap?.counts.scored).toBe(0)
    expect(heatmap?.counts.without_target).toBe(0)
  })

  it('accounts for every row it was given, in one tally each', () => {
    // ADR 0025's coverage requirement: a row that left the figure and is tallied nowhere is a
    // silent omission, which is the one thing a count like this exists to prevent.
    const rows = [
      row(0),
      row(1, { frozen: true }),
      row(2, { frozen: true }),
      row(3, { frozen: true }),
      row(4, { low_speed: true }),
      row(5, { maneuver: 'gybe' }),
      row(6, { tws: '40' }),
      row(7),
    ]

    const counts = raceTrackHeatmap(rows, TARGETS)?.counts

    expect(counts).toEqual({
      rows: 8,
      with_fix: 8,
      scored: 2,
      filler_anchored: 0,
      frozen: 3,
      low_speed: 1,
      maneuver_window: 1,
      without_target: 1,
    })
    const tallied =
      (counts?.scored ?? 0) +
      (counts?.frozen ?? 0) +
      (counts?.low_speed ?? 0) +
      (counts?.maneuver_window ?? 0) +
      (counts?.without_target ?? 0)
    expect(tallied).toBe(counts?.rows)
  })

  it('draws the frame it was asked for, not the shape of the track', () => {
    const heatmap = raceTrackHeatmap([row(0), row(1)], TARGETS, {
      width: 200,
      height: 100,
      pad: 4,
    })

    expect(heatmap?.width).toBe(200)
    expect(heatmap?.height).toBe(100)
  })

  it('says nothing at all where the window holds no position', () => {
    const rows = [row(0, { positioned: false }), row(1, { positioned: false })]

    // Null rather than an empty heatmap, which a caller could render as a map of a race nobody can
    // see. A recording with no fixes must say so in words (ADR 0033).
    expect(raceTrackHeatmap(rows, TARGETS)).toBeNull()
  })

  it('counts a row with no position as drawn nowhere, and still counts it', () => {
    const rows = [row(0), row(1, { positioned: false }), row(2)]

    const heatmap = raceTrackHeatmap(rows, TARGETS)

    expect(heatmap?.counts.rows).toBe(3)
    expect(heatmap?.counts.with_fix).toBe(2)
    // The missing fix breaks the line: nothing joins the fixes either side of a position the file
    // never gave.
    expect(heatmap?.segments).toHaveLength(0)
  })
})

describe('a Dropout on the map', () => {
  /** Rows 2, 3 and 4 repeat row 1's position: a dead feed in the middle of a race. */
  const WITH_DROPOUT = [
    row(0),
    row(1),
    row(2, { frozen: true, north: 0.001 }),
    row(3, { frozen: true, north: 0.001 }),
    row(4, { frozen: true, north: 0.001 }),
    row(5),
    row(6),
  ]

  it('rings every frozen row and breaks the track into and out of the run', () => {
    const heatmap = raceTrackHeatmap(WITH_DROPOUT, TARGETS)

    expect(heatmap?.rings).toHaveLength(3)
    // Three rings on one position, which is the finding that forced the bridge: a frozen run
    // repeats one fix, so the rings stack into a single pixel.
    expect(new Set(heatmap?.rings.map((ring) => `${ring.cx},${ring.cy}`)).size).toBe(1)
    // Two legs: 0→1 before the run and 5→6 after it. Nothing is drawn across the gap, so the
    // boat's silence is visible as absence rather than as a straight line.
    expect(heatmap?.segments).toHaveLength(2)
  })

  it('bridges the gap with the duration the recording measured and the rows it holds', () => {
    const heatmap = raceTrackHeatmap(WITH_DROPOUT, TARGETS)

    expect(heatmap?.bridges).toHaveLength(1)
    // Row 1 to row 5 at a 30-second cadence. Measured between the fixes either side, never
    // assumed from a cadence.
    expect(heatmap?.bridges[0].seconds).toBe(120)
    expect(heatmap?.bridges[0].rows).toBe(3)
    // And it spans the two real fixes, not the repeated one.
    expect(heatmap?.bridges[0].x1).not.toBe(heatmap?.bridges[0].x2)
  })

  it('makes no duration claim across a missing fix, which is a break and not a Dropout', () => {
    // A track can break because the fix was absent as well as because the feed died, and only one
    // of those is a gap anybody can state the length of.
    const rows = [row(0), row(1, { positioned: false }), row(2)]

    expect(raceTrackHeatmap(rows, TARGETS)?.bridges).toHaveLength(0)
  })

  it('bridges nothing where the run has no fix on one side of it', () => {
    // A dropout that began before the gun has nothing in the window to bridge from, and inventing
    // a start for it would assert a course the recording never recorded.
    const rows = [row(0, { frozen: true }), row(1, { frozen: true }), row(2), row(3)]

    const heatmap = raceTrackHeatmap(rows, TARGETS)

    expect(heatmap?.rings).toHaveLength(2)
    expect(heatmap?.bridges).toHaveLength(0)
  })
})

describe('a Dropout’s duration, as a sailor would say it', () => {
  it('reads in seconds until a minute is the honest unit', () => {
    expect(dropoutDuration(34)).toBe('34s')
    expect(dropoutDuration(89)).toBe('89s')
  })

  it('reads in minutes, then in hours and minutes', () => {
    expect(dropoutDuration(90)).toBe('2m')
    expect(dropoutDuration(420)).toBe('7m')
    expect(dropoutDuration(3420)).toBe('57m')
    expect(dropoutDuration(7860)).toBe('2h11')
    // Padded, so `2h5` cannot be read as five minutes past two hours or as two and a half.
    expect(dropoutDuration(7500)).toBe('2h05')
  })
})
