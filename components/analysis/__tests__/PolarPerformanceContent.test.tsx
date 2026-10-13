import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  POLAR,
  POLAR_VERSION,
  RACES,
  ROWS,
  VOCABULARY,
  matchableRow,
} from '@/components/analysis/__tests__/fixture'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import {
  EMPTY_FILTER,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { AnalysisFilter, MatchableRow } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

function renderScreen(
  initialFilter: AnalysisFilter = EMPTY_FILTER,
  rows: MatchableRow[] = ROWS
): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <PolarPerformanceContent
      rows={rows}
      races={RACES}
      dimensions={DIMENSIONS}
      initialFilter={initialFilter}
      polars={{ [POLAR_VERSION]: POLAR }}
    />
  )
  return { user: userEvent.setup({ delay: null }) }
}

const bucket = (id: string) =>
  screen.getByTestId('filter-popover').querySelector(`[data-bucket="${CSS.escape(id)}"]`) as
    | HTMLButtonElement
    | null

beforeEach(() => {
  window.history.replaceState(null, '', '/boat-performance/polar')
})

describe('the figures', () => {
  it('states Polar Efficiency and VMG Efficiency over the matched, Countable rows', () => {
    renderScreen()

    // Three of the four fixture rows are Countable: two at target, one at half. Weighted by
    // equal intervals that is (6 + 3 + 6) / (6 × 3).
    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent('83.3%')
    expect(screen.getByTestId('vmg-efficiency')).toHaveTextContent('83.3%')
  })

  it('says what the figures are a ratio of, in the unit it counts in', () => {
    // Three Countable fixture rows at a minute each. Stating the evidence as time is also what
    // makes the ratio-of-sums self-evident: the weighting *is* the denominator.
    renderScreen()
    expect(
      screen.getByText(/total distance over total target distance across 3m of scored sailing/)
    ).toBeInTheDocument()
  })

  it('never says "row" anywhere a sailor can read it', () => {
    // The whole point of the wording pass: "row" is the database's unit, not a sailor's. This is
    // over the rendered screen rather than over one string, so a new label cannot reintroduce it.
    renderScreen()
    expect(document.body.textContent).not.toMatch(/\brows?\b/i)
  })

  it('carries Target VMG’s standing caveat beside the figure', () => {
    renderScreen()
    expect(screen.getByText(/Target VMG is estimated from the Polar/)).toBeInTheDocument()
  })

  it('says in words that nothing could be scored, rather than showing a dash', () => {
    renderScreen(EMPTY_FILTER, [
      matchableRow({
        countable: true,
        efficiency: {
          row_index: 1,
          target_speed: null,
          polar_efficiency: null,
          vmg_zone: null,
          vmg: null,
          target_vmg: null,
          vmg_efficiency: null,
        },
      }),
    ])

    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent(
      'Nothing in this match could be scored against the Polar.'
    )
    expect(screen.getByTestId('polar-efficiency').textContent).not.toMatch(/—|0\.0%/)
  })
})

