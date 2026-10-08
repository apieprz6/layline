import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { polarTargets } from '@/services/analysis/polar-targets'
import type { CrossoverChartPayload, PolarPayload } from '@/types'

/**
 * Reading a Crossover Chart at a point the boat sailed.
 *
 * The chart holds a Sail Definition number, which is categorical, so it is floored and never
 * interpolated: there is no such thing as "35% Sail 6, 65% Sail 8" (ADR 0028). The axis below is
 * this boat's own thirteen columns, including the 25 that sits between 24 and 30 — confirmed
 * genuine, and where the A2 is retired before everything collapses to Reef + Jib 3 by 30.
 */

const CHART: CrossoverChartPayload = {
  twa_axis: [35, 40, 45, 90, 180],
  tws_axis: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30],
  cells: [
    [1, 1, 1, 2, 2, 4, 4, 5, 5, 5, 5, 5, 5],
    [1, 1, 1, 2, 2, 4, 4, 5, 5, 5, 5, 5, 5],
    [1, 1, 1, 1, 2, 2, 4, 3, 5, 5, 5, 5, 5],
    [6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 8, 9],
    [6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 8, 9],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 2, label: 'Main + Jib 2' },
    { number: 3, label: 'Main + Jib 2 + Staysail' },
    { number: 4, label: 'Main + Jib 3' },
    { number: 5, label: 'Main reefed + Jib 3' },
    { number: 6, label: 'Main + A2' },
    { number: 7, label: 'Main + A3' },
    { number: 8, label: 'Main + A3, reefed' },
    { number: 9, label: 'Main reefed + Jib 3' },
  ],
  source: {
    format: 'qtvlm-sailselect',
    header_token: 'TWA/TWS',
    definitions: {
      format: 'qtvlm-saildesc',
      filename: 'HandsomePete_2026.saildesc',
      content_sha256: 'a'.repeat(64),
    },
  },
}

const chart = crossoverLookup(CHART)

