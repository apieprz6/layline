import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The Wind Rose and the header logo follow the theme (LAY-194), in a real browser.
 *
 * Both used to paint with daylight literals — a hex in an SVG attribute, an `<img>` of an SVG
 * file — so `.theme-nightvision` reached everything on the station screen but them, and they
 * stayed blue and cyan after dark. jsdom resolves no `var()` and cascades no theme class, so only
 * a browser can say what colour they actually came out.
 *
 * Starts in daylight explicitly: the default preference is `auto`, which is night vision whenever
 * the suite happens to run after dusk.
 */

const DAY_BANDS = ['rgb(0, 122, 82)', 'rgb(0, 85, 187)', 'rgb(196, 112, 0)', 'rgb(204, 17, 0)']
const NIGHT_BANDS = ['rgb(153, 51, 51)', 'rgb(204, 34, 34)', 'rgb(238, 51, 0)', 'rgb(255, 0, 0)']

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('layline-theme-preference', 'solar'))
})

async function nightVision(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.classList.toggle('theme-nightvision', value)
  }, on)
}

const computed = (locator: Locator, property: 'stroke' | 'fill'): Promise<string> =>
  locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property)

test("the Wind Rose's connectors change colour with the theme", async ({ page }) => {
  await gotoHydrated(page, '/dev/station/CHII2')
  // A 404 here is a server started without LAYLINE_STATION_HARNESS, not a broken rose.
  const connector = page.locator('.wind-rose-card path.chart-data-stroke').first()
  await expect(connector, 'the rose drew no connector').toBeAttached()

  const day = await computed(connector, 'stroke')
  expect(DAY_BANDS).toContain(day)

  await nightVision(page, true)
  const night = await computed(connector, 'stroke')
  expect(NIGHT_BANDS).toContain(night)

  // The same band in both: the theme swapped the token under it, nothing re-banded the wind.
  expect(NIGHT_BANDS.indexOf(night)).toBe(DAY_BANDS.indexOf(day))
})

test('the header logo comes out in the accent after dark', async ({ page }) => {
  await gotoHydrated(page, '/')
  const mark = page.getByTestId('logo-mark').locator('circle')

  expect(await computed(mark, 'fill')).toBe('rgb(0, 229, 255)')

  await nightVision(page, true)
  expect(await computed(mark, 'fill')).toBe('rgb(204, 0, 0)')
})
