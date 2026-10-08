/**
 * The `HDG` Measured Offset, as rules rather than as measurements.
 *
 * The archive's own figures are pinned in `archive-instrument-tuning.test.ts`, which needs the
 * owner's recordings; these are the rules those figures come from.
 */

import {
  BIN_SIZE_DEG,
  HEADING_BIN_COUNT,
  HEADING_OFFSET_CAVEAT,
  MIN_ROWS_PER_BIN,
  MIN_VALID_ROWS,
  eraHeadingOffset,
  headingOffsetByEra,
  raceHeadingOffset,
} from '@/services/analysis/compass-deviation'
import { calibrationEras } from '@/services/analysis/calibration-eras'
import type { HeadingReadableRow } from '@/services/analysis/compass-deviation'
import type { CalibrationEra, RaceHeadingOffset, RaceHeadingOffsetResult } from '@/types'

/** A readable row: Countable, sailing at six knots, on the heading and course given. */
function row(ctw: number, cog: number, over: Partial<HeadingReadableRow> = {}): HeadingReadableRow {
  return {
    row_index: 1,
    countable: true,
    ctw: ctw.toFixed(1),
    cog: cog.toFixed(1),
    sog: '6.0',
    ...over,
  }
}

/** `count` rows holding one heading, each `error` degrees right of its own track. */
function holding(ctw: number, error: number, count: number): HeadingReadableRow[] {
  return Array.from({ length: count }, (_, index) =>
    row(ctw, ctw - error, { row_index: index + 1 })
  )
}

function race(rows: HeadingReadableRow[], over: { race_id?: string; window_start?: string } = {}) {
  return {
    race_id: 'race-1',
    window_start: '2026-06-03 19:00:00',
    rows,
    ...over,
  }
}

/** The figure, or a thrown test failure — the refusals have their own assertions below. */
function measured(rows: HeadingReadableRow[], over = {}): RaceHeadingOffset {
  const result = raceHeadingOffset(race(rows, over))
  if (!result.ok) throw new Error(`expected a figure, got ${result.reason}`)
  return result.offset
}

const ERA: CalibrationEra = calibrationEras([], 'HDG')[0]

describe('one Race’s Measured Offset for HDG', () => {
  it('is the mean of CTW − COG over the rows it could read', () => {
    const offset = measured([...holding(90, 4, 5), ...holding(180, 8, 5)])

    expect(offset.mean_offset_deg).toBeCloseTo(6, 10)
    expect(offset.row_count).toBe(10)
    expect(offset.max_abs_error_deg).toBeCloseTo(8, 10)
  })

  it('wraps a difference across 0°/360° the short way, not the long way', () => {
    // The bug a line-for-line port of the prior art's `normalize_angle` would have: these rows
    // hold 5° on a track of 355°, and an unwrapped subtraction reads −350 on every one of them.
    const offset = measured(holding(5, 10, 6))

    expect(offset.mean_offset_deg).toBeCloseTo(10, 10)
    expect(offset.max_abs_error_deg).toBeCloseTo(10, 10)
  })

  it('carries the CTW = HDG + leeway caveat on the figure itself', () => {
    // Attached rather than left to the renderer: a caveat a second renderer has to remember is one
    // it will forget, and this figure is only honest with it.
    expect(measured(holding(90, 4, 5)).caveat).toBe(HEADING_OFFSET_CAVEAT)
    expect(HEADING_OFFSET_CAVEAT).toContain('CTW = HDG + leeway')
  })

  it('refuses a Race under five readable rows, and says how many it had', () => {
    const result = raceHeadingOffset(race(holding(90, 4, MIN_VALID_ROWS - 1)))

    // No figure and no zero: the screen says which Race produced nothing and why.
    expect(result).toEqual({
      ok: false,
      race_id: 'race-1',
      window_start: '2026-06-03 19:00:00',
      reason: 'too-few-rows',
      row_count: 4,
    })
  })

  it('reads no row that is not Countable', () => {
    const rows = [...holding(90, 4, 5), ...holding(90, 40, 20).map((r) => ({ ...r, countable: false }))]

    // Twenty Frozen or mid-tack rows at a 40° error, which would move the mean by 32°.
    expect(measured(rows).mean_offset_deg).toBeCloseTo(4, 10)
    expect(measured(rows).row_count).toBe(5)
  })

  it('reads no row below its own speed gate, which is stricter than Low-Speed', () => {
    const slow = holding(90, 40, 5).map((r) => ({ ...r, sog: '3.4' }))
    const fast = holding(90, 4, 5).map((r) => ({ ...r, sog: '3.5' }))

    // 3.4 kt is not Low-Speed — the boat is sailing — and is still too slow for a heading reading
    // to say anything about the compass rather than about leeway and steering.
    expect(measured([...fast, ...slow]).row_count).toBe(5)
    expect(raceHeadingOffset(race(slow))).toMatchObject({ ok: false, row_count: 0 })
  })

  it('reads no row missing either channel, including a COG that Row Quality does not cover', () => {
    const rows = [
      ...holding(90, 4, 5),
      ...holding(90, 4, 3).map((r) => ({ ...r, cog: null })),
      ...holding(90, 4, 3).map((r) => ({ ...r, ctw: null })),
    ]

    expect(measured(rows).row_count).toBe(5)
  })
})

