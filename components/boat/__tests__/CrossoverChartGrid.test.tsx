import { render, screen } from '@testing-library/react'
import CrossoverChartGrid from '../CrossoverChartGrid'
import type { CrossoverChartPayload } from '@/types'

/** A chart small enough to read in a test, with the shape of a real one. */
const CHART: CrossoverChartPayload = {
  twa_axis: [40, 80, 120],
  tws_axis: [8, 12],
  cells: [
    [1, 1],
    [1, 2],
    [3, 3],
  ],
  sail_definitions: [
    { number: 1, label: 'GV + Genoa' },
    { number: 2, label: 'GV + Solent' },
    { number: 3, label: 'GV + A3' },
  ],
  source: {
    format: 'qtvlm-sailselect',
    header_token: 'TWA/TWS',
    definitions: {
      format: 'qtvlm-saildesc',
      filename: 'HandsomePete_2026.saildesc',
      content_sha256: 'b'.repeat(64),
    },
  },
}

/** The boat's own shape: 26 wind angles × 13 wind speeds, 338 cells. */
function boatSizedChart(): CrossoverChartPayload {
  const twa_axis = Array.from({ length: 26 }, (_, index) => 30 + index * 6)
  const tws_axis = Array.from({ length: 13 }, (_, index) => 4 + index * 2)

  return {
    twa_axis,
    tws_axis,
    cells: twa_axis.map((_, row) => tws_axis.map((_, column) => ((row + column) % 3) + 1)),
    sail_definitions: CHART.sail_definitions,
  }
}

function shownAngles(): string[] {
  return screen
    .getAllByTestId('crossover-chart-row')
    .map((row) => row.getAttribute('data-twa') ?? '')
}

describe('the Crossover Chart grid', () => {
  it('draws one row per wind angle and one column per wind speed', () => {
    render(<CrossoverChartGrid payload={CHART} />)

    expect(shownAngles()).toEqual(['40', '80', '120'])
    // The corner, then 8 and 12.
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.getAllByTestId('crossover-chart-cell')).toHaveLength(6)
  })

  it('prints the sail number in every cell, so colour is never how a sail is identified', () => {
    render(<CrossoverChartGrid payload={CHART} />)

    // The night-vision theme is one red on purpose, and hues fail anyone who cannot separate
    // them — so the number is in the cell, not only in the legend.
    const printed = screen
      .getAllByTestId('crossover-chart-cell')
      .map((cell) => cell.textContent)
    expect(printed).toEqual(['1', '1', '1', '2', '3', '3'])
  })

  it('bands by position in the definitions list rather than by sail number', () => {
    render(
      <CrossoverChartGrid
        payload={{
          ...CHART,
          // qtVlm's numbers are qtVlm's: they need not start at 1 or be contiguous, so a palette
          // indexed by them would leave holes and colour two charts of the same boat differently.
          cells: [
            [3, 3],
            [3, 7],
            [7, 7],
          ],
          sail_definitions: [
            { number: 3, label: 'GV + Genoa' },
            { number: 7, label: 'GV + A3' },
          ],
        }}
      />
    )

    const cells = screen.getAllByTestId('crossover-chart-cell')
    expect(cells[0].style.background).toBe('var(--sail-band-1)')
    expect(cells[3].style.background).toBe('var(--sail-band-2)')
  })

  it('says the sail in words for the one cell being pointed at', () => {
    render(<CrossoverChartGrid payload={CHART} />)

    // 338 numbers, each of which would otherwise have to be looked up in the legend.
    const cells = screen.getAllByTestId('crossover-chart-cell')
    expect(cells[3]).toHaveAttribute('title', '80° at 12 kn — GV + Solent')
  })

  it('labels an axis value exactly as written, with no invented decimal place', () => {
    render(
      <CrossoverChartGrid
        payload={{ ...CHART, tws_axis: [8, 12.5], cells: [[1, 1], [1, 2], [3, 3]] }}
      />
    )

    expect(screen.getByRole('columnheader', { name: '12.5' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '40' })).toBeInTheDocument()
  })

  it('lists every definition in the legend, with how much of the chart calls for it', () => {
    render(<CrossoverChartGrid payload={CHART} />)

    const legend = screen.getAllByTestId('crossover-chart-legend-row')
    expect(legend).toHaveLength(3)
    expect(legend[0].textContent).toMatch('GV + Genoa')
    expect(legend[0].textContent).toMatch('3 cells')
    expect(legend[1].textContent).toMatch('1 cell')
  })

  it('keeps a definition no cell calls for, and says so rather than dropping the row', () => {
    render(
      <CrossoverChartGrid
        payload={{
          ...CHART,
          sail_definitions: [
            ...CHART.sail_definitions,
            { number: 4, label: 'GV + Tourmentin' },
          ],
        }}
      />
    )

    // A sail defined and never recommended is a real state — a storm jib the chart never gets
    // round to asking for — and it is legal, so it is shown.
    const legend = screen.getAllByTestId('crossover-chart-legend-row')
    expect(legend).toHaveLength(4)
    expect(legend[3].textContent).toMatch('GV + Tourmentin')
    expect(legend[3].textContent).toMatch('never recommended')
  })

  it('draws the whole of the boat’s own 26 × 13 chart', () => {
    render(<CrossoverChartGrid payload={boatSizedChart()} />)

    expect(screen.getAllByTestId('crossover-chart-row')).toHaveLength(26)
    expect(screen.getAllByTestId('crossover-chart-cell')).toHaveLength(338)
  })

  it('sizes 13 wind speeds and the angle column to fit inside 390px', () => {
    render(<CrossoverChartGrid payload={boatSizedChart()} />)

    // Thirteen 24px cells and a 40px angle column come to 352px, so the boat's chart needs no
    // sideways scroll on the phone it is read on. Where it lands on screen is Playwright's
    // question; that the numbers add up is this one's.
    const cell = screen.getAllByTestId('crossover-chart-cell')[0]
    const angle = screen.getAllByRole('rowheader')[0]
    const width = Number.parseInt(cell.style.minWidth, 10) * 13
    expect(width + Number.parseInt(angle.style.minWidth, 10)).toBeLessThanOrEqual(390)
  })

  it('keeps the angle column in place when a wider chart scrolls sideways', () => {
    render(<CrossoverChartGrid payload={boatSizedChart()} />)

    // A cell whose row has scrolled out of sight names nothing.
    expect(screen.getAllByRole('rowheader')[0].style.position).toBe('sticky')
  })

  it('draws a cell whose sail nothing defines rather than dropping it', () => {
    render(<CrossoverChartGrid payload={{ ...CHART, cells: [[9, 1], [1, 2], [3, 3]] }} />)

    // The payload schema refuses this, so it cannot arrive from an upload — but a row written
    // before a rule tightened must still render, and an unnamed sail shown as unnamed is honest.
    const cells = screen.getAllByTestId('crossover-chart-cell')
    expect(cells[0].textContent).toBe('9')
    expect(cells[0]).toHaveAttribute('title', '40° at 8 kn — sail 9')
    expect(cells[0].style.background).toBe('var(--surface-divider)')
  })

  it('says which way round the grid reads', () => {
    render(<CrossoverChartGrid payload={CHART} />)

    const grid = screen.getByTestId('crossover-chart-grid')
    expect(grid.textContent).toMatch(/knots across the top/)
    expect(grid.textContent).toMatch(/angles down the side/)
  })
})
