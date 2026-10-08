/**
 * The paddlewheel-vs-`SOG` divergence, as rules rather than as measurements.
 *
 * The archive's own figures — the U-shaped gap and the three slopes one population gives under
 * three fit methods — are pinned in `archive-paddlewheel.test.ts`, which needs the owner's
 * recordings. These are the rules those figures come out of, written over rows built by hand so
 * each one fails on its own account.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import {
  MIN_FIT_POINTS,
  MIN_SOG_SPREAD_KNOTS,
  gapBySpeedBand,
  lineGapAt,
  paddlewheelDivergence,
  raceDivergence,
} from '@/services/analysis/paddlewheel'
import type { FitMethod, PaddlewheelRace, SpeedPairRow } from '@/services/analysis/paddlewheel'
import type { CalibrationEvent, Maneuver } from '@/types'

/**
 * One row, Countable unless told otherwise, carrying the two speeds as a file writes them.
 *
 * `null` is a channel that said nothing. `'0.0'` would be a reading of zero, which is why the two
 * are never spelled the same way here.
 */
function row(
  row_index: number,
  stw: string | null,
  sog: string | null,
  excluded: 'frozen' | 'low-speed' | Maneuver | null = null
): SpeedPairRow {
  const row_time = `2026-06-03 19:${String(row_index % 60).padStart(2, '0')}:00`
  return {
    row_index,
    row_time,
    quality: {
      row_index,
      row_time,
      frozen: excluded === 'frozen',
      not_water_referenced: stw === null,
      low_speed: excluded === 'low-speed',
      gap_seconds: 30,
    },
    maneuver_window:
      excluded === 'frozen' || excluded === 'low-speed' || excluded === null ? null : excluded,
    countable: excluded === null,
    sog,
    stw,
  }
}

/** A Race of rows on a straight line: `SOG = gain × STW`, from 3 kt of `STW` upward. */
function line(race_id: string, gain: number, rows = 8, sailed_at = '2026-06-03 19:00:00'): PaddlewheelRace {
  return {
    race_id,
    sailed_at,
    rows: Array.from({ length: rows }, (_, at) => {
      const stw = 3 + at * 0.5
      return row(at + 1, stw.toFixed(2), (stw * gain).toFixed(4))
    }),
  }
}

const NO_LOG = buildCalibrationLog([], [])

describe('one Race’s divergence', () => {
  it('keeps every Countable row as a point, as recorded', () => {
    const divergence = raceDivergence(line('race-1', 1))

    expect(divergence.points).toHaveLength(8)
    expect(divergence.points[0]).toEqual({ row_index: 1, stw: 3, sog: 3 })
    expect(divergence.coverage.countable).toBe(8)
  })

  it('reads no row that is not Countable, whichever of the three reasons excluded it', () => {
    const divergence = raceDivergence({
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: [
        row(1, '4.0', '4.2'),
        row(2, '4.0', '9.9', 'frozen'),
        row(3, '4.0', '1.2', 'low-speed'),
        row(4, '4.0', '9.9', 'tack'),
      ],
    })

    expect(divergence.points.map((point) => point.row_index)).toEqual([1])
    expect(divergence.coverage.rows).toBe(4)
    expect(divergence.coverage.countable).toBe(1)
  })

  it('fits the line over the `STW` range the points span, and nothing wider', () => {
    const { fit } = raceDivergence(line('race-1', 1.05))

    expect(fit.fitted).toBe(true)
    if (!fit.fitted) throw new Error('expected a line')
    expect(fit.line.ends[0].stw).toBeCloseTo(3, 6)
    expect(fit.line.ends[1].stw).toBeCloseTo(6.5, 6)
    expect(fit.line.r_squared).toBeCloseTo(1, 6)
  })

  it('draws no line through four points, and still shows all four', () => {
    const thin = raceDivergence(line('race-1', 1.05, 4))

    expect(MIN_FIT_POINTS).toBe(5)
    expect(thin.points).toHaveLength(4)
    expect(thin.fit).toEqual({ fitted: false, reason: 'too-few-points' })
  })

  it('draws no line through a Race that never spanned three knots of `SOG`', () => {
    // A calm evening is real data and still gets its scatter — it just cannot say where a line
    // through it should point (ADR 0027).
    const calm: PaddlewheelRace = {
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: Array.from({ length: 10 }, (_, at) => row(at + 1, `${3 + at * 0.1}`, `${3.2 + at * 0.1}`)),
    }

    expect(MIN_SOG_SPREAD_KNOTS).toBe(3)
    expect(raceDivergence(calm).sog_spread_knots).toBeCloseTo(0.9, 6)
    expect(raceDivergence(calm).fit).toEqual({ fitted: false, reason: 'narrow-spread' })
  })

  it('says so rather than throwing when no Countable row carried either speed', () => {
    const quiet: PaddlewheelRace = {
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: [row(1, null, null), row(2, null, null)],
    }
    const divergence = raceDivergence(quiet)

    expect(divergence.fit).toEqual({ fitted: false, reason: 'no-points' })
    expect(divergence.measured_offset_knots).toBeNull()
    expect(divergence.sog_spread_knots).toBeNull()
  })
})

