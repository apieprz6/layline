import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CHART,
  POLAR_RANGE,
  RACES,
  ROWS as SHARED_ROWS,
  VOCABULARY,
  matchableRow,
} from '@/components/analysis/__tests__/fixture'
import SailSelectionContent from '@/components/analysis/SailSelectionContent'
import {
  EMPTY_FILTER,
  SAIL_SELECTION_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { AnalysisFilter, MatchableRow } from '@/types'

/**
 * The Sail Selection Screen in jsdom: four layers, the ghost, and the tap-through.
 *
 * What is pinned here is the three claims ADR 0030 rests on that are facts about the *rendering*
 * rather than about the arithmetic (`services/analysis/__tests__/sail-selection.test.ts` holds
 * that, and `archive-sail-selection.test.ts` holds it against the real archive):
 *
 *   - **every cell prints its number or glyph**, on every layer, independently of its colour —
 *     which is the whole of what makes the night-vision theme readable, since there the sail bands
 *     and the three state colours all collapse to reds;
 *   - the **Chart** layer is never narrowed and never ghosted, and the other three are;
 *   - a tap opens *that cell's* breakdown, with each line's own percent of target.
 *
 * The geometry — a cell's position at 390px, the sticky angle column — is Playwright's, in
 * `e2e/authenticated/sail-selection.spec.ts`.
 */

const DIMENSIONS = analysisDimensions(SAIL_SELECTION_DIMENSIONS, VOCABULARY)

/**
 * The shared fixture rows, with the two 18 kt ones left unscored.
 *
 * `POLAR_RANGE` stops at 14 knots, so a Polar asked about an 18 kt row would have nothing to
 * interpolate between and would answer missing (ADR 0028). Scored rows past the Polar's own axis
 * are a state the app cannot produce, and a suite that rendered them would be arguing about a cell
 * that both can and cannot carry a figure.
 */
const ROWS = SHARED_ROWS.map((row) =>
  row.tws !== null && row.tws > POLAR_RANGE.tws_to
    ? {
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
    : row
)

function renderScreen(
  initialFilter: AnalysisFilter = EMPTY_FILTER,
  rows: MatchableRow[] = ROWS
): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <SailSelectionContent
      rows={rows}
      races={RACES}
      dimensions={DIMENSIONS}
      initialFilter={initialFilter}
      chart={CHART}
      domain={POLAR_RANGE}
    />
  )
  return { user: userEvent.setup({ delay: null }) }
}

/** Every cell of the grid, keyed the way a sailor would name it: `40°/10 kt`. */
function cells(): Map<string, HTMLElement> {
  return new Map(
    screen
      .getAllByTestId('sail-selection-cell')
      .map((cell) => [`${cell.dataset.twa}/${cell.dataset.tws}`, cell])
  )
}

const printOf = (at: string): string => cells().get(at)?.dataset.print ?? ''

async function showLayer(
  user: ReturnType<typeof userEvent.setup>,
  layer: string
): Promise<void> {
  await user.click(
    screen
      .getAllByTestId('sail-selection-layer')
      .find((button) => button.dataset.layer === layer) as HTMLElement
  )
}

const bucket = (id: string) =>
  screen.getByTestId('filter-popover').querySelector(`[data-bucket="${CSS.escape(id)}"]`) as
    | HTMLButtonElement
    | null

beforeEach(() => {
  window.history.replaceState(null, '', '/boat-performance/sail-selection')
})

