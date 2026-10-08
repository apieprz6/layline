/**
 * The **Coverage Ledger**: what is matched, and how much of it rests on rows nobody annotated.
 *
 * The permanence is the thing under test as much as the arithmetic — every assertion about an
 * untouched filter is an assertion that the figure is there before anybody narrows anything
 * (ADR 0029).
 */

import { coverageLedger, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import {
  EMPTY_FILTER,
  NOT_RECORDED,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { AnalysisFilter, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, {
  sails: ['Main + Jib 1'],
  months: ['2026-06'],
})

let nextIndex = 0

function row(over: Partial<MatchableRow> = {}): MatchableRow {
  nextIndex += 1
  return {
    race_id: 'race-a',
    row_index: nextIndex,
    day: '2026-06-03',
    day_seconds: 19 * 3600,
    tws: 11,
    twa: 42,
    sea_state: 'calm',
    sail: { recorded: 'definition', label: 'Main + Jib 1' },
    countable: true,
    interval_seconds: 30,
    sog: 6,
    efficiency: {
      row_index: nextIndex,
      target_speed: null,
      polar_efficiency: null,
      vmg_zone: null,
      vmg: null,
      target_vmg: null,
      vmg_efficiency: null,
    },
    ...over,
  }
}

describe('the ledger over an untouched filter', () => {
  const rows = [
    row({ race_id: 'a' }),
    row({ race_id: 'a', sea_state: null, sail: { recorded: 'not-recorded' } }),
    row({ race_id: 'b', sea_state: null, sail: { recorded: 'not-recorded' }, countable: false }),
  ]

  const ledger = coverageLedger(rows, EMPTY_FILTER, DIMENSIONS)

  it('states the matched rows against the archive’s own total', () => {
    expect(ledger.matched_rows).toBe(3)
    expect(ledger.total_rows).toBe(3)
  })

  it('counts races by grouping matched rows, never by filtering at the Race', () => {
    expect(ledger.matched_races).toBe(2)
    expect(ledger.total_races).toBe(2)
  })

  it('says how many of the matched rows a figure may actually be computed over', () => {
    expect(ledger.countable_rows).toBe(2)
  })

  it('reports the unannotated share per dimension, before anybody has narrowed anything', () => {
    const sea = ledger.gaps.find((gap) => gap.dimension === 'sea')
    expect(sea?.rows).toBe(2)
    expect(sea?.share).toBeCloseTo(2 / 3)
    expect(ledger.gaps.find((gap) => gap.dimension === 'sail')?.rows).toBe(2)
  })

  it('names the thing that is missing rather than the chip it is filtered by', () => {
    expect(ledger.gaps.find((gap) => gap.dimension === 'sail')?.label).toBe('Sail Configuration')
    expect(ledger.gaps.find((gap) => gap.dimension === 'sea')?.label).toBe('Sea state')
  })

  it('leaves out a dimension nothing is missing for, rather than printing a zero line', () => {
    expect(ledger.gaps.map((gap) => gap.dimension)).not.toContain('wind')
  })

  it('orders the gaps biggest first, which is the order a sailor should read them in', () => {
    const lopsided = coverageLedger(
      [...rows, row({ race_id: 'c', tws: null, sea_state: null, sail: { recorded: 'not-recorded' } })],
      EMPTY_FILTER,
      DIMENSIONS
    )
    expect(lopsided.gaps[0].rows).toBeGreaterThanOrEqual(lopsided.gaps[1].rows)
  })
})

describe('the ledger as the filter narrows', () => {
  const rows = [
    row({ race_id: 'a', tws: 11 }),
    row({ race_id: 'a', tws: 18, sea_state: null }),
    row({ race_id: 'b', tws: 18 }),
  ]

  it('follows the narrowing while keeping the archive’s totals in view', () => {
    const narrowed: AnalysisFilter = { buckets: { wind: ['heavy'] }, range: null }
    const ledger = coverageLedger(rows, narrowed, DIMENSIONS)

    expect(ledger.matched_rows).toBe(2)
    expect(ledger.total_rows).toBe(3)
    expect(ledger.matched_races).toBe(2)
    expect(ledger.gaps.find((gap) => gap.dimension === 'sea')?.share).toBeCloseTo(0.5)
  })

  it('reports a share of nothing as nothing rather than as zero percent', () => {
    const ledger = coverageLedger(rows, { buckets: { sea: ['rough'] }, range: null }, DIMENSIONS)
    expect(ledger.matched_rows).toBe(0)
    expect(ledger.gaps).toEqual([])
  })

  it('still states the gap when the sailor has narrowed *to* it', () => {
    const ledger = coverageLedger(rows, { buckets: { sea: [NOT_RECORDED] }, range: null }, DIMENSIONS)
    expect(ledger.matched_rows).toBe(1)
    expect(ledger.gaps.find((gap) => gap.dimension === 'sea')?.share).toBe(1)
  })

  it('reads an empty archive without inventing a denominator', () => {
    const ledger = coverageLedger([], EMPTY_FILTER, DIMENSIONS)
    expect(ledger).toEqual({
      matched_rows: 0,
      total_rows: 0,
      matched_races: 0,
      total_races: 0,
      countable_rows: 0,
      gaps: [],
    })
  })
})

describe('the words the ledger prints', () => {
  it('states rows and the races they came from', () => {
    expect(
      ledgerHeadline({
        matched_rows: 3251,
        total_rows: 3251,
        matched_races: 13,
        total_races: 13,
        countable_rows: 2316,
        gaps: [],
      })
    ).toBe('3,251 rows · 13 of 13 races')
  })

  it('writes the sentence ADR 0029 wrote', () => {
    expect(
      gapSentence({ dimension: 'sea', label: 'Sea state', rows: 1593, share: 0.49 })
    ).toBe('Of those, 1,593 (49%) have no Sea state recorded.')
  })
})
