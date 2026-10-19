/**
 * The tool against the screen, over one fixture: they must agree (ADR 0042).
 *
 * Every parity assertion compares the tool with the Sail Selection Screen's own code, rendered or
 * called, and never with a literal. The rules' own literals are in
 * `services/analysis/__tests__/sail-selection.test.ts` and `archive-sail-selection.test.ts`.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cellFromArgument, sailSelectionAnswer } from '../sail-selection'
import SailSelectionContent from '@/components/analysis/SailSelectionContent'
import SailSelectionTeaser from '@/components/analysis/SailSelectionTeaser'
import { AGREEMENT_GLYPHS } from '@/components/analysis/sail-selection-chrome'
import {
  CHART,
  CHART_VERSION,
  POLAR_RANGE,
  RACES,
  ROWS as SHARED_ROWS,
  VOCABULARY,
  matchableRow,
} from '@/components/analysis/__tests__/fixture'
import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { EMPTY_FILTER, SAIL_SELECTION_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import {
  cellViews,
  chartAgreement,
  getSailSelectionData,
  gridCoverage,
  placementSentence,
} from '@/services/analysis/sail-selection'
import type { AnalysisFilter, MatchableRow, McpCellAgreement, SailSelectionAnswer } from '@/types'

const DIMENSIONS = analysisDimensions(SAIL_SELECTION_DIMENSIONS, VOCABULARY)
const CHART_IN_FORCE = { payload: CHART, versionId: CHART_VERSION, versionNumber: 1 }

/** An unscored row, as `SailSelectionContent.test.tsx` makes the 18 kt ones: past the Polar. */
function unscored(row: MatchableRow): MatchableRow {
  return {
    ...row,
    efficiency: {
      row_index: row.row_index,
      target_speed: null,
      polar_efficiency: null,
      vmg_zone: null,
      vmg: null,
      target_vmg: null,
      vmg_efficiency: null,
    },
  }
}

/**
 * The shared fixture, plus enough to give every verdict something to say: a differing row and an
 * agreeing one in one cell (mixed), a Filler-Anchored one, and an Off-chart sail in a cell of its
 * own, so Not recorded and Off-chart each have a cell where they are the whole answer.
 */
const FIXTURE: MatchableRow[] = [
  ...SHARED_ROWS.map((row) => (row.tws !== null && row.tws > POLAR_RANGE.tws_to ? unscored(row) : row)),
  matchableRow({ tws: 11, sail: { recorded: 'definition', definition_number: 2, label: 'Main + Jib 2' } }),
  matchableRow({
    tws: 11,
    sea_state: 'moderate',
    efficiency: { ...matchableRow().efficiency, target_speed: { knots: 6, filler_anchored: true } },
  }),
  matchableRow({ twa: 95, tws: 12, race_id: 'july', day: '2026-07-01', sail: { recorded: 'note-only' } }),
]

const FILTERS: [string, AnalysisFilter][] = [
  ['the whole archive', EMPTY_FILTER],
  ['calm water only', { buckets: { sea: ['calm'] }, range: null }],
  ['a day range', { buckets: {}, range: { from: '2026-07-01', to: '2026-07-31' } }],
  ['nothing at all', { buckets: { sea: ['rough'] }, range: null }],
]

function renderScreen(filter: AnalysisFilter): ReturnType<typeof userEvent.setup> {
  render(
    <SailSelectionContent
      rows={FIXTURE}
      races={RACES}
      dimensions={DIMENSIONS}
      initialFilter={filter}
      chart={CHART}
      domain={POLAR_RANGE}
      chartVersionId={CHART_VERSION}
    />
  )
  return userEvent.setup({ delay: null })
}

/** The left pane's grid cells, by `twa/tws`. */
function gridCells(): Map<string, HTMLElement> {
  const pane = screen.getAllByTestId('sail-selection-pane')[0]
  return new Map(
    within(pane)
      .getAllByTestId('sail-selection-cell')
      .map((cell) => [`${cell.dataset.twa}/${cell.dataset.tws}`, cell])
  )
}

async function showAgreement(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const pane = screen.getAllByTestId('sail-selection-pane')[0]
  await user.click(
    within(pane)
      .getAllByTestId('sail-selection-layer')
      .find((button) => button.dataset.layer === 'agreement') as HTMLElement
  )
}