describe('a blank `STW` row', () => {
  const race: PaddlewheelRace = {
    race_id: 'race-1',
    sailed_at: '2026-06-03 19:00:00',
    rows: [
      row(1, '4.0', '4.2'),
      row(2, null, '4.4'),
      row(3, '4.0', null),
      row(4, null, '0.4', 'low-speed'),
      row(5, null, '4.4', 'frozen'),
      row(6, null, null),
      row(7, '', '4.0'),
    ],
  }

  it('cannot be a point, because there is no `STW` to plot it at', () => {
    const divergence = raceDivergence(race)

    expect(divergence.points.map((point) => point.row_index)).toEqual([1])
    expect(divergence.points.some((point) => point.stw === 0)).toBe(false)
  })

  it('is not a point at the origin when the cell is empty rather than absent', () => {
    // `Number('')` is 0, and a zero here would be a reading of zero knots on a row where the
    // paddlewheel reported nothing — the one thing this check must never draw.
    const divergence = raceDivergence(race)

    expect(divergence.points.map((point) => point.row_index)).not.toContain(7)
  })

  it('is counted as its own coverage stat rather than dropped', () => {
    const { coverage } = raceDivergence(race)

    expect(coverage.countable).toBe(5)
    expect(coverage.points).toBe(1)
    // Rows 2, 6 and 7: absent, absent on both channels, and an empty cell. All three are rows the
    // paddlewheel said nothing on, which is what this stat states.
    expect(coverage.blank_stw).toBe(3)
    expect(coverage.blank_sog).toBe(1)
    expect(coverage.points + coverage.blank_stw + coverage.blank_sog).toBe(coverage.countable)
  })

  it('says where the blank rows that were not Countable went', () => {
    // ADR 0034: on the real archive this stat is zero over the rows the chart reads, and the
    // answer that matters is which exclusion took each blank row — Frozen or Low-Speed.
    const { coverage } = raceDivergence(race)

    expect(coverage.excluded_blank_stw).toEqual({
      frozen: 1,
      low_speed: 1,
      maneuver_window: 0,
    })
  })
})

describe('the fit method the slope depends on', () => {
  /**
   * Two instruments disagreeing with noise in both, which is the only case the three methods
   * separate: on points exactly on a line they agree to the last digit.
   */
  const noisy: PaddlewheelRace = {
    race_id: 'race-1',
    sailed_at: '2026-06-03 19:00:00',
    rows: [
      row(1, '3.0', '3.6'),
      row(2, '4.0', '3.9'),
      row(3, '5.0', '5.4'),
      row(4, '6.0', '5.7'),
      row(5, '7.0', '7.2'),
      row(6, '8.0', '7.5'),
      row(7, '9.0', '9.0'),
    ],
  }

  function slopeUnder(method: FitMethod): number {
    const { fit } = raceDivergence(noisy, method)
    if (!fit.fitted) throw new Error(`expected a line under ${method}`)
    const [from, to] = fit.line.ends
    return (to.sog - from.sog) / (to.stw - from.stw)
  }

  it('is orthogonal unless the caller asks otherwise', () => {
    const { fit } = raceDivergence(noisy)

    expect(fit.fitted && fit.line.method).toBe('orthogonal')
  })

  it('gives three slopes for one population, the orthogonal one between the other two', () => {
    // Least squares on one variable is biased flat by noise in the other, and here both channels
    // are measurements — which is the whole reason no single coefficient is ever printed.
    expect(slopeUnder('sog-on-stw')).toBeLessThan(slopeUnder('orthogonal'))
    expect(slopeUnder('orthogonal')).toBeLessThan(slopeUnder('stw-on-sog'))
  })

  it('reports the same `R²` whichever way the line was fitted', () => {
    const squares = (['orthogonal', 'sog-on-stw', 'stw-on-sog'] as const).map((method) => {
      const { fit } = raceDivergence(noisy, method)
      return fit.fitted ? fit.line.r_squared : null
    })

    expect(squares[0]).toBeCloseTo(squares[1] as number, 12)
    expect(squares[0]).toBeCloseTo(squares[2] as number, 12)
  })

  it('reports a Measured Offset that no method can move, because no fit enters it', () => {
    // The knot gap is the mean of `SOG − STW` over the rows. The methods disagree about the line;
    // they cannot disagree about this.
    const offsets = (['orthogonal', 'sog-on-stw', 'stw-on-sog'] as const).map(
      (method) => raceDivergence(noisy, method).measured_offset_knots
    )

    expect(offsets[0]).toBeCloseTo(0.0429, 4)
    expect(new Set(offsets).size).toBe(1)
  })

  it('never hands back a drafted correction to type into the display', () => {
    // LAY-138 decision 7, as a guard rather than as a promise: a slope and an intercept under any
    // spelling is a value a sailor would program, and the line is published as two ends of a
    // drawn segment precisely so that it is a shape instead.
    const forbidden = /^(multiplier|offset|slope|intercept|gain|coefficient|a|b)$/

    const keys = (value: unknown): string[] =>
      value === null || typeof value !== 'object'
        ? []
        : Array.isArray(value)
          ? value.flatMap(keys)
          : Object.entries(value).flatMap(([key, held]) => [key, ...keys(held)])

    expect(keys(paddlewheelDivergence([noisy], NO_LOG)).filter((key) => forbidden.test(key))).toEqual(
      []
    )
  })
})

