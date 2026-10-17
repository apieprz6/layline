import { render, screen, within } from '@testing-library/react'
import { polarPerformanceAnswer } from '../polar-performance'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import { RACES, ROWS, VOCABULARY, matchableRow } from '@/components/analysis/__tests__/fixture'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import type { AnalysisFilter, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

/** The fixture with one more June row, scored against a cell the Polar manufactured. */
const WITH_FILLER: MatchableRow[] = [
  ...ROWS,
  matchableRow({
    race_id: 'june',
    sog: 4.5,
    efficiency: {
      row_index: 99,
      target_speed: { knots: 6, filler_anchored: true },
      polar_efficiency: 0.75,
      vmg_zone: 'upwind',
      vmg: 4.5,
      target_vmg: { estimated_knots: 6, filler_anchored: true },
      vmg_efficiency: 0.75,
    },
  }),
]

function renderScreen(rows: MatchableRow[], filter: AnalysisFilter): void {
  render(
    <PolarPerformanceContent
      rows={rows}
      races={RACES}
      dimensions={DIMENSIONS}
      initialFilter={filter}
      polars={{}}
    />
  )
}

describe('polarPerformanceAnswer', () => {
  it('states the figures the Polar performance screen prints for the same filter', () => {
    const filter: AnalysisFilter = { buckets: { sail: ['Main + Jib 1'] }, range: null }
    const answer = polarPerformanceAnswer(WITH_FILLER, filter, DIMENSIONS)

    renderScreen(WITH_FILLER, filter)

    // 6 + 3 + 4.5 knots over three 6 kt targets, a minute each: 13.5 / 18.
    expect(answer.polarEfficiency.percent).toBe('75.0%')
    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent(answer.polarEfficiency.percent!)
    expect(screen.getByTestId('vmg-efficiency')).toHaveTextContent(answer.vmgEfficiency.percent!)
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(answer.coverageLedger.statement[0])
  })

  it('flags the Filler-Anchored share beside each figure, and still gives the figure', () => {
    const answer = polarPerformanceAnswer(
      WITH_FILLER,
      { buckets: { sail: ['Main + Jib 1'] }, range: null },
      DIMENSIONS
    )

    renderScreen(WITH_FILLER, { buckets: { sail: ['Main + Jib 1'] }, range: null })

    expect(answer.polarEfficiency).toMatchObject({ ratio: 0.75, fillerAnchoredShare: 1 / 3, fillerAnchored: true })
    expect(answer.vmgEfficiency).toMatchObject({ fillerAnchoredShare: 1 / 3, fillerAnchored: true })
    expect(
      within(screen.getByTestId('polar-efficiency')).getByTestId('polar-efficiency-filler-anchored')
    ).toHaveTextContent('33%')
  })

  it('carries the Coverage Ledger in time: what matched, what was scored, what was left out and why', () => {
    // Untouched: the whole archive, the July rows nobody annotated included.
    const answer = polarPerformanceAnswer(ROWS, { buckets: {}, range: null }, DIMENSIONS)

    expect(answer.coverageLedger).toMatchObject({
      matchedSeconds: 240,
      totalSeconds: 240,
      matchedRaces: 2,
      totalRaces: 2,
      countableSeconds: 180,
    })
    expect(answer.polarEfficiency.scoredSeconds).toBe(180)
    expect(answer.vmgEfficiency.scoredSeconds).toBe(180)
    expect(answer.coverageLedger.excluded).toEqual([
      { reason: 'Not Countable: frozen, low-speed or mid-maneuver', seconds: 60 },
    ])
    // Both July rows lack a Sea State; only one lacks a Sail Configuration, the other is Note only.
    expect(answer.coverageLedger.notRecorded).toEqual([
      { dimension: 'sea', missing: 'Sea state', seconds: 120, share: 0.5 },
      { dimension: 'sail', missing: 'Sail Configuration', seconds: 60, share: 0.25 },
    ])
    expect(answer.coverageLedger.statement).toEqual([
      '2 of 2 races · 4m recorded',
      '3m of it can be scored; 1m is frozen, low-speed or mid-maneuver.',
      'Of that, 50% has no Sea state recorded.',
      'Of that, 25% has no Sail Configuration recorded.',
    ])
  })

  it('states time the Polar could not score, which is excluded from the figure and not hidden', () => {
    const rows = [
      ...ROWS,
      matchableRow({
        efficiency: { ...matchableRow().efficiency, target_speed: null, target_vmg: null, vmg: null },
      }),
    ]

    const answer = polarPerformanceAnswer(rows, { buckets: {}, range: null }, DIMENSIONS)

    expect(answer.coverageLedger.excluded).toContainEqual({
      reason:
        'Countable, but not scored: no SOG, or no Target Speed (outside the Polar, or no Polar for the race)',
      seconds: 60,
    })
  })

  it('gives VMG Efficiency its own time, and says what it left out that Polar Efficiency kept', () => {
    const rows = [
      ...ROWS,
      matchableRow({ efficiency: { ...matchableRow().efficiency, target_vmg: null } }),
    ]

    const answer = polarPerformanceAnswer(rows, { buckets: {}, range: null }, DIMENSIONS)

    expect(answer.polarEfficiency.scoredSeconds).toBe(240)
    expect(answer.vmgEfficiency.scoredSeconds).toBe(180)
    expect(answer.coverageLedger.excluded).toContainEqual({
      reason: 'Scored for Polar Efficiency, but no Target VMG: left out of VMG Efficiency only',
      seconds: 60,
    })
  })

  it('gives no number where nothing could be scored, and says so in words', () => {
    const answer = polarPerformanceAnswer(ROWS, { buckets: { sea: ['rough'] }, range: null }, DIMENSIONS)

    expect(answer.polarEfficiency).toMatchObject({ ratio: null, percent: null, fillerAnchoredShare: null })
    expect(answer.polarEfficiency.note).toMatch(/could be scored/)
  })

  it('echoes the filter it applied and the vocabulary each dimension offers', () => {
    const answer = polarPerformanceAnswer(ROWS, { buckets: { pos: ['upwind'] }, range: null }, DIMENSIONS)

    expect(answer.filter).toEqual({ pos: ['upwind'] })
    expect(answer.dimensions.map((each) => each.dimension)).toEqual(['pos', 'sail', 'sea', 'time', 'when'])
    expect(answer.dimensions.find((each) => each.dimension === 'sail')?.buckets.map((b) => b.id)).toEqual([
      'not-recorded',
      'note-only',
      'Main + Jib 1',
      'Main + Jib 2',
      'Reef + Jib 2',
    ])
  })
})
