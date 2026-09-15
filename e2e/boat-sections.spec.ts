import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The boat sections, in a browser, for the questions jsdom cannot answer:
 * whether the drawer's fixed 268px really holds "Boat performance" on one line
 * once a padlock and a "Sign in" share the row, whether the locked rows clear the
 * fold, whether a tap on a locked row's invitation opens the **Auth Sheet**
 * *without leaving the route*, and where a deep link to a boat route actually
 * ends up.
 *
 * Everything here runs as a **Guest** — no session is established — which is the
 * state the locks exist for.
 */

test.describe('the locked boat sections', () => {
  /** The drawer panel, which is mounted whether it is open or not. */
  const drawerOf = (page: Page) => page.locator('nav').filter({ hasText: 'Wind Data' }).first()

  test('shows a guest five entries, with the boat pair inert', async ({ page }) => {
    await gotoHydrated(page)

    const panel = drawerOf(page)
    await expect(panel).not.toBeInViewport()

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(panel).toBeInViewport()

    // Position, not presence: the pair sits in the middle of a full-height panel,
    // and the whole point of showing it is that a visitor can see it.
    const rows = page.getByTestId('locked-entry')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toBeInViewport()
    await expect(rows.last()).toBeInViewport()
    await expect(rows.first()).toContainText('Boat management')
    await expect(rows.last()).toContainText('Boat performance')

    // Nowhere to go: there is no signed-out version of either screen, so neither
    // row is a link, and the invitation on the row is the only affordance.
    await expect(panel.getByRole('link', { name: /Boat/ })).toHaveCount(0)
    await expect(page.getByTestId('padlock')).toHaveCount(2)
    await expect(
      page.getByRole('button', { name: 'Sign in to open Boat performance' })
    ).toBeInViewport()
  })

  test('holds the drawer at 268px with no label wrapping', async ({ page }) => {
    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()

    // Measured open: the panel is always mounted, and a bounding box taken while
    // it is still sliding is a box of a moving target.
    const panel = drawerOf(page)
    await expect(panel).toBeInViewport()

    const drawer = await panel.boundingBox()
    // Not `toBe`: the panel is composited through a `translateX`, and Chromium
    // hands back 268.00000762939453 for it.
    expect(drawer?.width).toBeCloseTo(268, 1)

    // "Boat performance" is the longest label in the drawer, so it is the one that
    // would wrap — and a second line would push every row below it down. One line
    // of 14px Inter is ~17px tall; anything near 34px is two.
    const label = page.getByTestId('locked-entry').last().locator('span').first()
    const box = await label.boundingBox()
    expect(box?.height).toBeLessThan(26)

    // The row, not just the label: the padlock and its "Sign in" share the 268px,
    // so either of *them* wrapping would grow the row while the label stayed on one
    // line. An open row is the height a single-line row is, and the locked pair has
    // to match it — otherwise signing in would shift everything beneath them.
    const openRow = await page.getByRole('link', { name: /Wind Data/ }).boundingBox()
    for (const index of [0, 1]) {
      const lockedRow = await page.getByTestId('locked-entry').nth(index).boundingBox()
      expect(lockedRow?.height).toBeCloseTo(openRow?.height ?? 0, 1)
    }
  })

  test("a tap on a locked row's Sign in opens the sheet without moving", async ({ page }) => {
    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()

    await expect(page.getByTestId('auth-sheet')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign in to open Boat performance' }).click()

    // Over the screen the sailor is on, and the drawer gets out of the way: the
    // round trip through Google reloads the page, so it would not survive anyway.
    await expect(page.getByTestId('auth-sheet')).toBeInViewport()
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeInViewport()
    await expect(drawerOf(page)).not.toBeInViewport()
    await expect(page).toHaveURL(/\/$/)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('auth-sheet')).toHaveCount(0)
  })

  test('sends a deep link back to the dashboard with the sheet open', async ({ page }) => {
    // A guest asking for the route directly gets no signed-out rendering of it at
    // all — they land on the dashboard with the sheet open and the section
    // remembered, which is where finishing sign-in will take them.
    await gotoHydrated(page, '/boat-management')

    await expect(page.getByTestId('auth-sheet')).toBeInViewport()
    // The screen's own content, not its title: since LAY-104 the header of Boat
    // management is the boat's *name*, so a heading is no longer the thing a guest
    // must not be served — the boat is. Both halves of that: the list of artifacts,
    // and the identity itself, which no signed-out screen may ever name.
    await expect(page.getByTestId('boat-setup-list')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Handsome Pete')
    // The ask is taken back out of the URL once it has been read, so a reload does
    // not reopen a sheet the sailor has dismissed.
    await expect(page).toHaveURL(/\/$/)
  })

  test('serves a guest no part of a boat screen', async ({ page }) => {
    // The one bare `page.goto()` in the suite, deliberately: the redirect chain is
    // the assertion, and only `goto` returns a response. Nothing is clicked on this
    // navigation, so the hydration trap `gotoHydrated` exists for cannot bite.
    const response = await page.goto('/boat-performance')

    expect(response?.status()).toBe(200)
    // Not a 404 and not a locked stand-in: the dashboard, with the section carried
    // along in the query for the sheet to pick up.
    expect(response?.url()).toContain('signin=%2Fboat-performance')
    expect(response?.request().redirectedFrom()?.url()).toContain('/boat-performance')
  })
})
