import { analysisRows } from '@/services/analysis/countable'
import {
  aggregateEfficiency,
  computeRowEfficiency,
  rowIntervalSeconds,
} from '@/services/analysis/efficiency'
import type { ScorableRow } from '@/services/analysis/efficiency'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import { readableRows } from '@/services/analysis/readable-rows'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { PolarPayload, Transcription } from '@/types'

/**
 * Polar Efficiency and VMG Efficiency, per row and over a window.
 *
 * The per-row half is arithmetic and is pinned as such. The aggregate half is the part worth
 * arguing about, and the tests below are built to fail if it ever becomes a mean of per-row
 * percentages: a Filler-Anchored row's target can read far too low, and averaging percentages lets
 * a handful of those dominate a figure nobody can see the rows behind (ADR 0036).
 */

/**
 * Round numbers so every expected figure can be checked by hand. TWA 60 at 10 knots: 6 knots.
 *
 * TWA 35 is exactly twice TWA 30, so both are the file's own ramp and a row sailed at either is
 * compared against a manufactured target of 1 knot — which is the whole reason a mean of per-row
 * percentages is the wrong aggregate.
 */
const GRID: PolarPayload = {
  twa_axis: [30, 35, 60, 120],
  tws_axis: [10, 20],
  boat_speed: [
    [1, 2],
    [2, 4],
    [6, 8],
    [5, 7],
  ],
  source: { format: 'orc-pol', header_token: 'twa/tws' },
}

const targets = polarTargets(GRID)

function row(fields: Partial<ScorableRow> & { row_index: number; row_time: string }): ScorableRow {
  return { sog: null, tws: null, twa: null, countable: true, ...fields }
}

describe('rowIntervalSeconds', () => {
  it('measures each row as the gap to the row after it', () => {
    // qtVlm logs on events, not on a clock: one archive recording's median in-window cadence is 75
    // seconds. Nothing may assume 30, or any other figure.
    const measured = rowIntervalSeconds([
      { row_time: '2026-07-01 19:00:00' },
      { row_time: '2026-07-01 19:00:30' },
      { row_time: '2026-07-01 19:02:30' },
    ])

    expect(measured).toEqual([30, 120, null])
  })

  it('gives the last row no interval, rather than standing in a cadence for it', () => {
    // There is no following sample, so no span was measured. One row out of thousands is a cheaper
    // loss than a race figure built on an assumed clock.
    expect(rowIntervalSeconds([{ row_time: '2026-07-01 19:00:00' }])).toEqual([null])
  })

  it('gives a row the clock stepped backwards across no interval either', () => {
    // The hour a fall-back repeats is recorded twice and never converted away to hide it, so one
    // step a season is -3,600 seconds. A negative weight would subtract a real row's distance.
    expect(
      rowIntervalSeconds([
        { row_time: '2026-11-01 01:59:30' },
        { row_time: '2026-11-01 01:00:00' },
        { row_time: '2026-11-01 01:00:30' },
      ])
    ).toEqual([null, 30, null])
  })

  it('reads two rows at the same stamp as a measured interval of nothing, not as none', () => {
    // A zero is a different fact from a null, and the difference reaches the aggregate: the row
    // weighs nothing in the sums and is still a row the figure accounted for.
    expect(
      rowIntervalSeconds([
        { row_time: '2026-07-01 19:00:00' },
        { row_time: '2026-07-01 19:00:00' },
      ])
    ).toEqual([0, null])
  })
})

