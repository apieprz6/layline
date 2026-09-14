import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The boat sections, in a browser, for the three questions jsdom cannot answer:
 * whether the drawer's fixed 268px really holds "Boat performance" on one line,
 * whether the locked rows clear the fold, and whether a tap on a locked screen's
 * invitation opens the **Auth Sheet** *without leaving the route*.
 *
 * Everything here runs as a **Guest** — no session is established — which is the
 * state the locks exist for.
 */

test.describe('the locked boat sections', () => {
  test('shows a guest five entries, with the boat pair padlocked', async ({ page }) => {
    await gotoHydrated(page)

    const panel = page.locator('nav').filter({ hasText: 'Wind Data' }).first()
    await expect(panel).not.toBeInViewport()

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(panel).toBeInViewport()

    // Position, not presence: the pair sits in the middle of a full-height panel,
    // and the whole point of showing it is that a visitor can see it.
    const management = page.getByRole('link', { name: /Boat management/ })
    const performance = page.getByRole('link', { name: /Boat performance/ })
    await expect(management).toBeInViewport()
    await expect(performance).toBeInViewport()

    // The invitation is on the row itself, not in a block of its own (ADR 0016).
    await expect(management).toContainText('Sign in')
    await expect(performance).toContainText('Sign in')
  })

  test('holds the drawer at 268px with no label wrapping', async ({ page }) => {
    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()

    // Measured open: the panel is always mounted, and a bounding box taken while
    // it is still sliding is a box of a moving target.
    const panel = page.locator('nav').filter({ hasText: 'Wind Data' }).first()
    await expect(panel).toBeInViewport()

    const drawer = await panel.boundingBox()
    // Not `toBe`: the panel is composited through a `translateX`, and Chromium
    // hands back 268.00000762939453 for it.
    expect(drawer?.width).toBeCloseTo(268, 1)

    // "Boat performance" is the longest label in the drawer, so it is the one that
    // would wrap — and a second line would push every row below it down. One line
    // of 14px Inter is ~17px tall; anything near 34px is two.
    const label = page.getByRole('link', { name: /Boat performance/ }).locator('span').first()
    const box = await label.boundingBox()
    expect(box?.height).toBeLessThan(26)

    // The row, not just the label: the padlock and its "Sign in" share the 268px,
    // so either of *them* wrapping would grow the row while the label stayed on one
    // line. An unlocked row is the height a single-line row is, and the locked pair
    // has to match it.
    const openRow = await page.getByRole('link', { name: /Wind Data/ }).boundingBox()
    for (const name of [/Boat management/, /Boat performance/]) {
      const lockedRow = await page.getByRole('link', { name }).boundingBox()
      expect(lockedRow?.height).toBeCloseTo(openRow?.height ?? 0, 1)
    }
  })

  test('a tap on a padlocked row lands on the locked screen', async ({ page }) => {
    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('link', { name: /Boat performance/ }).click()

    await expect(page).toHaveURL(/\/boat-performance$/)
    await expect(page.getByRole('heading', { name: 'Boat performance' })).toBeVisible()
    await expect(page.getByTestId('locked-placeholder')).toBeInViewport()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })

  test('a deep link to a boat route lands there too, not on a 404', async ({ page }) => {
    // The one bare `page.goto()` in the suite, deliberately: the status code is the
    // assertion, and only `goto` returns a response. Nothing is clicked on this
    // navigation, so the hydration trap `gotoHydrated` exists for cannot bite; the
    // hydrated navigation follows immediately below for everything that is.
    const response = await page.goto('/boat-management')
    expect(response?.status()).toBe(200)

    await gotoHydrated(page, '/boat-management')
    await expect(page.getByRole('heading', { name: 'Boat management' })).toBeVisible()
    await expect(page.getByTestId('locked-placeholder')).toBeInViewport()
  })

  test('the invitation opens the sheet over the screen the sailor asked for', async ({ page }) => {
    await gotoHydrated(page, '/boat-performance')

    await expect(page.getByTestId('auth-sheet')).toHaveCount(0)
    // Scoped to the screen: the drawer's account block offers Sign in a second
    // time, deliberately, and it is mounted whether the drawer is open or not.
    await page
      .getByTestId('locked-screen')
      .getByRole('button', { name: 'Sign in', exact: true })
      .click()

    // Over it, in place: the sheet is on screen and the route has not moved, which
    // is what leaves the sailor here after they finish signing in (ADR 0016).
    await expect(page.getByTestId('auth-sheet')).toBeInViewport()
    await expect(page).toHaveURL(/\/boat-performance$/)
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeInViewport()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('auth-sheet')).toHaveCount(0)
  })
})
