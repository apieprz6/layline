/**
 * The **Coverage Ledger**: what is matched, and how much of it rests on sailing nobody annotated.
 *
 * Two things are under test as much as the arithmetic. The **permanence** — every assertion about
 * an untouched filter is an assertion that the figure is there before anybody narrows anything
 * (ADR 0029). And the **unit**: this counts in measured time and never in rows, because a row
 * count cannot be held against a sailor's memory of the afternoon (ADR 0009) and, since qtVlm logs
 * on events rather than on a clock, is not even proportional to one. Every row below carries a
 * deliberately uneven interval so that a test asserting time cannot pass by counting.
 */

import {
  countableSentence,
  coverageLedger,
  gapSentence,
  ledgerHeadline,
} from '@/services/analysis/coverage-ledger'
import {
  EMPTY_FILTER,
  NOT_RECORDED,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { AnalysisFilter, CoverageLedger, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, {
  sails: ['Main + Jib 1'],
  months: ['2026-06'],
})

/** The Crossover Chart Version these rows were sailed under: the vocabulary their sail numbers are in. */
const CHART_VERSION = 'chart-version-1'

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
    crossover_chart_version_id: CHART_VERSION,
    sail: { recorded: 'definition', definition_number: 1, label: 'Main + Jib 1' },
    countable: true,
    interval_seconds: 60,
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

/** A ledger as the renderers take one, for the sentence tests. */
function ledger(over: Partial<CoverageLedger> = {}): CoverageLedger {
  return {
    matched_seconds: 15_120,
    total_seconds: 15_120,
    countable_seconds: 10_860,
    matched_rows: 3251,
    matched_races: 13,
    total_races: 13,
    gaps: [],
    ...over,
  }
}

describe('the ledger over an untouched filter', () => {
  // 10 minutes annotated, 30 minutes not, 20 minutes not and not Countable either.
  const rows = [
    row({ race_id: 'a', interval_seconds: 600 }),
    row({
      race_id: 'a',
      interval_seconds: 1_800,
      sea_state: null,
      sail: { recorded: 'not-recorded' },
    }),
    row({
      race_id: 'b',
      interval_seconds: 1_200,
      sea_state: null,
      sail: { recorded: 'not-recorded' },
      countable: false,
    }),
  ]

  const subject = coverageLedger(rows, EMPTY_FILTER, DIMENSIONS)

  it('states the sailing it matched against the archive’s own total', () => {
    expect(subject.matched_seconds).toBe(3_600)
    expect(subject.total_seconds).toBe(3_600)
  })

  it('counts races by grouping matched rows, never by filtering at the Race', () => {
    expect(subject.matched_races).toBe(2)
    expect(subject.total_races).toBe(2)
  })

  it('says how much of it a figure may actually be computed over', () => {
    expect(subject.countable_seconds).toBe(2_400)
  })

  it('reports the unannotated share per dimension, before anybody has narrowed anything', () => {
    const sea = subject.gaps.find((gap) => gap.dimension === 'sea')
    expect(sea?.seconds).toBe(3_000)
    expect(sea?.share).toBeCloseTo(3_000 / 3_600)
    expect(subject.gaps.find((gap) => gap.dimension === 'sail')?.seconds).toBe(3_000)
  })

  it('weighs a gap by how long it lasted, not by how many rows it took', () => {
    // One 30-minute unannotated row against two annotated 5-minute ones: by rows that is a third
    // of the match, and by time it is three quarters. Only the second is a fact about the sailing.
    const uneven = coverageLedger(
      [
        row({ interval_seconds: 300 }),
        row({ interval_seconds: 300 }),
        row({ interval_seconds: 1_800, sea_state: null }),
      ],
      EMPTY_FILTER,
      DIMENSIONS
    )

    expect(uneven.gaps.find((gap) => gap.dimension === 'sea')?.share).toBeCloseTo(0.75)
  })

  it('names the thing that is missing rather than the chip it is filtered by', () => {
    expect(subject.gaps.find((gap) => gap.dimension === 'sail')?.label).toBe('Sail Configuration')
    expect(subject.gaps.find((gap) => gap.dimension === 'sea')?.label).toBe('Sea state')
  })

  it('leaves out a dimension nothing is missing for, rather than printing a zero line', () => {
    expect(subject.gaps.map((gap) => gap.dimension)).not.toContain('wind')
  })

  it('orders the gaps biggest first, which is the order a sailor should read them in', () => {
    const lopsided = coverageLedger(
      [
        ...rows,
        row({
          race_id: 'c',
          interval_seconds: 900,
          tws: null,
          sea_state: null,
          sail: { recorded: 'not-recorded' },
        }),
      ],
      EMPTY_FILTER,
      DIMENSIONS
    )
    expect(lopsided.gaps[0].seconds).toBeGreaterThanOrEqual(lopsided.gaps[1].seconds)
  })

  it('counts a row whose interval could not be measured as matched but as no time', () => {
    // The last row of every window has no measured interval (`rowIntervalSeconds`), so the ledger
    // is a floor. What it must not do is drop the row from the match or invent a span for it.
    const withLastRow = coverageLedger(
      [row({ interval_seconds: 600 }), row({ interval_seconds: null })],
      EMPTY_FILTER,
      DIMENSIONS
    )

    expect(withLastRow.matched_rows).toBe(2)
    expect(withLastRow.matched_seconds).toBe(600)
  })
})

describe('the ledger as the filter narrows', () => {
  const rows = [
    row({ race_id: 'a', tws: 11, interval_seconds: 600 }),
    row({ race_id: 'a', tws: 18, interval_seconds: 600, sea_state: null }),
    row({ race_id: 'b', tws: 18, interval_seconds: 600 }),
  ]

  it('follows the narrowing while keeping the archive’s total in view', () => {
    const narrowed: AnalysisFilter = { buckets: { wind: ['heavy'] }, range: null }
    const subject = coverageLedger(rows, narrowed, DIMENSIONS)

    expect(subject.matched_seconds).toBe(1_200)
    expect(subject.total_seconds).toBe(1_800)
    expect(subject.matched_races).toBe(2)
    expect(subject.gaps.find((gap) => gap.dimension === 'sea')?.share).toBeCloseTo(0.5)
  })

  it('reports a share of nothing as nothing rather than as zero percent', () => {
    const subject = coverageLedger(rows, { buckets: { sea: ['rough'] }, range: null }, DIMENSIONS)
    expect(subject.matched_rows).toBe(0)
    expect(subject.matched_seconds).toBe(0)
    expect(subject.gaps).toEqual([])
  })

  it('still states the gap when the sailor has narrowed *to* it', () => {
    const subject = coverageLedger(
      rows,
      { buckets: { sea: [NOT_RECORDED] }, range: null },
      DIMENSIONS
    )
    expect(subject.matched_seconds).toBe(600)
    expect(subject.gaps.find((gap) => gap.dimension === 'sea')?.share).toBe(1)
  })

  it('reads an empty archive without inventing a denominator', () => {
    expect(coverageLedger([], EMPTY_FILTER, DIMENSIONS)).toEqual({
      matched_seconds: 0,
      total_seconds: 0,
      countable_seconds: 0,
      matched_rows: 0,
      matched_races: 0,
      total_races: 0,
      gaps: [],
    })
  })
})

describe('the words the ledger prints', () => {
  it('leads with the races and follows with the sailing, never a row count', () => {
    expect(ledgerHeadline(ledger())).toBe('13 of 13 races · 4h 12m recorded')
  })

  it('states the part a figure may read and the part it may not', () => {
    expect(countableSentence(ledger())).toBe(
      '3h 1m of it can be scored; 1h 11m is frozen, low-speed or mid-maneuver.'
    )
  })

  it('drops the second clause when nothing was excluded, rather than saying 0s is frozen', () => {
    expect(countableSentence(ledger({ countable_seconds: 15_120 }))).toBe(
      '4h 12m of it can be scored.'
    )
  })

  it('writes the gap sentence as a share of the sailing on screen', () => {
    expect(gapSentence({ dimension: 'sea', label: 'Sea state', seconds: 7_380, share: 0.49 })).toBe(
      'Of that, 49% has no Sea state recorded.'
    )
  })

  it('falls back to the duration itself where there is no share to take', () => {
    // Nothing was measured, so there is no denominator. The gap is still real and still stated.
    expect(gapSentence({ dimension: 'sail', label: 'Sail Configuration', seconds: 0, share: null }))
      .toBe('Of that, 0s has no Sail Configuration recorded.')
  })

  it('never prints the word row', () => {
    const printed = [
      ledgerHeadline(ledger()),
      countableSentence(ledger()),
      gapSentence({ dimension: 'sea', label: 'Sea state', seconds: 7_380, share: 0.49 }),
    ].join(' ')

    expect(printed).not.toMatch(/\brows?\b/i)
  })
})