describe('computeRowEfficiency', () => {
  it('divides SOG by Target Speed, and not STW', () => {
    // ADR 0027: the paddlewheel is dimensionally right and practically wrong on this boat, running
    // a couple of percent under SOG at 4-5 knots and roughly ten by 9-10.
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '5.4', tws: '10', twa: '60' }),
      targets
    )

    expect(scored.target_speed).toEqual({ knots: 6, filler_anchored: false })
    expect(scored.polar_efficiency).toBeCloseTo(0.9)
  })

  it('derives VMG as SOG times the cosine of the angle, as a magnitude', () => {
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '6', tws: '10', twa: '-120' }),
      targets
    )

    expect(scored.vmg_zone).toBe('downwind')
    expect(scored.vmg).toBeCloseTo(6 * Math.abs(Math.cos((120 * Math.PI) / 180)))
    // The only downwind row in the grid: 5 x |cos120| = 2.5.
    expect(scored.target_vmg?.estimated_knots).toBeCloseTo(2.5)
    expect(scored.vmg_efficiency).toBeCloseTo(1.2)
  })

  it('shows a Filler-Anchored figure with the flag on it, never a null', () => {
    // TWA 30 is the grid's ramp seed and 60 is not twice it, so row 30 alone is filler. A row
    // sailed at 30 degrees is real; only the question of what to compare it against is in doubt.
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '4', tws: '10', twa: '30' }),
      targets
    )

    expect(scored.target_speed).toEqual({ knots: 1, filler_anchored: true })
    expect(scored.polar_efficiency).toBe(4)
  })

  it('reports no target outside the Polar, rather than one from its nearest edge', () => {
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '7', tws: '26', twa: '60' }),
      targets
    )

    expect(scored.target_speed).toBeNull()
    expect(scored.polar_efficiency).toBeNull()
    expect(scored.target_vmg).toBeNull()
    expect(scored.vmg_efficiency).toBeNull()
  })

  it('reports nothing where a channel said nothing, and never a fabricated zero', () => {
    // `Number('')` is 0 and `Number(null)` is 0. A zero knot of boat speed would read as 0% of
    // target rather than as no answer (ADR 0008).
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: null, tws: '10', twa: '60' }),
      targets
    )

    expect(scored.polar_efficiency).toBeNull()
    expect(scored.vmg).toBeNull()
    // The Polar still answers: the target is a property of the wind, not of the GPS.
    expect(scored.target_speed?.knots).toBe(6)
  })

  it('says nothing at all about a row with no wind angle', () => {
    const scored = computeRowEfficiency(
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '6', tws: '10', twa: null }),
      targets
    )

    expect(scored.target_speed).toBeNull()
    expect(scored.vmg_zone).toBeNull()
    expect(scored.target_vmg).toBeNull()
  })
})

