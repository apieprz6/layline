import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The two routes LAY-110 adds, asked of a **Guest** — which is the only account state this suite can
 * establish, and the one the locks exist for.
 *
 * Both are new front doors into the archive: a race link is the thing a sailor sends to a crew, and
 * the upload route is guessable from it. Neither has a signed-out rendering, so what a browser is
 * needed for is where a deep link actually *ends up* — a redirect chain no jsdom test can follow.
 */

test.describe('the race routes, to a guest', () => {
  test('sends a deep link to one race back to the dashboard with the sheet open', async ({
    page,
  }) => {
    // The id does not have to exist. The account is checked before the race is read, deliberately:
    // whether there is a race at that id is already more than a guest may learn.
    await gotoHydrated(page, '/boat-performance/races/9f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b')

    await expect(page.getByTestId('auth-sheet')).toBeInViewport()
    await expect(page).toHaveURL(/\/$/)
  })

  test('serves a guest no part of the upload wizard', async ({ page }) => {
    // A bare `goto()` for the same reason `boat-sections.spec.ts` uses one: the redirect chain is
    // the assertion, nothing is clicked, so the hydration trap cannot bite.
    const response = await page.goto('/boat-performance/upload')

    expect(response?.status()).toBe(200)
    expect(response?.url()).toContain('signin=%2Fboat-performance%2Fupload')
    expect(response?.request().redirectedFrom()?.url()).toContain('/boat-performance/upload')
    // Not a locked stand-in of the wizard, and above all no file input: the one control that would
    // let an unauthenticated request put bytes in the bucket.
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })

  test('serves a guest no part of the amend flow either, and keeps the section they aimed at', async ({
    page,
  }) => {
    // The amend route is the same flow minus the File step (ADR 0010 Amendment 1), so it is the same
    // front door and the same lock (ADR 0015). What is worth a browser here is the *round trip*: the
    // section a chip pointed at survives the redirect, so signing in lands the sailor on the sea state
    // they came to fix rather than on the window they had no complaint about.
    const response = await page.goto(
      '/boat-performance/races/9f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/amend?section=sea'
    )

    expect(response?.status()).toBe(200)
    expect(response?.url()).toContain('signin=')
    expect(response?.url()).toContain('amend')
    expect(response?.url()).toContain('section%3Dsea')
    // No flow of any kind was drawn: no section tabs, and no window fields to move.
    await expect(page.getByTestId('amend-sections')).toHaveCount(0)
    await expect(page.locator('#race-window-start')).toHaveCount(0)
  })
})
