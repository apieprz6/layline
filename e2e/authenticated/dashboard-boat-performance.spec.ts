import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The Boat performance Overall cards on the **Dashboard**, where a real browser puts them.
 *
 * Which cards a sailor gets, and that a Guest gets none, is Jest's (`(dashboard)/__tests__`). What
 * only a browser can see is the arrangement: each card is a cell of the Dashboard's own grid, the
 * width of the Live Wind card, flowing on after it — one column on a phone, two on a desktop,
 * three on an ultrawide.
 *
 * The archive project's synthetic race is what guarantees each card has something to draw.
 */

type Box = { x: number; y: number; width: number; height: number }

const CARD_HREFS = [
  '/boat-performance/polar',
  '/boat-performance/sail-selection',
  '/boat-performance/instrument-tuning',
]

/** Live Wind, then the three cards, in the order the grid lays them out. */
async function measureCells(page: Page): Promise<Box[]> {
  const wind = page.locator('.layline-card', { hasText: 'Live Wind' })
  await expect(wind).toBeVisible()
  const cells: Box[] = [(await wind.boundingBox())!]

  // Scoped to the grid Live Wind sits in, so a link of the same name in the drawer can't answer.
  const grid = wind.locator('xpath=..')
  for (const href of CARD_HREFS) {
    const card = grid.locator(`a[href="${href}"]`)
    await expect(card).toBeVisible()
    cells.push((await card.boundingBox())!)
  }

  return cells
}

/** Every cell at its row and column of a `columns`-wide grid, and every one Live Wind's width. */
function expectGrid(cells: Box[], columns: number): void {
  const [first] = cells

  cells.forEach((cell, i) => {
    const rowLead = cells[i - (i % columns)]
    const columnLead = cells[i % columns]

    expect(Math.abs(cell.width - first.width), `cell ${i} width`).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.y - rowLead.y), `cell ${i} row`).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.x - columnLead.x), `cell ${i} column`).toBeLessThanOrEqual(1)
    if (i % columns > 0) {
      const left = cells[i - 1]
      expect(cell.x, `cell ${i} beside the one before`).toBeGreaterThanOrEqual(left.x + left.width)
    }
    if (i >= columns) {
      const above = cells[i - columns]
      expect(cell.y, `cell ${i} below its row`).toBeGreaterThanOrEqual(above.y + above.height)
    }
  })
}

test.describe('The Dashboard, to a signed-in sailor', () => {
  test('flows the three Overall cards on after Live Wind, one column on a phone and two on a desktop', async ({
    page,
  }) => {
    await gotoHydrated(page, '/')
    const columns = page.viewportSize()!.width >= 768 ? 2 : 1

    expectGrid(await measureCells(page), columns)
  })

  test('gives them three columns on an ultrawide', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1280, 'An ultrawide is a desktop question.')

    await page.setViewportSize({ width: 2560, height: 1080 })
    await gotoHydrated(page, '/')

    expectGrid(await measureCells(page), 3)
  })
})