function wholeChart(filter: AnalysisFilter): SailSelectionAnswer {
  return sailSelectionAnswer(FIXTURE, filter, DIMENSIONS, CHART_IN_FORCE, POLAR_RANGE, null)
}

describe.each(FILTERS)('the whole chart over %s', (_name, filter) => {
  const answer = wholeChart(filter)
  const cells = answer.regions!.flatMap((region) => region.cells)
  const unreached = answer.regions!.flatMap((region) => region.unreached.flatMap((group) => group.cells))

  it('names every cell of the grid exactly once, inside the region the Chart layer draws it in', () => {
    expect(cells.length + unreached.length).toBe(CHART.twa_axis.length * CHART.tws_axis.length)
    for (const region of answer.regions!) {
      const held = region.unreached.reduce((sum, group) => sum + group.cells.length, 0)
      expect(region.cellCount).toBe(region.cells.length + held)
      expect(region.reachedCells).toBe(region.cells.length)
    }
  })

  it('gives each cell the Cell Agreement the Agreement layer prints, over the rows it states', async () => {
    const user = renderScreen(filter)
    await showAgreement(user)
    const grid = gridCells()

    for (const [twa, tws] of unreached) expect(grid.get(`${twa}/${tws}`)!.dataset.print).toBe('')
    for (const cell of cells) {
      const drawn = grid.get(`${cell.twaDegrees}/${cell.twsKnots}`)!
      expect(drawn.dataset.print).toBe(AGREEMENT_GLYPHS[cell.agreement])
      expect(drawn.getAttribute('aria-label')).toContain(
        `${answer.words.cellAgreement[cell.agreement]} over ${cell.rows} rows from ${cell.races}`
      )
    }
  })

  it('states the grid’s own counts and the screen’s Coverage Ledger and placement words', () => {
    const data = getSailSelectionData(FIXTURE, filter, DIMENSIONS, CHART, POLAR_RANGE, CHART_VERSION)
    const coverage = gridCoverage(cellViews(data.cells))

    expect(answer.grid).toMatchObject({
      cells: coverage.cells,
      reached: coverage.reached,
      withFigure: coverage.with_figure,
      rowsWithoutFigure: coverage.rows_without_figure,
      unreachable: coverage.unreachable,
      mixed: coverage.mixed,
      emptiedByFilter: coverage.ghosted,
    })
    expect(answer.coverageLedger.statement).toEqual([
      ledgerHeadline(data.ledger),
      countableSentence(data.ledger),
      ...data.ledger.gaps.map(gapSentence),
      placementSentence(data),
    ])

    renderScreen(filter)
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(answer.coverageLedger.statement[0])
    expect(screen.getByTestId('sail-selection-placement')).toHaveTextContent(
      answer.coverageLedger.statement.at(-1)!
    )
  })

  it('states Chart Agreement as the screen’s own fold does, the share and both sides', () => {
    const data = getSailSelectionData(FIXTURE, filter, DIMENSIONS, CHART, POLAR_RANGE, CHART_VERSION)
    const agreement = chartAgreement(data.cells)

    expect(answer.chartAgreement).toMatchObject({
      share: agreement.agreement,
      placedRows: agreement.placed_rows,
      judgeableRows: agreement.judgeable_rows,
    })
    expect(answer.chartAgreement!.following.ratio).toBe(agreement.following.polar_efficiency)
    expect(answer.chartAgreement!.differing.ratio).toBe(agreement.differing.polar_efficiency)
    expect(answer.cell).toBeNull()
  })
})

describe('Chart Agreement', () => {
  it('prints the share the Overall tab’s card prints, over the same sailing', () => {
    const answer = wholeChart(EMPTY_FILTER)
    const data = getSailSelectionData(FIXTURE, EMPTY_FILTER, [], CHART, null)

    render(<SailSelectionTeaser races={RACES.length} agreement={chartAgreement(data.cells)} />)

    expect(screen.getByTestId('chart-agreement')).toHaveTextContent(answer.chartAgreement!.percent!)
  })
})

