/**
 * The **Polar Plot**'s arithmetic (ADR 0040), pinned where an obvious implementation goes wrong:
 *
 *   - a patch is `sumEfficiency` over its own rows, so the patches add up to the headline;
 *   - the focus window is the same width at every centre, which stepping the certificate's own
 *     columns was not;
 *   - the certificate behind the sailing is the columns it was *scored against*, each changing ink
 *     where its own cells stop being measured;
 *   - what is not drawn is stated in time, by reason, and adds up.
 */

import { sumEfficiency } from '@/services/analysis/efficiency'
import {
  DEFAULT_FOCUS,
  FOCUS_WIDTHS,
  aggregateKnots,
  aggregateTargetKnots,
  certificateFamily,
  clampCentre,
  familiesFor,
  familyColumns,
  focusRange,
  focusWindow,
  inFocus,
  plotMoments,
  plotPatches,
  familyKnots,
  rimKnots,
  racePolarPlot,
  seasonTrace,
  timeNotDrawn,
  type PlottableRow,
} from '@/services/analysis/polar-plot'
import { polarTargets } from '@/services/analysis/polar-targets'
import type { PolarPayload } from '@/types'

/**
 * A certificate whose ramp clears at a different angle in each column — the shape of this boat's
 * own, small enough to read.
 *
 * At 4 kt the 30/35/40 rows are 1×, 2×, 3× the seed: all three are filler, first real angle 52.
 * At 8 kt only 30 and 35 are on the ramp (5.0 is not 4.5): first real angle 40.
 * At 12 kt the 35 row is not twice the 30, so there is no ramp at all.
 */
const POLAR: PolarPayload = {
  twa_axis: [30, 35, 40, 52, 90, 135],
  tws_axis: [4, 8, 12],
  boat_speed: [
    [1, 1.5, 2],
    [2, 3, 4.4],
    [3, 5, 5.6],
    [3.9, 5.6, 6.4],
    [4.6, 6.8, 7.6],
    [4.2, 6.4, 7.4],
  ],
}

let next = 0

function row(over: Partial<PlottableRow> & { target?: number | null; filler?: boolean }): PlottableRow {
  next += 1
  const sog = over.sog === undefined ? 6 : over.sog
  const target = over.target === undefined ? 6 : over.target

  return {
    race_id: over.race_id ?? 'race-a',
    row_index: over.row_index ?? next,
    tws: over.tws === undefined ? 10 : over.tws,
    twa: over.twa === undefined ? 52 : over.twa,
    countable: over.countable ?? true,
    interval_seconds: over.interval_seconds === undefined ? 30 : over.interval_seconds,
    sog,
    polar_version_id: over.polar_version_id === undefined ? 'polar-1' : over.polar_version_id,
    efficiency: {
      row_index: next,
      target_speed: target === null ? null : { knots: target, filler_anchored: over.filler ?? false },
      polar_efficiency: target === null || target <= 0 || sog === null ? null : sog / target,
      vmg_zone: 'upwind',
      vmg: sog,
      target_vmg: null,
      vmg_efficiency: null,
    },
  }
}