describe('binning a Race by heading', () => {
  it('returns all 36 bins, including the ones nobody sailed', () => {
    const offset = measured(holding(95, 4, 5))

    expect(offset.bins).toHaveLength(HEADING_BIN_COUNT)
    expect(offset.bins.map((bin) => bin.bin_start_deg)).toEqual(
      Array.from({ length: 36 }, (_, index) => index * BIN_SIZE_DEG)
    )
    // A heading nobody sailed and one sailed too little to average both have a null mean; the
    // count is what tells them apart, which is why every bin carries one (ADR 0034).
    expect(offset.bins[9]).toEqual({
      bin_start_deg: 90,
      bin_center_deg: 95,
      row_count: 5,
      mean_error_deg: 4,
    })
    expect(offset.bins[0]).toMatchObject({ row_count: 0, mean_error_deg: null })
  })

  it('leaves a bin under three rows counted but unaveraged', () => {
    const offset = measured([...holding(95, 4, 5), ...holding(185, 20, MIN_ROWS_PER_BIN - 1)])

    expect(offset.bins[18]).toMatchObject({ row_count: 2, mean_error_deg: null })
    // The two rows still count toward the Race's own mean, which is over rows and not over bins.
    expect(offset.row_count).toBe(7)
    expect(offset.headings_covered).toBe(1)
  })

  it('is half-open, so a heading of exactly 360 lands in no bin at all', () => {
    // Faithful to the prior art, which bins `[350, 360)` and leaves 360.0 out of every bin.
    // Wrapping it to 0 here would move which rows count toward a coverage figure relative to the
    // tool the archive's owner already reads.
    const offset = measured(holding(360, 4, 5))

    expect(offset.row_count).toBe(5)
    expect(offset.headings_covered).toBe(0)
    expect(offset.bins.every((bin) => bin.row_count === 0)).toBe(true)
  })

  it('reports coverage as a share of the rose and as a count of headings', () => {
    const offset = measured([...holding(5, 2, 3), ...holding(15, 6, 3), ...holding(25, 1, 2)])

    expect(offset.headings_covered).toBe(2)
    expect(offset.heading_coverage).toBeCloseTo(2 / 36, 10)
  })
})