describe('the verdicts', () => {
  const answer = wholeChart(EMPTY_FILTER)
  const at = (twa: number, tws: number) =>
    answer.regions!.flatMap((region) => region.cells).find((cell) => cell.twaDegrees === twa && cell.twsKnots === tws)!
  const unreachedAt = (twa: number, tws: number) =>
    answer.regions!.flatMap((region) => region.unreached).find((group) =>
      group.cells.some(([t, s]) => t === twa && s === tws)
    )

  it('keeps Not recorded and Off-chart apart from Differs, each as a proportion of the cell’s rows', () => {
    // A worked example, not a parity check: the fixture's own rows, cell by cell.
    const mixed = at(40, 10) as McpCellAgreement
    expect(mixed.agreement).toBe('mixed')
    expect(mixed.verdicts).toEqual([
      expect.objectContaining({ verdict: 'agrees', rows: 2, share: 2 / 3 }),
      expect.objectContaining({ verdict: 'differs', rows: 1, share: 1 / 3 }),
    ])

    expect(at(40, 16)).toMatchObject({
      agreement: 'not-recorded',
      verdicts: [expect.objectContaining({ verdict: 'not-recorded', share: 1 })],
    })
    expect(at(90, 10)).toMatchObject({
      agreement: 'off-chart',
      verdicts: [expect.objectContaining({ verdict: 'off-chart', share: 1 })],
    })
  })

  it('reports a cell nobody sailed in as unreached, with its reason', () => {
    expect(at(90, 4)).toBeUndefined()
    expect(unreachedAt(90, 4)?.reason).toBe('No race has reached this cell.')
  })
})

describe.each(FILTERS)('one cell over %s', (_name, filter) => {
  it.each([
    [40, 10],
    [40, 16],
    [90, 10],
    [90, 16],
  ])('states what the cell sheet states for %s° at %s kt', async (twa, tws) => {
    const target = cellFromArgument({ twa, tws }, CHART)
    if (!target.ok) throw new Error(target.message)

    const answer = sailSelectionAnswer(FIXTURE, filter, DIMENSIONS, CHART_IN_FORCE, POLAR_RANGE, target.cell)
    const cell = answer.cell!
    expect(answer.regions).toBeNull()
    expect(answer.chartAgreement).toBeNull()

    const user = renderScreen(filter)
    await user.click(gridCells().get(`${twa}/${tws}`)!)
    const sheet = screen.getByTestId('sail-selection-cell-sheet')

    expect(sheet).toHaveTextContent(`Chart says ${cell.chartSays}`)
    for (const sentence of cell.statement) expect(sheet).toHaveTextContent(sentence)

    if (cell.cellAgreement.agreement === 'unreached') {
      expect(cell.breakdown).toBeNull()
      return
    }

    expect(within(sheet).getByTestId('cell-agreement')).toHaveTextContent(
      answer.words.cellAgreement[cell.cellAgreement.agreement]
    )
    expect(within(sheet).getByTestId('cell-percent')).toHaveTextContent(
      cell.cellAgreement.polarEfficiency.percent ?? 'none'
    )

    for (const [testId, lines] of [
      ['breakdown-sails', cell.breakdown!.sails],
      ['breakdown-seas', cell.breakdown!.seas],
      ['breakdown-times', cell.breakdown!.times],
    ] as const) {
      const drawn = within(within(sheet).getByTestId(testId)).getAllByTestId('breakdown-line')
      expect(drawn.map((line) => line.dataset.line)).toEqual(lines.map((line) => line.id))
      lines.forEach((line, index) => {
        expect(drawn[index]).toHaveTextContent(`${line.label}`)
        expect(drawn[index]).toHaveTextContent(`${line.rows} rows`)
        expect(drawn[index]).toHaveTextContent(line.polarEfficiency.percent ?? 'no target')
        if (line.verdict) expect(drawn[index]).toHaveTextContent(answer.words.sailVerdict[line.verdict])
      })
    }
  })
})

describe('cellFromArgument', () => {
  it('finds a cell by the chart’s own axis values', () => {
    expect(cellFromArgument({ twa: 90, tws: 16 }, CHART)).toEqual({ ok: true, cell: { row: 1, column: 2 } })
  })

  it('refuses a cell the chart does not hold, with the valid axes', () => {
    const refused = cellFromArgument({ twa: 45, tws: 10 }, CHART)

    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.message).toContain('40, 90')
    expect(!refused.ok && refused.message).toContain('4, 10, 16')
  })
})