describe('patches', () => {
  const rows = [
    row({ twa: 41, sog: 5.2, target: 5.5, interval_seconds: 120 }),
    row({ twa: -43, sog: 5.4, target: 5, interval_seconds: 30, race_id: 'race-b', filler: true }),
    row({ twa: 44.9, sog: 5.49, target: 6, interval_seconds: 60 }),
    row({ twa: 52, sog: 5.5, target: 5.8, interval_seconds: 45 }),
    row({ twa: 140, sog: 7.1, target: 7, interval_seconds: 300 }),
    row({ twa: 180, sog: 6, target: 6.5, interval_seconds: 20 }),
    // Not drawn, and so in no patch and in no sum.
    row({ twa: 41, sog: 5.2, countable: false }),
    row({ twa: 41, sog: 5.2, target: null }),
    row({ twa: 41, sog: 5.2, interval_seconds: null }),
  ]

  it('bins the plane at 5° by half a knot, folding port onto starboard', () => {
    const patches = plotPatches(rows)

    expect(patches.map((patch) => patch.key)).toEqual(['40|5', '50|5.5', '140|7', '175|6'])
    // Port and starboard share a patch: the Polar's angle axis is one side of the boat.
    expect(patches[0].races).toBe(2)
    expect(patches[0].efficiency.rows).toBe(3)
  })

  it('makes each patch sumEfficiency over exactly the rows in it', () => {
    const patches = plotPatches(rows)
    const first = sumEfficiency(rows.slice(0, 3))

    expect(patches[0].efficiency).toEqual(first)
    expect(patches[0].efficiency.filler_anchored_rows).toBe(1)
  })

  it('adds up, across every patch, to the figure over the same rows', () => {
    const patches = plotPatches(rows)
    const whole = sumEfficiency(rows)
    const actual = patches.reduce((total, patch) => total + patch.efficiency.actual_distance_nm, 0)
    const target = patches.reduce((total, patch) => total + patch.efficiency.target_distance_nm, 0)
    const seconds = patches.reduce((total, patch) => total + patch.efficiency.elapsed_seconds, 0)

    expect(actual).toBeCloseTo(whole.actual_distance_nm, 10)
    expect(target).toBeCloseTo(whole.target_distance_nm, 10)
    expect(seconds).toBe(whole.elapsed_seconds)
    expect(actual / target).toBeCloseTo(whole.polar_efficiency ?? NaN, 10)
  })

  it('reads a patch’s speed and target out of the same sums its percent comes from', () => {
    const [first] = plotPatches(rows)
    const seconds = 120 + 30 + 60

    expect(aggregateKnots(first.efficiency)).toBeCloseTo((5.2 * 120 + 5.4 * 30 + 5.49 * 60) / seconds)
    expect(aggregateTargetKnots(first.efficiency)).toBeCloseTo((5.5 * 120 + 5 * 30 + 6 * 60) / seconds)
  })
})

describe('moments', () => {
  it('draws one dot per row the figures sum, each with its own interval and its own verdict', () => {
    const moments = plotMoments([
      row({ row_index: 7, twa: -48, sog: 5, target: 4, tws: 9, filler: true, interval_seconds: 12 }),
      row({ countable: false }),
    ])

    expect(moments).toEqual([
      {
        race_id: 'race-a',
        row_index: 7,
        twa: -48,
        tws: 9,
        sog: 5,
        target_knots: 4,
        polar_efficiency: 1.25,
        filler_anchored: true,
        seconds: 12,
      },
    ])
  })
})

describe('the focus window', () => {
  it('is the same width at every centre the slider can reach', () => {
    const range = focusRange([POLAR])!
    for (const width of FOCUS_WIDTHS) {
      for (let centre = range.from; centre <= range.to; centre += 1) {
        const window = focusWindow(centre, width)
        expect(window.high - window.low).toBe(width)
        expect((window.high + window.low) / 2).toBe(centre)
      }
    }
  })

  it('opens at 10 knots ± 2', () => {
    expect(focusWindow(DEFAULT_FOCUS.centre, DEFAULT_FOCUS.width)).toEqual({ low: 8, high: 12 })
  })

  it('holds its low edge and not its high one, so neighbouring windows never share a row', () => {
    const rows = [row({ tws: 8 }), row({ tws: 11.99 }), row({ tws: 12 }), row({ tws: null })]
    expect(inFocus(rows, focusWindow(10, 4)).map((each) => each.tws)).toEqual([8, 11.99])
  })

  it('travels the certificate’s own range, in whole knots', () => {
    expect(focusRange([POLAR])).toEqual({ from: 4, to: 12 })
    expect(focusRange([POLAR, { ...POLAR, tws_axis: [6, 8, 20.5] }])).toEqual({ from: 4, to: 20 })
    expect(focusRange([])).toBeNull()
    expect(clampCentre(10, { from: 4, to: 8 })).toBe(8)
    expect(clampCentre(2.4, { from: 4, to: 8 })).toBe(4)
  })
})

