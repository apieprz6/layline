import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SailSelectionContent from '@/components/analysis/SailSelectionContent'
import {
  archiveChart,
  archiveDomain,
  archiveMonths,
  archiveRows,
  describeArchiveScreen,
} from '@/services/analysis/__tests__/archive-screen'
import {
  EMPTY_FILTER,
  SAIL_SELECTION_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import { SAIL_SELECTION_LAYERS } from '@/components/analysis/sail-selection-chrome'

/**
 * All four layers, rendered over the **real** 26 × 13 grid.
 *
 * The other two suites hold the arithmetic (`services/analysis/__tests__/sail-selection.test.ts`)
 * and the archive's own counts (`archive-sail-selection.test.ts`) — this one renders what they
 * measure, because a grid that folds correctly and draws 150 blank cells is not a screen.
 *
 * The claim it exists for is the one ADR 0030 refuses to compromise on: **every cell prints its
 * number or glyph, and nothing on this screen is carried by colour alone.** In night vision the
 * eight sail bands become red tints of each other and the three state tokens become reds, so a
 * cell whose fact lived only in its fill would be unreadable on the exact screen a sailor uses at
 * night — and this archive holds a fourteen-hour overnight race. jsdom computes no CSS variables,
 * so the theme itself cannot be rendered here; what *can* be checked, and is the real guarantee,
 * is that no cell is ever tinted without also being printed. A cell that passes that is readable
 * whatever the tokens resolve to.
 *
 * Needs the owner's recordings and his two Boat Setup artifacts; skips loudly without them.
 */

describeArchiveScreen('the real chart, with the real archive over it', () => {
  function renderScreen(): ReturnType<typeof userEvent.setup> {
    render(
      <SailSelectionContent
        rows={archiveRows()}
        races={[]}
        dimensions={analysisDimensions(SAIL_SELECTION_DIMENSIONS, {
          sails: [],
          months: archiveMonths(),
        })}
        initialFilter={EMPTY_FILTER}
        chart={archiveChart()}
        domain={archiveDomain()}
      />
    )
    return userEvent.setup({ delay: null })
  }

  it('draws all 338 cells, 26 rows of 13', () => {
    renderScreen()

    expect(screen.getAllByTestId('sail-selection-cell')).toHaveLength(338)
    expect(screen.getAllByTestId('sail-selection-row')).toHaveLength(26)
  })

  it('switches between the four layers from the thumbnails', async () => {
    const user = renderScreen()

    for (const layer of SAIL_SELECTION_LAYERS) {
      await user.click(
        screen
          .getAllByTestId('sail-selection-layer')
          .find((button) => button.dataset.layer === layer.id) as HTMLElement
      )

      expect(screen.getByTestId('sail-selection-grid')).toHaveAttribute('data-layer', layer.id)
      expect(screen.getByTestId('sail-selection-layer-title')).toHaveTextContent(layer.name)
      // And the grid is redrawn whole on every one of them: no layer renders a subset.
      expect(screen.getAllByTestId('sail-selection-cell')).toHaveLength(338)
    }
  })

  it('never tints a cell it does not also print, on any layer', async () => {
    const user = renderScreen()

    for (const layer of SAIL_SELECTION_LAYERS) {
      await user.click(
        screen
          .getAllByTestId('sail-selection-layer')
          .find((button) => button.dataset.layer === layer.id) as HTMLElement
      )

      const unprinted = screen
        .getAllByTestId('sail-selection-cell')
        .filter((cell) => cell.dataset.print === '')
        .filter((cell) => {
          const fill = cell.querySelector('span')?.getAttribute('style') ?? ''
          return fill.includes('color-mix') || fill.includes('--sail-band') || fill.includes('--surface-divider')
        })

      expect(unprinted.map((cell) => `${layer.id} ${cell.dataset.cell}`)).toEqual([])
    }
  })

  it('prints every reached cell on each of the three data layers', async () => {
    const user = renderScreen()
    const reached = new Set<string>()

    await user.click(
      screen
        .getAllByTestId('sail-selection-layer')
        .find((button) => button.dataset.layer === 'coverage') as HTMLElement
    )

    for (const cell of screen.getAllByTestId('sail-selection-cell')) {
      if (cell.dataset.print !== '') reached.add(cell.dataset.cell as string)
    }

    // The archive's own figure, rendered rather than computed (`archive-sail-selection.test.ts`).
    expect(reached.size).toBe(150)

    for (const layer of ['target', 'agreement']) {
      await user.click(
        screen
          .getAllByTestId('sail-selection-layer')
          .find((button) => button.dataset.layer === layer) as HTMLElement
      )

      const blank = screen
        .getAllByTestId('sail-selection-cell')
        .filter((cell) => reached.has(cell.dataset.cell as string) && cell.dataset.print === '')

      expect(blank.map((cell) => `${layer} ${cell.dataset.cell}`)).toEqual([])
    }
  })

  it('prints a dash across the two columns past the certificate’s last, reached or not', async () => {
    const user = renderScreen()
    await user.click(
      screen
        .getAllByTestId('sail-selection-layer')
        .find((button) => button.dataset.layer === 'target') as HTMLElement
    )

    const past = screen
      .getAllByTestId('sail-selection-cell')
      .filter((cell) => Number(cell.dataset.tws) > 24)

    expect(past).toHaveLength(52)
    expect([...new Set(past.map((cell) => cell.dataset.print))]).toEqual(['–'])
  })

  /**
   * The night-vision half of the acceptance criterion, in the only form that can be checked here.
   *
   * jsdom loads no stylesheet and resolves no custom property, so the *colours* under
   * `theme-nightvision` cannot be rendered. What can be rendered, and is the claim that matters,
   * is that **the print does not consult the theme at all**: every cell prints the same character
   * under the class as without it. That is what makes the grid readable when the eight sail bands
   * and the four state tokens have all collapsed to reds (`app/globals.css`, ADR 0024).
   */
  it('prints the same in night vision as in daylight, on every layer', async () => {
    const user = renderScreen()
    const printsPerLayer: string[][] = []

    for (const layer of SAIL_SELECTION_LAYERS) {
      await user.click(
        screen
          .getAllByTestId('sail-selection-layer')
          .find((button) => button.dataset.layer === layer.id) as HTMLElement
      )
      printsPerLayer.push(
        screen.getAllByTestId('sail-selection-cell').map((cell) => cell.dataset.print as string)
      )
    }

    document.documentElement.classList.add('theme-nightvision')

    try {
      for (const [index, layer] of SAIL_SELECTION_LAYERS.entries()) {
        await user.click(
          screen
            .getAllByTestId('sail-selection-layer')
            .find((button) => button.dataset.layer === layer.id) as HTMLElement
        )

        expect(
          screen.getAllByTestId('sail-selection-cell').map((cell) => cell.dataset.print as string)
        ).toEqual(printsPerLayer[index])
      }
    } finally {
      document.documentElement.classList.remove('theme-nightvision')
    }
  })

  it('opens a real cell’s breakdown, with each line’s own percent of target', async () => {
    const user = renderScreen()

    // 140° at 10 kt: the cell ADR 0030 argues the whole breakdown from, a hundred rows across
    // seven races whose sub-figures pull in different directions.
    const cell = screen
      .getAllByTestId('sail-selection-cell')
      .find((each) => each.dataset.twa === '140' && each.dataset.tws === '10') as HTMLElement

    await user.click(cell)

    const sheet = screen.getByTestId('sail-selection-cell-sheet')
    expect(sheet).toHaveTextContent('140° · 10 kt')
    expect(sheet).toHaveTextContent('Chart says')
    expect(screen.getByTestId('cell-percent').textContent).toMatch(/^\d+\.\d%$/)

    // Each group carries lines, and every line a figure of its own or `no target` — never the
    // cell's own percentage borrowed downward.
    for (const group of ['breakdown-sails', 'breakdown-seas', 'breakdown-times']) {
      const lines = screen.getByTestId(group).querySelectorAll('[data-testid="breakdown-line"]')
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        expect(line.textContent).toMatch(/\d+\.\d%|no target/)
      }
    }
  })
})
