import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The **Sail Selection Screen** in a real browser, at 390px and either side of 1440px.
 *
 * Everything about *what* the grid says is Jest's — `services/analysis/__tests__/sail-selection.test.ts`
 * for the arithmetic, `archive-sail-selection.test.ts` for the real archive's counts, and
 * `SailSelectionContent.test.tsx` for what a cell prints. What only a browser can answer is the
 * geometry ADR 0030 actually rests on, and none of it is visible in jsdom:
 *
 *   - **the grid fits a 390px phone without a sideways scroll**, which is a question about the
 *     width of thirteen columns and not about their presence;
 *   - **the angle column stays put**, because a cell whose row you cannot see names nothing;
 *   - **a tap opens that cell's breakdown**, with a real click on a real handler;
 *   - **from 1440px two grids stand side by side**, and below it the second is not drawn at all.
 *
 * 🚨 `gotoHydrated`, never a bare `page.goto()`. This suite runs against `next build && next start`
 * because `next dev` never hydrates in this container, and a click on an un-hydrated node
 * *succeeds* — so a missing handler looks exactly like a bad selector.
 *
 * ## Why it skips rather than seeds
 *
 * There is no seeding. The owner hand-enters the archive and the boat's Crossover Chart through the
 * finished UI, so a fresh local stack has neither and this screen correctly says so. A spec that
 * invented a chart would be testing a fixture; one that skipped silently would report green over
 * nothing. So it skips **loudly**, the same stance `analysis-filter.spec.ts` takes.
 */

/**
 * The left pane, which is the whole screen below 1440px. The right one is in the markup at every
 * width and hidden by CSS, so an unscoped locator would match both grids.
 */
function leftPane(page: Page): Locator {
  return page.locator('[data-testid="sail-selection-pane"][data-pane="left"]')
}

function rightPane(page: Page): Locator {
  return page.locator('[data-testid="sail-selection-pane"][data-pane="right"]')
}

async function gridOrSkip(page: Page): Promise<void> {
  await gotoHydrated(page, '/boat-performance/sail-selection')

  const grid = await page.getByTestId('sail-selection-grid').count()
  test.skip(
    grid === 0,
    'This stack has no Crossover Chart or no races. Enter them through /boat-setup and ' +
      '/boat-performance/upload — there is no seeding.'
  )
}

test.describe('the Sail Selection Screen, to an admin', () => {
  test('fits the whole chart across a 390px screen without a sideways scroll', async ({ page }) => {
    await gridOrSkip(page)

    const grid = leftPane(page).getByTestId('sail-selection-grid')
    await expect(grid).toBeInViewport()

    // The grid bleeds out through the page's padding and divides the width between its columns
    // (`table-layout: fixed`), so nothing is cut off and nothing has to be scrolled to.
    const overflow = await grid.evaluate((node) => node.scrollWidth - node.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const first = leftPane(page).getByTestId('sail-selection-cell').first()
    const last = leftPane(page)
      .getByTestId('sail-selection-row')
      .first()
      .getByTestId('sail-selection-cell')
      .last()
    const left = await first.boundingBox()
    const right = await last.boundingBox()

    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect((right?.x ?? 0) + (right?.width ?? 0)).toBeLessThanOrEqual(390)
    // Every cell wide enough to put a thumb on, which is what the 24px row height is for.
    expect(left?.height ?? 0).toBeGreaterThanOrEqual(20)
  })

  test('keeps the angle column pinned, so a cell always has a row to belong to', async ({ page }) => {
    await gridOrSkip(page)

    const angle = leftPane(page).getByTestId('sail-selection-row').first().locator('th')
    const before = await angle.boundingBox()

    await leftPane(page).getByTestId('sail-selection-grid').evaluate((node) => node.scrollBy(200, 0))

    const after = await angle.boundingBox()
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 0)
  })

  test('switches layer on a thumbnail tap, and every cell still prints', async ({ page }) => {
    await gridOrSkip(page)

    const thumbs = leftPane(page).getByTestId('sail-selection-layer')
    await expect(thumbs).toHaveCount(4)
    await expect(thumbs.first()).toBeInViewport()

    await thumbs.filter({ hasText: 'Agreement' }).click()
    await expect(leftPane(page).getByTestId('sail-selection-grid')).toHaveAttribute(
      'data-layer',
      'agreement'
    )

    // A cell with sailing in it prints its glyph, whatever the theme has done to its colour.
    const printed = leftPane(page).locator('[data-testid="sail-selection-cell"]:not([data-print=""])')
    expect(await printed.count()).toBeGreaterThan(0)
  })

  test('opens the tapped cell’s own breakdown, and closes again', async ({ page }) => {
    await gridOrSkip(page)

    await leftPane(page).getByTestId('sail-selection-layer').filter({ hasText: 'Coverage' }).click()

    const reached = leftPane(page)
      .locator('[data-testid="sail-selection-cell"]:not([data-print=""])')
      .first()
    const twa = await reached.getAttribute('data-twa')
    const tws = await reached.getAttribute('data-tws')
    await reached.click()

    const sheet = page.getByTestId('sail-selection-cell-sheet')
    await expect(sheet).toBeInViewport()
    await expect(sheet).toContainText(`${twa}° · ${tws} kt`)
    await expect(sheet).toContainText('Chart says')
    await expect(sheet.getByTestId('breakdown-seas')).toBeVisible()

    await sheet.getByTestId('close-cell').click()
    await expect(sheet).toHaveCount(0)
  })

  test('narrows without leaving the page, and ghosts what the narrowing emptied', async ({ page }) => {
    await gridOrSkip(page)

    await leftPane(page).getByTestId('sail-selection-layer').filter({ hasText: 'Coverage' }).click()

    // A sentinel only a real navigation can destroy: a filter tap must not cost a round trip
    // (ADR 0029), and nothing else tells a `replaceState` from a navigation onto the same markup.
    await page.evaluate(() => {
      ;(window as unknown as { __survived?: boolean }).__survived = true
    })

    await page.getByTestId('filter-chip-sea').click()
    const popover = page.getByTestId('filter-popover')
    const moderate = popover.locator('[data-bucket="moderate"]')
    test.skip(
      await moderate.isDisabled(),
      'No row in this archive is annotated Moderate, so there is no enabled chip to tap.'
    )

    await moderate.click()
    await expect(page).toHaveURL(/[?&]sea=moderate(&|$)/)
    expect(
      await page.evaluate(() => (window as unknown as { __survived?: boolean }).__survived)
    ).toBe(true)

    // What the narrowing cost, drawn rather than silently lost.
    expect(
      await leftPane(page).locator('[data-testid="sail-selection-cell"][data-ghost]').count()
    ).toBeGreaterThan(0)
  })

  test('taps through from the season rail’s sail selection row', async ({ page }) => {
    await gotoHydrated(page, '/boat-performance')

    const row = page.getByTestId('sail-selection-teaser')
    test.skip((await row.count()) === 0, 'The local archive has no races.')

    await expect(row).toBeInViewport()
    await row.click()
    await expect(page).toHaveURL(/\/boat-performance\/sail-selection$/)
  })
})

