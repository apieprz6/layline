/**
 * The tool against the screen, over one fixture: they must agree (ADR 0042).
 *
 * Every assertion here compares the tool with the Polar performance screen's own code, rendered or
 * called, and never with a literal. A literal would fail on every intended change to a rule and pass
 * the day the tool held a copy of one. The rules' own literals are in
 * `services/analysis/__tests__/polar-performance.test.ts` and `coverage-ledger.test.ts`.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { polarPerformanceAnswer } from '../polar-performance'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import {
  POLAR,
  POLAR_VERSION,
  RACES,
  ROWS,
  VOCABULARY,
  matchableRow,
} from '@/components/analysis/__tests__/fixture'
import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions, matchedRows } from '@/services/analysis/filter'
import { excludedFromFigures, getPolarPerformanceData } from '@/services/analysis/polar-performance'
import { DEFAULT_FOCUS, focusRange, seasonWindow, windowReading } from '@/services/analysis/polar-plot'
import type { AnalysisFilter, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)
const POLARS = { [POLAR_VERSION]: POLAR }

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
      polars={POLARS}
    />
  )
}

describe.each(FILTERS)('polarPerformanceAnswer over %s', (_name, filter) => {
  const answer = polarPerformanceAnswer(FIXTURE, filter, DIMENSIONS, POLARS)

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
    const answer = polarPerformanceAnswer(FIXTURE, { buckets: {}, range: null }, DIMENSIONS, POLARS)

    expect(answer.polarEfficiency.fillerAnchored).toBe(true)
    expect(answer.vmgEfficiency.scoredSeconds).toBeLessThan(answer.polarEfficiency.scoredSeconds)
  })

  it('echoes the filter it applied and every bucket each dimension offers, empty ones included', () => {
    const answer = polarPerformanceAnswer(ROWS, { buckets: { pos: ['upwind'] }, range: null }, DIMENSIONS, POLARS)

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

describe.each(FILTERS)('the wind window over %s', (_name, filter) => {
  const answer = polarPerformanceAnswer(FIXTURE, filter, DIMENSIONS, POLARS, DEFAULT_FOCUS)
  const window = answer.windWindow!

  it('draws the window the screen opens on, over the same time', () => {
    renderScreen(filter)

    expect(screen.getByTestId('polar-plot-window')).toHaveTextContent(
      `${window.lowKnots}–${window.highKnots} kt`
    )
    // The line under the knots: the window's time, its own percent of target and its flag.
    expect(screen.getByTestId('polar-plot-window-reading')).toHaveTextContent(window.reading)
    if (window.polarEfficiency.percent !== null) {
      expect(window.reading).toContain(window.polarEfficiency.percent)
    }
  })

  it('reads each patch as the screen’s patch card does', () => {
    renderScreen(filter)

    const drawn = screen.queryAllByTestId('polar-plot-patch')
    expect(drawn).toHaveLength(window.patches.length)

    for (const [index, patch] of window.patches.entries()) {
      fireEvent.click(drawn[index])
      const card = screen.getByTestId('polar-plot-patch-card')

      expect(card).toHaveTextContent(
        `${patch.twaDegrees.from}–${patch.twaDegrees.to}° at ${patch.sogKnots.from.toFixed(1)}–${patch.sogKnots.to.toFixed(1)} kt`
      )
      expect(card).toHaveTextContent(`${patch.percent ?? 'no figure'} of target`)
      expect(within(card).queryByTestId('polar-plot-patch-filler') !== null).toBe(patch.fillerAnchored)
    }
  })

  it('carries what the screen’s own window holds, renamed and not recomputed', () => {
    const matched = matchedRows(FIXTURE, filter, DIMENSIONS)
    const view = seasonWindow(matched, POLARS, DEFAULT_FOCUS.centre, DEFAULT_FOCUS.width)

    expect(window).toMatchObject({
      lowKnots: view.focus.low,
      highKnots: view.focus.high,
      polarColumnsInPlay: view.columns_in_play,
      notDrawn: { seconds: view.undrawn.seconds },
    })
    expect(window.polarEfficiency.ratio).toBe(view.efficiency.polar_efficiency)
    expect(window.reading).toBe(windowReading(view.efficiency))
    // The screen states no VMG figure for a window, so neither does the tool.
    expect(window).not.toHaveProperty('vmgEfficiency')
    expect(window.patches.map((patch) => patch.scoredSeconds)).toEqual(
      view.patches.map((patch) => patch.efficiency.elapsed_seconds)
    )
  })
})

describe('the wind window', () => {
  it('keeps two winds apart: the same box at 4 and at 12 knots is two answers, never one', () => {
    // Same angle, same speed, so one patch if they were ever drawn together: 110% of a 4 kt
    // target and 50% of a 12 kt one.
    const light = matchableRow({
      tws: 4,
      sog: 5.5,
      efficiency: { ...matchableRow().efficiency, target_speed: { knots: 5, filler_anchored: false } },
    })
    const fresh = matchableRow({
      tws: 12,
      sog: 5.5,
      efficiency: { ...matchableRow().efficiency, target_speed: { knots: 11, filler_anchored: false } },
    })
    const rows = [light, fresh]
    const none = { buckets: {}, range: null }

    const at4 = polarPerformanceAnswer(rows, none, DIMENSIONS, POLARS, { centre: 4, width: 2 }).windWindow!
    const at12 = polarPerformanceAnswer(rows, none, DIMENSIONS, POLARS, { centre: 12, width: 2 }).windWindow!

    expect(at4.patches).toHaveLength(1)
    expect(at12.patches).toHaveLength(1)
    // A worked example and not a parity check: 5.5 / 5 and 5.5 / 11.
    expect(at4.patches[0].percent).toBe('110%')
    expect(at12.patches[0].percent).toBe('50%')
  })

  it('is absent where none was asked for, and the answer says which windows can be asked', () => {
    const answer = polarPerformanceAnswer(FIXTURE, { buckets: {}, range: null }, DIMENSIONS, POLARS)
    const range = focusRange([POLAR])!

    expect(answer.windWindow).toBeNull()
    expect(answer.windWindowOptions).toEqual({
      centreFromKnots: range.from,
      centreToKnots: range.to,
      widthsKnots: [2, 4, 6],
    })
  })
})