describe('aggregateEfficiency', () => {
  /** Two half-minutes at 5.4 knots against a 6-knot target: 90% both ways round. */
  const steady: ScorableRow[] = [
    row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '5.4', tws: '10', twa: '60' }),
    row({ row_index: 2, row_time: '2026-07-01 19:00:30', sog: '5.4', tws: '10', twa: '60' }),
    row({ row_index: 3, row_time: '2026-07-01 19:01:00', sog: '5.4', tws: '10', twa: '60' }),
  ]

  it('sums distances and divides, and states the sums it divided', () => {
    const figure = aggregateEfficiency(steady, targets)

    // Two rows carry an interval; the third is last and carries none.
    expect(figure.rows).toBe(2)
    expect(figure.elapsed_seconds).toBe(60)
    expect(figure.actual_distance_nm).toBeCloseTo((5.4 * 60) / 3600)
    expect(figure.target_distance_nm).toBeCloseTo((6 * 60) / 3600)
    expect(figure.polar_efficiency).toBeCloseTo(0.9)
  })

  it('weights a long row more than a short one, which a flat mean would not', () => {
    /**
     * One 10-second row at 120% of target and one 290-second row at 90%. A mean of percentages
     * answers 105%; the honest figure is a shade over 90, because the boat spent 97% of the window
     * in the second row.
     */
    const uneven: ScorableRow[] = [
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '7.2', tws: '10', twa: '60' }),
      row({ row_index: 2, row_time: '2026-07-01 19:00:10', sog: '5.4', tws: '10', twa: '60' }),
      row({ row_index: 3, row_time: '2026-07-01 19:05:00', sog: '5.4', tws: '10', twa: '60' }),
    ]

    const figure = aggregateEfficiency(uneven, targets)

    expect(figure.polar_efficiency).toBeCloseTo((7.2 * 10 + 5.4 * 290) / (6 * 300))
    expect(figure.polar_efficiency).toBeCloseTo(0.91)
    // What a flat mean of the two rows' own percentages would have answered.
    expect((1.2 + 0.9) / 2).toBeCloseTo(1.05)
  })

  it('does not let a Filler-Anchored row dominate the figure', () => {
    /**
     * The failure ADR 0036 ruled the mean of percentages out over. The middle row is sailed at
     * TWA 30, where the ramp puts its target at 1 knot — so its own percentage is 540%. A mean of
     * the three rows' percentages answers 240%; the ratio of sums answers 125%, because that row
     * contributed the distance the boat actually covered in it and nothing more.
     */
    const withFiller: ScorableRow[] = [
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '5.4', tws: '10', twa: '60' }),
      row({ row_index: 2, row_time: '2026-07-01 19:00:30', sog: '5.4', tws: '10', twa: '30' }),
      row({ row_index: 3, row_time: '2026-07-01 19:01:00', sog: '5.4', tws: '10', twa: '60' }),
      row({ row_index: 4, row_time: '2026-07-01 19:01:30', sog: '5.4', tws: '10', twa: '60' }),
    ]

    const figure = aggregateEfficiency(withFiller, targets)

    expect(figure.rows).toBe(3)
    expect(figure.filler_anchored_rows).toBe(1)
    expect(figure.polar_efficiency).toBeCloseTo((5.4 * 90) / (6 * 30 + 1 * 30 + 6 * 30))
    expect(figure.polar_efficiency).toBeLessThan(1.3)
    // What a mean of the three rows' own percentages would have answered.
    expect((0.9 + 5.4 + 0.9) / 3).toBeCloseTo(2.4)
  })

  it('counts the Filler-Anchored rows rather than excluding them', () => {
    // Stated so a screen can caveat the figure, never used to withhold anything: a sailed row is
    // real regardless of how weak its comparison point is.
    const allFiller: ScorableRow[] = [
      row({ row_index: 1, row_time: '2026-07-01 19:00:00', sog: '2', tws: '10', twa: '30' }),
      row({ row_index: 2, row_time: '2026-07-01 19:00:30', sog: '2', tws: '10', twa: '30' }),
    ]

    const figure = aggregateEfficiency(allFiller, targets)

    expect(figure.rows).toBe(1)
    expect(figure.filler_anchored_rows).toBe(1)
    expect(figure.polar_efficiency).toBe(2)
  })

  it('leaves out rows that are not Countable, and their time with them', () => {
    // ADR 0025: a row that is not Countable never enters a performance number. Its interval goes
    // with it rather than being credited to whichever neighbour is Countable — so the middle row's
    // 30 seconds are absent from the window's elapsed total.
    const excluded = [
      steady[0],
      { ...steady[1], countable: false, sog: '9' },
      steady[2],
      row({ row_index: 4, row_time: '2026-07-01 19:01:30', sog: '5.4', tws: '10', twa: '60' }),
    ]

    const figure = aggregateEfficiency(excluded, targets)

    expect(figure.rows).toBe(2)
    expect(figure.elapsed_seconds).toBe(60)
    expect(figure.polar_efficiency).toBeCloseTo(0.9)
  })

  it('accounts for every Countable row in exactly one of its three tallies', () => {
    // A row that left the figure and is tallied nowhere is a silent omission, which is the one
    // thing ADR 0025 asks a coverage count to prevent. Here: two rows summed, one off the
    // certificate's axes, one last row with no interval, and one excluded as not Countable.
    const mixed = [
      steady[0],
      row({ row_index: 2, row_time: '2026-07-01 19:00:30', sog: '9', tws: '26', twa: '60' }),
      { ...steady[2], countable: false },
      row({ row_index: 4, row_time: '2026-07-01 19:01:30', sog: '5.4', tws: '10', twa: '60' }),
      row({ row_index: 5, row_time: '2026-07-01 19:02:00', sog: '5.4', tws: '10', twa: '60' }),
    ]

    const figure = aggregateEfficiency(mixed, targets)
    const countable = mixed.filter((at) => at.countable).length

    expect(countable).toBe(4)
    expect(figure.rows).toBe(2)
    expect(figure.rows_without_target).toBe(1)
    expect(figure.rows_without_interval).toBe(1)
    expect(figure.rows + figure.rows_without_target + figure.rows_without_interval).toBe(countable)
  })

  it('counts a row with no target separately, and in neither sum', () => {
    const offGrid = [
      steady[0],
      row({ row_index: 2, row_time: '2026-07-01 19:00:30', sog: '9', tws: '26', twa: '60' }),
      steady[2],
    ]

    const figure = aggregateEfficiency(offGrid, targets)

    expect(figure.rows).toBe(1)
    expect(figure.rows_without_target).toBe(1)
    expect(figure.polar_efficiency).toBeCloseTo(0.9)
  })

  it('reports no figure at all for a window with nothing summable in it', () => {
    // Null and never 0% or 100%: a window of frozen rows measured nothing, and a fabricated
    // efficiency is exactly the plausible stand-in the core beliefs forbid.
    const figure = aggregateEfficiency(
      [{ ...steady[0], countable: false }, { ...steady[1], countable: false }],
      targets
    )

    expect(figure.polar_efficiency).toBeNull()
    expect(figure.vmg_efficiency).toBeNull()
    expect(figure.rows).toBe(0)
  })

  it('sums VMG over its own subset, so the two sums describe the same rows', () => {
    const figure = aggregateEfficiency(steady, targets)

    // TWA 60 at 10 knots: VMG 5.4 x cos60 = 2.7 against a target VMG of 6 x cos60 = 3.
    expect(figure.actual_vmg_distance_nm).toBeCloseTo((2.7 * 60) / 3600)
    expect(figure.target_vmg_distance_nm).toBeCloseTo((3 * 60) / 3600)
    expect(figure.vmg_efficiency).toBeCloseTo(0.9)
  })

  it('re-aggregates by adding sums, which is why the sums are reported', () => {
    // A season figure adds two races' sums; it does not average their ratios. Pinned because the
    // Sail Selection Screen's per-slice shape depends on it (ADR 0030).
    const fast = aggregateEfficiency(steady, targets)
    const slow = aggregateEfficiency(
      steady.map((at) => ({ ...at, sog: '3' })),
      targets
    )

    const season =
      (fast.actual_distance_nm + slow.actual_distance_nm) /
      (fast.target_distance_nm + slow.target_distance_nm)

    expect(season).toBeCloseTo((5.4 + 3) / (6 + 6))
    expect(season).not.toBeCloseTo(
      ((fast.polar_efficiency ?? 0) + (slow.polar_efficiency ?? 0)) / 2 + 0.01
    )
  })
})

