import { test, expect } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The **Analysis Filter** in a real browser: a chip tap, and the URL round trip, at 390px.
 *
 * Everything about *what* the filter matches is Jest's — `services/analysis/__tests__/filter.test.ts`
 * and the three component suites answer it in jsdom in a second. What only a browser can answer is
 * the pair of claims ADR 0029 actually rests on, both of which jsdom cannot see:
 *
 *   - the rail is **on screen** at 390px without the figures below it moving off it, which is a
 *     question about position and not about presence (`toBeInViewport`, per `docs/testing/README.md`);
 *   - narrowing **updates the URL without a navigation**, and a copied URL reproduces the view.
 *     `history.replaceState` in jsdom is a stub; whether the document survived the write is a fact
 *     about a real page.
 *
 * 🚨 `gotoHydrated`, never a bare `page.goto()`. This suite runs against `next build && next start`
 * because `next dev` never hydrates in this container, and a click on an un-hydrated node
 * *succeeds* — so a missing handler looks exactly like a bad selector.
 *
 * ## Why it skips rather than seeds
 *
 * There is no seeding. The owner hand-enters the archive through the finished UI, so a fresh local
 * stack has no Race and this screen correctly says so. A spec that invented rows would be testing
 * a fixture; one that skipped silently would report green over nothing. So it skips **loudly**, the
 * same stance `services/recordings/__tests__/archive.ts` takes for the suites that need the
 * owner's recordings.
 */

/** The screen with an empty archive draws this instead of the rail, and there is nothing to tap. */
async function railOrSkip(page: import('@playwright/test').Page): Promise<void> {
  await gotoHydrated(page, '/boat-performance/polar')

  const empty = await page.getByTestId('empty-state').count()
  test.skip(
    empty > 0,
    'The local archive has no races. Enter one through /boat-performance/upload — there is no seeding.'
  )
}

test.describe('the Analysis Filter, to an admin', () => {
  test('keeps the whole rail reachable at 390px, with the ledger under it', async ({ page }) => {
    await railOrSkip(page)

    const rail = page.getByTestId('analysis-filter-rail')
    await expect(rail).toBeInViewport()
    // Six dimensions on this screen (ADR 0029), and the rail scrolls sideways rather than wrapping
    // — so the last chip is in the DOM and off-screen until it is scrolled to, which is the design
    // and not a defect.
    await expect(rail.getByRole('button')).toHaveCount(6)

    // The ledger is permanent, not a warning that appears on narrowing.
    await expect(page.getByTestId('coverage-ledger')).toBeInViewport()
  })

  test('narrows on a tap, writes the URL, and never leaves the page', async ({ page }) => {
    await railOrSkip(page)

    // A sentinel that only a real navigation can destroy. This is the whole assertion: a filter
    // tap must not cost a server round trip (ADR 0029), and nothing else can tell a `replaceState`
    // from a navigation that happened to land on the same markup.
    await page.evaluate(() => {
      ;(window as unknown as { __survived?: boolean }).__survived = true
    })

    await page.getByTestId('filter-chip-wind').click()
    const popover = page.getByTestId('filter-popover')
    await expect(popover).toBeInViewport()

    const medium = popover.locator('[data-bucket="medium"]')
    test.skip(
      await medium.isDisabled(),
      'No row in this archive is in the Medium band, so there is no enabled chip to tap.'
    )

    await medium.click()

    await expect(page).toHaveURL(/[?&]wind=medium(&|$)/)
    await expect(page.getByTestId('filter-chip-wind')).toContainText('Medium')
    expect(
      await page.evaluate(() => (window as unknown as { __survived?: boolean }).__survived)
    ).toBe(true)
  })

  test('a copied URL reproduces the same narrowed view', async ({ page }) => {
    await railOrSkip(page)

    await page.getByTestId('filter-chip-wind').click()
    const popover = page.getByTestId('filter-popover')
    const medium = popover.locator('[data-bucket="medium"]')
    test.skip(await medium.isDisabled(), 'No row in this archive is in the Medium band.')
    await medium.click()

    const narrowed = page.url()
    const ledger = await page.getByTestId('coverage-ledger-headline').textContent()

    // A fresh load of the URL the sailor would have copied. The server reads `searchParams` and
    // renders the narrowing itself, so this is also the assertion that it does not flash the whole
    // archive first.
    await gotoHydrated(page, narrowed)

    await expect(page.getByTestId('filter-chip-wind')).toContainText('Medium')
    expect(await page.getByTestId('coverage-ledger-headline').textContent()).toBe(ledger)
  })

  test('taps through from the Overall tab’s hero card', async ({ page }) => {
    await gotoHydrated(page, '/boat-performance')

    await page.getByRole('tab', { name: 'Overall' }).click()

    const teaser = page.getByTestId('polar-performance-teaser')
    test.skip((await teaser.count()) === 0, 'The local archive has no races.')

    await expect(teaser).toBeInViewport()
    await teaser.click()
    await expect(page).toHaveURL(/\/boat-performance\/polar$/)
  })
})
