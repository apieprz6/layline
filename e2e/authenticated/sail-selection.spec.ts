import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The **Sail Selection Screen** in a real browser, at 390px.
 *
 * Everything about *what* the grid says is Jest's — `services/analysis/__tests__/sail-selection.test.ts`
 * for the arithmetic, `archive-sail-selection.test.ts` for the real archive's counts, and
 * `SailSelectionContent.test.tsx` for what a cell prints. What only a browser can answer is the
 * geometry ADR 0030 actually rests on, and none of it is visible in jsdom:
 *
 *   - **the grid fits a 390px phone without a sideways scroll**, which is a question about the
 *     width of thirteen columns and not about their presence;
 *   - **the angle column stays put**, because a cell whose row you cannot see names nothing;
 *   - **a tap opens that cell's breakdown**, with a real click on a real handler.
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

    const grid = page.getByTestId('sail-selection-grid')
    await expect(grid).toBeInViewport()

    // The grid bleeds out through the page's padding and divides the width between its columns
    // (`table-layout: fixed`), so nothing is cut off and nothing has to be scrolled to.
    const overflow = await grid.evaluate((node) => node.scrollWidth - node.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const first = page.getByTestId('sail-selection-cell').first()
    const last = page.getByTestId('sail-selection-row').first().getByTestId('sail-selection-cell').last()
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

    const angle = page.getByTestId('sail-selection-row').first().locator('th')
    const before = await angle.boundingBox()

    await page.getByTestId('sail-selection-grid').evaluate((node) => node.scrollBy(200, 0))

    const after = await angle.boundingBox()
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 0)
  })

  test('switches layer on a thumbnail tap, and every cell still prints', async ({ page }) => {
    await gridOrSkip(page)

    const thumbs = page.getByTestId('sail-selection-layer')
    await expect(thumbs).toHaveCount(4)
    await expect(thumbs.first()).toBeInViewport()

    await thumbs.filter({ hasText: 'Agreement' }).click()
    await expect(page.getByTestId('sail-selection-grid')).toHaveAttribute(
      'data-layer',
      'agreement'
    )

    // A cell with sailing in it prints its glyph, whatever the theme has done to its colour.
    const printed = page.locator('[data-testid="sail-selection-cell"]:not([data-print=""])')
    expect(await printed.count()).toBeGreaterThan(0)
  })

  test('opens the tapped cell’s own breakdown, and closes again', async ({ page }) => {
    await gridOrSkip(page)

    await page.getByTestId('sail-selection-layer').filter({ hasText: 'Coverage' }).click()

    const reached = page.locator('[data-testid="sail-selection-cell"]:not([data-print=""])').first()
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

    await page.getByTestId('sail-selection-layer').filter({ hasText: 'Coverage' }).click()

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
    expect(await page.locator('[data-testid="sail-selection-cell"][data-ghost]').count()).toBeGreaterThan(0)
  })

  test('taps through from the Overall tab’s sail selection row', async ({ page }) => {
    await gotoHydrated(page, '/boat-performance')

    await page.getByRole('tab', { name: 'Overall' }).click()

    const row = page.getByTestId('sail-selection-teaser')
    test.skip((await row.count()) === 0, 'The local archive has no races.')

    await expect(row).toBeInViewport()
    await row.click()
    await expect(page).toHaveURL(/\/boat-performance\/sail-selection$/)
  })
})
