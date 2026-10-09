import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROWS, RACES, VOCABULARY, matchableRow } from '@/components/analysis/__tests__/fixture'
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

  it('flags the band that rests on filler, not only the total', () => {
    // Filler is per *cell*, so one column of the grid can be the certificate's ramp while the
    // whole-archive figure is not (ADR 0036). A flag only on the total would hide it.
    renderScreen(EMPTY_FILTER, [matchableRow({ sog: 6 }), { ...filler, tws: 18 }])

    const heavy = screen
      .getAllByTestId('band-row')
      .find((row) => row.dataset.bucket === 'heavy') as HTMLElement
    const medium = screen
      .getAllByTestId('band-row')
      .find((row) => row.dataset.bucket === 'medium') as HTMLElement

    expect(within(heavy).getByTestId('band-filler-anchored')).toHaveTextContent('100% filler')
    expect(within(medium).queryByTestId('band-filler-anchored')).not.toBeInTheDocument()
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
    renderScreen({ buckets: { wind: ['heavy'] }, range: null })

    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Heavy (16–22 kt)')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('2m recorded of 4m')
  })

  it('offers the way back to the whole archive only while it is narrowed', async () => {
    const { user } = renderScreen({ buckets: { wind: ['heavy'] }, range: null })

    await user.click(screen.getByTestId('clear-filter'))
    expect(screen.queryByTestId('clear-filter')).not.toBeInTheDocument()
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('4m recorded')
  })
})

describe('narrowing moves the view and the URL, and never navigates', () => {
  it('writes the narrowing into the URL with replaceState', async () => {
    const pushState = jest.spyOn(window.history, 'pushState')
    const { user } = renderScreen()

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    expect(window.location.search).toBe('?wind=heavy')
    // `replaceState` and not `pushState`: a filter tap is not a place in history to go back to,
    // and six dimensions of taps would make the back button a tour of them.
    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  it('updates the figures in the same render, with nothing in flight', async () => {
    const { user } = renderScreen()

    await user.click(screen.getByTestId('filter-chip-wind'))
    await user.click(bucket('light') as HTMLButtonElement)

    // The one Light row is the half-speed one.
    expect(screen.getByTestId('polar-efficiency')).toHaveTextContent('50.0%')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('1 of 2 races · 1m')
  })

  it('takes the query string back off the URL when the narrowing is undone', async () => {
    const { user } = renderScreen({ buckets: { wind: ['heavy'] }, range: null })

    await user.click(screen.getByTestId('clear-filter'))
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/boat-performance/polar')
  })

  it('leaves the URL alone on first paint, so a link’s own narrowing is not rewritten', () => {
    const replaceState = jest.spyOn(window.history, 'replaceState')
    renderScreen({ buckets: { wind: ['heavy'] }, range: null })

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

describe('the per-band breakdown', () => {
  it('lists every wind band, including the ones the archive has nothing in', () => {
    renderScreen()

    const bands = screen.getAllByTestId('band-row')
    expect(bands.map((row) => row.dataset.bucket)).toEqual([
      'light',
      'medium',
      'heavy',
      'storm',
      'not-recorded',
    ])
  })

  it('says a band has no scorable time rather than printing a dash', () => {
    renderScreen()

    const storm = screen
      .getAllByTestId('band-row')
      .find((row) => row.dataset.bucket === 'storm') as HTMLElement
    expect(within(storm).getByText('no scorable time')).toBeInTheDocument()
  })

  it('states each band’s own figure over its own rows', () => {
    renderScreen()

    const heavy = screen
      .getAllByTestId('band-row')
      .find((row) => row.dataset.bucket === 'heavy') as HTMLElement
    // One of the two Heavy rows is not Countable, so the band is one minute at the target.
    expect(heavy).toHaveTextContent('100.0% · 1m')
  })
})
