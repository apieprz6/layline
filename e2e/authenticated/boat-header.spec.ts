import { test, expect } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The signed-in header names the boat (LAY-180, amending ADR 0015).
 *
 * Checked against Boat management's own `h1` rather than a literal, so the spec holds whatever the
 * local boat is called. The Guest's half — that no signed-out screen names the boat — is
 * `boat-sections.spec.ts`, which asserts the name appears nowhere on a Guest's page.
 */
test.describe('the header, to a signed-in sailor', () => {
  test('names the boat Boat management names, on every screen', async ({ page }) => {
    await gotoHydrated(page, '/boat-management')
    const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim()
    expect(name, 'Boat management has no boat name to compare against').toBeTruthy()

    for (const path of ['/', '/boat-management']) {
      await gotoHydrated(page, path)
      await expect(page.getByTestId('app-header-title')).toHaveText(name!)
    }
  })

  test('draws the icon the route serves, or the layline mark when there is none', async ({
    page,
  }) => {
    await gotoHydrated(page, '/')

    const header = page.getByTestId('app-header')
    const icon = header.locator('img[src^="/boat/icon"]')

    if ((await icon.count()) === 0) {
      // No icon uploaded: the mark stays, and nothing is invented in its place.
      await expect(header.getByTestId('logo-mark')).toBeVisible()
      expect((await page.request.get('/boat/icon')).status()).toBe(404)
      return
    }

    // An icon: the route serves it to this session, privately, and the browser decoded it.
    const response = await page.request.get((await icon.getAttribute('src'))!)
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toMatch(/^private\b/)
    expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  })
})