describe('the line’s gap from 1:1', () => {
  it('is read off the drawn line, at the speed asked for', () => {
    // `SOG = 1.1 × STW`, so the line sits 0.4 kt above 1:1 at 4 kt and 0.8 kt above it at 8 kt.
    const { fit } = raceDivergence(line('race-1', 1.1, 12))
    if (!fit.fitted) throw new Error('expected a line')

    expect(lineGapAt(fit.line, 4)).toBeCloseTo(0.4, 6)
    expect(lineGapAt(fit.line, 8)).toBeCloseTo(0.8, 6)
  })

  it('is absent past the range the line was fitted over, rather than extrapolated', () => {
    const { fit } = raceDivergence(line('race-1', 1.1))
    if (!fit.fitted) throw new Error('expected a line')

    expect(fit.line.ends[1].stw).toBeCloseTo(6.5, 6)
    expect(lineGapAt(fit.line, 8)).toBeNull()
    expect(lineGapAt(fit.line, 2)).toBeNull()
  })
})

describe('the Era aggregate', () => {
  /** Eight rows reading 1:1, and five reading a knot high — a long Race and a short one. */
  const honest = line('race-honest', 1, 8, '2026-06-03 19:00:00')
  const high: PaddlewheelRace = {
    race_id: 'race-high',
    sailed_at: '2026-06-10 19:00:00',
    rows: Array.from({ length: 5 }, (_, at) => {
      const stw = 3 + at
      return row(at + 1, stw.toFixed(2), (stw + 1).toFixed(2))
    }),
  }

  it('pools every Race in the Era into one fit', () => {
    const [era] = paddlewheelDivergence([honest, high], NO_LOG)

    expect(era.races.map((race) => race.race_id)).toEqual(['race-honest', 'race-high'])
    expect(era.coverage.points).toBe(13)
    expect(era.fit.fitted).toBe(true)
  })

  it('weights each Race by one over its Countable row count, so duration buys no influence', () => {
    // Eight rows at a gap of zero and five at a gap of one knot. Weighted per Race the answer is
    // half a knot; pooled row by row it would be 0.38, and the long Race would have decided it.
    const [era] = paddlewheelDivergence([honest, high], NO_LOG)

    expect(era.measured_offset_knots).toBeCloseTo(0.5, 6)
  })

  it('counts the Races that could carry a line of their own', () => {
    const thin = line('race-thin', 1, 4, '2026-06-17 19:00:00')
    const [era] = paddlewheelDivergence([honest, high, thin], NO_LOG)

    expect(era.races_with_points).toBe(3)
    expect(era.races_with_a_line).toBe(2)
  })

  it('is one Era over the whole season while the Log says nothing about `STW`', () => {
    const autocompensation: CalibrationEvent = {
      id: 'event-1',
      artifact_id: 'artifact-1',
      kind: 'instrument_calibration',
      occurred_on: '2026-06-05',
      type: 'autocompensation',
      channels: ['HDG'],
      note: 'Swung the compass.',
      created_by: 'admin-1',
      created_at: '2026-06-06T02:00:00Z',
      updated_at: '2026-06-06T02:00:00Z',
    }
    const eras = paddlewheelDivergence([honest, high], buildCalibrationLog([], [autocompensation]))

    expect(eras).toHaveLength(1)
    expect(eras[0].era).toEqual({ channel: 'STW', from: null, until: null, opened_by: [] })
  })

  it('splits the season at an `STW` act, and never at a step in the data', () => {
    const cleaned: CalibrationEvent = {
      id: 'event-2',
      artifact_id: 'artifact-1',
      kind: 'instrument_calibration',
      occurred_on: '2026-06-08',
      type: 'other',
      channels: ['STW'],
      note: 'Paddlewheel cleaned.',
      created_by: 'admin-1',
      created_at: '2026-06-09T02:00:00Z',
      updated_at: '2026-06-09T02:00:00Z',
    }
    const eras = paddlewheelDivergence([honest, high], buildCalibrationLog([], [cleaned]))

    expect(eras.map((era) => era.races.map((race) => race.race_id))).toEqual([
      ['race-honest'],
      ['race-high'],
    ])
    // Each Era now reads its own Races and nothing else: 1:1 before the cleaning, a knot high
    // after it, where one pooled figure would have shown a quarter knot and explained nothing.
    expect(eras[0].measured_offset_knots).toBeCloseTo(0, 6)
    expect(eras[1].measured_offset_knots).toBeCloseTo(1, 6)
  })

  it('keeps an Era that holds no Race, with the reason instead of a figure', () => {
    const cleaned: CalibrationEvent = {
      id: 'event-3',
      artifact_id: 'artifact-1',
      kind: 'instrument_calibration',
      occurred_on: '2026-09-30',
      type: 'other',
      channels: ['STW'],
      note: 'Paddlewheel replaced over the winter.',
      created_by: 'admin-1',
      created_at: '2026-10-01T02:00:00Z',
      updated_at: '2026-10-01T02:00:00Z',
    }
    const eras = paddlewheelDivergence([honest, high], buildCalibrationLog([], [cleaned]))

    expect(eras).toHaveLength(2)
    expect(eras[1].races).toEqual([])
    expect(eras[1].measured_offset_knots).toBeNull()
    expect(eras[1].fit).toEqual({ fitted: false, reason: 'no-points' })
  })
})