describe('four layers over one grid', () => {
  it('opens on the Chart layer, which is the chart and nothing else', () => {
    renderScreen()

    expect(screen.getByTestId('sail-selection-layer-title')).toHaveTextContent('Chart')
    expect(screen.getByTestId('sail-selection-grid')).toHaveAttribute('data-layer', 'chart')
    expect(screen.getAllByTestId('sail-selection-cell')).toHaveLength(6)
  })

  it('offers all four grids as thumbnails, with the open one pressed', async () => {
    const { user } = renderScreen()

    const thumbs = screen.getAllByTestId('sail-selection-layer')
    expect(thumbs.map((thumb) => thumb.dataset.layer)).toEqual([
      'chart',
      'coverage',
      'target',
      'agreement',
    ])
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'true')

    await showLayer(user, 'agreement')
    expect(screen.getByTestId('sail-selection-layer-title')).toHaveTextContent('Agreement')
    expect(screen.getByTestId('sail-selection-grid')).toHaveAttribute('data-layer', 'agreement')
  })

  it('prints the chart’s own sail number in every cell, reached or not', () => {
    renderScreen()

    // Row-major, straight off the payload: no Race reached the 90° row and it is drawn in full.
    expect([...cells().keys()]).toEqual(['40/4', '40/10', '40/16', '90/4', '90/10', '90/16'])
    expect([...cells().values()].map((cell) => cell.dataset.print)).toEqual([
      '1',
      '1',
      '2',
      '1',
      '4',
      '4',
    ])
  })

  it('prints a race count on Coverage and a glyph on Agreement', async () => {
    const { user } = renderScreen()

    await showLayer(user, 'coverage')
    expect(printOf('40/10')).toBe('1')
    // No Race reached the 90° row, and blank means blank.
    expect(printOf('90/10')).toBe('')

    await showLayer(user, 'agreement')
    // The 11 kt row carried Main + Jib 1, which is what the 10 kt column calls for.
    expect(printOf('40/10')).toBe('=')
    // The 18 kt row's Sail Configuration was never written down.
    expect(printOf('40/16')).toBe('?')
  })

  it('prints a percent of target, and a dash where no target can exist', async () => {
    const { user } = renderScreen()
    await showLayer(user, 'target')

    expect(printOf('40/10')).toBe('100')
    // 4 kt: the one Light row sailed at half its target.
    expect(printOf('40/4')).toBe('50')
    // The 16 kt column opens past this Polar's last, and extrapolation is forbidden (ADR 0028).
    expect(printOf('40/16')).toBe('–')
    expect(printOf('90/16')).toBe('–')
  })

  /**
   * The night-vision claim, in the form jsdom can hold: **no layer's print depends on its colour.**
   * There the eight sail bands become red tints of each other and the three state colours become
   * reds, so a cell whose fact lived only in its fill would be unreadable on the exact screen a
   * sailor uses at night — and this archive holds a fourteen-hour overnight race (ADR 0030).
   */
  it('prints something in every cell that has anything to say, on every layer', async () => {
    const { user } = renderScreen()

    for (const layer of ['chart', 'coverage', 'target', 'agreement']) {
      await showLayer(user, layer)

      for (const [at, cell] of cells()) {
        const empty = cell.dataset.print === ''
        // A cell is blank only where it genuinely has nothing: no sailing under this filter, on a
        // layer that reads sailing.
        if (empty) expect(['90/4', '90/10', '90/16', '40/4', '40/10', '40/16']).toContain(at)
        else expect(cell.dataset.print).not.toBe('')
      }

      // And on every layer, the cells the fixture's rows reached print.
      if (layer !== 'chart') expect(printOf('40/10')).not.toBe('')
    }
  })
})

