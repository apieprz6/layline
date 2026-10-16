import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The signed-in header naming a boat whose name is too long for a phone (LAY-180).
 *
 * Whether the header names the boat at all, and to whom, is Jest's (`RaceHeader.test.tsx`). What
 * only a browser can say is where things land: a long name has to give way to the WIND NOW readout
 * rather than push it off a 390px screen, and has to stay on one line while it does.
 *
 * Over `/dev/race-header`, a harness off unless `LAYLINE_TRACK_HARNESS=1` — see the route on why
 * the real boat is not renamed for this.
 */
test.describe('the header, to a Guest', () => {
  test('keeps the layline wordmark, and the icon route refuses them', async ({ page }) => {
    await gotoHydrated(page, '/')

    await expect(page.getByTestId('app-header-title')).toHaveText('layline')
    expect((await page.request.get('/boat/icon')).status()).toBe(401)
  })
})

test.describe('the header, naming a long boat name', () => {
  test('ellipsises the name on one line and keeps the wind readout on screen', async ({ page }) => {
    const response = await page.request.get('/dev/race-header')
    expect(
      response.status(),
      '/dev/race-header 404s: the server was started without LAYLINE_TRACK_HARNESS=1'
    ).toBe(200)

    await gotoHydrated(page, '/dev/race-header')

    const header = page.getByTestId('app-header')
    const title = page.getByTestId('app-header-title')
    const wind = page.getByTestId('app-header-wind')
    await expect(title).toBeVisible()
    await expect(wind).toBeVisible()

    const viewport = page.viewportSize()!
    const headerBox = (await header.boundingBox())!
    const titleBox = (await title.boundingBox())!
    const windBox = (await wind.boundingBox())!

    // The readout is whole and on screen, and the name stops short of it.
    expect(windBox.x + windBox.width).toBeLessThanOrEqual(viewport.width)
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(windBox.x)
    // Nothing overflows the header itself, so nothing scrolls sideways.
    expect(headerBox.width).toBeLessThanOrEqual(viewport.width)

    // One line, cut with an ellipsis: wider than it is shown, no taller than one line of it.
    const metrics = await title.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight) || el.clientHeight,
      height: el.getBoundingClientRect().height,
      textOverflow: getComputedStyle(el).textOverflow,
    }))

    if (viewport.width <= 390) {
      expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)
    }
    expect(metrics.textOverflow).toBe('ellipsis')
    expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1)
  })
})
