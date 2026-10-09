/**
 * The Polar performance screen's own aggregation: two figures over the matched, Countable rows.
 *
 * What is pinned here is the three rules that make the figures honest, every one of them a place
 * an obvious implementation gets it wrong:
 *
 *   - a figure is a **ratio of sums**, so a short row cannot weigh what a long one does (ADR 0036);
 *   - **Countable** is a hard exclusion, independent of whether a row matched (ADR 0025, ADR 0026);
 *   - a **Filler-Anchored** row is counted and **flagged**, never withheld (ADR 0036).
 */

import {
  EMPTY_FILTER,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import {
  fillerAnchoredShare,
  getPolarPerformanceData,
  vmgFillerAnchoredShare,
} from '@/services/analysis/polar-performance'
import type { MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, {
  sails: ['Main + Jib 1'],
  months: ['2026-06', '2026-07'],
})

let nextIndex = 0

/** A row the Polar could answer for: `sog` knots against `target` knots, for `seconds`. */
function scored(over: {
  sog?: number
  target?: number | null
  seconds?: number | null
  countable?: boolean
  filler?: boolean
  tws?: number | null
  race_id?: string
  day?: string
}): MatchableRow {
  nextIndex += 1
  const target = over.target === undefined ? 6 : over.target
  const sog = over.sog ?? 6

  return {
    race_id: over.race_id ?? 'race-a',
    row_index: nextIndex,
    day: over.day ?? '2026-06-03',
    day_seconds: 19 * 3600,
    tws: over.tws === undefined ? 11 : over.tws,
    twa: 42,
    sea_state: 'calm',
    sail: { recorded: 'definition', label: 'Main + Jib 1' },
    countable: over.countable ?? true,
    interval_seconds: over.seconds === undefined ? 60 : over.seconds,
    sog,
    efficiency: {
      row_index: nextIndex,
      target_speed: target === null ? null : { knots: target, filler_anchored: over.filler ?? false },
      polar_efficiency: target === null ? null : sog / target,
      vmg_zone: 'upwind',
      vmg: sog,
      target_vmg: target === null ? null : { estimated_knots: target, filler_anchored: false },
      vmg_efficiency: target === null ? null : sog / target,
    },
  }
}

describe('Polar Efficiency and VMG Efficiency over a matched set', () => {
  it('weighs each row by the seconds it actually lasted, not one row one vote', () => {
    // 10 minutes at the target, then 1 minute at half of it. A mean of percentages says 75%;
    // the ratio of sums says 95.5%, which is what the boat did.
    const data = getPolarPerformanceData(
      [scored({ sog: 6, target: 6, seconds: 600 }), scored({ sog: 3, target: 6, seconds: 60 })],
      EMPTY_FILTER,
      DIMENSIONS
    )

    expect(data.overall.polar_efficiency).toBeCloseTo((6 * 600 + 3 * 60) / (6 * 660))
    expect(data.overall.rows).toBe(2)
  })

  it('computes VMG Efficiency over the same rows', () => {
    const data = getPolarPerformanceData([scored({ sog: 3, target: 6 })], EMPTY_FILTER, DIMENSIONS)
    expect(data.overall.vmg_efficiency).toBeCloseTo(0.5)
  })

  it('excludes a row that is not Countable even though it matched every bucket', () => {
    const data = getPolarPerformanceData(
      [scored({ sog: 6, target: 6 }), scored({ sog: 1, target: 6, countable: false })],
      EMPTY_FILTER,
      DIMENSIONS
    )

    expect(data.overall.rows).toBe(1)
    expect(data.overall.polar_efficiency).toBeCloseTo(1)
    // The ledger still counts it as matched, because matching and counting are different
    // questions (ADR 0026).
    expect(data.ledger.matched_rows).toBe(2)
    expect(data.ledger.countable_rows).toBe(1)
  })

  it('excludes the rows a narrowing excluded', () => {
    const data = getPolarPerformanceData(
      [scored({ sog: 6, target: 6, tws: 11 }), scored({ sog: 3, target: 6, tws: 18 })],
      { buckets: { wind: ['medium'] }, range: null },
      DIMENSIONS
    )

    expect(data.overall.rows).toBe(1)
    expect(data.overall.polar_efficiency).toBeCloseTo(1)
  })

  it('answers null rather than zero when nothing could be summed', () => {
    const data = getPolarPerformanceData([], EMPTY_FILTER, DIMENSIONS)
    expect(data.overall.polar_efficiency).toBeNull()
    expect(data.overall.vmg_efficiency).toBeNull()
  })

  it('accounts for every Countable row, including the ones that left no figure', () => {
    const data = getPolarPerformanceData(
      [
        scored({}),
        scored({ target: null }),
        scored({ seconds: null }),
        scored({ countable: false }),
      ],
      EMPTY_FILTER,
      DIMENSIONS
    )

    const { rows, rows_without_target, rows_without_interval } = data.overall
    expect(rows + rows_without_target + rows_without_interval).toBe(3)
  })
})

describe('a Filler-Anchored figure is shown and flagged, never withheld', () => {
  const rows = [scored({ sog: 6, target: 6 }), scored({ sog: 6, target: 3, filler: true })]
  const data = getPolarPerformanceData(rows, EMPTY_FILTER, DIMENSIONS)

  it('counts the Filler-Anchored row into the figure', () => {
    expect(data.overall.rows).toBe(2)
    expect(data.overall.polar_efficiency).toBeCloseTo((6 + 6) / (6 + 3))
  })

  it('says how many of the rows behind the figure rest on the Polar’s own filler', () => {
    expect(data.overall.filler_anchored_rows).toBe(1)
    expect(fillerAnchoredShare(data.overall)).toBeCloseTo(0.5)
  })

  it('has no share to report where no row was summed', () => {
    expect(fillerAnchoredShare(getPolarPerformanceData([], EMPTY_FILTER, DIMENSIONS).overall)).toBeNull()
    expect(
      vmgFillerAnchoredShare(getPolarPerformanceData([], EMPTY_FILTER, DIMENSIONS).overall)
    ).toBeNull()
  })

  it('sizes VMG’s doubt over VMG’s own rows, not Target Speed’s', () => {
    // A row with a Target Speed and no Target VMG is real — rare, but real. Here both scored rows
    // carry a Target Speed and only one carries a Target VMG, and that one rests on filler: the
    // Polar figure is 1 in 2 filler-anchored, the VMG figure is 1 in 1.
    const noVmgTarget = scored({})
    noVmgTarget.efficiency = { ...noVmgTarget.efficiency, target_vmg: null, vmg_efficiency: null }

    const onFiller = scored({ filler: true })
    onFiller.efficiency = {
      ...onFiller.efficiency,
      target_vmg: { estimated_knots: 6, filler_anchored: true },
    }

    const { overall } = getPolarPerformanceData([noVmgTarget, onFiller], EMPTY_FILTER, DIMENSIONS)

    expect(overall.rows).toBe(2)
    expect(overall.vmg_rows).toBe(1)
    expect(fillerAnchoredShare(overall)).toBeCloseTo(0.5)
    expect(vmgFillerAnchoredShare(overall)).toBe(1)
  })
})

describe('the per-band breakdown', () => {
  const rows = [
    scored({ sog: 6, target: 6, tws: 11 }),
    scored({ sog: 3, target: 6, tws: 18 }),
    scored({ sog: 3, target: 6, tws: null }),
  ]

  const data = getPolarPerformanceData(rows, EMPTY_FILTER, DIMENSIONS)

  it('renders every band in the vocabulary, in band order, empty ones included', () => {
    expect(data.bands.map((band) => band.bucket.id)).toEqual([
      'light',
      'medium',
      'heavy',
      'storm',
      'not-recorded',
    ])
  })

  it('reads the Polar’s own axis as the band, so each figure is over one wind range', () => {
    const byId = new Map(data.bands.map((band) => [band.bucket.id, band]))
    expect(byId.get('medium')?.efficiency.polar_efficiency).toBeCloseTo(1)
    expect(byId.get('heavy')?.efficiency.polar_efficiency).toBeCloseTo(0.5)
    expect(byId.get('light')?.efficiency.polar_efficiency).toBeNull()
  })

  it('keeps the rows that recorded no wind in their own band rather than in a real one', () => {
    const notRecorded = data.bands.find((band) => band.bucket.id === 'not-recorded')
    expect(notRecorded?.efficiency.rows).toBe(1)
  })

  it('narrows with the filter, rather than showing the whole archive beside a narrowed figure', () => {
    const narrowed = getPolarPerformanceData(rows, { buckets: { wind: ['medium'] }, range: null }, DIMENSIONS)
    expect(narrowed.bands.find((band) => band.bucket.id === 'heavy')?.efficiency.rows).toBe(0)
  })

  it('has no band breakdown on a screen that does not offer the wind dimension', () => {
    const withoutWind = analysisDimensions(['pos', 'sea'], { sails: [], months: [] })
    expect(getPolarPerformanceData(rows, EMPTY_FILTER, withoutWind).bands).toEqual([])
  })
})