describe('a Filler-Anchored figure is shown and flagged', () => {
  const filler = matchableRow({
    sog: 6,
    efficiency: {
      row_index: 99,
      target_speed: { knots: 3, filler_anchored: true },
      polar_efficiency: 2,
      vmg_zone: 'upwind',
      vmg: 6,
      target_vmg: { estimated_knots: 3, filler_anchored: true },
      vmg_efficiency: 2,
    },
  })

  it('shows the figure and puts the doubt beside it', () => {
    renderScreen(EMPTY_FILTER, [matchableRow({ sog: 6 }), filler])

    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent('133.3%')
    expect(screen.getByTestId('polar-efficiency-filler-anchored')).toHaveTextContent(
      /50% of this is compared against a cell the Polar manufactured rather than measured/
    )
  })

  it('says nothing about filler when no row rests on any', () => {
    renderScreen()
    expect(screen.queryByTestId('polar-efficiency-filler-anchored')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vmg-efficiency-filler-anchored')).not.toBeInTheDocument()
  })

  it('sizes each figure’s doubt over its own rows, not over the other figure’s', () => {
    // The row with no Target VMG is in the Polar figure and not in the VMG one, so the two
    // denominators differ: 1 of 2 against 1 of 1. A shared share would describe rows that are not
    // in the number it sits beside.
    const noVmgTarget = matchableRow({ sog: 6 })
    noVmgTarget.efficiency = { ...noVmgTarget.efficiency, target_vmg: null, vmg_efficiency: null }

    renderScreen(EMPTY_FILTER, [noVmgTarget, filler])

    expect(screen.getByTestId('polar-efficiency-filler-anchored')).toHaveTextContent('50%')
    expect(screen.getByTestId('vmg-efficiency-filler-anchored')).toHaveTextContent('100%')
  })
})

describe('the whole archive by default', () => {
  it('opens on all of it, with no recent-N window applied', () => {
    renderScreen()

    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      '2 of 2 races · 4m recorded'
    )
    // Nothing narrowed, so no "of 4m" qualifier and no way back to offer.
    expect(screen.getByTestId('coverage-ledger-headline').textContent).not.toMatch(/of 4m/)
    expect(screen.queryByTestId('clear-filter')).not.toBeInTheDocument()
  })

  it('honours a narrowing the server read off the URL, before anything is tapped', () => {
    renderScreen({ buckets: { sea: ['not-recorded'] }, range: null })

    expect(screen.getByTestId('filter-chip-sea')).toHaveTextContent('Not recorded')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('2m recorded of 4m')
  })

  it('offers the way back to the whole archive only while it is narrowed', async () => {
    const { user } = renderScreen({ buckets: { sea: ['not-recorded'] }, range: null })

    await user.click(screen.getByTestId('clear-filter'))
    expect(screen.queryByTestId('clear-filter')).not.toBeInTheDocument()
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('4m recorded')
  })
})

describe('narrowing moves the view and the URL, and never navigates', () => {
  it('writes the narrowing into the URL with replaceState', async () => {
    const pushState = jest.spyOn(window.history, 'pushState')
    const { user } = renderScreen()

    await user.click(screen.getByTestId('filter-chip-sea'))
    await user.click(bucket('not-recorded') as HTMLButtonElement)

    expect(window.location.search).toBe('?sea=not-recorded')
    // `replaceState` and not `pushState`: a filter tap is not a place in history to go back to,
    // and six dimensions of taps would make the back button a tour of them.
    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  it('updates the figures in the same render, with nothing in flight', async () => {
    const { user } = renderScreen()

    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent('83.3%')

    await user.click(screen.getByTestId('filter-chip-sea'))
    await user.click(bucket('not-recorded') as HTMLButtonElement)

    // The July rows, one of them Countable and on the pace; the half-speed June row is gone.
    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent('100.0%')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('1 of 2 races · 2m')
  })

  it('takes the query string back off the URL when the narrowing is undone', async () => {
    const { user } = renderScreen({ buckets: { sea: ['not-recorded'] }, range: null })

    await user.click(screen.getByTestId('clear-filter'))
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/boat-performance/polar')
  })

  it('leaves the URL alone on first paint, so a link’s own narrowing is not rewritten', () => {
    const replaceState = jest.spyOn(window.history, 'replaceState')
    renderScreen({ buckets: { sea: ['not-recorded'] }, range: null })

    expect(replaceState).not.toHaveBeenCalled()
    replaceState.mockRestore()
  })
})

describe('the ledger switch, wired to the buckets', () => {
  it('excludes every unrecorded row across every dimension at once', async () => {
    const { user } = renderScreen()

    await user.click(screen.getByTestId('include-unrecorded'))

    // The two July rows carry neither annotation; the two June rows carry both.
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      '1 of 2 races · 2m recorded'
    )
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'All of it carries every annotation.'
    )
  })

  it('reads itself back from the chips rather than from a second piece of state', async () => {
    const { user } = renderScreen()

    await user.click(screen.getByTestId('include-unrecorded'))
    expect(screen.getByTestId('include-unrecorded')).not.toBeChecked()

    await user.click(screen.getByTestId('include-unrecorded'))
    expect(screen.getByTestId('include-unrecorded')).toBeChecked()
  })

  it('reads mixed when a narrowing on one dimension has quietly dropped its unrecorded rows', async () => {
    const { user } = renderScreen()

    // Narrowing Sea state to Calm excludes the two rows nobody annotated — which is what
    // narrowing means (ADR 0026) — and the switch going indeterminate is how a sailor finds out.
    // A separately-held boolean would still read "included" here, and the ledger would lie.
    await user.click(screen.getByTestId('filter-chip-sea'))
    await user.click(bucket('calm') as HTMLButtonElement)

    const box = screen.getByTestId('include-unrecorded') as HTMLInputElement
    expect(box.indeterminate).toBe(true)
  })

  it('leaves the two dimensions a row cannot lack out of the switch’s enumeration', async () => {
    const { user } = renderScreen()

    await user.click(screen.getByTestId('include-unrecorded'))

    // Every row has a timestamp, so narrowing `time` and `when` would light every chip on them
    // and write every one into the URL to exclude nothing.
    expect(screen.getByTestId('filter-chip-time')).toHaveTextContent('Any')
    expect(screen.getByTestId('filter-chip-when')).toHaveTextContent('Any')
    expect(window.location.search).not.toMatch(/time=|when=/)
  })
})

