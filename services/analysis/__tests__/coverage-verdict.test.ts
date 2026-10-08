/**
 * The **coverage verdict**: how much a figure rests on, never how bad the instrument is.
 *
 * ADR 0034 retired ADR 0032's σ band because the race-to-race scatter it divided by was mostly
 * heading mix — a fact about which courses were sailed, not about how well anything was measured.
 * What replaces it is an axis, not a cut-point, so these tests are written against the boundaries
 * rather than against the archive's own numbers: the constants are provisional and expected to
 * move, and a test that pinned `SOLID` to today's 24-of-36 would fail for the right reason the day
 * the owner sails one more Race.
 */

import {
  ASYMMETRY_SOLID_PAIRS,
  ASYMMETRY_THIN_PAIRS,
  SOLID_SHARE,
  THIN_SHARE,
  asymmetryCoverage,
  headingCoverage,
  speedCoverage,
} from '@/services/analysis/coverage-verdict'
import type { EraDivergence, RaceDivergence } from '@/services/analysis/paddlewheel'
import type {
  CalibrationEra,
  EraAsymmetryFigure,
  EraAwaAsymmetry,
  EraHeadingOffset,
  PairedPointOfSail,
} from '@/types'

const ERA: CalibrationEra = {
  key: 'HDG:opening',
  channel: 'HDG',
  from_date: null,
  until_date: null,
  opened_by: [],
}

/** An `HDG` Era carrying nothing but the one figure the verdict reads. */
function headingEra(headings_on_two_or_more_races: number): EraHeadingOffset {
  return {
    era: { ...ERA },
    bins: [],
    swing: null,
    mean_of_bins_deg: null,
    mean_of_races_deg: null,
    race_count: 3,
    headings_covered: headings_on_two_or_more_races,
    headings_on_two_or_more_races,
    heading_bin_count: 36,
    races: [],
    excluded: [],
    caveat: 'measured through CTW',
  }
}

function figure(point_of_sail: PairedPointOfSail, pair_count: number): EraAsymmetryFigure {
  return {
    point_of_sail,
    asymmetry_deg: -5.5,
    wider_tack: 'port',
    wider_by_deg: 11,
    held_deg: { starboard: 34, port: 45 },
    pair_count,
    caveat: 'not a Measured Offset',
    race_count: 2,
    race_figures: [],
  }
}

function asymmetryEra(upwind: number | null, downwind: number | null): EraAwaAsymmetry {
  return {
    era: { ...ERA, channel: 'AWA', key: 'AWA:opening' },
    upwind: upwind === null ? null : figure('upwind', upwind),
    downwind: downwind === null ? null : figure('downwind', downwind),
    race_count: 10,
    races: [],
    excluded: [],
    caveat: 'not a Measured Offset',
  }
}

function speedEra(withALine: number, withoutALine: number): EraDivergence {
  const race = (fitted: boolean, index: number): RaceDivergence => ({
    race_id: `race-${fitted ? 'fit' : 'nofit'}-${index}`,
    sailed_at: '2026-06-01 18:00:00',
    points: [],
    coverage: {
      rows: 0,
      countable: 0,
      points: 0,
      blank_stw: 0,
      blank_sog: 0,
      excluded_blank_stw: { frozen: 0, low_speed: 0, maneuver_window: 0 },
    },
    sog_spread_knots: null,
    measured_offset_knots: null,
    fit: fitted
      ? { fitted: true, line: { method: 'orthogonal', ends: [{ stw: 1, sog: 1 }, { stw: 9, sog: 9 }], r_squared: 0.9, points: 100 } }
      : { fitted: false, reason: 'narrow-spread' },
  })

  return {
    era: { ...ERA, channel: 'STW', key: 'STW:opening' },
    races: [
      ...Array.from({ length: withALine }, (_, index) => race(true, index)),
      ...Array.from({ length: withoutALine }, (_, index) => race(false, index)),
    ],
    coverage: {
      rows: 0,
      countable: 0,
      points: 0,
      blank_stw: 0,
      blank_sog: 0,
      excluded_blank_stw: { frozen: 0, low_speed: 0, maneuver_window: 0 },
    },
    measured_offset_knots: null,
    fit: { fitted: false, reason: 'no-points' },
    gap_by_speed: [],
    races_with_points: withALine + withoutALine,
    races_with_a_line: withALine,
  }
}

describe('the share thresholds every verdict off a share reads', () => {
  it('is a two-thirds and a one-third cut, as the prototype used', () => {
    expect([THIN_SHARE, SOLID_SHARE]).toEqual([1 / 3, 2 / 3])
  })
})