describe('the gap by speed band', () => {
  it('is one band per knot, holding the knot above its own figure', () => {
    const race = raceDivergence({
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: [
        row(1, '2.0', '2.4'),
        row(2, '2.9', '3.5'),
        row(3, '4.0', '4.0'),
        row(4, '8.2', '8.6'),
        row(5, '8.8', '9.2'),
      ],
    })

    const bands = gapBySpeedBand([race])

    expect(bands.map(({ band, rows, races }) => ({ band, rows, races }))).toEqual([
      { band: 2, rows: 2, races: 1 },
      { band: 4, rows: 1, races: 1 },
      { band: 8, rows: 2, races: 1 },
    ])
    expect(bands.map((band) => band.mean_gap_knots)).toEqual([
      expect.closeTo(0.5, 6),
      expect.closeTo(0, 6),
      expect.closeTo(0.4, 6),
    ])
  })

  it('averages each Race’s own mean in a band, so a long Race cannot own one', () => {
    const long = raceDivergence({
      race_id: 'race-long',
      sailed_at: '2026-06-03 19:00:00',
      rows: [row(1, '4.0', '4.0'), row(2, '4.1', '4.1'), row(3, '4.2', '4.2')],
    })
    const short = raceDivergence({
      race_id: 'race-short',
      sailed_at: '2026-06-10 19:00:00',
      rows: [row(1, '4.5', '5.1')],
    })

    const [band] = gapBySpeedBand([long, short])

    expect({ ...band, mean_gap_knots: undefined }).toEqual({
      band: 4,
      rows: 4,
      races: 2,
      mean_gap_knots: undefined,
    })
    // Row by row it would read 0.15 kt, and the three rows of the long Race would have said so.
    expect(band.mean_gap_knots).toBeCloseTo(0.3, 6)
  })

  it('is the axis the Era was asked for, and `STW` where it was asked for nothing', () => {
    const race: PaddlewheelRace = {
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: [row(1, '3.8', '4.4')],
    }

    expect(paddlewheelDivergence([race], NO_LOG)[0].gap_by_speed[0].band).toBe(3)
    expect(
      paddlewheelDivergence([race], NO_LOG, { band_axis: 'sog' })[0].gap_by_speed[0].band
    ).toBe(4)
  })

  it('bands by the recorded `SOG` instead, where that is the axis asked for', () => {
    // ADR 0034's own caveat: which channel the rows are banded by moves the figure at the top
    // end, so the axis is the caller's to state rather than this module's to assume.
    const race = raceDivergence({
      race_id: 'race-1',
      sailed_at: '2026-06-03 19:00:00',
      rows: [row(1, '3.8', '4.4')],
    })

    expect(gapBySpeedBand([race], 'stw').map((band) => band.band)).toEqual([3])
    expect(gapBySpeedBand([race], 'sog').map((band) => band.band)).toEqual([4])
  })
})