describe('the certificate family', () => {
  it('draws the columns the moments were scored against, and no others', () => {
    expect(familyColumns(POLAR, [8])).toEqual([8])
    expect(familyColumns(POLAR, [9])).toEqual([8, 12])
    expect(familyColumns(POLAR, [5, 9, 11])).toEqual([4, 8, 12])
    // Past the axis there is no target, so nothing to draw it against (ADR 0028).
    expect(familyColumns(POLAR, [3, 14])).toEqual([])
  })

  it('changes ink where each column’s own cells stop being measured: a staircase', () => {
    const family = certificateFamily(POLAR, [5, 9])
    const inkOf = (tws: number): [boolean, number, number][] =>
      family
        .find((curve) => curve.tws === tws)!
        .runs.map((run) => [
          run.filler_anchored,
          run.points[0].twa,
          run.points[run.points.length - 1].twa,
        ])

    // The leg into the first measured angle is still read through filler, so it is stitched.
    expect(inkOf(4)).toEqual([
      [true, 30, 52],
      [false, 52, 135],
    ])
    expect(inkOf(8)).toEqual([
      [true, 30, 40],
      [false, 40, 135],
    ])
    expect(inkOf(12)).toEqual([[false, 30, 135]])
  })

  it('reads each point through targetSpeed, so it is the certificate’s own figure at that cell', () => {
    const [curve] = certificateFamily(POLAR, [12])
    expect(curve.runs[0].points.map((point) => point.knots)).toEqual([2, 4.4, 5.6, 6.4, 7.6, 7.4])
  })

  it('breaks a column where the Polar has nothing, rather than bridging it', () => {
    const holed: PolarPayload = { ...POLAR, boat_speed: POLAR.boat_speed.map((speeds, index) => (index === 4 ? [0, 0, 0] : speeds)) }
    const [curve] = certificateFamily(holed, [12])

    expect(curve.runs.map((run) => run.points.map((point) => point.twa))).toEqual([[30, 35, 40, 52]])
  })

  it('reads each Polar Version’s family off that Version, for the rows scored against it', () => {
    const later: PolarPayload = { ...POLAR, tws_axis: [6, 10, 14] }
    const families = familiesFor(
      [
        row({ tws: 8, polar_version_id: 'polar-1' }),
        row({ tws: 10, polar_version_id: 'polar-2' }),
        row({ tws: 12, polar_version_id: null, target: null }),
        // Not drawn, so it brings no column with it.
        row({ tws: 4, polar_version_id: 'polar-1', countable: false }),
      ],
      { 'polar-1': POLAR, 'polar-2': later }
    )

    expect(families.map((family) => [family.version_id, family.curves.map((curve) => curve.tws)])).toEqual([
      ['polar-1', [8]],
      ['polar-2', [10]],
    ])
  })
})

describe('the rim', () => {
  it('can be fitted to the columns a picture draws, rather than the whole certificate', () => {
    // The teaser draws only the columns the sailing was scored against. Its rim from the whole
    // Polar would be set by the 12 kt column's 7.6 kt reach, which a 5 kt afternoon never draws —
    // so the drawing would sit inside a ring nothing reaches.
    const families = familiesFor([row({ tws: 4, polar_version_id: 'polar-1', sog: 3 })], {
      'polar-1': POLAR,
    })

    expect(Math.max(...familyKnots(families))).toBe(4.6)
    expect(rimKnots(plotMoments([row({ tws: 4, sog: 3 })]), [], familyKnots(families))).toBe(6)
    expect(rimKnots(plotMoments([row({ tws: 4, sog: 3 })]), [POLAR])).toBe(8)
  })

  it('still clears the fastest moment, so no speed is drawn slower than it was', () => {
    // A moment past every drawn column still sets the rim: fitting it to the certificate never
    // clamps the sailing down.
    const families = familiesFor([row({ tws: 4, polar_version_id: 'polar-1' })], { 'polar-1': POLAR })

    expect(rimKnots(plotMoments([row({ tws: 4, sog: 9 })]), [], familyKnots(families))).toBeGreaterThan(9)
  })
})