test.describe('the Sail Selection Screen on an ultrawide', () => {
  test('stands two grids side by side from 1440px, each on its own layer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gridOrSkip(page)

    await expect(rightPane(page)).toBeVisible()
    await expect(leftPane(page).getByTestId('sail-selection-grid')).toHaveAttribute('data-layer', 'chart')
    await expect(rightPane(page).getByTestId('sail-selection-grid')).toHaveAttribute(
      'data-layer',
      'agreement'
    )

    const a = await leftPane(page).getByTestId('sail-selection-grid').boundingBox()
    const b = await rightPane(page).getByTestId('sail-selection-grid').boundingBox()
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // Side by side rather than stacked: level tops, and the right one wholly past the left one.
    expect(b?.y).toBeCloseTo(a?.y ?? 0, 0)
    expect(b?.x ?? 0).toBeGreaterThanOrEqual((a?.x ?? 0) + (a?.width ?? 0))
    expect((b?.x ?? 0) + (b?.width ?? 0)).toBeLessThanOrEqual(1440)

    // And each grid is drawn whole inside its half, with nothing to scroll sideways to.
    for (const pane of [leftPane(page), rightPane(page)]) {
      const overflow = await pane
        .getByTestId('sail-selection-grid')
        .evaluate((node) => node.scrollWidth - node.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    }

    // The right pane's thumbnails switch the right pane and nothing else.
    await rightPane(page).getByTestId('sail-selection-layer').filter({ hasText: 'Coverage' }).click()
    await expect(rightPane(page).getByTestId('sail-selection-grid')).toHaveAttribute(
      'data-layer',
      'coverage'
    )
    await expect(leftPane(page).getByTestId('sail-selection-grid')).toHaveAttribute('data-layer', 'chart')
  })

  test('opens one sheet from either grid, and marks the cell in both', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gridOrSkip(page)

    const cell = rightPane(page).getByTestId('sail-selection-cell').first()
    const key = await cell.getAttribute('data-cell')
    await cell.click()

    await expect(page.getByTestId('sail-selection-cell-sheet')).toHaveCount(1)
    await expect(leftPane(page).locator(`[data-cell="${key}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(rightPane(page).locator(`[data-cell="${key}"]`)).toHaveAttribute('aria-pressed', 'true')
  })

  test('keeps one grid at 1439px', async ({ page }) => {
    await page.setViewportSize({ width: 1439, height: 900 })
    await gridOrSkip(page)

    await expect(leftPane(page).getByTestId('sail-selection-grid')).toBeVisible()
    await expect(rightPane(page)).toBeHidden()
  })

  test('stops at 1700px and centres past it', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1200 })
    await gridOrSkip(page)

    const a = await leftPane(page).boundingBox()
    const b = await rightPane(page).boundingBox()
    const start = a?.x ?? 0
    const end = (b?.x ?? 0) + (b?.width ?? 0)

    expect(end - start).toBeLessThanOrEqual(1700)
    // Centred: as much glass either side, to within a pixel of rounding.
    expect(Math.abs(start - (2560 - end))).toBeLessThanOrEqual(2)
  })
})