describe('the `HDG` verdict, off the share of the rose resting on two or more Races', () => {
  it('reads SOLID at two-thirds of the rose and above', () => {
    expect(headingCoverage(headingEra(24)).verdict).toBe('SOLID')
    expect(headingCoverage(headingEra(36)).verdict).toBe('SOLID')
  })

  it('reads THIN from one third up to, but not including, two-thirds', () => {
    expect(headingCoverage(headingEra(12)).verdict).toBe('THIN')
    expect(headingCoverage(headingEra(23)).verdict).toBe('THIN')
  })

  it('reads ANECDOTAL under one third, and on a rose nothing was sailed on', () => {
    expect(headingCoverage(headingEra(11)).verdict).toBe('ANECDOTAL')
    expect(headingCoverage(headingEra(0)).verdict).toBe('ANECDOTAL')
  })

  it('states the share it read in words, never as the verdict alone', () => {
    // ADR 0034: the word is always printed and the reason stands beside it. A verdict with no
    // reason is a grade, and this is not grading the compass.
    expect(headingCoverage(headingEra(24)).reason).toBe(
      '24 of 36 headings rest on two or more Races'
    )
  })

  it('says a bin resting on one Race is not coverage, by counting only the shared ones', () => {
    // Two Eras over the same curve: the same 30 headings reached, 24 of them on more than one
    // Race in the first and 6 in the second. Same picture, different trust.
    expect(headingCoverage(headingEra(24)).verdict).not.toBe(
      headingCoverage(headingEra(6)).verdict
    )
  })
})

describe('the `AWA` verdict, off the pair count on the weaker point of sail', () => {
  it('reads the weaker side and not the better one', () => {
    // The archive's own shape: 18 upwind pairs and 2 downwind. An Asymmetry that cannot be
    // compared upwind to downwind cannot be interpreted, so 18 buys nothing.
    const verdict = asymmetryCoverage(asymmetryEra(18, 2))

    expect(verdict.verdict).toBe('ANECDOTAL')
    expect(verdict.reason).toBe('2 Tack Pairs downwind, against 18 upwind')
  })

  it('reads a point of sail with no pairs at all as none, not as absent', () => {
    const verdict = asymmetryCoverage(asymmetryEra(20, null))

    expect(verdict.verdict).toBe('ANECDOTAL')
    expect(verdict.reason).toBe('no Tack Pair downwind, against 20 upwind')
  })

  it('reads ANECDOTAL under the five pairs ADR 0034 names, THIN at it, SOLID at twice it', () => {
    expect(ASYMMETRY_THIN_PAIRS).toBe(5)
    expect(ASYMMETRY_SOLID_PAIRS).toBe(10)

    expect(asymmetryCoverage(asymmetryEra(9, 4)).verdict).toBe('ANECDOTAL')
    expect(asymmetryCoverage(asymmetryEra(9, 5)).verdict).toBe('THIN')
    expect(asymmetryCoverage(asymmetryEra(12, 10)).verdict).toBe('SOLID')
  })

  it('names whichever side is weaker, upwind included', () => {
    expect(asymmetryCoverage(asymmetryEra(3, 11)).reason).toBe(
      '3 Tack Pairs upwind, against 11 downwind'
    )
  })

  it('reads an Era that paired no tacks at all as ANECDOTAL rather than throwing', () => {
    const verdict = asymmetryCoverage(asymmetryEra(null, null))

    expect(verdict.verdict).toBe('ANECDOTAL')
    expect(verdict.reason).toBe('no Tack Pair at either point of sail')
  })
})

describe('the `STW` verdict, off the share of Races carrying a line of their own', () => {
  it('reads SOLID at two-thirds of the Races and above', () => {
    expect(speedCoverage(speedEra(9, 4)).verdict).toBe('SOLID')
  })

  it('reads THIN from one third, and ANECDOTAL under it', () => {
    expect(speedCoverage(speedEra(5, 8)).verdict).toBe('THIN')
    expect(speedCoverage(speedEra(3, 10)).verdict).toBe('ANECDOTAL')
  })

  it('states the count in words', () => {
    expect(speedCoverage(speedEra(9, 4)).reason).toBe('9 of 13 Races carry a line of their own')
  })

  it('reads an Era nobody sailed in as ANECDOTAL, and says that rather than dividing by zero', () => {
    const verdict = speedCoverage(speedEra(0, 0))

    expect(verdict.verdict).toBe('ANECDOTAL')
    expect(verdict.reason).toBe('no Race in this Era')
  })
})