describe('the season trace', () => {
  it('sums ten-degree slices, so its speed and its percent are one aggregate read twice', () => {
    const trace = seasonTrace([
      row({ twa: 41, sog: 6, target: 6, interval_seconds: 300 }),
      row({ twa: -49, sog: 3, target: 6, interval_seconds: 60 }),
      row({ twa: 141, sog: 7, target: 7, interval_seconds: 60 }),
      row({ twa: 141, countable: false }),
    ])

    expect(trace.map((bin) => bin.twa)).toEqual([40, 140])
    expect(trace[0].knots).toBeCloseTo((6 * 300 + 3 * 60) / 360)
    expect(trace[0].polar_efficiency).toBeCloseTo((6 * 300 + 3 * 60) / (6 * 360))
    expect(trace[0].seconds).toBe(360)
  })
})

describe('time not drawn', () => {
  it('says how much sailing is on no picture, in time, by reason, largest first', () => {
    const undrawn = timeNotDrawn([
      row({ interval_seconds: 600 }),
      row({ countable: false, interval_seconds: 90 }),
      row({ countable: false, interval_seconds: 30 }),
      row({ polar_version_id: null, target: null, interval_seconds: 300 }),
      row({ tws: null, target: null, interval_seconds: 20 }),
      row({ sog: null, interval_seconds: 5 }),
      row({ twa: 20, target: null, interval_seconds: 40 }),
      // A ramp meeting 0°: a target, and no colour any percent of it could mean.
      row({ twa: 0, target: 0, interval_seconds: 7 }),
      // No measured span, so no amount of sailing to state.
      row({ countable: false, interval_seconds: null }),
    ])

    expect(undrawn).toEqual({
      seconds: 120 + 300 + 25 + 40 + 7,
      parts: [
        { reason: 'no_polar', seconds: 300 },
        { reason: 'not_countable', seconds: 120 },
        { reason: 'off_the_certificate', seconds: 40 },
        { reason: 'no_reading', seconds: 25 },
        { reason: 'zero_target', seconds: 7 },
      ],
    })
  })

  it('is nothing at all where every row is drawn', () => {
    expect(timeNotDrawn([row({}), row({})])).toEqual({ seconds: 0, parts: [] })
  })
})

describe('one Race', () => {
  const targets = polarTargets(POLAR)
  const at = (seconds: number): string =>
    `2026-07-11T14:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const transcription = [
    { row_index: 0, row_time: at(0), sog: '5.0', tws: '9', twa: '52', countable: true },
    { row_index: 1, row_time: at(30), sog: '5.2', tws: '9', twa: '-52', countable: false },
    { row_index: 2, row_time: at(40), sog: '6.0', tws: '9', twa: '90', countable: true },
    { row_index: 3, row_time: at(100), sog: '6.1', tws: '9', twa: '90', countable: true },
  ]

  it('measures and scores the window the way the season does, then draws only what it sums', () => {
    const plot = racePolarPlot(transcription, { id: 'race-a', polar_version_id: 'polar-1' }, POLAR, targets)

    // Each moment lasts until the next row in the window, whatever that row's own verdict.
    expect(plot.moments.map((moment) => [moment.row_index, moment.seconds])).toEqual([
      [0, 30],
      [2, 60],
    ])
    expect(plot.moments[0].target_knots).toBeCloseTo(targets.targetSpeed(52, 9)!.knots)
    // The manoeuvre is drawn nowhere and said; the last row lasted no measured span at all.
    expect(plot.undrawn).toEqual({ seconds: 10, parts: [{ reason: 'not_countable', seconds: 10 }] })
    expect(plot.polar).toBe(POLAR)
  })
})