describe('crossoverLookup', () => {
  it('names the sail in the chart’s own words, not just its number', () => {
    // A Sail Definition's label is the only name a sail has in Layline (ADR 0023), and a bare
    // number names nothing.
    expect(chart.recommend(45, 18)).toEqual({
      definition: { number: 3, label: 'Main + Jib 2 + Staysail' },
      chart_twa: 45,
      chart_tws: 18,
    })
  })

  it('reads the chart whichever tack the boat is on', () => {
    // A recording's TWA is signed (ADR 0008); the chart's axis is one side of the boat.
    expect(chart.recommend(-45, 18)).toEqual(chart.recommend(45, 18))
  })

  describe('flooring on the wind-speed axis, never interpolating', () => {
    it('keeps a boat at 24.6 knots on the 24-knot recommendation', () => {
      // The case ADR 0028 rejected nearest-neighbour over. The columns are thresholds, not
      // samples, and 24.6 is not yet 25.
      expect(chart.recommend(90, 24.6)?.chart_tws).toBe(24)
      expect(chart.recommend(90, 24.6)?.definition.number).toBe(7)
    })

    it('keeps a boat at 27.5 knots on the 25-knot recommendation', () => {
      // Nearest-neighbour would round to 30 and retire a sail two and a half knots early.
      expect(chart.recommend(90, 27.5)?.chart_tws).toBe(25)
      expect(chart.recommend(90, 27.5)?.definition.number).toBe(8)
    })

    it('crosses over the moment the column does, and not before', () => {
      expect(chart.recommend(90, 24.999)?.definition.number).toBe(7)
      expect(chart.recommend(90, 25)?.definition.number).toBe(8)
    })

    it('names one Definition and never a blend of two', () => {
      // Halfway between the 12 and 14 knot columns at TWA 45, which name sails 2 and 2; halfway
      // between 16 and 18, which name 4 and 3. Both answers are one of the chart's own entries.
      expect(chart.recommend(45, 13)?.definition.number).toBe(2)
      expect(chart.recommend(45, 17)?.definition.number).toBe(4)
    })
  })

  describe('flooring on the angle axis the same way', () => {
    it('reads a boat at 44 degrees off the 40-degree row', () => {
      expect(chart.recommend(44, 18)?.chart_twa).toBe(40)
      expect(chart.recommend(44, 18)?.definition.number).toBe(5)
    })

    it('reads a boat past the last tabulated angle off that angle', () => {
      expect(chart.recommend(180, 4)?.chart_twa).toBe(180)
    })
  })

  describe('below either axis, where there is no recommendation at all', () => {
    it('gives a boat under the chart’s lowest column nothing', () => {
      // Four rows of this archive sit at 3.0-3.6 knots, under the chart's own first column. They
      // have no floor, so no recommendation, so no cell and nothing to have disagreed with
      // (ADR 0030). This is the same missing state as a Target Speed outside the Polar's range.
      expect(chart.recommend(90, 3.6)).toBeNull()
      expect(chart.recommend(90, 4)).not.toBeNull()
    })

    it('gives a boat pinching under the chart’s lowest angle nothing', () => {
      expect(chart.recommend(34, 12)).toBeNull()
      expect(chart.recommend(35, 12)).not.toBeNull()
    })
  })

  describe('above the top column, where a threshold is still a threshold', () => {
    it('keeps the top recommendation rather than reporting missing', () => {
      // The chart's last column is "everything has collapsed to Reef + Jib 3", which is still the
      // answer at 35 knots. It is the Polar whose domain ends: it interpolates, and above its last
      // column there is no bracket to interpolate inside.
      expect(chart.recommend(90, 35)?.chart_tws).toBe(30)
      expect(chart.recommend(90, 35)?.definition.number).toBe(9)
    })
  })

  describe('never resampled against the Polar, in either direction', () => {
    /** The certificate axis: nine columns, capped at 24 knots by ORC Rule 402.2. */
    const POLAR: PolarPayload = {
      twa_axis: [52, 90, 150],
      tws_axis: [4, 6, 8, 10, 12, 14, 16, 20, 24],
      boat_speed: [
        [3.98, 5.42, 6.32, 6.8, 7.02, 7.11, 7.16, 7.22, 7.2],
        [4.43, 5.95, 6.82, 7.26, 7.54, 7.72, 7.86, 8.2, 8.41],
        [3.05, 4.4, 5.52, 6.45, 7.06, 7.44, 7.81, 8.66, 10.34],
      ],
      source: { format: 'orc-pol', header_token: 'twa/tws' },
    }

    it('answers at a wind speed the Polar has no column for', () => {
      // 18 and 22 are the chart's own columns and no certificate measures them. Asking the chart
      // at 18 reads 18, and does not snap to the Polar's 16 or 20.
      expect(CHART.tws_axis).toContain(18)
      expect(POLAR.tws_axis).not.toContain(18)
      expect(chart.recommend(90, 18)?.chart_tws).toBe(18)
    })

    it('still has a recommendation where the Polar has no target at all', () => {
      // This boat's chart reaches 30 knots while its certificate stops at 24 — the gap is
      // structural. A cell at 25 or 30 shows a sail with no Target Speed to shade it by.
      const targets = polarTargets(POLAR)

      expect(chart.recommend(90, 27)).not.toBeNull()
      expect(targets.targetSpeed(90, 27)).toBeNull()
    })

    it('and the Polar still has a target where the chart has no recommendation', () => {
      // The gap runs both ways: the Polar's lightest column is 4 and the chart's first is 4 too,
      // but the chart's first *angle* is 35 while the certificate tabulates 30.
      const targets = polarTargets(POLAR)

      expect(chart.recommend(34, 10)).toBeNull()
      expect(targets.targetSpeed(60, 10)).not.toBeNull()
    })
  })

  it('reports missing rather than a number with no name, for a cell no definition covers', () => {
    // The payload gate refuses a dangling id on the way in, so this is a chart written before a
    // rule existed. Either way a sail number with no label names nothing.
    const dangling = crossoverLookup({
      ...CHART,
      sail_definitions: [{ number: 1, label: 'Main + Jib 1' }],
    })

    expect(dangling.recommend(35, 4)?.definition.label).toBe('Main + Jib 1')
    expect(dangling.recommend(35, 10)).toBeNull()
  })
})