describe('an Era’s curve', () => {
  const offsets = (rows: HeadingReadableRow[], race_id: string, window_start: string) =>
    raceHeadingOffset(race(rows, { race_id, window_start }))

  it('averages each Race’s own bin means, and never pools their rows', () => {
    const long = offsets(holding(95, 10, 100), 'distance-race', '2026-06-01 09:00:00')
    const short = offsets(holding(95, 4, 5), 'beer-can', '2026-06-10 19:00:00')
    const era = eraHeadingOffset(ERA, [long, short])

    // 7, not the 9.8 pooling 103 rows would give: a 13-hour distance race may not swamp a
    // 90-minute beer-can in a figure about how the compass has behaved.
    expect(era.bins[9].mean_error_deg).toBeCloseTo(7, 10)
    expect(era.bins[9].race_count).toBe(2)
    expect(era.bins[9].race_means).toEqual([
      { race_id: 'distance-race', mean_error_deg: 10 },
      { race_id: 'beer-can', mean_error_deg: 4 },
    ])
  })

  it('leads with the swing between the highest and lowest heading', () => {
    const era = eraHeadingOffset(ERA, [
      offsets([...holding(15, 12, 4), ...holding(245, -9, 4), ...holding(95, 2, 4)], 'r1', '2026-06-01 19:00:00'),
    ])

    // The card's headline (ADR 0035): a single bin's figure, and so the one number here with no
    // weighting to disclose, unlike the two means below.
    expect(era.swing?.highest).toMatchObject({ bin_center_deg: 15, mean_error_deg: 12 })
    expect(era.swing?.lowest).toMatchObject({ bin_center_deg: 245, mean_error_deg: -9 })
    expect(era.swing?.swing_deg).toBeCloseTo(21, 10)
  })

  it('states both means of the same figure, by their weighting', () => {
    const era = eraHeadingOffset(ERA, [
      offsets([...holding(15, 12, 20), ...holding(245, -8, 4)], 'r1', '2026-06-01 19:00:00'),
    ])

    // Every heading equal: (12 + −8) / 2. Every Race equal, each Race's own figure being over its
    // rows: (20 × 12 + 4 × −8) / 24. Both correct, and whichever is printed has to say which.
    expect(era.mean_of_bins_deg).toBeCloseTo(2, 10)
    expect(era.mean_of_races_deg).toBeCloseTo(8.667, 3)
  })

  it('counts the headings resting on two or more Races, which one Race cannot cover', () => {
    const era = eraHeadingOffset(ERA, [
      offsets([...holding(15, 12, 5), ...holding(95, 2, 5)], 'r1', '2026-06-01 19:00:00'),
      offsets(holding(15, 10, 5), 'r2', '2026-06-08 19:00:00'),
    ])

    // ADR 0034's coverage axis: a bin resting on one Race is that Race's heading mix, not the
    // Era's behaviour.
    expect(era.headings_covered).toBe(2)
    expect(era.headings_on_two_or_more_races).toBe(1)
    expect(era.heading_bin_count).toBe(36)
  })

  it('carries a Race that produced nothing as an exclusion, never as a point', () => {
    const era = eraHeadingOffset(ERA, [
      offsets(holding(95, 4, 5), 'measured', '2026-06-01 19:00:00'),
      offsets(holding(95, 40, 2), 'thin', '2026-06-08 19:00:00'),
    ])

    expect(era.races.map((r) => r.race_id)).toEqual(['measured'])
    expect(era.excluded).toEqual([
      {
        ok: false,
        race_id: 'thin',
        window_start: '2026-06-08 19:00:00',
        reason: 'too-few-rows',
        row_count: 2,
      },
    ])
    // And the excluded Race's rows are nowhere in the figure.
    expect(era.mean_of_races_deg).toBeCloseTo(4, 10)
  })

  it('orders its Races oldest first, whatever order it was handed them', () => {
    const era = eraHeadingOffset(ERA, [
      offsets(holding(95, 4, 5), 'later', '2026-06-08 19:00:00'),
      offsets(holding(95, 4, 5), 'earlier', '2026-06-01 19:00:00'),
    ])

    expect(era.races.map((r) => r.race_id)).toEqual(['earlier', 'later'])
  })

  it('has no curve, and says so, where every Race in it was excluded', () => {
    const era = eraHeadingOffset(ERA, [offsets(holding(95, 4, 2), 'thin', '2026-06-01 19:00:00')])

    expect(era.swing).toBe(null)
    expect(era.mean_of_bins_deg).toBe(null)
    expect(era.mean_of_races_deg).toBe(null)
    expect(era.race_count).toBe(0)
    expect(era.excluded).toHaveLength(1)
  })
})

describe('the Eras a season is read as', () => {
  const log = calibrationEras(
    [
      {
        entry: 'event',
        date: '2026-07-04',
        event: {
          id: 'event-1',
          artifact_id: 'artifact-1',
          kind: 'instrument_calibration',
          occurred_on: '2026-07-04',
          type: 'autocompensation',
          channels: ['HDG'],
          note: 'swung the compass',
          created_by: 'admin-1',
          created_at: '2026-07-05T02:00:00Z',
          updated_at: '2026-07-05T02:00:00Z',
        },
      },
    ],
    'HDG'
  )

  const results: RaceHeadingOffsetResult[] = [
    raceHeadingOffset(race(holding(95, 14, 5), { race_id: 'june', window_start: '2026-06-03 19:00:00' })),
    raceHeadingOffset(race(holding(95, 3, 5), { race_id: 'july', window_start: '2026-07-22 19:00:00' })),
  ]

  it('never averages across a boundary, because that is two configurations in one number', () => {
    const eras = headingOffsetByEra(log, results)

    expect(eras).toHaveLength(2)
    expect(eras[0].mean_of_races_deg).toBeCloseTo(14, 10)
    expect(eras[1].mean_of_races_deg).toBeCloseTo(3, 10)
    expect(eras[1].era.from_date).toBe('2026-07-04')
  })

  it('drops an Era nobody sailed in', () => {
    const eras = headingOffsetByEra(log, [results[1]])

    expect(eras.map((era) => era.era.from_date)).toEqual(['2026-07-04'])
  })
})
