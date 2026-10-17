/**
 * The tool against the screen, over one fixture: they must agree (ADR 0042).
 *
 * Every assertion here compares the tool with the Polar performance screen's own code, rendered or
 * called, and never with a literal. A literal would fail on every intended change to a rule and pass
 * the day the tool held a copy of one. The rules' own literals are in
 * `services/analysis/__tests__/polar-performance.test.ts` and `coverage-ledger.test.ts`.
 */

import { render, screen, within } from '@testing-library/react'
import { polarPerformanceAnswer } from '../polar-performance'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import { RACES, ROWS, VOCABULARY, matchableRow } from '@/components/analysis/__tests__/fixture'
import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { excludedFromFigures, getPolarPerformanceData } from '@/services/analysis/polar-performance'
import type { AnalysisFilter, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

/**
 * The fixture, plus a June row scored against a cell the Polar manufactured and one the Polar
 * could score for speed but not for VMG — so the flag and VMG's own subset both have something to
 * agree about.
 */
const FIXTURE: MatchableRow[] = [
  ...ROWS,
  matchableRow({
    race_id: 'june',
    sog: 4.5,
    efficiency: {
      ...matchableRow().efficiency,
      target_speed: { knots: 6, filler_anchored: true },
      target_vmg: { estimated_knots: 6, filler_anchored: true },
    },
  }),
  matchableRow({ race_id: 'june', efficiency: { ...matchableRow().efficiency, target_vmg: null } }),
]

const FILTERS: [string, AnalysisFilter][] = [
  ['the whole archive', { buckets: {}, range: null }],
  ['one sail', { buckets: { sail: ['Main + Jib 1'] }, range: null }],
  ['upwind, unannotated sea state only', { buckets: { pos: ['upwind'], sea: ['not-recorded'] }, range: null }],
  ['a day range', { buckets: {}, range: { from: '2026-06-01', to: '2026-06-30' } }],
  ['nothing at all', { buckets: { sea: ['rough'] }, range: null }],
]

function renderScreen(filter: AnalysisFilter): void {
  render(
    <PolarPerformanceContent
      rows={FIXTURE}
      races={RACES}
      dimensions={DIMENSIONS}
      initialFilter={filter}
      polars={{}}
    />
  )
}

describe.each(FILTERS)('polarPerformanceAnswer over %s', (_name, filter) => {
  const answer = polarPerformanceAnswer(FIXTURE, filter, DIMENSIONS)

  it('states the figures the Polar performance screen prints', () => {
    renderScreen(filter)

    for (const [testId, figure] of [
      ['polar-efficiency', answer.polarEfficiency],
      ['vmg-efficiency', answer.vmgEfficiency],
    ] as const) {
      const card = screen.getByTestId(testId)
      expect(card).toHaveTextContent(figure.percent ?? figure.note!)

      // The flag is drawn exactly where the tool raises it, beside its own figure.
      const flag = within(card).queryByTestId(`${testId}-filler-anchored`)
      expect(flag !== null).toBe(figure.fillerAnchored)
    }
  })

  it('states the Coverage Ledger the screen draws, in the screen’s own words', () => {
    renderScreen(filter)

    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      answer.coverageLedger.statement[0]
    )
    // The sentence under the figures, which the screen and the tool take from one function.
    expect(screen.getByText(answer.coverageLedger.statement.at(-1)!, { exact: false })).toBeInTheDocument()
  })

  it('carries what the screen’s own ledger and figures say, renamed and not recomputed', () => {
    const data = getPolarPerformanceData(FIXTURE, filter, DIMENSIONS)

    expect(answer.coverageLedger).toMatchObject({
      matchedSeconds: data.ledger.matched_seconds,
      totalSeconds: data.ledger.total_seconds,
      countableSeconds: data.ledger.countable_seconds,
      matchedRaces: data.ledger.matched_races,
      totalRaces: data.ledger.total_races,
      excluded: excludedFromFigures(data),
    })
    expect(answer.coverageLedger.statement.slice(0, -1)).toEqual([
      ledgerHeadline(data.ledger),
      countableSentence(data.ledger),
      ...data.ledger.gaps.map(gapSentence),
    ])
    expect(answer.polarEfficiency.ratio).toBe(data.overall.polar_efficiency)
    expect(answer.polarEfficiency.scoredSeconds).toBe(data.overall.elapsed_seconds)
    expect(answer.vmgEfficiency.ratio).toBe(data.overall.vmg_efficiency)
    expect(answer.vmgEfficiency.scoredSeconds).toBe(data.overall.vmg_elapsed_seconds)
  })
})

describe('polarPerformanceAnswer', () => {
  it('has figures the fixture can disagree about: a flag, and VMG over less than speed', () => {
    // Guards the parity suite above against a fixture too plain to tell two rules apart.
    const answer = polarPerformanceAnswer(FIXTURE, { buckets: {}, range: null }, DIMENSIONS)

    expect(answer.polarEfficiency.fillerAnchored).toBe(true)
    expect(answer.vmgEfficiency.scoredSeconds).toBeLessThan(answer.polarEfficiency.scoredSeconds)
  })

  it('echoes the filter it applied and every bucket each dimension offers, empty ones included', () => {
    const answer = polarPerformanceAnswer(ROWS, { buckets: { pos: ['upwind'] }, range: null }, DIMENSIONS)

    expect(answer.filter).toEqual({ pos: ['upwind'] })
    expect(answer.dimensions).toEqual(
      DIMENSIONS.map((dimension) => ({
        dimension: dimension.id,
        label: dimension.label,
        buckets: dimension.buckets.map((bucket) => ({
          id: bucket.id,
          label: bucket.label,
          ...(bucket.footnote ? { footnote: bucket.footnote } : {}),
        })),
      }))
    )
  })
})
