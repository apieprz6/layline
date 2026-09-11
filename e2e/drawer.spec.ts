import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * Smoke coverage for the drawer, and the reason the browser harness exists:
 * these assertions all depend on hydration, so they are exactly what Jest's
 * jsdom render and a `curl` of the markup cannot tell us.
 *
 * The drawer's bordered footer is where the account block lands, so this suite
 * is the natural place to extend once the Auth Sheet ships.
 */

test.describe('hamburger drawer', () => {
  test('opens on tap, lists the nav, and closes on Escape', async ({ page }) => {
    await gotoHydrated(page)

    // The panel is always in the DOM, translated off-canvas when closed, so
    // presence proves nothing — position does.
    const panel = page.locator('nav').filter({ hasText: 'Wind Data' }).first()
    await expect(panel).not.toBeInViewport()

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(panel).toBeInViewport()

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Wind Data' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel).not.toBeInViewport()
  })

  test('the footer region holds only the version, for now', async ({ page }) => {
    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()

    // Guard rail for the account block: today this region carries nothing but
    // the version hairline. When the block lands, "Browsing as guest" joins it
    // and this assertion is the one to update rather than delete.
    await expect(page.getByText(/v1\.0/i)).toBeVisible()
    await expect(page.getByText('Browsing as guest')).toHaveCount(0)
  })
})
