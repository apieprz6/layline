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

  test('the footer stays above the fold when the drawer opens', async ({ page }) => {
    await gotoHydrated(page)

    // `toBeVisible()` would be worthless here, and the trap is worth naming: the
    // footer is inside the always-mounted panel, so a translated-off-canvas node
    // keeps its bounding box and reads as "visible" with the drawer shut. Only
    // its position distinguishes the two states.
    const version = page.getByText(/v1\.0/i)
    await expect(version).not.toBeInViewport()

    await page.getByRole('button', { name: 'Menu', exact: true }).click()

    // The footer is pinned to the bottom of a full-height panel, so on a short
    // viewport it is the first thing to fall off the screen. That it clears the
    // fold at 390x844 is the browser-only question here; whether it *renders*
    // is already covered in HamburgerMenu.test.tsx.
    await expect(version).toBeInViewport()
  })
})