describe('a narrowing, and what it costs', () => {
  it('leaves a dotted ghost where a cell held sailing and now holds none', async () => {
    const { user } = renderScreen()
    await showLayer(user, 'coverage')

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    const ghost = cells().get('40/10') as HTMLElement
    expect(ghost.dataset.ghost).toBe('true')
    // Blank plus a ghost, never the unfiltered value dimmed: a number the filter excludes is a lie
    // with a legend, and on a grid of 338 cells nobody consults the legend (ADR 0030).
    expect(ghost.dataset.print).toBe('')
    expect(cells().get('90/10')?.dataset.ghost).toBeUndefined()
  })

  it('never ghosts or narrows the Chart layer, because the chart is the chart', async () => {
    const { user } = renderScreen()

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    expect([...cells().values()].every((cell) => cell.dataset.ghost === undefined)).toBe(true)
    expect(printOf('40/10')).toBe('1')
  })

  it('writes the narrowing into the URL with replaceState, and never navigates', async () => {
    const pushState = jest.spyOn(window.history, 'pushState')
    const { user } = renderScreen()

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    expect(window.location.search).toBe('?wind=heavy')
    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  it('honours a narrowing the server read off the URL, before anything is tapped', () => {
    renderScreen({ buckets: { wind: ['light'] }, range: null })

    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Light (0–8 kt)')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('recorded of')
  })

  it('offers five dimensions and no "sail used", since the sail is the chart’s own answer', () => {
    renderScreen()

    const rail = screen.getByTestId('analysis-filter-rail')
    expect(rail.querySelectorAll('button')).toHaveLength(5)
    expect(screen.queryByTestId('filter-chip-sail')).not.toBeInTheDocument()
  })

  it('names the Sea State alone in the ledger’s switch, having no sail dimension', () => {
    renderScreen()
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Include sailing with no sea state recorded'
    )
  })
})

describe('what the screen says about itself', () => {
  it('states what each layer is over, and how much of the grid can never hold a figure', async () => {
    const { user } = renderScreen()

    expect(screen.getByTestId('sail-selection-summary')).toHaveTextContent(
      '6 cells, and the chart’s recommendation in every one of them.'
    )

    await showLayer(user, 'coverage')
    expect(screen.getByTestId('sail-selection-summary')).toHaveTextContent(
      '3 of 6 cells have Countable sailing in them.'
    )

    await showLayer(user, 'target')
    // The 18 kt cell holds a row and no computable target, and its whole column is past this
    // Polar's last — the two `–` states ADR 0030 keeps apart, in one sentence.
    expect(screen.getByTestId('sail-selection-summary')).toHaveTextContent(
      '2 of 6 cells carry a percent of target · 1 with sailing and no computable one · 2 where none can ever exist.'
    )
  })

  it('claims no figure at all for the region when the Polar could not be read', async () => {
    render(
      <SailSelectionContent
        rows={ROWS}
        races={RACES}
        dimensions={DIMENSIONS}
        initialFilter={EMPTY_FILTER}
        chart={CHART}
        domain={null}
      />
    )
    const user = userEvent.setup({ delay: null })
    await showLayer(user, 'target')

    // Null is not nought. With no Polar in hand the question has no answer, and "0 where none can
    // ever exist" would be a plausible number standing in for a missing one.
    const summary = screen.getByTestId('sail-selection-summary')
    expect(summary).toHaveTextContent('no Polar read, so where none can exist is unknown')
    expect(summary).not.toHaveTextContent('0 where none can ever exist')
    expect(screen.getByTestId('sail-selection-legend')).toHaveTextContent(
      'How much of the grid can never hold one is unknown here'
    )

    // The 18 kt cell still dashes, because *its own* rows have no Target Speed — which is a fact
    // about those rows and not a claim about the region. The two `–` cases stay distinguishable.
    expect(printOf('40/16')).toBe('–')
    expect(printOf('90/16')).toBe('')
  })

  it('says how many cells a narrowing emptied', async () => {
    const { user } = renderScreen()
    await showLayer(user, 'coverage')

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    expect(screen.getByTestId('sail-selection-summary')).toHaveTextContent(
      '2 were emptied by this filter'
    )
  })

  it('states the rows its figures leave out, which ADR 0025 asks of every screen', () => {
    renderScreen()
    expect(
      screen.getByText(/1 matched rows are excluded as Frozen, Low-Speed or inside a Maneuver Window/)
    ).toBeInTheDocument()
  })

  it('says why the region can never hold a figure, once per region', async () => {
    const { user } = renderScreen()
    await showLayer(user, 'target')

    const legend = screen.getByTestId('sail-selection-legend')
    expect(legend).toHaveTextContent('2 of the 6 cells can never hold one')
    expect(legend).toHaveTextContent(
      "Past the Polar's last column (14 kt) a Target Speed is never extrapolated."
    )
    // One sentence for the region, not one per cell in it — both unreachable cells are the same
    // column, and the legend says so once.
    expect(legend.textContent?.match(/never extrapolated/g)).toHaveLength(1)
  })

  it('keeps colour out of the legend’s only carrier, on every layer that has one', async () => {
    const { user } = renderScreen()

    // The Chart layer's legend is the Boat Setup screen's, not this one's.
    expect(screen.queryByTestId('sail-selection-legend')).not.toBeInTheDocument()

    await showLayer(user, 'agreement')
    const legend = screen.getByTestId('sail-selection-legend')
    expect(legend).toHaveTextContent('the sail carried was the one printed')
    expect(legend).toHaveTextContent('the vocabulary running out, and never disagreement')
  })
})

describe('tapping a cell', () => {
  it('opens that cell’s breakdown, with each line’s own percent of target', async () => {
    const { user } = renderScreen()

    await user.click(cells().get('40/10') as HTMLElement)

    const sheet = screen.getByTestId('sail-selection-cell-sheet')
    expect(sheet).toHaveTextContent('40° · 10 kt')
    expect(sheet).toHaveTextContent('Chart says Main + Jib 1')
    expect(within(sheet).getByTestId('cell-percent')).toHaveTextContent('100.0%')
    expect(within(sheet).getByTestId('cell-agreement')).toHaveTextContent(
      'carried what the chart calls for'
    )

    const sails = within(sheet).getByTestId('breakdown-sails')
    expect(within(sails).getByTestId('breakdown-line')).toHaveTextContent('Main + Jib 1')
    expect(within(sails).getByTestId('breakdown-line')).toHaveTextContent('100.0%')
  })

  it('breaks the cell down by Sea State and time of day as well as by sail', async () => {
    const { user } = renderScreen()
    await user.click(cells().get('40/10') as HTMLElement)

    const sheet = screen.getByTestId('sail-selection-cell-sheet')
    expect(within(sheet).getByTestId('breakdown-seas')).toHaveTextContent('Calm (0–1 ft)')
    // 19:00 in the recording's own frame, which the `time` dimension's fixed clock calls day.
    expect(within(sheet).getByTestId('breakdown-times')).toHaveTextContent('Day')
  })

  it('says a line has no target rather than borrowing the cell’s figure downward', async () => {
    const unscored = matchableRow({
      tws: 11,
      sea_state: 'moderate',
      efficiency: {
        row_index: 99,
        target_speed: null,
        polar_efficiency: null,
        vmg_zone: null,
        vmg: null,
        target_vmg: null,
        vmg_efficiency: null,
      },
    })

    const { user } = renderScreen(EMPTY_FILTER, [...ROWS, unscored])
    await user.click(cells().get('40/10') as HTMLElement)

    const seas = within(screen.getByTestId('sail-selection-cell-sheet')).getByTestId(
      'breakdown-seas'
    )
    const moderate = within(seas)
      .getAllByTestId('breakdown-line')
      .find((line) => line.dataset.line === 'moderate') as HTMLElement

    expect(moderate).toHaveTextContent('no target')
    expect(moderate).not.toHaveTextContent('100.0%')
  })

  it('says a cell the narrowing emptied held sailing, and how much', async () => {
    const { user } = renderScreen({ buckets: { wind: ['heavy'] }, range: null })

    await user.click(cells().get('40/10') as HTMLElement)

    expect(screen.getByTestId('sail-selection-cell-sheet')).toHaveTextContent(
      'No Countable sailing here under this filter — 1 rows with the filter cleared.'
    )
  })

  it('says why a cell can never carry a figure, rather than leaving a bare dash', async () => {
    const { user } = renderScreen()

    await user.click(cells().get('90/16') as HTMLElement)
    expect(screen.getByTestId('sail-selection-cell-sheet')).toHaveTextContent(
      "16 kt is past the Polar's last column (14 kt), and a Target Speed is never extrapolated."
    )
  })

  it('states the verdict as a proportion rather than as the glyph alone', async () => {
    const { user } = renderScreen()
    await user.click(cells().get('40/16') as HTMLElement)

    expect(screen.getByTestId('cell-verdict-tally')).toHaveTextContent(
      '0 agreeing · 0 differing · 1 with no sail written down'
    )
  })

  it('closes again, and leaves the URL alone throughout', async () => {
    const { user } = renderScreen()

    await user.click(cells().get('40/10') as HTMLElement)
    expect(window.location.search).toBe('')

    await user.click(screen.getByTestId('close-cell'))
    expect(screen.queryByTestId('sail-selection-cell-sheet')).not.toBeInTheDocument()
  })

  it('keeps the cell open across a layer change, which is the comparison the thumbnails make', async () => {
    const { user } = renderScreen()

    await user.click(cells().get('40/10') as HTMLElement)
    await showLayer(user, 'target')

    expect(screen.getByTestId('sail-selection-cell-sheet')).toHaveTextContent('40° · 10 kt')
  })
})