describe('what a caller hands this module', () => {
  /**
   * `ScorableRow` is a narrow port — six fields of a row with twenty-one — so that this module
   * cannot quietly grow a dependency on a channel it has no rule about. It is deliberately *not* a
   * second shape to build: a `ReadableRow` satisfies it, and `readableRows` is the one join from a
   * Transcription to its Countable verdicts, with the one refusal to line two misaligned row lists
   * up by index. The join and that refusal are `readable-rows.test.ts`'s to pin; what is pinned
   * here is that the two compose at all.
   */
  /** Two fixes half a minute apart on starboard, the second of them barely moving. */
  function recording(): Transcription {
    const header = 'Date;Longitude;Latitude;COG;SOG;TWS;TWA'
    const lines = [
      '07/01/2026 19:00:00;-87.61237000;41.88459000;210.0;5.4;10.0;60.0',
      '07/01/2026 19:00:30;-87.61237100;41.88459100;211.0;1.2;10.0;60.0',
    ]
    const outcome = parseQtvlmRecording([header, ...lines, ''].join('\n'))
    if (!outcome.ok) throw new Error(`expected a Transcription, got ${outcome.reason}`)
    return outcome.transcription
  }

  it('takes a ReadableRow as a ScorableRow, with no second join in between', () => {
    const { rows } = recording()
    const quality = assessRowQuality(rows)
    const joined: ScorableRow[] = readableRows(
      rows,
      analysisRows(quality, detectManeuvers(rows, quality))
    )

    expect(joined[0].countable).toBe(true)
    // 1.2 knots is below the Low-Speed gate: the boat was not sailing.
    expect(joined[1].countable).toBe(false)
    // 5.4 knots against the 6-knot target at TWA 60 in 10, over the one measured interval.
    expect(aggregateEfficiency(joined, targets).polar_efficiency).toBeCloseTo(0.9)
  })
})