describe('the Polar Plot under the figures (ADR 0040)', () => {
  /** Two patches inside the opening 8–12 kt window, and one row outside it. */
  const SPREAD = [
    matchableRow({ race_id: 'june', tws: 10, twa: 42, sog: 5.2 }),
    matchableRow({ race_id: 'july', day: '2026-07-01', tws: 11, twa: -43, sog: 5.4 }),
    matchableRow({ race_id: 'july', day: '2026-07-01', tws: 9, twa: 140, sog: 7.1 }),
    matchableRow({ race_id: 'july', day: '2026-07-01', tws: 18, twa: 140, sog: 7.6 }),
  ]

  const plot = (): HTMLElement => screen.getByTestId('polar-plot')
  const windowLabel = (): string => screen.getByTestId('polar-plot-window').textContent ?? ''

  it('replaces the per-band list, and the rail offers no wind chip beside it', () => {
    renderScreen()

    expect(screen.queryByTestId('band-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-chip-wind')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('polar-plot-card')).getByTestId('polar-plot')).toBeInTheDocument()
  })

  it('opens on a 4-knot window at 10, drawing only the sailing inside it, as patches', () => {
    renderScreen(EMPTY_FILTER, SPREAD)

    expect(windowLabel()).toBe('8–12 kt')
    expect(within(plot()).getAllByTestId('polar-plot-patch').map((patch) => patch.dataset.patch)).toEqual([
      '40|5',
      '140|7',
    ])
    // The certificate behind them is the columns that sailing was scored against: 9, 10 and 11
    // knots all sit between the 8 and 12 kt columns.
    expect(within(plot()).getAllByTestId('polar-plot-column').map((column) => column.dataset.tws)).toEqual([
      '8',
      '12',
    ])
  })

  it('keeps the same width wherever the centre goes, and the width chips change it', async () => {
    const { user } = renderScreen(EMPTY_FILTER, SPREAD)
    const slider = screen.getByTestId('polar-plot-centre')

    for (const [centre, label] of [
      ['4', '2–6 kt'],
      ['13', '11–15 kt'],
      ['20', '18–22 kt'],
    ]) {
      fireEvent.change(slider, { target: { value: centre } })
      expect(windowLabel()).toBe(label)
    }

    await user.click(screen.getByTestId('polar-plot-width-2'))
    expect(windowLabel()).toBe('19–21 kt')
    await user.click(screen.getByTestId('polar-plot-width-6'))
    expect(windowLabel()).toBe('17–23 kt')
  })

  it('ticks the certificate’s own columns under the slider, lit where the window holds them', () => {
    renderScreen(EMPTY_FILTER, SPREAD)

    const ticks = screen.getAllByTestId('polar-plot-column-tick')
    expect(ticks.map((tick) => tick.textContent)).toEqual(['4', '8', '12', '16', '20'])
    expect(ticks.filter((tick) => tick.dataset.inside !== undefined).map((tick) => tick.textContent)).toEqual([
      '8',
    ])
  })

  it('narrows the picture and never the match: the ledger and the figures do not move', () => {
    renderScreen(EMPTY_FILTER, SPREAD)
    const ledger = screen.getByTestId('coverage-ledger-headline').textContent
    const figure = screen.getByTestId('polar-efficiency').textContent

    fireEvent.change(screen.getByTestId('polar-plot-centre'), { target: { value: '18' } })

    expect(within(plot()).getAllByTestId('polar-plot-patch')).toHaveLength(1)
    expect(screen.getByTestId('coverage-ledger-headline').textContent).toBe(ledger)
    expect(screen.getByTestId('polar-efficiency').textContent).toBe(figure)
  })

  it('reads a tapped patch out, in time and races, with a halo rather than a recolour', async () => {
    const filler = matchableRow({ race_id: 'june', tws: 10, twa: 41, sog: 5.1 })
    filler.efficiency = {
      ...filler.efficiency,
      target_speed: { knots: 6, filler_anchored: true },
    }
    const { user } = renderScreen(EMPTY_FILTER, [...SPREAD, filler])

    const patch = within(plot()).getAllByTestId('polar-plot-patch')[0]
    const fill = patch.getAttribute('fill')
    await user.click(patch)

    const card = screen.getByTestId('polar-plot-patch-card')
    expect(card).toHaveTextContent('40–45° at 5.0–5.5 kt')
    // 5.2, 5.4 and 5.1 knots against 6, a minute each: 15.7 over 18.
    expect(card).toHaveTextContent('87% of target')
    expect(card).toHaveTextContent('3m over 2 races · target 6.00 kt')
    expect(within(card).getByTestId('polar-plot-patch-filler')).toHaveTextContent('33% filler-anchored')
    expect(card.textContent).not.toMatch(/\brows?\b/i)

    const selected = within(plot()).getAllByTestId('polar-plot-patch')[0]
    expect(selected).toHaveAttribute('data-selected-mark')
    expect(selected.getAttribute('stroke')).toBe('var(--text-accent)')
    expect(selected.getAttribute('fill')).toBe(fill)
  })

  it('walks the patches with the arrow keys, and selects no sector', async () => {
    const { user } = renderScreen(EMPTY_FILTER, SPREAD)

    plot().focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('polar-plot-patch-card')).toHaveTextContent('40–45°')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('polar-plot-patch-card')).toHaveTextContent('140–145°')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('polar-plot-patch-card')).toHaveTextContent('40–45°')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('polar-plot-patch-card')).toHaveTextContent('140–145°')

    expect(plot().querySelector('[data-testid^="sector"]')).toBeNull()
  })

  it('reads the same state as a percent, with the certificate as a 100% circle and dots for patches', async () => {
    const { user } = renderScreen(EMPTY_FILTER, SPREAD)

    await user.click(screen.getByTestId('polar-plot-reading-pct'))

    expect(plot()).toHaveAttribute('data-reading', 'pct')
    expect(within(plot()).getByTestId('polar-plot-on-target')).toBeInTheDocument()
    expect(within(plot()).queryByTestId('polar-plot-column')).not.toBeInTheDocument()
    expect(within(plot()).queryByTestId('polar-plot-patch')).not.toBeInTheDocument()
    expect(within(plot()).getAllByTestId('polar-plot-dot')).toHaveLength(3)
  })

  it('keeps the legend to one line, with the method and what is not drawn one tap down', () => {
    renderScreen()

    const legend = screen.getByTestId('polar-plot-legend')
    expect(legend).toHaveTextContent(/certificate\s*not measured/)
    const explainer = screen.getByTestId('polar-plot-explainer')
    expect(explainer.tagName).toBe('DETAILS')
    expect(explainer).not.toHaveAttribute('open')
    expect(screen.getByTestId('polar-plot-card').textContent).not.toMatch(/\brows?\b/i)
  })
})
